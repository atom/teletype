const assert = require('assert')
const {Emitter, TextEditor} = require('atom')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {TeletypeClient} = require('@atom/teletype-client')
const HostPortalBinding = require('../lib/host-portal-binding')
const FakeClipboard = require('./helpers/fake-clipboard')
const FakePortal = require('./helpers/fake-portal')

suite('HostPortalBinding', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  test('handling an unexpected error when joining a portal', async () => {
    const client = new TeletypeClient({pubSubGateway: {}})
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
    const portal = new FakePortal()
    const client = new TeletypeClient({pubSubGateway: {}})
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

  test('toggling site position components visibility when switching between shared and non-shared pane items', async () => {
    const client = new TeletypeClient({pubSubGateway: {}})
    const portal = new FakePortal()
    client.createPortal = () => portal
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildHostPortalBinding(client, atomEnv)

    const localEditor1 = await atomEnv.workspace.open()
    await portalBinding.initialize()
    assert.equal(portalBinding.sitePositionsController.visible, true)

    const localNonEditor = await atomEnv.workspace.open(new FakePaneItem())
    assert.equal(portalBinding.sitePositionsController.visible, false)

    const localEditor2 = await atomEnv.workspace.open()
    assert.equal(portalBinding.sitePositionsController.visible, true)

    const remoteEditor = new TextEditor()
    remoteEditor.isRemote = true
    await atomEnv.workspace.open(remoteEditor)
    assert.equal(portalBinding.sitePositionsController.visible, false)

    await atomEnv.workspace.open(localEditor2)
    assert.equal(portalBinding.sitePositionsController.visible, true)

    remoteEditor.destroy()
    localEditor1.destroy()
    localEditor2.destroy()
    localNonEditor.destroy()
    assert.equal(portalBinding.sitePositionsController.visible, false)
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

class FakePaneItem {
  constructor () {
    this.element = document.createElement('div')
    this.emitter = new Emitter()
  }

  destroy () {
    this.emitter.emit('did-destroy')
  }

  onDidDestroy (callback) {
    return this.emitter.on('did-destroy', callback)
  }
}
