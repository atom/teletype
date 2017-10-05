const LoginDialog = require('./login-dialog')

module.exports =
class GithubAuthenticationProvider {
  constructor ({client, credentialCache, commandRegistry, notificationManager, workspace}) {
    this.credentialCache = credentialCache
    this.commandRegistry = commandRegistry
    this.notificationManager = notificationManager
    this.workspace = workspace
    this.client = client
    this.client.onSignOut(this.didSignOut.bind(this))
  }

  async signIn () {
    try {
      return (
        this.client.isSignedIn() ||
        await this.signInUsingSavedToken() ||
        await this.promptForTokenAndSignIn()
      )
    } catch (error) {
      this.notificationManager.addError('Failed to sign in', {
        description: `Signing in failed with error: <code>${error.message}</code>`,
        dismissable: true
      })

      return false
    }
  }

  async signInUsingSavedToken () {
    const savedToken = await this.credentialCache.get('oauth-token')
    if (savedToken) {
      return this.client.signIn(savedToken)
    } else {
      return false
    }
  }

  async promptForTokenAndSignIn () {
    const loginDialog = new LoginDialog({commandRegistry: this.commandRegistry})
    const modalPanel = this.workspace.addModalPanel({item: loginDialog, className: 'realtime-LoginPanel'})
    loginDialog.focus()

    try {
      let signedIn = false
      while (true) {
        const token = await loginDialog.getNextTokenPromise()
        if (token == null) break

        await loginDialog.update({invalidToken: false})
        if (await this.client.signIn(token)) {
          await this.credentialCache.set('oauth-token', token)
          signedIn = true
          break
        } else {
          await loginDialog.update({invalidToken: true})
        }
      }

      return signedIn
    } finally {
      modalPanel.destroy()
      loginDialog.dispose()
    }
  }

  async didSignOut () {
    await this.credentialCache.delete('oauth-token')
    this.notificationManager.addWarning('You have been signed out', {
      description: 'Please, share or join a portal to sign in again.',
      dismissable: true
    })
  }
}
