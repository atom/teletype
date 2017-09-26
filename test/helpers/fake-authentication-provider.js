let tokenCount = 0

module.exports =
class FakeAuthenticationProvider {
  login () {
    return 'oauth-token-' + tokenCount++
  }
}
