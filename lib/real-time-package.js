const path = require('path')
const {CompositeDisposable} = require('atom')
const {RealTimeClient} = require('@atom/real-time-client')
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
      'real-time:close-portal': this.closeHostPortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace .realtime-RemotePaneItem', {
      'real-time:leave-portal': this.leaveGuestPortal.bind(this),
    })
    this.commandRegistry.add('atom-text-editor.realtime-RemotePaneItem', {
      'real-time:toggle-follow-host-cursor': this.toggleFollowHostCursor.bind(this)
    })
  }

  async sharePortal () {
    const client = await this.getClient()
    this.hostPortalBinding = new HostPortalBinding({
      client,
      workspace: this.workspace,
      clipboard: this.clipboard,
      notificationManager: this.notificationManager,
      addStatusBarIndicatorForPortal: this.addStatusBarIndicatorForPortal.bind(this)
    })
    await this.hostPortalBinding.initialize()
    return this.hostPortalBinding.portal
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
    const portalBinding = new GuestPortalBinding({
      client,
      portalId,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      didDispose: () => {this.didDisposePortalBinding(portalBinding) },
      addStatusBarIndicatorForPortal: this.addStatusBarIndicatorForPortal.bind(this)
    })
    if (await portalBinding.initialize()) {
      this.guestPortalBindings.push(portalBinding)
      this.workspace.getElement().classList.add('realtime-Guest')
      return portalBinding.portal
    }
  }

  closeHostPortal () {
    this.hostPortalBinding.close()
    this.hostPortalBinding = null
  }

  leaveGuestPortal () {
    this.getActiveGuestPortalBinding().close()
  }

  didDisposePortalBinding (portalBinding) {
    this.guestPortalBindings.splice(this.guestPortalBindings.indexOf(portalBinding), 1)
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
      return this.statusBar.addRightTile({item: indicator, priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR})
    }
  }

  async getClient () {
    if (!this.client) {
      this.client = new RealTimeClient({
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
