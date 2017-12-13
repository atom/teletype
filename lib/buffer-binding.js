const {Range, TextBuffer} = require('atom')

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
  }

  dispose () {
    if (this.disposed) return

    this.disposed = true
    this.buffer.restoreDefaultHistoryProvider(this.bufferProxy.getHistory(this.buffer.maxUndoEntries))
    this.buffer = null
    if (this.bufferDestroySubscription) this.bufferDestroySubscription.dispose()
    this.emitDidDispose()
  }

  setBufferProxy (bufferProxy) {
    this.bufferProxy = bufferProxy
    this.buffer.setHistoryProvider(this)
    while (this.pendingChanges.length > 0) {
      this.pushChange(this.pendingChanges.shift())
    }
    this.pendingChanges = null
    this.bufferDestroySubscription = this.buffer.onDidDestroy(() => {
      if (this.isHost) {
        bufferProxy.dispose()
      } else {
        this.dispose()
      }
    })
  }

  setText (text) {
    this.buffer.setTextInRange(this.buffer.getRange(), text, {undo: 'skip'})
  }

  pushChange (change) {
    if (this.bufferProxy) {
      const {oldStart, oldEnd, newText} = change
      this.bufferProxy.setTextInRange(oldStart, oldEnd, newText)
    } else {
      this.pendingChanges.push(change)
    }
  }

  pushChanges (changes) {
    for (let i = changes.length - 1; i >= 0; i--) {
      this.pushChange(changes[i])
    }
  }

  updateText (textUpdates) {
    for (let i = textUpdates.length - 1; i >= 0; i--) {
      const {oldStart, oldEnd, newText} = textUpdates[i]
      this.buffer.setTextInRange(new Range(oldStart, oldEnd), newText, {undo: 'skip'})
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
    return this.bufferProxy.createCheckpoint(options)
  }

  groupChangesSinceCheckpoint (checkpoint, options) {
    return this.bufferProxy.groupChangesSinceCheckpoint(checkpoint, options)
  }

  revertToCheckpoint (checkpoint, options) {
    const result = this.bufferProxy.revertToCheckpoint(checkpoint, options)
    if (result) {
      this.convertMarkerRanges(result.markers)
      return result
    } else {
      return false
    }
  }

  applyGroupingInterval (groupingInterval) {
    this.bufferProxy.applyGroupingInterval(groupingInterval)
  }

  enforceUndoStackSizeLimit () {}

  save () {
    if (this.buffer.getPath()) return this.saveBuffer()
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
