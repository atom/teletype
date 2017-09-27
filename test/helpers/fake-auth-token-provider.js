let tokenCount = 0

module.exports =
class FakeAuthTokenProvider {
  constructor () {
    this.token = 'oauth-token-' + tokenCount++
  }

  getToken () {
    return Promise.resolve(this.token)
  }

  didInvalidateToken () {
    this.token = null
  }
}
