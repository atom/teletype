const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class GuestPortalBindingRegistry {
  constructor ({client, workspace, notificationManager, addStatusBarIndicatorForPortal}) {
    this.client = client
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.addStatusBarIndicatorForPortal = addStatusBarIndicatorForPortal
    this.promisesByPortalId = new Map()
  }

  dispose () {
    const disposePromises = []
    this.promisesByPortalId.forEach(async (portalBindingPromise) => {
      const disposePromise = portalBindingPromise.then((portalBinding) => {
        if (portalBinding) portalBinding.dispose()
      })
      disposePromises.push(disposePromise)
    })
    return Promise.all(disposePromises)
  }

  getPortalBinding (portalId) {
    let promise = this.promisesByPortalId.get(portalId)
    if (!promise) {
      promise = this.createPortalBinding(portalId)
      promise.then((binding) => {
        if (!binding) this.promisesByPortalId.delete(portalId)
      })
      this.promisesByPortalId.set(portalId, promise)
    }

    return promise
  }

  async createPortalBinding (portalId) {
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

  async getActivePortalBinding () {
    const activePaneItem = this.workspace.getActivePaneItem()
    for (const [_, portalBindingPromise] of this.promisesByPortalId) {
      const portalBinding = await portalBindingPromise
      if (portalBinding.getActivePaneItem() === activePaneItem) {
        return portalBinding
      }
    }
  }

  didDisposePortalBinding (portalBinding) {
    this.promisesByPortalId.delete(portalBinding.portalId)
    if (this.promisesByPortalId.size === 0) {
      this.workspace.getElement().classList.remove('realtime-Guest')
    }
  }
}
