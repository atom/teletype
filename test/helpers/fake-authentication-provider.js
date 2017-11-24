const {Disposable} = require('atom')

module.exports =
class FakeAuthenticationProvider {
  constructor ({shouldFailSignIn, notificationManager}) {
    this.shouldFailSignIn = shouldFailSignIn
    this.notificationManager = notificationManager
  }

  onDidChange (callback) {
    return new Disposable(callback)
  }

  async signIn (token) {
    if (this.shouldFailSignIn) {
      this.notificationManager.addError()
    }
    return !this.shouldFailSignIn
  }

  isSigningIn () {
    return false
  }

  async signOut () {

  }

  dispose () {

  }
}
