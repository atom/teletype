const getPathWithNativeSeparators = require('./get-path-with-native-separators')
const {Emitter, CompositeDisposable} = require('atom')

module.exports=
class BufferFile {
  constructor({bufferProxy, buffer}) {
    this.bufferProxy = bufferProxy
    this.emitter = new Emitter()
    this.disposed = false
    /*this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(buffer.onDidDestroy(this.dispose().bind(this)))*/
  }

  isDisposed () {
    return this.disposed
  }

  dispose () {
    if (!this.disposed){
      this.disposed = true
      this.subscriptions.dispose()
      if(this.bufferProxy) this.bufferProxy = undefined
      this.emitter.dispose()
    }
  }

  closeBufferProxy () {
    this.bufferProxy = undefined
  }

  getPath () {
    if(this.bufferProxy){
      return getPathWithNativeSeparators(this.bufferProxy.uri + "")
    } else{
      return undefined
    }
  }

  createWriteStream () {
    //NOT IMPLEMENTED: No save Function for guest.
    //If a save/autosave function is added, implement it here.
    return null
  }

  pathChanged(){
    this.emitter.emit('did-rename')
  }

  onDidRename (callback) {
    return this.emitter.on('did-rename',callback)
  }
}
