const {RealTimeClient, Errors} = require('@atom/real-time-client')
const PortalBindingManager = require('./portal-binding-manager')
const JoinPortalDialog = require('./join-portal-dialog')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')
const GithubAuthenticationProvider = require('./github-authentication-provider')
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
      pubSubGateway: this.pubSubGateway,
      authTokenProvider: this.authTokenProvider
    })
    this.client.onConnectionError(this.handleConnectionError.bind(this))
    this.portalBindingManagerPromise = null
  }

  async dispose () {
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
  }

  async sharePortal () {
    if (!await this.signIn()) return

    const manager = await this.getPortalBindingManager()
    if (manager) {
      const hostPortalBinding = await manager.getHostPortalBinding()
      if (hostPortalBinding) return hostPortalBinding.portal
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
    if (!await this.signIn()) return

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
    activePortalBinding.close()
  }

  async toggleFollowHostCursor () {
    const manager = await this.getPortalBindingManager()
    const activePortalBinding = await manager.getActiveGuestPortalBinding()
    activePortalBinding.toggleFollowHostCursorOnActiveEditorProxy()
  }

  async consumeStatusBar (statusBar) {
    await this.signIn() // TODO Don't do this here
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    const indicator = new PortalStatusBarIndicator({
      portalBindingManager: await this.getPortalBindingManager(),
      tooltipManager: this.tooltipManager
    })
    return statusBar.addRightTile({item: indicator, priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR})
  }

  handleConnectionError (event) {
    const message = 'Connection Error'
    const description = `An error occurred with a real-time connection: <code>${event.message}</code>`
    this.notificationManager.addError(message, {
      description,
      dismissable: true
    })
  }

  async signIn () {
    const authenticationProvider = await this.getAuthenticationProvider()
    if (authenticationProvider) {
      return authenticationProvider.signIn()
    } else {
      return false
    }
  }

  getAuthenticationProvider () {
    if (!this.authenticationProviderPromise) {
      this.authenticationProviderPromise = new Promise(async (resolve, reject) => {
        const client = await this.getClient()
        if (client) {
          resolve(new GithubAuthenticationProvider({
            client,
            workspace: this.workspace,
            commandRegistry: this.commandRegistry,
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
