const {CompositeDisposable} = require('atom')
let [TeletypeClient, Errors] = []
let PortalBindingManager = null
let PortalStatusBarIndicator = null
let AuthenticationProvider = null
let CredentialCache = null

module.exports =
class TeletypePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      credentialCache, pubSubGateway, pusherKey, pusherOptions, baseURL, tetherDisconnectWindow
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.pusherOptions = pusherOptions
    this.baseURL = baseURL
    this.tetherDisconnectWindow = tetherDisconnectWindow
    this.credentialCache = credentialCache
    this.portalBindingManagerPromise = null
  }

  activate () {
    // console.log('teletype: Using pusher key:', this.pusherKey)
    // console.log('teletype: Using base URL:', this.baseURL)

    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(this.commandRegistry.add('atom-workspace.teletype-Authenticated', {
      'teletype:sign-out': () => this.signOut()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace', {
      'teletype:share-portal': () => this.sharePortal()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace', {
      'teletype:join-portal': () => this.joinPortal()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace.teletype-Host', {
      'teletype:close-portal': () => this.closeHostPortal()
    }))
  }

  async deactivate () {
    if (this.subscriptions) this.subscriptions.dispose() // Package is not activated in specs
    if (this.portalStatusBarIndicator) this.portalStatusBarIndicator.destroy()

    if (this.portalBindingManagerPromise) {
      const manager = await this.portalBindingManagerPromise
      if (manager) await manager.dispose()
    }
  }

  async sharePortal () {
    await this.signInUsingSavedToken()
    this.showPopover()

    if (await this.isSignedIn()) {
      const manager = await this.getPortalBindingManager()
      const portalBinding = await manager.createHostPortalBinding()
      if (portalBinding) return portalBinding.portal
    }
  }

  async joinPortal (id) {
    await this.signInUsingSavedToken()
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
    const getPortalBindingManager = async () => await this.getPortalBindingManager()
    const getAuthenticationProvider = async () => await this.getAuthenticationProvider()
    const isClientOutdated = () => this.isClientOutdated
    const hasInitializationError = () => this.initializationError
    if (!PortalStatusBarIndicator) PortalStatusBarIndicator = require('./portal-status-bar-indicator')
    this.portalStatusBarIndicator = new PortalStatusBarIndicator({
      statusBar,
      getPortalBindingManager,
      getAuthenticationProvider,
      isClientOutdated,
      hasInitializationError,
      tooltipManager: this.tooltipManager,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      workspace: this.workspace,
      notificationManager: this.notificationManager
    })

    this.portalStatusBarIndicator.attach()
  }

  async signInUsingSavedToken () {
    const authenticationProvider = await this.getAuthenticationProvider()
    if (authenticationProvider) {
      return authenticationProvider.signInUsingSavedToken()
    } else {
      return false
    }
  }

  async signOut () {
    const authenticationProvider = await this.getAuthenticationProvider()
    if (authenticationProvider) {
      this.portalStatusBarIndicator.showPopover()
      await authenticationProvider.signOut()
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

    let {popoverComponent} = this.portalStatusBarIndicator
    if (!popoverComponent) popoverComponent = await this.portalStatusBarIndicator.initialOpenPromise
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
    if (this.authenticationProvider) return Promise.resolve(this.authenticationProvider)

    if (!this.authenticationProviderPromise) {
      this.authenticationProviderPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          if (!AuthenticationProvider) AuthenticationProvider = require('./authentication-provider')
          if (!this.credentialCache) {
            if (!CredentialCache) CredentialCache = require('./credential-cache')
            this.credentialCache = new CredentialCache()
          }
          this.authenticationProvider = new AuthenticationProvider({
            client,
            credentialCache: this.credentialCache,
            notificationManager: this.notificationManager,
            workspace: this.workspace
          })
          resolve(this.authenticationProvider)
        } else {
          this.authenticationProviderPromise = null
          resolve(null)
        }
      })
    }

    return this.authenticationProviderPromise
  }

  getPortalBindingManager () {
    if (this.portalBindingManager) return Promise.resolve(this.portalBindingManager)

    if (!this.portalBindingManagerPromise) {
      this.portalBindingManagerPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          if (!PortalBindingManager) PortalBindingManager = require('./portal-binding-manager')
          this.portalBindingManager = new PortalBindingManager({
            client,
            workspace: this.workspace,
            notificationManager: this.notificationManager
          })
          resolve(this.portalBindingManager)
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
      if(!TeletypeClient) ({TeletypeClient, Errors} = require('@atom/teletype-client'))
      if (this.client) {
        await this.client.initialize()
        return this.client
      }

      this.client = new TeletypeClient({
        pusherKey: this.pusherKey,
        pusherOptions: this.pusherOptions,
        baseURL: this.baseURL,
        pubSubGateway: this.pubSubGateway,
        tetherDisconnectWindow: this.tetherDisconnectWindow
      })
      this.client.onConnectionError(this.handleConnectionError.bind(this))

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
