module.exports =
class FakePasswordManager {
  constructor () {
    this.password = null
  }

  get () {
    return Promise.resolve(this.password)
  }

  async set (password) {
    await Promise.resolve()
    this.password = password
  }
}
