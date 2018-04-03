const getPathWithNativeSeparators = require('./get-path-with-native-separators')
const {Emitter} = require('atom')

module.exports =
class BufferFile {
  constructor ({uri}) {
    this.uri = uri
    this.emitter = new Emitter()
  }

  dispose () {
    this.emitter.dispose()
  }

  getPath () {
    return getPathWithNativeSeparators(this.uri)
  }

  createWriteStream () {
    // NOT IMPLEMENTED: No save Function for guest.
    // If a save/autosave function is added, implement it here.
    return null
  }

  existsSync () {
    return false
  }

  setURI (uri) {
    this.uri = uri
    this.emitter.emit('did-rename')
  }

  onDidRename (callback) {
    return this.emitter.on('did-rename', callback)
  }
}
