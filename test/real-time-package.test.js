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

  test('sharing and joining a portal', async function () {
    const clipboard = new FakeClipboard()

    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv, clipboard)
    await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv, clipboard)
    await guestPackage.joinPortal()

    const hostEditor1 = await hostEnv.workspace.open(temp.path({extension: '.js'}))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])

    await condition(() => guestEnv.workspace.getActiveTextEditor() != null)
    const guestEditor1 = guestEnv.workspace.getActiveTextEditor()
    assert.equal(guestEditor1.getText(), 'const hello = "world"')
    assert.equal(guestEditor1.getTitle(), `Remote Buffer: ${hostEditor1.getTitle()}`)
    assert(!guestEditor1.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))

    hostEditor1.setSelectedBufferRanges([
      [[0, 0], [0, 2]],
      [[0, 4], [0, 6]]
    ])
    guestEditor1.setSelectedBufferRanges([
      [[0, 1], [0, 3]],
      [[0, 5], [0, 7]]
    ])
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))

    assert(guestPackage.bindingForEditor(guestEditor1).isFollowingHostCursor())
    guestPackage.toggleFollowHostCursor(guestEditor1)
    assert(!guestPackage.bindingForEditor(guestEditor1).isFollowingHostCursor())

    const hostEditor2 = await hostEnv.workspace.open(temp.path({extension: '.md'}))
    hostEditor2.setText('# Hello, World')
    hostEditor2.setCursorBufferPosition([0, 2])

    await condition(() => guestEnv.workspace.getActiveTextEditor() !== guestEditor1)
    const guestEditor2 = guestEnv.workspace.getActiveTextEditor()
    assert.equal(guestEditor2.getText(), '# Hello, World')
    assert.equal(guestEditor2.getTitle(), `Remote Buffer: ${hostEditor2.getTitle()}`)
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor2), getCursorDecoratedRanges(guestEditor2)))
  })

  function buildPackage (env, clipboard) {
    return new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env.workspace,
      commands: env.commands,
      clipboard: clipboard
    })
  }
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

class FakeClipboard {
  constructor () {
    this.text = null
  }

  read () {
    return this.text
  }

  write (text) {
    this.text = text
  }
}
