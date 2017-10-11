const {RealTimeClient, Errors} = require('@atom/real-time-client')
const PortalBindingManager = require('./portal-binding-manager')
const JoinPortalDialog = require('./join-portal-dialog')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const AuthenticationProvider = require('./authentication-provider')
const CredentialCache = require('./credential-cache')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, restGateway, pubSubGateway, pusherKey, baseURL
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
    this.credentialCache = credentialCache || new CredentialCache()
    this.client = new RealTimeClient({
      pusherKey: this.pusherKey,
      baseURL: this.baseURL,
      restGateway: this.restGateway,
      pubSubGateway: this.pubSubGateway
    })
    this.client.onConnectionError(this.handleConnectionError.bind(this))
    this.portalBindingManagerPromise = null
  }

  async dispose () {
    if (this.portalStatusBarIndicator) {
      this.statusBarTile.destroy()
      this.portalStatusBarIndicator.dispose()
    }

    if (this.portalBindingManagerPromise) {
      const manager = await this.portalBindingManagerPromise
      await manager.dispose()
    }
  }

  activate () {
    console.log('real-time: Using pusher key:', this.pusherKey)
    console.log('real-time: Using base URL:', this.baseURL)

    this.commandRegistry.add('atom-workspace:not(.realtime-Host)', {
      'real-time:share-portal': this.sharePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace', {
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

    // Initiate sign-in, which will continue asynchronously, since we don't want
    // to block here.
    this.signInUsingSavedToken()
  }

  async sharePortal () {
    if (!await this.isSignedIn()) {
      this.promptForSignIn()
      return
    }

    const manager = await this.getPortalBindingManager()
    if (manager) {
      const hostPortalBinding = await manager.createHostPortalBinding()
      if (hostPortalBinding) return hostPortalBinding.portal
    }
  }

  async showJoinPortalDialog () {
    if (!await this.isSignedIn()) {
      this.promptForSignIn()
      return
    }

    const dialog = new JoinPortalDialog({
      workspace: this.workspace,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      didConfirm: (portalId) => { this.joinPortal(portalId) }
    })
    dialog.show()
  }

  async joinPortal (portalId) {
    if (!await this.isSignedIn()) {
      this.promptForSignIn()
      return
    }

    const manager = await this.getPortalBindingManager()
    if (manager) {
      const portalBinding = await manager.getGuestPortalBinding(portalId)
      if (portalBinding) {
        portalBinding.activate()
        return portalBinding.portal
      }
    }
  }

  async closeHostPortal () {
    const manager = await this.getPortalBindingManager()
    const hostPortalBinding = await manager.getHostPortalBinding()
    hostPortalBinding.close()
  }

  async leaveGuestPortal () {
    const manager = await this.getPortalBindingManager()
    const activePortalBinding = await manager.getActiveGuestPortalBinding()
    activePortalBinding.leave()
  }

  async toggleFollowHostCursor () {
    const manager = await this.getPortalBindingManager()
    const activePortalBinding = await manager.getActiveGuestPortalBinding()
    activePortalBinding.toggleFollowHostCursorOnActiveEditorProxy()
  }

  async consumeStatusBar (statusBar) {
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    this.portalStatusBarIndicator = new PortalStatusBarIndicator({
      realTimeClient: await this.getClient(),
      portalBindingManager: await this.getPortalBindingManager(),
      authenticationProvider: await this.getAuthenticationProvider(),
      tooltipManager: this.tooltipManager,
      commandRegistry: this.commandRegistry
    })
    this.statusBarTile = statusBar.addRightTile({
      item: this.portalStatusBarIndicator,
      priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR
    })
  }

  async signInUsingSavedToken () {
    const authenticationProvider = await this.getAuthenticationProvider()
    if (authenticationProvider) {
      return authenticationProvider.signInUsingSavedToken()
    } else {
      return false
    }
  }

  async isSignedIn () {
    const authenticationProvider = await this.getAuthenticationProvider()
    if (authenticationProvider) {
      return authenticationProvider.isSignedIn()
    } else {
      return false
    }
  }

  promptForSignIn () {
    if (this.portalStatusBarIndicator) {
      this.portalStatusBarIndicator.showPopover()
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

  getAuthenticationProvider () {
    if (!this.authenticationProviderPromise) {
      this.authenticationProviderPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          resolve(new AuthenticationProvider({
            client,
            credentialCache: this.credentialCache,
            notificationManager: this.notificationManager
          }))
        } else {
          this.authenticationProviderPromise = null
          resolve(null)
        }
      })
    }

    return this.authenticationProviderPromise
  }

  getPortalBindingManager () {
    if (!this.portalBindingManagerPromise) {
      this.portalBindingManagerPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          resolve(new PortalBindingManager({
            client,
            workspace: this.workspace,
            clipboard: this.clipboard,
            notificationManager: this.notificationManager
          }))
        } else {
          this.portalBindingManagerPromise = null
          resolve(null)
        }
      })
    }

    return this.portalBindingManagerPromise
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
