const {Disposable} = require('atom')

module.exports =
class FakeAuthenticationProvider {
  constructor ({notificationManager}) {
    this.notificationManager = notificationManager
  }

  onDidChange (callback) {
    return new Disposable(callback)
  }

  async signIn (token) {
    return true
  }

  isSigningIn () {
    return false
  }

  async signOut () {}

  dispose () {}
}
