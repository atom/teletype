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
