const {Emitter} = require('atom')
const HostPortalBinding = require('./host-portal-binding')
const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class PortalBindingManager {
  constructor ({client, workspace, notificationManager}) {
    this.emitter = new Emitter()
    this.client = client
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.hostPortalBindingPromise = null
    this.promisesByGuestPortalId = new Map()
  }

  dispose () {
    const disposePromises = []

    if (this.hostPortalBindingPromise) {
      const disposePromise = this.hostPortalBindingPromise.then((portalBinding) => {
        portalBinding.dispose()
      })
      disposePromises.push(disposePromise)
    }

    this.promisesByGuestPortalId.forEach(async (portalBindingPromise) => {
      const disposePromise = portalBindingPromise.then((portalBinding) => {
        if (portalBinding) portalBinding.dispose()
      })
      disposePromises.push(disposePromise)
    })

    return Promise.all(disposePromises)
  }

  createHostPortalBinding () {
    if (this.hostPortalBindingPromise == null) {
      this.hostPortalBindingPromise = this._createHostPortalBinding()
      this.hostPortalBindingPromise.then((binding) => {
        if (!binding) this.hostPortalBindingPromise = null
      })
    }

    return this.hostPortalBindingPromise
  }

  async _createHostPortalBinding () {
    const portalBinding = new HostPortalBinding({
      client: this.client,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      didDispose: () => { this.didDisposeHostPortalBinding() }
    })

    if (await portalBinding.initialize()) {
      this.emitter.emit('did-change')
      return portalBinding
    }
  }

  getHostPortalBinding () {
    return this.hostPortalBindingPromise
      ? this.hostPortalBindingPromise
      : Promise.resolve(null)
  }

  didDisposeHostPortalBinding () {
    this.hostPortalBindingPromise = null
    this.emitter.emit('did-change')
  }

  createGuestPortalBinding (portalId) {
    let promise = this.promisesByGuestPortalId.get(portalId)
    if (promise) {
      promise.then((binding) => {
        if (binding) binding.activate()
      })
    } else {
      promise = this._createGuestPortalBinding(portalId)
      promise.then((binding) => {
        if (!binding) this.promisesByGuestPortalId.delete(portalId)
      })
      this.promisesByGuestPortalId.set(portalId, promise)
    }

    return promise
  }

  async _createGuestPortalBinding (portalId) {
    const portalBinding = new GuestPortalBinding({
      portalId,
      client: this.client,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      didDispose: () => { this.didDisposeGuestPortalBinding(portalBinding) }
    })

    if (await portalBinding.initialize()) {
      this.workspace.getElement().classList.add('teletype-Guest')
      this.emitter.emit('did-change')
      return portalBinding
    }
  }

  getGuestPortalBindings () {
    return Promise.all(this.promisesByGuestPortalId.values())
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

  async hasActivePortals () {
    const hostPortalBinding = await this.getHostPortalBinding()
    const guestPortalBindings = await this.getGuestPortalBindings()

    return (hostPortalBinding != null) || (guestPortalBindings.length > 0)
  }

  didDisposeGuestPortalBinding (portalBinding) {
    this.promisesByGuestPortalId.delete(portalBinding.portalId)
    if (this.promisesByGuestPortalId.size === 0) {
      this.workspace.getElement().classList.remove('teletype-Guest')
    }
    this.emitter.emit('did-change')
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }
}
