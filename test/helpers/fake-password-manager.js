module.exports =
class FakePasswordManager {
  constructor () {
    this.passwordsByKey = new Map()
  }

  getPassword (key) {
    return Promise.resolve(this.passwordsByKey.get(key))
  }

  async setPassword (key, password) {
    await Promise.resolve()
    this.passwordsByKey.set(key, password)
  }

  async deletePassword (key) {
    await Promise.resolve()
    this.passwordsByKey.delete(key)
  }
}
