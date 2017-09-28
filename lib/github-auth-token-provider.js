const {CompositeDisposable, Disposable, TextEditor} = require('atom')
const LoginDialog = require('./login-dialog')

module.exports =
class GithubAuthTokenProvider {
  constructor ({credentialCache, workspace}) {
    this.credentialCache = credentialCache
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
        tokenIsInvalid: previousTokenWasInvalid,
        didConfirm: async (token) => {
          modalPanel.destroy()
          await this.credentialCache.set('oauth-token', token)
          resolve(token)
        },
        didBlur: () => {
          modalPanel.destroy()
          resolve(null)
        }
      })
      const modalPanel = this.workspace.addModalPanel({item: loginDialog})
      loginDialog.focus()
    })
  }
}
