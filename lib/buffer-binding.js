const {Point, Range} = require('atom')

function doNothing () {}

module.exports =
class BufferBinding {
  constructor ({buffer, didDispose}) {
    this.buffer = buffer
    this.emitDidDispose = didDispose || doNothing
    this.defaultHistoryProvider = this.buffer.getHistoryProvider()
    this.pendingChanges = []
  }

  dispose () {
    this.defaultHistoryProvider.clear()
    this.buffer.setHistoryProvider(this.defaultHistoryProvider)
    this.buffer = null
    this.defaultHistoryProvider = null
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
    this.bufferDestroySubscription = this.buffer.onDidDestroy(() => bufferProxy.dispose())
  }

  setText (text) {
    this.buffer.setTextInRange(this.buffer.getRange(), text, {undo: 'skip'})
  }

  pushChange (change) {
    if (this.bufferProxy) {
      const {newStart, oldExtent, newText} = change
      this.bufferProxy.setTextInRange(newStart, newStart.traverse(oldExtent), newText)
    } else {
      this.pendingChanges.push(change)
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
    this.convertMarkerRanges(result.markers)
    return result
  }

  redo () {
    const result = this.bufferProxy.redo()
    this.convertMarkerRanges(result.markers)
    return result
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

  createCheckpoint (options) {
    return this.bufferProxy.createCheckpoint(options)
  }

  groupChangesSinceCheckpoint (checkpoint, options) {
    return this.bufferProxy.groupChangesSinceCheckpoint(checkpoint, options)
  }

  revertToCheckpoint () {
    // TODO: Implement and test me!
  }

  applyGroupingInterval (groupingInterval) {
    this.bufferProxy.applyGroupingInterval(groupingInterval)
  }

  enforceUndoStackSizeLimit () {}
}
