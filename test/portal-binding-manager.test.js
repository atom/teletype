const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const PortalBindingManager = require('../lib/portal-binding-manager')
const FakeEditorProxy = require('./helpers/fake-editor-proxy')

suite('PortalBindingManager', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  suite('host portal binding', () => {
    test('idempotently creating the host portal binding', async () => {
      const manager = buildPortalBindingManager()

      const portalBinding1Promise = manager.createHostPortalBinding()
      assert.equal(portalBinding1Promise, manager.createHostPortalBinding())

      manager.client.resolveLastCreatePortalPromise(buildPortal())
      const portalBinding1 = await portalBinding1Promise
      assert.equal(manager.createHostPortalBinding(), portalBinding1Promise)
      assert.equal(manager.getHostPortalBinding(), portalBinding1Promise)

      portalBinding1.close()
      const portalBinding2Promise = manager.createHostPortalBinding()
      assert.notEqual(portalBinding2Promise, portalBinding1Promise)
      assert.equal(manager.createHostPortalBinding(), portalBinding2Promise)
      assert.equal(manager.getHostPortalBinding(), portalBinding2Promise)
    })

    test('successfully fetching a binding after failing the first time', async () => {
      const manager = buildPortalBindingManager()

      const portalBinding1Promise = manager.createHostPortalBinding()
      manager.client.resolveLastCreatePortalPromise(null)
      assert(!await portalBinding1Promise)
      assert(!await manager.getHostPortalBinding())

      const portalBinding2Promise = manager.createHostPortalBinding()
      manager.client.resolveLastCreatePortalPromise(buildPortal())
      assert(await portalBinding2Promise)
      assert(await manager.getHostPortalBinding())
    })
  })

  suite('guest portal bindings', () => {
    test('idempotently creating guest portal bindings', () => {
      const manager = buildPortalBindingManager()

      const portal1BindingPromise1 = manager.createGuestPortalBinding('1')
      const portal1BindingPromise2 = manager.createGuestPortalBinding('1')
      const portal2BindingPromise1 = manager.createGuestPortalBinding('2')
      assert.equal(portal1BindingPromise1, portal1BindingPromise2)
      assert.notEqual(portal1BindingPromise1, portal2BindingPromise1)
    })

    test('successfully fetching a binding after failing the first time', async () => {
      const manager = buildPortalBindingManager()

      const portalBinding1Promise1 = manager.createGuestPortalBinding('1')
      manager.client.resolveLastJoinPortalPromise(null)
      assert(!await portalBinding1Promise1)

      const portalBinding1Promise2 = manager.createGuestPortalBinding('1')
      assert.notEqual(portalBinding1Promise1, portalBinding1Promise2)

      manager.client.resolveLastJoinPortalPromise(buildPortal())
      assert(await portalBinding1Promise2)
    })
  })

  test('getRemoteBuffers()', async () => {
    const manager = buildPortalBindingManager()

    const guest1PortalBindingPromise = manager.createGuestPortalBinding('1')
    manager.client.resolveLastJoinPortalPromise(buildPortal({login: 'user-1'}))
    const guest1PortalBinding = await guest1PortalBindingPromise

    const guest2PortalBindingPromise = manager.createGuestPortalBinding('2')
    manager.client.resolveLastJoinPortalPromise(buildPortal({login: 'user-2'}))
    const guest2PortalBinding = await guest2PortalBindingPromise

    const editorProxy1 = new FakeEditorProxy('uri-1')
    guest1PortalBinding.addEditorProxy(editorProxy1)
    guest1PortalBinding.addEditorProxy(new FakeEditorProxy('uri-2'))
    guest1PortalBinding.removeEditorProxy(editorProxy1)
    guest1PortalBinding.addEditorProxy(new FakeEditorProxy('uri-3'))

    guest2PortalBinding.addEditorProxy(new FakeEditorProxy('uri-4'))
    guest2PortalBinding.addEditorProxy(new FakeEditorProxy('uri-5'))

    assert.deepEqual(await manager.getRemoteBuffers(), [
      {label: '@user-1: uri-2', uri: 'uri-2'},
      {label: '@user-1: uri-3', uri: 'uri-3'},
      {label: '@user-2: uri-4', uri: 'uri-4'},
      {label: '@user-2: uri-5', uri: 'uri-5'}
    ])
  })

  test('adding and removing classes from the workspace element', async () => {
    const manager = buildPortalBindingManager()

    const portalBinding1Promise = manager.createGuestPortalBinding('1')
    manager.client.resolveLastJoinPortalPromise(buildPortal())
    const portalBinding1 = await portalBinding1Promise
    assert(manager.workspace.element.classList.contains('teletype-Guest'))

    const portalBinding2Promise = manager.createGuestPortalBinding('2')
    manager.client.resolveLastJoinPortalPromise(buildPortal())
    const portalBinding2 = await portalBinding2Promise
    assert(manager.workspace.element.classList.contains('teletype-Guest'))

    portalBinding1.leave()
    assert(manager.workspace.element.classList.contains('teletype-Guest'))

    portalBinding2.leave()
    assert(!manager.workspace.element.classList.contains('teletype-Guest'))
  })
})

function buildPortalBindingManager () {
  const {workspace, notifications: notificationManager} = buildAtomEnvironment()
  const client = {
    resolveLastCreatePortalPromise: null,
    resolveLastJoinPortalPromise: null,
    createPortal () {
      return new Promise((resolve) => { this.resolveLastCreatePortalPromise = resolve })
    },
    joinPortal () {
      return new Promise((resolve) => { this.resolveLastJoinPortalPromise = resolve })
    }
  }
  return new PortalBindingManager({client, workspace, notificationManager})
}

let nextIdentityId = 1
function buildPortal ({login} = {}) {
  return {
    activateEditorProxy () {},
    getSiteIdentity () {
      return {login: login || 'identity-' + nextIdentityId++}
    },
    dispose () {
      this.delegate.dispose()
    },
    setDelegate (delegate) {
      this.delegate = delegate
    }
  }
}
