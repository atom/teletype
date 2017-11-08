const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {TeletypeClient} = require('@atom/teletype-client')
const HostPortalBinding = require('../lib/host-portal-binding')
const FakeClipboard = require('./helpers/fake-clipboard')

suite('HostPortalBinding', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  test('handling an unexpected error when joining a portal', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    client.createPortal = function () {
      throw new Error('It broke!')
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildHostPortalBinding(client, atomEnv)

    const result = await portalBinding.initialize()
    assert.equal(result, false)

    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    const {message, options} = atomEnv.notifications.getNotifications()[0]
    assert.equal(message, 'Failed to share portal')
    assert(options.description.includes('It broke!'))
  })

  test('showing notifications when sites join or leave', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    const portal = {
      setDelegate (delegate) {
        this.delegate = delegate
      },
      getSiteIdentity (siteId) {
        return {login: 'site-' + siteId}
      },
      setActiveEditorProxy () {}
    }
    client.createPortal = function () {
      return portal
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildHostPortalBinding(client, atomEnv)
    await portalBinding.initialize()

    atomEnv.notifications.clear()
    portal.delegate.siteDidJoin(2)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-2'))

    atomEnv.notifications.clear()
    portal.delegate.siteDidLeave(3)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-3'))
  })

  function buildHostPortalBinding (client, atomEnv) {
    return new HostPortalBinding({
      client,
      notificationManager: atomEnv.notifications,
      workspace: atomEnv.workspace,
      clipboard: new FakeClipboard()
    })
  }
})
