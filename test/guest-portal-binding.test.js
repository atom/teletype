const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {FollowState, TeletypeClient} = require('@atom/teletype-client')
const FakePortal = require('./helpers/fake-portal')
const FakeEditorProxy = require('./helpers/fake-editor-proxy')
const GuestPortalBinding = require('../lib/guest-portal-binding')
const EmptyPortalPaneItem = require('../lib/empty-portal-pane-item')

suite('GuestPortalBinding', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  test('handling an unexpected error when joining a portal', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    client.joinPortal = function () {
      throw new Error('It broke!')
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'portal-id')

    const result = await portalBinding.initialize()
    assert.equal(result, false)

    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    const {message, options} = atomEnv.notifications.getNotifications()[0]
    assert.equal(message, 'Failed to join portal')
    assert(options.description.includes('It broke!'))
  })

  test('showing notifications when sites join or leave', async () => {
    const portal = new FakePortal()
    const client = {
      joinPortal () {
        return portal
      }
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'portal-id')
    await portalBinding.initialize()

    atomEnv.notifications.clear()
    portal.delegate.siteDidJoin(2)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-1'))
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-2'))

    atomEnv.notifications.clear()
    portal.delegate.siteDidLeave(3)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-1'))
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-3'))
  })

  test('switching the active editor in rapid succession', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    const portal = new FakePortal()
    client.joinPortal = function () {
      return portal
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')
    await portalBinding.initialize()

    const activePaneItemChangeEvents = []
    const disposable = atomEnv.workspace.onDidChangeActivePaneItem((item) => {
      activePaneItemChangeEvents.push(item)
    })

    portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-1'))
    portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-2'))
    await portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-3'))

    assert.deepEqual(
      activePaneItemChangeEvents.map((i) => i.getTitle()),
      ['@site-1: uri-1', '@site-1: uri-2', '@site-1: uri-3']
    )
    assert.deepEqual(
      atomEnv.workspace.getPaneItems().map((i) => i.getTitle()),
      ['@site-1: uri-1', '@site-1: uri-2', '@site-1: uri-3']
    )

    disposable.dispose()
  })

  test('switching the active editor to a remote editor that had been moved into a non-active pane', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    client.joinPortal = () => new FakePortal()
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')
    await portalBinding.initialize()

    const editorProxy1 = new FakeEditorProxy('editor-1')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy1)

    const editorProxy2 = new FakeEditorProxy('editor-2')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy2)

    const leftPane = atomEnv.workspace.getActivePane()
    const rightPane = leftPane.splitRight({moveActiveItem: true})
    assert.equal(leftPane.getItems().length, 1)
    assert.equal(rightPane.getItems().length, 1)
    assert.equal(atomEnv.workspace.getActivePane(), rightPane)

    leftPane.activate()
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy2)
    assert.equal(leftPane.getItems().length, 1)
    assert.equal(rightPane.getItems().length, 1)
    assert.equal(atomEnv.workspace.getActivePane(), rightPane)
  })

  test('relaying active editor changes', async () => {
    const portal = new FakePortal()
    const client = {joinPortal: () => portal}
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')
    await portalBinding.initialize()

    // Manually switching to another editor relays active editor changes to the client.
    await atomEnv.workspace.open()
    assert.equal(portal.activeEditorProxyChangeCount, 1)

    portal.setFollowState(FollowState.RETRACTED)

    // Updating tether and removing editor proxies while retracted doesn't relay
    // active editor changes to the client.
    const editorProxy1 = new FakeEditorProxy('editor-1')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy1)
    assert.equal(portal.activeEditorProxyChangeCount, 1)

    const editorProxy2 = new FakeEditorProxy('editor-2')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy2)
    assert.equal(portal.activeEditorProxyChangeCount, 1)

    const editorProxy3 = new FakeEditorProxy('editor-3')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy3)
    assert.equal(portal.activeEditorProxyChangeCount, 1)

    await portalBinding.removeEditorProxy(editorProxy3)
    assert.equal(portal.activeEditorProxyChangeCount, 1)
    assert(atomEnv.workspace.getActivePaneItem().getTitle().includes('editor-2'))

    portal.setFollowState(FollowState.DISCONNECTED)

    // Removing editor proxies while not retracted relays active editor changes to the client.
    await portalBinding.removeEditorProxy(editorProxy2)
    assert.equal(portal.activeEditorProxyChangeCount, 2)
    assert(atomEnv.workspace.getActivePaneItem().getTitle().includes('editor-1'))
  })

  test('host closing last remote editor on guest workspace', async () => {
    const portal = new FakePortal()
    const client = {joinPortal: () => portal}
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')

    await portalBinding.initialize()
    portal.setFollowState(FollowState.RETRACTED)

    const editorProxy1 = new FakeEditorProxy('editor-1')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy1)

    const editorProxy2 = new FakeEditorProxy('editor-2')
    portal.setFollowState(FollowState.DISCONNECTED)
    await portalBinding.updateTether(FollowState.DISCONNECTED)

    await portalBinding.removeEditorProxy(editorProxy2)
    assert.equal(portal.resolveFollowState(), FollowState.DISCONNECTED)

    await portalBinding.removeEditorProxy(editorProxy1)
    assert.equal(portal.getFollowedSiteId(), 1)
    assert.equal(portal.resolveFollowState(), FollowState.RETRACTED)
    assert(!portal.disposed)
  })

  test('toggling site position components visibility when switching tabs', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    const portal = new FakePortal()
    client.joinPortal = () => portal
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')

    await portalBinding.initialize()
    assert.equal(portalBinding.sitePositionsController.visible, true)

    const localPaneItem1 = await atomEnv.workspace.open()
    assert.equal(portalBinding.sitePositionsController.visible, false)

    const editorProxy = new FakeEditorProxy('some-uri')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy)
    assert.equal(portalBinding.sitePositionsController.visible, true)

    await atomEnv.workspace.open(localPaneItem1)
    assert.equal(portalBinding.sitePositionsController.visible, false)

    localPaneItem1.destroy()
    assert.equal(portalBinding.sitePositionsController.visible, true)

    const localPaneItem2 = await atomEnv.workspace.open()
    assert.equal(portalBinding.sitePositionsController.visible, false)

    await portalBinding.removeEditorProxy(editorProxy)
    localPaneItem2.destroy()
    assert(atomEnv.workspace.getActivePaneItem() instanceof EmptyPortalPaneItem)
    assert.equal(portalBinding.sitePositionsController.visible, true)
  })

  function buildGuestPortalBinding (client, atomEnv, portalId) {
    return new GuestPortalBinding({
      client,
      portalId,
      notificationManager: atomEnv.notifications,
      workspace: atomEnv.workspace
    })
  }
})
