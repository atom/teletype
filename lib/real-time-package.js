const path = require('path')

const {CompositeDisposable} = require('atom')
const {allowUnsafeNewFunction} = require('loophole')

// Bypass CSP errors caused by Protobuf in Tachyon.
// TODO: Remove this once Atom 1.20 reaches stable.
let Client
allowUnsafeNewFunction(() => { Client = require('@atom/real-time-client') })

const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const HostPortalBinding = require('./host-portal-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const JoinPortalDialog = require('./join-portal-dialog')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      restGateway, pubSubGateway, pusherKey, baseURL
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.restGateway = restGateway
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.hostPortalBinding = null
    this.guestPortalBindings = []
    this.statusBarTilesByPortalId = new Map()
  }

  async dispose () {
    if (this.hostPortalBinding) await this.hostPortalBinding.dispose()

    for (const binding of this.guestPortalBindings) {
      await binding.dispose()
    }
  }

  activate () {
    console.log('real-time: Using pusher key:', this.pusherKey)
    console.log('real-time: Using base URL:', this.baseURL)

    this.commandRegistry.add('atom-workspace:not(.realtime-Host):not(.realtime-Guest)', {
      'real-time:share-portal': this.sharePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace:not(.realtime-Host)', {
      'real-time:join-portal': this.showJoinPortalDialog.bind(this)
    })
    this.commandRegistry.add('atom-workspace.realtime-Host', {
      'real-time:close-portal': this.closePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace .realtime-RemotePaneItem', {
      'real-time:leave-portal': this.leavePortal.bind(this),
    })
    this.commandRegistry.add('atom-text-editor.realtime-RemotePaneItem', {
      'real-time:toggle-follow-host-cursor': this.toggleFollowHostCursor.bind(this)
    })
  }

  async sharePortal () {
    const client = await this.getClient()
    const portal = await client.createPortal()
    this.hostPortalBinding = new HostPortalBinding({
      portal,
      workspace: this.workspace,
      clipboard: this.clipboard,
      notificationManager: this.notificationManager
    })
    this.hostPortalBinding.initialize()
    this.addStatusBarIndicatorForPortal(portal, {isHost: true})
    return portal
  }

  showJoinPortalDialog () {
    const dialog = new JoinPortalDialog({
      workspace: this.workspace,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      didConfirm: (portalId) => { this.joinPortal(portalId) }
    })
    dialog.show()
  }

  async joinPortal (portalId) {
    const client = await this.getClient()
    const portal = await client.joinPortal(portalId)
    this.addStatusBarIndicatorForPortal(portal, {isHost: false})
    const portalBinding = new GuestPortalBinding({
      portal,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      hostDidDisconnect: () => { this.disposeGuestPortalForBinding(portalBinding) },
      didLeave: () => { this.disposeGuestPortalForBinding(portalBinding) }
    })
    portalBinding.initialize()
    this.guestPortalBindings.push(portalBinding)
    return portal
  }

  closePortal () {
    this.hostPortalBinding.close()
    this.removeStatusBarIndicatorForPortal(this.hostPortalBinding.portal)
  }

  leavePortal () {
    const portalBinding = this.getActiveGuestPortalBinding()
    portalBinding.portal.dispose()
    this.disposeGuestPortalForBinding(portalBinding)
  }

  disposeGuestPortalForBinding (portalBinding) {
    const index = this.guestPortalBindings.indexOf(portalBinding)
    const portal = portalBinding.portal
    portalBinding.dispose()
    this.guestPortalBindings.splice(index, 1)

    this.removeStatusBarIndicatorForPortal(portal)
    if (this.guestPortalBindings.length === 0) {
      this.workspace.getElement().classList.remove('realtime-Guest')
    }
  }

  toggleFollowHostCursor () {
    const portalBinding = this.guestPortalBindings.find(b => b.getActivePaneItem() === this.workspace.getActivePaneItem())
    portalBinding.toggleFollowHostCursorOnActiveEditorProxy()
  }

  consumeStatusBar (statusBar) {
    this.statusBar = statusBar
    this.workspace.observeActivePaneItem(this.didChangeActivePaneItem.bind(this))
  }

  didChangeActivePaneItem (paneItem) {
    for (let i = 0; i < this.guestPortalBindings.length; i++) {
      const portalBinding = this.guestPortalBindings[i]
      const isFocused = (paneItem === portalBinding.getActivePaneItem())
      const statusBarTile = this.statusBarTilesByPortalId.get(portalBinding.portal.id)
      if (statusBarTile) statusBarTile.getItem().setFocused(isFocused)
    }
  }

  addStatusBarIndicatorForPortal (portal, {isHost}) {
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    if (this.statusBar) {
      const indicator = new PortalStatusBarIndicator({
        clipboard: this.clipboard,
        tooltipManager: this.tooltipManager,
        portal
      })
      if (isHost) indicator.setFocused(true)
      const tile = this.statusBar.addRightTile({item: indicator, priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR})
      this.statusBarTilesByPortalId.set(portal.id, tile)
    }
  }

  removeStatusBarIndicatorForPortal (portal) {
    const tile = this.statusBarTilesByPortalId.get(portal.id)
    if (tile) {
      tile.getItem().dispose()
      tile.destroy()
      this.statusBarTilesByPortalId.delete(portal.id)
    }
  }

  async getClient () {
    if (!this.client) {
      this.client = new Client({
        pusherKey: this.pusherKey,
        baseURL: this.baseURL,
        restGateway: this.restGateway,
        pubSubGateway: this.pubSubGateway
      })
      await this.client.initialize()
    }

    return this.client
  }

  getActiveGuestPortalBinding () {
    return this.guestPortalBindings.find(b => b.getActivePaneItem() === this.workspace.getActivePaneItem())
  }
}
