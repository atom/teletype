const {Emitter} = require('atom')

module.exports =
class AuthenticationProvider {
  constructor ({client, notificationManager, workspace, credentialCache}) {
    this.client = client
    this.client.onSignInChange(this.didChangeSignIn.bind(this))
    this.credentialCache = credentialCache
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.emitter = new Emitter()
  }

  async signInUsingSavedToken () {
    if (this.isSignedIn()) return true

    const token = await this.credentialCache.get('oauth-token')
    if (token) {
      return this._signIn(token)
    } else {
      return false
    }
  }

  async signIn (token) {
    if (this.isSignedIn()) return true

    if (await this._signIn(token)) {
      await this.credentialCache.set('oauth-token', token)
      return true
    } else {
      return false
    }
  }

  async signOut () {
    if (!this.isSignedIn()) return

    await this.credentialCache.delete('oauth-token')
    this.client.signOut()
  }

  async _signIn (token) {
    try {
      this.signingIn = true
      this.didChangeSignIn()

      const signedIn = await this.client.signIn(token)
      return signedIn
    } catch (error) {
      this.notificationManager.addError('Failed to authenticate to teletype', {
        description: `Signing in failed with error: <code>${error.message}</code>`,
        dismissable: true
      })
    } finally {
      this.signingIn = false
      this.didChangeSignIn()
    }
  }

  isSigningIn () {
    return this.signingIn
  }

  isSignedIn () {
    return this.client.isSignedIn()
  }

  getIdentity () {
    return this.client.getLocalUserIdentity()
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }

  didChangeSignIn () {
    const workspaceElement = this.workspace.getElement()
    if (this.isSignedIn()) {
      workspaceElement.classList.add('teletype-Authenticated')
    } else {
      workspaceElement.classList.remove('teletype-Authenticated')
    }

    this.emitter.emit('did-change')
  }
}
