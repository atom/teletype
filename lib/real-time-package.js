const {RealTimeClient, Errors} = require('@atom/real-time-client')
const PortalBindingManager = require('./portal-binding-manager')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const AuthenticationProvider = require('./authentication-provider')
const CredentialCache = require('./credential-cache')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, pubSubGateway, pusherKey, baseURL
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.credentialCache = credentialCache || new CredentialCache()
    this.client = new RealTimeClient({
      pusherKey: this.pusherKey,
      baseURL: this.baseURL,
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

    this.commandRegistry.add('atom-workspace', {
      'real-time:share-portal': () => this.sharePortal()
    })
    this.commandRegistry.add('atom-workspace', {
      'real-time:join-portal': () => this.joinPortal()
    })
    this.commandRegistry.add('atom-workspace.realtime-Host', {
      'real-time:close-portal': () => this.closeHostPortal()
    })
    this.commandRegistry.add('atom-text-editor.realtime-RemotePaneItem', {
      'real-time:toggle-follow-host-cursor': () => this.toggleFollowHostCursor()
    })

    // Initiate sign-in, which will continue asynchronously, since we don't want
    // to block here.
    this.signInUsingSavedToken()
  }

  async sharePortal () {
    this.showPopover()

    if (await this.isSignedIn()) {
      const manager = await this.getPortalBindingManager()
      const portalBinding = await manager.createHostPortalBinding()
      if (portalBinding) {
        await this.showSharingInstructions()
        return portalBinding.portal
      }
    }
  }

  async joinPortal (id) {
    this.showPopover()

    if (await this.isSignedIn()) {
      if (id) {
        const manager = await this.getPortalBindingManager()
        const portalBinding = await manager.createGuestPortalBinding(id)
        if (portalBinding) return portalBinding.portal
      } else {
        await this.showJoinPortalPrompt()
      }
    }
  }

  async closeHostPortal () {
    this.showPopover()

    const manager = await this.getPortalBindingManager()
    const hostPortalBinding = await manager.getHostPortalBinding()
    hostPortalBinding.close()
  }

  async toggleFollowHostCursor () {
    const manager = await this.getPortalBindingManager()
    const activePortalBinding = await manager.getActiveGuestPortalBinding()
    activePortalBinding.toggleFollowHostCursorOnActiveEditorProxy()
  }

  async consumeStatusBar (statusBar) {
    const realTimeClient = await this.getClient()
    if (!realTimeClient) return

    const portalBindingManager = await this.getPortalBindingManager()
    if (!portalBindingManager) return

    const authenticationProvider = await this.getAuthenticationProvider()
    if (!authenticationProvider) return

    this.portalStatusBarIndicator = new PortalStatusBarIndicator({
      realTimeClient,
      portalBindingManager,
      authenticationProvider,
      tooltipManager: this.tooltipManager,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard
    })

    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
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

  showPopover () {
    if (!this.portalStatusBarIndicator) return

    this.portalStatusBarIndicator.showPopover()
  }

  async showSharingInstructions () {
    if (!this.portalStatusBarIndicator) return

    const {popoverComponent} = this.portalStatusBarIndicator
    const {portalListComponent} = popoverComponent.refs
    await portalListComponent.showSharingInstructions()
  }

  async showJoinPortalPrompt () {
    if (!this.portalStatusBarIndicator) return

    const {popoverComponent} = this.portalStatusBarIndicator
    const {portalListComponent} = popoverComponent.refs
    await portalListComponent.showJoinPortalPrompt()
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
