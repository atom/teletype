module.exports =
class FakeCredentialCache {
  constructor () {
    this.credentialsByKey = new Map()
  }

  get (key) {
    return Promise.resolve(this.credentialsByKey.get(key))
  }

  async set (key, password) {
    await Promise.resolve()
    this.credentialsByKey.set(key, password)
  }

  async delete (key) {
    await Promise.resolve()
    this.credentialsByKey.delete(key)
  }
}
