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

// TODO: For tests that aren't directly related to heartbeat logic, replace
// usage of eviction via heartbeat with explicit closing of a portal.

suite('RealTimePackage', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  let testServer, containerElement, portals, conditionErrorMessage

  suiteSetup(async function () {
    const {startTestServer} = require('@atom/real-time-server')
    testServer = await startTestServer({
      databaseURL: 'postgres://localhost:5432/real-time-server-test',
      // Uncomment and provide credentials to test against Pusher.
      // pusherCredentials: {
      //   appId: '123',
      //   key: '123',
      //   secret: '123'
      // }
    })
  })

  suiteTeardown(() => {
    return testServer.stop()
  })

  setup(() => {
    conditionErrorMessage = null
    portals = []
    containerElement = document.createElement('div')
    document.body.appendChild(containerElement)

    return testServer.reset()
  })

  teardown(async () => {
    if (conditionErrorMessage) {
      console.error('Condition failed with error message: ', conditionErrorMessage)
    }

    containerElement.remove()
    for (const portal of portals) {
      await portal.dispose()
    }
  })

  test('sharing and joining a portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    guestPackage.joinPortal(portalId)

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

  test('preserving guest portal position in workspace', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)

    await guestEnv.workspace.open(path.join(temp.path(), 'guest-1'))

    const portalId = (await hostPackage.sharePortal()).id
    await guestPackage.joinPortal(portalId)

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'host-1'))
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['guest-1', 'Remote Buffer: host-1']))

    await guestEnv.workspace.open(path.join(temp.path(), 'guest-2'))
    assert.deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['guest-1', 'Remote Buffer: host-1', 'guest-2'])

    await hostEnv.workspace.open(path.join(temp.path(), 'host-2'))
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['guest-1', 'Remote Buffer: host-2', 'guest-2']))

    hostEnv.workspace.paneForItem(hostEditor1).activateItem(hostEditor1)
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['guest-1', 'Remote Buffer: host-1', 'guest-2']))
  })

  test('host without an active text editor', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    await guestPackage.joinPortal(portalId)
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['Portal: No Active File']))

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'some-file'))
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['Remote Buffer: some-file']))

    hostEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['Portal: No Active File']))

    await hostEnv.workspace.open(path.join(temp.path(), 'some-file'))
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['Remote Buffer: some-file']))
  })

  test('host disconnecting while there is an active shared editor', async function () {
    const HEARTBEAT_INTERVAL_IN_MS = 10
    const EVICTION_PERIOD_IN_MS = 2 * HEARTBEAT_INTERVAL_IN_MS
    testServer.heartbeatService.setEvictionPeriod(EVICTION_PERIOD_IN_MS)

    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    const hostPortal = await hostPackage.sharePortal()

    await guestPackage.joinPortal(hostPortal.id)

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'file-1'))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])
    await condition(() => guestEnv.workspace.getActiveTextEditor() != null)

    const hostEditor2 = await hostEnv.workspace.open(path.join(temp.path(), 'file-2'))
    hostEditor2.setText('const goodnight = "moon"')
    hostEditor2.setCursorBufferPosition([0, 2])
    await condition(() => guestEnv.workspace.getActiveTextEditor().getTitle() === 'Remote Buffer: file-2')

    const guestEditor = guestEnv.workspace.getActiveTextEditor()
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor2), getCursorDecoratedRanges(guestEditor)))
    guestEditor.setCursorBufferPosition([0, 5])

    const guestEditorTitleChangeEvents = []
    guestEditor.onDidChangeTitle((title) => guestEditorTitleChangeEvents.push(title))

    await hostPortal.simulateNetworkFailure()
    await condition(async () => deepEqual(
      await testServer.heartbeatService.findDeadSites(),
      [{portalId: hostPortal.id, id: hostPortal.siteId}]
    ))
    testServer.heartbeatService.evictDeadSites()
    await condition(() => guestEditor.getTitle() === 'untitled')
    assert.deepEqual(guestEditorTitleChangeEvents, ['untitled'])
    assert.equal(guestEditor.getText(), 'const goodnight = "moon"')
    assert(guestEditor.isModified())
    assert.deepEqual(getCursorDecoratedRanges(guestEditor), [
      {start: {row: 0, column: 5}, end: {row: 0, column: 5}}
    ])

    // Ensure that the guest can still edit the buffer or modify selections.
    guestEditor.getBuffer().setTextInRange([[0, 0], [0, 5]], 'let')
    guestEditor.setCursorBufferPosition([0, 7])
    assert.equal(guestEditor.getText(), 'let goodnight = "moon"')
    assert.deepEqual(getCursorDecoratedRanges(guestEditor), [
      {start: {row: 0, column: 7}, end: {row: 0, column: 7}}
    ])
  })

  test('host disconnecting while there is no active shared editor', async function () {
    const HEARTBEAT_INTERVAL_IN_MS = 10
    const EVICTION_PERIOD_IN_MS = 2 * HEARTBEAT_INTERVAL_IN_MS
    testServer.heartbeatService.setEvictionPeriod(EVICTION_PERIOD_IN_MS)

    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    const hostPortal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    await guestPackage.joinPortal(hostPortal.id)
    await condition(() => deepEqual(guestEnv.workspace.getPaneItems().map((i) => i.getTitle()), ['Portal: No Active File']))

    await hostPortal.simulateNetworkFailure()
    await condition(async () => deepEqual(
      await testServer.heartbeatService.findDeadSites(),
      [{portalId: hostPortal.id, id: hostPortal.siteId}]
    ))
    testServer.heartbeatService.evictDeadSites()
    await condition(() => guestEnv.workspace.getPaneItems().length === 0)
  })

  test('propagating nested marker layer updates that depend on text updates in a nested transaction', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const hostEditor = await hostEnv.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    await guestPackage.joinPortal(hostPortal.id)
    await condition(() => guestEnv.workspace.getActiveTextEditor() != null)
    const guestEditor = guestEnv.workspace.getActiveTextEditor()

    hostEditor.transact(() => {
      hostEditor.setText('abc\ndef')
      hostEditor.transact(() => {
        hostEditor.setCursorBufferPosition([1, 2])
      })
    })

    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor), getCursorDecoratedRanges(guestEditor)))
  })

  test('autoscrolling to the host cursor position when changing the active editor', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    // Attach the workspace element to the DOM, and give it an extremely small
    // height so that we can be sure that the editor will be scrollable.
    const guestWorkspaceElement = guestEnv.views.getView(guestEnv.workspace)
    guestWorkspaceElement.style.height = '10px'
    containerElement.appendChild(guestWorkspaceElement)

    const portal = await hostPackage.sharePortal()
    guestPackage.joinPortal(portal.id)

    const hostEditor1 = await hostEnv.workspace.open()
    hostEditor1.setText('abc\ndef\nghi')
    hostEditor1.setCursorBufferPosition([2, 0])

    await condition(() => guestEnv.workspace.getActiveTextEditor() != null)
    const guestEditor1 = guestEnv.workspace.getActiveTextEditor()
    await condition(() => guestEditor1.getScrollTopRow() === 2)

    const hostEditor2 = await hostEnv.workspace.open()
    hostEditor2.setText('jkl\nmno\npqr\nstu')
    hostEditor2.setCursorBufferPosition([3, 0])

    await condition(() => guestEnv.workspace.getActiveTextEditor() !== guestEditor1)
    const guestEditor2 = guestEnv.workspace.getActiveTextEditor()
    await condition(() => guestEditor2.getScrollTopRow() === 3)
  })

  test('status bar indicator', async () => {
    const HEARTBEAT_INTERVAL_IN_MS = 10
    const EVICTION_PERIOD_IN_MS = 2 * HEARTBEAT_INTERVAL_IN_MS
    testServer.heartbeatService.setEvictionPeriod(EVICTION_PERIOD_IN_MS)

    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    const hostStatusBar = new FakeStatusBar()
    hostPackage.consumeStatusBar(hostStatusBar)

    const hostPortal = await hostPackage.sharePortal()
    assert.equal(hostStatusBar.getRightTiles().length, 1)

    hostPackage.clipboard.write('')
    hostStatusBar.getRightTiles()[0].item.click()
    assert.equal(hostPackage.clipboard.read(), hostPortal.id)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv, {heartbeatIntervalInMilliseconds: HEARTBEAT_INTERVAL_IN_MS})
    const guestStatusBar = new FakeStatusBar()
    guestPackage.consumeStatusBar(guestStatusBar)

    await guestPackage.joinPortal(hostPortal.id)
    assert.equal(guestStatusBar.getRightTiles().length, 1)

    guestPackage.clipboard.write('')
    guestStatusBar.getRightTiles()[0].item.click()
    assert.equal(guestPackage.clipboard.read(), hostPortal.id)

    await hostPortal.simulateNetworkFailure()
    await condition(async () => deepEqual(
      await testServer.heartbeatService.findDeadSites(),
      [{portalId: hostPortal.id, id: hostPortal.siteId}]
    ))
    testServer.heartbeatService.evictDeadSites()
    await condition(() => guestStatusBar.getRightTiles().length === 0)
  })

  function buildPackage (env, {heartbeatIntervalInMilliseconds} = {}) {
    return new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env.workspace,
      notificationManager: env.notifications,
      commandRegistry: env.commands,
      tooltipManager: env.tooltips,
      clipboard: new FakeClipboard(),
      heartbeatIntervalInMilliseconds,
      didCreateOrJoinPortal: (portal) => portals.push(portal)
    })
  }

  function condition (fn, message) {
    assert(!conditionErrorMessage, 'Cannot await on multiple conditions at the same time')

    conditionErrorMessage = message
    return new Promise((resolve) => {
      async function callback () {
        const resultOrPromise = fn()
        const result = (resultOrPromise instanceof Promise) ? (await resultOrPromise) : resultOrPromise
        if (result) {
          conditionErrorMessage = null
          resolve()
        } else {
          setTimeout(callback, 5)
        }
      }

      callback()
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

class FakeStatusBar {
  constructor () {
    this.rightTiles = []
  }

  getRightTiles () {
    return this.rightTiles
  }

  addRightTile (tile) {
    this.rightTiles.push(tile)
    return {
      destroy: () => {
        const index = this.rightTiles.indexOf(tile)
        this.rightTiles.splice(index, 1)
      }
    }
  }
}
