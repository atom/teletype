let tokenCount = 0

module.exports =
class FakeAuthTokenProvider {
  getToken () {
    return Promise.resolve('oauth-token-' + tokenCount++)
  }
}
