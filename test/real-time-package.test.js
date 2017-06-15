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
    const env1 = buildAtomEnvironment()
    const env1Package = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env1.workspace,
      commands: env1.commands,
      clipboard: {
        write (text) {
          clipboardText = text
        }
      }
    })

    const env2 = buildAtomEnvironment()
    const env2Package = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env2.workspace,
      commands: env2.commands,
      clipboard: {
        read () {
          return clipboardText
        }
      }
    })

    await env1Package.sharePortal()
    await env2Package.joinPortal()

    const env1Editor = await env1.workspace.open(temp.path({extension: '.js'}))
    env1Editor.setText('const hello = "world"')
    env1Editor.setCursorBufferPosition([0, 4])

    await condition(() => env2.workspace.getActiveTextEditor() != null)
    const env2Editor = env2.workspace.getActiveTextEditor()
    assert.equal(env2Editor.getText(), env1Editor.getText())
    assert.equal(env2Editor.getTitle(), `Remote Buffer: ${env1Editor.getTitle()}`)
    assert(!env2Editor.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(env1Editor), getCursorDecoratedRanges(env2Editor)))

    env1Editor.setSelectedBufferRanges([
      [[0, 0], [0, 2]],
      [[0, 4], [0, 6]]
    ])
    env2Editor.setSelectedBufferRanges([
      [[0, 1], [0, 3]],
      [[0, 5], [0, 7]]
    ])
    await condition(() => deepEqual(getCursorDecoratedRanges(env1Editor), getCursorDecoratedRanges(env2Editor)))

    assert(env2Package.bindingForEditor(env2Editor).isFollowingHostCursor())
    env2Package.toggleFollowHostCursor(env2Editor)
    assert(!env2Package.bindingForEditor(env2Editor).isFollowingHostCursor())
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
