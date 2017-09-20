const GuestPortalBindingRegistry = require('../lib/guest-portal-binding-registry')

const assert = require('assert')
const suite = global.describe
const test = global.it

suite('GuestPortalBindingRegistry', () => {
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
    const registry = new GuestPortalBindingRegistry({client, workspace})

    const portalBinding1 = await registry.getPortalBinding('1')
    assert(workspace.element.classList.contains('realtime-Guest'))

    const portalBinding2 = await registry.getPortalBinding('2')
    assert(workspace.element.classList.contains('realtime-Guest'))

    portalBinding1.dispose()
    assert(workspace.element.classList.contains('realtime-Guest'))

    portalBinding2.dispose()
    assert(!workspace.element.classList.contains('realtime-Guest'))
  })
})
