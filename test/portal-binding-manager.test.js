const assert = require('assert')
const PortalBindingManager = require('../lib/portal-binding-manager')

suite('PortalBindingManager', () => {
  test.skip('idempotently creating the host portal binding', () => {
    const client = {
      createPortal () {
        console.log('in createPortal');
        return new Promise(() => {})
      }
    }
    const workspace = {
      getElement () {
        return document.createElement('div')
      },
      observeActiveTextEditor () {}
    }

    const manager = new PortalBindingManager({client, workspace})
    const portalBindingPromise1 = manager.createHostPortalBinding()
    const portalBindingPromise2 = manager.createHostPortalBinding()
    assert.equal(portalBindingPromise1, portalBindingPromise2)
  })

  test('fetching the same guest portal binding multiple times before it has been initialized', () => {
    const client = {
      joinPortal (id) {
        return new Promise(() => {})
      }
    }
    const workspace = {
      getElement () {
        return document.createElement('div')
      },
      observeActivePaneItem () {}
    }

    const manager = new PortalBindingManager({client, workspace})
    const portal1BindingPromise1 = manager.getGuestPortalBinding('1')
    const portal1BindingPromise2 = manager.getGuestPortalBinding('1')
    const portal2BindingPromise1 = manager.getGuestPortalBinding('2')
    assert.equal(portal1BindingPromise1, portal1BindingPromise2)
    assert.notEqual(portal1BindingPromise1, portal2BindingPromise1)
  })

  test('successfully fetching a binding after failing the first time', async () => {
    let resolveLastJoinPortalPromise, rejectLastJoinPortalPromise
    const client = {
      joinPortal (id) {
        return new Promise((resolve, reject) => {
          resolveLastJoinPortalPromise = resolve
          rejectLastJoinPortalPromise = reject
        })
      }
    }
    const workspace = {
      getElement () {
        return document.createElement('div')
      },
      observeActivePaneItem () {}
    }
    const notificationManager = {
      addError () {}
    }

    const manager = new PortalBindingManager({client, workspace, notificationManager})
    const portalBinding1Promise1 = manager.getGuestPortalBinding('1')
    rejectLastJoinPortalPromise(new Error())
    assert.equal(await portalBinding1Promise1, null)

    const portalBinding1Promise2 = manager.getGuestPortalBinding('1')
    assert.notEqual(portalBinding1Promise1, portalBinding1Promise2)

    const portal = {
      setDelegate () {}
    }
    resolveLastJoinPortalPromise(portal)
    assert.equal((await portalBinding1Promise2).portal, portal)
  })

  test('adding and removing classes from the workspace element', async () => {
    const client = {
      joinPortal () {
        return Promise.resolve({
          setDelegate () {}
        })
      }
    }
    const workspace = {
      element: document.createElement('div'),
      getElement () {
        return this.element
      },
      observeActivePaneItem () {}
    }
    const manager = new PortalBindingManager({client, workspace})

    const portalBinding1 = await manager.getGuestPortalBinding('1')
    assert(workspace.element.classList.contains('realtime-Guest'))

    const portalBinding2 = await manager.getGuestPortalBinding('2')
    assert(workspace.element.classList.contains('realtime-Guest'))

    portalBinding1.dispose()
    assert(workspace.element.classList.contains('realtime-Guest'))

    portalBinding2.dispose()
    assert(!workspace.element.classList.contains('realtime-Guest'))
  })
})
