const keytar = require('keytar')

module.exports =
class KeytarPasswordManager {
  getPassword (key) {
    return keytar.getPassword('real-time', key)
  }

  setPassword (key, password) {
    return keytar.setPassword('real-time', key, password)
  }
}
