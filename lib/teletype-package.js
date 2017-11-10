const {TeletypeClient, Errors} = require('@atom/teletype-client')
const PortalBindingManager = require('./portal-binding-manager')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const AuthenticationProvider = require('./authentication-provider')
const CredentialCache = require('./credential-cache')

module.exports =
class TeletypePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, pubSubGateway, pusherKey, baseURL, tetherDisconnectWindow
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.tetherDisconnectWindow = tetherDisconnectWindow
    this.credentialCache = credentialCache || new CredentialCache()
    this.client = new TeletypeClient({
      pusherKey: this.pusherKey,
      baseURL: this.baseURL,
      pubSubGateway: this.pubSubGateway,
      tetherDisconnectWindow: this.tetherDisconnectWindow
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
    console.log('teletype: Using pusher key:', this.pusherKey)
    console.log('teletype: Using base URL:', this.baseURL)

    this.commandRegistry.add('atom-workspace', {
      'teletype:share-portal': () => this.sharePortal()
    })
    this.commandRegistry.add('atom-workspace', {
      'teletype:join-portal': () => this.joinPortal()
    })
    this.commandRegistry.add('atom-workspace.teletype-Host', {
      'teletype:close-portal': () => this.closeHostPortal()
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
      if (portalBinding) return portalBinding.portal
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

  async consumeStatusBar (statusBar) {
    const teletypeClient = await this.getClient()
    const portalBindingManager = await this.getPortalBindingManager()
    const authenticationProvider = await this.getAuthenticationProvider()
    this.portalStatusBarIndicator = new PortalStatusBarIndicator({
      teletypeClient,
      portalBindingManager,
      authenticationProvider,
      isClientOutdated: this.isClientOutdated,
      tooltipManager: this.tooltipManager,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      workspace: this.workspace
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

  async showJoinPortalPrompt () {
    if (!this.portalStatusBarIndicator) return

    const {popoverComponent} = this.portalStatusBarIndicator
    const {portalListComponent} = popoverComponent.refs
    await portalListComponent.showJoinPortalPrompt()
  }

  handleConnectionError (event) {
    const message = 'Connection Error'
    const description = `An error occurred with a teletype connection: <code>${event.message}</code>`
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
      if (error instanceof Errors.ClientOutOfDateError) {
        this.isClientOutdated = true
      } else {
        this.notificationManager.addError('Failed to initialize the teletype package', {
          description: `Establishing a teletype connection failed with error: <code>${error.message}</code>`,
          dismissable: true
        })
      }
    }
  }
}
