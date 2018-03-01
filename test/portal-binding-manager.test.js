const assert = require('assert')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const PortalBindingManager = require('../lib/portal-binding-manager')

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

let nextPortalId = 1
let nextIdentityId = 1
function buildPortal ({id, login} = {}) {
  return {
    id: id != null ? id : (nextPortalId++).toString(),
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
