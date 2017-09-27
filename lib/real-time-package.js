const path = require('path')
const {shell} = require('electron')
const {CompositeDisposable} = require('atom')
const {RealTimeClient, Errors} = require('@atom/real-time-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const HostPortalBinding = require('./host-portal-binding')
const GuestPortalBindingRegistry = require('./guest-portal-binding-registry')
const GuestPortalBinding = require('./guest-portal-binding')
const JoinPortalDialog = require('./join-portal-dialog')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const GithubAuthTokenProvider = require('./github-auth-token-provider')
const CredentialCache = require('./credential-cache')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      authTokenProvider, restGateway, pubSubGateway, pusherKey, baseURL
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
    this.authTokenProvider = authTokenProvider || new GithubAuthTokenProvider({
      workspace,
      commandRegistry,
      credentialCache: new CredentialCache(),
      openURL: shell.openExternal.bind(shell)
    })
    this.client = new RealTimeClient({
      pusherKey: this.pusherKey,
      baseURL: this.baseURL,
      restGateway: this.restGateway,
      pubSubGateway: this.pubSubGateway,
      authTokenProvider: this.authTokenProvider
    })
    this.client.onConnectionError(this.handleConnectionError.bind(this))
    this.hostPortalBinding = null
    this.guestPortalBindingRegistryPromise = null
  }

  async dispose () {
    if (this.hostPortalBinding) await this.hostPortalBinding.dispose()
    if (this.guestPortalBindingRegistryPromise) {
      const registry = await this.guestPortalBindingRegistryPromise
      await registry.dispose()
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
    if (client) {
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
    const registry = await this.getGuestPortalBindingRegistry()
    if (registry) {
      const portalBinding = await registry.getPortalBinding(portalId)
      if (portalBinding) {
        portalBinding.activate()
        return portalBinding.portal
      }
    }
  }

  closeHostPortal () {
    this.hostPortalBinding.close()
    this.hostPortalBinding = null
  }

  async leaveGuestPortal () {
    const registry = await this.getGuestPortalBindingRegistry()
    const activePortalBinding = await registry.getActivePortalBinding()
    activePortalBinding.close()
  }

  async toggleFollowHostCursor () {
    const registry = await this.getGuestPortalBindingRegistry()
    const activePortalBinding = await registry.getActivePortalBinding()
    activePortalBinding.toggleFollowHostCursorOnActiveEditorProxy()
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

  handleConnectionError (event) {
    const message = 'Connection Error'
    const description = `An error occurred with a real-time connection: <code>${event.message}</code>`
    this.notificationManager.addError(message, {
      description,
      dismissable: true
    })
  }

  getGuestPortalBindingRegistry () {
    if (!this.guestPortalBindingRegistryPromise) {
      this.guestPortalBindingRegistryPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          resolve(new GuestPortalBindingRegistry({
            client,
            workspace: this.workspace,
            notificationManager: this.notificationManager,
            addStatusBarIndicatorForPortal: this.addStatusBarIndicatorForPortal.bind(this)
          }))
        } else {
          this.guestPortalBindingRegistryPromise = null
          resolve(null)
        }
      })
    }

    return this.guestPortalBindingRegistryPromise
  }

  async getClient () {
    try {
      await this.client.initialize()
      return this.client
    } catch (error) {
      let message, description, buttons
      if (error instanceof Errors.ClientOutOfDateError) {
        message = 'The real-time package is out of date'
        description = 'You will need to update the package to continue collaborating.'
        buttons = [{
          text: 'View Package Settings',
          onDidClick: () => {
            this.workspace.open('atom://config/packages/real-time')
            notification.dismiss()
          }
        }]
      } else {
        message = 'Failed to initialize the real-time package'
        description = `Establishing a real-time connection failed with error: <code>${error.message}</code>`
        buttons = null
      }

      const notification = this.notificationManager.addError(message, {
        description,
        buttons,
        dismissable: true
      })
    }
  }
}
