const {Emitter, Range, CompositeDisposable, TextBuffer} = require('atom')
const getPathWithNativeSeparators = require('./get-path-with-native-separators')
const path = require('path')

function doNothing () {}

module.exports =
class BufferBinding {
  constructor ({buffer, isHost, didDispose}) {
    this.buffer = buffer
    this.saveBuffer = TextBuffer.prototype.save.bind(buffer)
    this.isHost = isHost
    this.emitDidDispose = didDispose || doNothing
    this.pendingChanges = []
    this.disposed = false
    this.disableHistory = false
    this.subscriptions = new CompositeDisposable()
    if (isHost) {
      this.subscriptions.add(buffer.onDidChangePath(this.relayURIChange.bind(this)))
    }
  }

  dispose () {
    if (this.disposed) return

    this.disposed = true
    this.subscriptions.dispose()
    this.buffer.restoreDefaultHistoryProvider(this.bufferProxy.getHistory(this.buffer.maxUndoEntries))
    this.buffer = null
    if (this.bufferDestroySubscription) this.bufferDestroySubscription.dispose()
    if (this.remoteFile) this.remoteFile.dispose()
    this.emitDidDispose()
  }

  setBufferProxy (bufferProxy) {
    this.bufferProxy = bufferProxy
    this.buffer.setHistoryProvider(this)
    while (this.pendingChanges.length > 0) {
      this.pushChange(this.pendingChanges.shift())
    }
    this.pendingChanges = null
    if (!this.isHost) {
      this.remoteFile = new RemoteFile({uri: bufferProxy.uri})
      this.buffer.setFile(this.remoteFile)
    }
    this.bufferDestroySubscription = this.buffer.onDidDestroy(() => {
      if (this.isHost) {
        bufferProxy.dispose()
      } else {
        this.dispose()
      }
    })
  }

  setText (text) {
    this.disableHistory = true
    this.buffer.setTextInRange(this.buffer.getRange(), text)
    this.disableHistory = false
  }

  pushChange (change) {
    if (this.disableHistory) return

    if (this.bufferProxy) {
      const {oldStart, oldEnd, newText} = change
      this.bufferProxy.setTextInRange(oldStart, oldEnd, newText)
    } else {
      this.pendingChanges.push(change)
    }
  }

  pushChanges (changes) {
    if (this.disableHistory) return

    for (let i = changes.length - 1; i >= 0; i--) {
      this.pushChange(changes[i])
    }
  }

  updateText (textUpdates) {
    for (let i = textUpdates.length - 1; i >= 0; i--) {
      const {oldStart, oldEnd, newText} = textUpdates[i]
      this.disableHistory = true
      this.buffer.setTextInRange(new Range(oldStart, oldEnd), newText)
      this.disableHistory = false
    }
  }

  undo () {
    const result = this.bufferProxy.undo()
    if (result) {
      this.convertMarkerRanges(result.markers)
      return result
    } else {
      return null
    }
  }

  redo () {
    const result = this.bufferProxy.redo()
    if (result) {
      this.convertMarkerRanges(result.markers)
      return result
    } else {
      return null
    }
  }

  convertMarkerRanges (layersById) {
    for (const layerId in layersById) {
      const markersById = layersById[layerId]
      for (const markerId in markersById) {
        const marker = markersById[markerId]
        marker.range = Range.fromObject(marker.range)
      }
    }
  }

  getChangesSinceCheckpoint (checkpoint) {
    return this.bufferProxy.getChangesSinceCheckpoint(checkpoint)
  }

  createCheckpoint (options) {
    if (this.disableHistory) return

    return this.bufferProxy.createCheckpoint(options)
  }

  groupChangesSinceCheckpoint (checkpoint, options) {
    if (this.disableHistory) return

    return this.bufferProxy.groupChangesSinceCheckpoint(checkpoint, options)
  }

  revertToCheckpoint (checkpoint, options) {
    if (this.disableHistory) return

    const result = this.bufferProxy.revertToCheckpoint(checkpoint, options)
    if (result) {
      this.convertMarkerRanges(result.markers)
      return result
    } else {
      return false
    }
  }

  groupLastChanges () {
    if (this.disableHistory) return

    return this.bufferProxy.groupLastChanges()
  }

  applyGroupingInterval (groupingInterval) {
    if (this.disableHistory) return

    this.bufferProxy.applyGroupingInterval(groupingInterval)
  }

  enforceUndoStackSizeLimit () {}

  save () {
    if (this.buffer.getPath()) return this.saveBuffer()
  }

  relayURIChange () {
    this.bufferProxy.setURI(this.getBufferProxyURI())
  }

  didChangeURI (uri) {
    if (this.remoteFile) this.remoteFile.setURI(uri)
  }

  getBufferProxyURI () {
    if (!this.buffer.getPath()) return 'untitled'
    const [projectPath, relativePath] = atom.workspace.project.relativizePath(this.buffer.getPath())
    if (projectPath) {
      const projectName = path.basename(projectPath)
      return path.join(projectName, relativePath)
    } else {
      return relativePath
    }
  }

  serialize (options) {
    return this.serializeUsingDefaultHistoryProviderFormat(options)
  }

  serializeUsingDefaultHistoryProviderFormat (options) {
    const {maxUndoEntries} = this.buffer
    this.buffer.restoreDefaultHistoryProvider(this.bufferProxy.getHistory(maxUndoEntries))
    const serializedDefaultHistoryProvider = this.buffer.historyProvider.serialize(options)

    this.buffer.setHistoryProvider(this)

    return serializedDefaultHistoryProvider
  }
}

class RemoteFile {
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

  setURI (uri) {
    this.uri = uri
    this.emitter.emit('did-rename')
  }

  onDidRename (callback) {
    return this.emitter.on('did-rename', callback)
  }

  existsSync () {
    return false
  }
}
