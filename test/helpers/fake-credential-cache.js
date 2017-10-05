module.exports =
class FakeCredentialCache {
  constructor () {
    this.credentialsByKey = new Map()
  }

  async get (key) {
    return this.credentialsByKey.get(key)
  }

  async set (key, password) {
    this.credentialsByKey.set(key, password)
  }

  async delete (key) {
    this.credentialsByKey.delete(key)
  }
}
