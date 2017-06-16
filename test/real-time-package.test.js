const assert = require('assert')

const RealTimePackage = require('../lib/real-time-package')

const deepEqual = require('deep-equal')
const fs = require('fs')
const path = require('path')
const suiteSetup = global.before
const suiteTeardown = global.after
const setup = global.beforeEach
const teardown = global.afterEach
const suite = global.describe
const test = global.it
const temp = require('temp').track()

suite('RealTimePackage', () => {
  let testServer, containerElement

  suiteSetup(async () => {
    const {startTestServer} = require('@atom-team/real-time-server')
    testServer = await startTestServer({databaseURL: 'postgres://localhost:5432/real-time-server-test'})
  })

  suiteTeardown(() => {
    return testServer.stop()
  })

  setup(() => {
    containerElement = document.createElement('div')
    document.body.appendChild(containerElement)

    return testServer.reset()
  })

  teardown(() => {
    containerElement.remove()
  })

  test('sharing and joining editors', async function () {
    let clipboardText
    const hostEnv = buildAtomEnvironment()
    const hostPackage = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: hostEnv.workspace,
      commands: hostEnv.commands,
      clipboard: {
        write (text) {
          clipboardText = text
        }
      }
    })

    const guestEnv = buildAtomEnvironment()
    const guestPackage = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: guestEnv.workspace,
      commands: guestEnv.commands,
      clipboard: {
        read () {
          return clipboardText
        }
      }
    })

    await hostPackage.sharePortal()
    await guestPackage.joinPortal()

    const hostEditor = await hostEnv.workspace.open(temp.path({extension: '.js'}))
    hostEditor.setText('const hello = "world"')
    hostEditor.setCursorBufferPosition([0, 4])

    await condition(() => guestEnv.workspace.getActiveTextEditor() != null)
    const guestEditor = guestEnv.workspace.getActiveTextEditor()
    assert.equal(guestEditor.getText(), hostEditor.getText())
    assert.equal(guestEditor.getTitle(), `Remote Buffer: ${hostEditor.getTitle()}`)
    assert(!guestEditor.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor), getCursorDecoratedRanges(guestEditor)))

    hostEditor.setSelectedBufferRanges([
      [[0, 0], [0, 2]],
      [[0, 4], [0, 6]]
    ])
    guestEditor.setSelectedBufferRanges([
      [[0, 1], [0, 3]],
      [[0, 5], [0, 7]]
    ])
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor), getCursorDecoratedRanges(guestEditor)))

    assert(guestPackage.bindingForEditor(guestEditor).isFollowingHostCursor())
    guestPackage.toggleFollowHostCursor(guestEditor)
    assert(!guestPackage.bindingForEditor(guestEditor).isFollowingHostCursor())
  })
})

function getCursorDecoratedRanges (editor) {
  const {decorationManager} = editor
  const decorationsByMarker = decorationManager.decorationPropertiesByMarkerForScreenRowRange(0, Infinity)
  const ranges = []
  for (const [marker, decorations] of decorationsByMarker) {
    const hasCursorDecoration = decorations.some((d) => d.type === 'cursor')
    if (hasCursorDecoration) ranges.push(marker.getBufferRange())
  }
  return ranges.sort((a, b) => a.compare(b))
}

function condition (fn) {
  return new Promise((resolve) => {
    setInterval(() => fn() ? resolve() : null, 15)
  })
}
