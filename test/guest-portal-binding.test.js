const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {RealTimeClient} = require('@atom/real-time-client')
const GuestPortalBinding = require('../lib/guest-portal-binding')

suite('GuestPortalBinding', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  test('handling an unexpected error when joining a portal', async () => {
    const client = new RealTimeClient({})
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
    const client = new RealTimeClient({})
    const portal = {
      setDelegate (delegate) {
        this.delegate = delegate
      },
      getSiteIdentity (siteId) {
        return {login: 'site-' + siteId}
      }
    }
    client.joinPortal = function () {
      return portal
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

  test.only('switching the active editor in rapid succession', async () => {
    const client = new RealTimeClient({})
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')

    portalBinding.setActiveEditorProxy(buildEditorProxy('uri-1'))
    portalBinding.setActiveEditorProxy(buildEditorProxy('uri-2'))
    await portalBinding.setActiveEditorProxy(buildEditorProxy('uri-3'))

    assert.deepEqual(getPaneItemTitles(atomEnv), ['Remote Buffer: uri-3'])
  })

  function getPaneItemTitles ({workspace}) {
    return workspace.getPaneItems().map((i) => i.getTitle())
  }

  function buildGuestPortalBinding (client, atomEnv, portalId) {
    return new GuestPortalBinding({
      client,
      portalId,
      notificationManager: atomEnv.notifications,
      workspace: atomEnv.workspace
    })
  }

  function buildEditorProxy (uri) {
    const bufferProxy = {
      uri,
      dispose () {},
      setDelegate () {},
      createCheckpoint () {},
      groupChangesSinceCheckpoint () {},
      applyGroupingInterval () {}
    }
    const editorProxy = {
      bufferProxy,
      setDelegate () {},
      updateSelections () {}
    }
    return editorProxy
  }
})
