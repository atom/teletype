const LoginDialog = require('./login-dialog')

module.exports =
class GithubAuthTokenProvider {
  constructor ({credentialCache, commandRegistry, workspace}) {
    this.credentialCache = credentialCache
    this.commandRegistry = commandRegistry
    this.workspace = workspace
    this.tokenIsInvalid = false
  }

  async getToken (canPrompt) {
    const previousTokenWasInvalid = this.tokenIsInvalid
    this.tokenIsInvalid = false

    let token
    if (!previousTokenWasInvalid) {
      token = await this.credentialCache.get('oauth-token')
    }

    if (token) {
      return token
    } else if (canPrompt) {
      const token = await this.showLoginDialog(previousTokenWasInvalid)
      return token
    } else {
      return null
    }
  }

  async didInvalidateToken () {
    this.tokenIsInvalid = true
    await this.credentialCache.delete('oauth-token')
  }

  showLoginDialog (previousTokenWasInvalid) {
    return new Promise((resolve) => {
      const loginDialog = new LoginDialog({
        commandRegistry: this.commandRegistry,
        tokenIsInvalid: previousTokenWasInvalid,
        didConfirm: async (token) => {
          resolve(token)

          modalPanel.destroy()
          loginDialog.dispose()
          await this.credentialCache.set('oauth-token', token)
        },
        didCancel: () => {
          resolve(null)

          modalPanel.destroy()
          loginDialog.dispose()
        }
      })
      const modalPanel = this.workspace.addModalPanel({item: loginDialog, className: 'realtime-LoginPanel'})
      loginDialog.focus()
    })
  }
}
