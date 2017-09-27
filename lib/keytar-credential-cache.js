const keytar = require('keytar')

module.exports =
class KeytarCredentialCache {
  get (key) {
    return keytar.getPassword('real-time', key)
  }

  set (key, password) {
    return keytar.setPassword('real-time', key, password)
  }

  delete (key) {
    return keytar.deletePassword('real-time', key)
  }
}
