const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {FollowState, TeletypeClient} = require('@atom/teletype-client')
const FakePortal = require('./helpers/fake-portal')
const GuestPortalBinding = require('../lib/guest-portal-binding')

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

  test('toggling site position components visibility when switching tabs')

  function buildGuestPortalBinding (client, atomEnv, portalId) {
    return new GuestPortalBinding({
      client,
      portalId,
      notificationManager: atomEnv.notifications,
      workspace: atomEnv.workspace
    })
  }

  class FakeEditorProxy {
    constructor (uri) {
      this.bufferProxy = {
        uri,
        dispose () {},
        setDelegate () {},
        createCheckpoint () {},
        groupChangesSinceCheckpoint () {},
        applyGroupingInterval () {}
      }
    }

    follow () {}

    didScroll () {}

    setDelegate () {}

    updateSelections () {}
  }
})
