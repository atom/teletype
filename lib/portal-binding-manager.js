const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class PortalBindingManager {
  constructor ({client, workspace, notificationManager, addStatusBarIndicatorForPortal}) {
    this.client = client
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.addStatusBarIndicatorForPortal = addStatusBarIndicatorForPortal
    this.promisesByGuestPortalId = new Map()
  }

  dispose () {
    const disposePromises = []
    this.promisesByGuestPortalId.forEach(async (portalBindingPromise) => {
      const disposePromise = portalBindingPromise.then((portalBinding) => {
        if (portalBinding) portalBinding.dispose()
      })
      disposePromises.push(disposePromise)
    })
    return Promise.all(disposePromises)
  }

  getGuestPortalBinding (portalId) {
    let promise = this.promisesByGuestPortalId.get(portalId)
    if (!promise) {
      promise = this.createGuestPortalBinding(portalId)
      promise.then((binding) => {
        if (!binding) this.promisesByGuestPortalId.delete(portalId)
      })
      this.promisesByGuestPortalId.set(portalId, promise)
    }

    return promise
  }

  async createGuestPortalBinding (portalId) {
    const portalBinding = new GuestPortalBinding({
      portalId,
      client: this.client,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      addStatusBarIndicatorForPortal: this.addStatusBarIndicatorForPortal,
      didDispose: () => { this.didDisposePortalBinding(portalBinding) }
    })

    if (await portalBinding.initialize()) {
      this.workspace.getElement().classList.add('realtime-Guest')
      return portalBinding
    }
  }

  async getActiveGuestPortalBinding () {
    const activePaneItem = this.workspace.getActivePaneItem()
    for (const [_, portalBindingPromise] of this.promisesByGuestPortalId) {
      const portalBinding = await portalBindingPromise
      if (portalBinding.getActivePaneItem() === activePaneItem) {
        return portalBinding
      }
    }
  }

  didDisposePortalBinding (portalBinding) {
    this.promisesByGuestPortalId.delete(portalBinding.portalId)
    if (this.promisesByGuestPortalId.size === 0) {
      this.workspace.getElement().classList.remove('realtime-Guest')
    }
  }
}
