let tokenCount = 0

module.exports =
class FakeAuthenticationProvider {
  authenticate () {
    return Promise.resolve('oauth-token-' + tokenCount++)
  }
}
