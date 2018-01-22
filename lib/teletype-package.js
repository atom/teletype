const {TeletypeClient, Errors} = require('@atom/teletype-client')
const {CompositeDisposable} = require('atom')
const PortalBindingManager = require('./portal-binding-manager')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const AuthenticationProvider = require('./authentication-provider')
const CredentialCache = require('./credential-cache')

module.exports =
class TeletypePackage {
  constructor (options) {
    const {
      baseURL, clipboard, commandRegistry, credentialCache, notificationManager,
      packageManager, pubSubGateway, pusherKey, pusherOptions,
      tetherDisconnectWindow, tooltipManager, workspace
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.packageManager = packageManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.pusherOptions = pusherOptions
    this.baseURL = baseURL
    this.tetherDisconnectWindow = tetherDisconnectWindow
    this.credentialCache = credentialCache || new CredentialCache()
    this.client = new TeletypeClient({
      pusherKey: this.pusherKey,
      pusherOptions: this.pusherOptions,
      baseURL: this.baseURL,
      pubSubGateway: this.pubSubGateway,
      tetherDisconnectWindow: this.tetherDisconnectWindow
    })
    this.client.onConnectionError(this.handleConnectionError.bind(this))
    this.portalBindingManagerPromise = null
  }

  activate () {
    console.log('teletype: Using pusher key:', this.pusherKey)
    console.log('teletype: Using base URL:', this.baseURL)

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
    this.subscriptions.add(this.commandRegistry.add('teletype-RemotePaneItem', {
      'teletype:leave-portal': () => this.leavePortal()
    }))
    this.subscriptions.add(this.commandRegistry.add('atom-workspace.teletype-Host', {
      'teletype:close-portal': () => this.closeHostPortal()
    }))

    // Initiate sign-in, which will continue asynchronously, since we don't want
    // to block here.
    this.signInUsingSavedToken()
  }

  async deactivate () {
    this.initializationError = null

    if (this.subscriptions) this.subscriptions.dispose() // Package is not activated in specs
    if (this.portalStatusBarIndicator) this.portalStatusBarIndicator.destroy()

    if (this.portalBindingManagerPromise) {
      const manager = await this.portalBindingManagerPromise
      await manager.dispose()
    }
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

  async leavePortal () {
    this.showPopover()

    const manager = await this.getPortalBindingManager()
    const guestPortalBinding = await manager.getActiveGuestPortalBinding()
    guestPortalBinding.leave()
  }

  async consumeStatusBar (statusBar) {
    const teletypeClient = await this.getClient()
    const portalBindingManager = await this.getPortalBindingManager()
    const authenticationProvider = await this.getAuthenticationProvider()
    this.portalStatusBarIndicator = new PortalStatusBarIndicator({
      statusBar,
      teletypeClient,
      portalBindingManager,
      authenticationProvider,
      isClientOutdated: this.isClientOutdated,
      initializationError: this.initializationError,
      tooltipManager: this.tooltipManager,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      packageManager: this.packageManager
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
            notificationManager: this.notificationManager,
            workspace: this.workspace
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
    if (this.initializationError) return null
    if (this.isClientOutdated) return null

    try {
      await this.client.initialize()
      return this.client
    } catch (error) {
      if (error instanceof Errors.ClientOutOfDateError) {
        this.isClientOutdated = true
      } else {
        this.initializationError = error
      }
    }
  }
}
