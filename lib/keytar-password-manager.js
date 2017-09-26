const keytar = require('keytar')

module.exports =
class KeytarPasswordManager {
  get () {
    return keytar.getPassword('real-time', 'default')
  }

  set (password) {
    return keytar.setPassword('real-time', 'default', password)
  }
}
