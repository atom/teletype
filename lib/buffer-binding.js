const {Point, Range} = require('atom')

module.exports =
class BufferBinding {
  constructor (textBuffer) {
    this.textBuffer = textBuffer
    this.defaultHistoryProvider = this.textBuffer.getHistoryProvider()
    this.pendingChanges = []
  }

  dispose () {
    this.defaultHistoryProvider.clear()
    this.textBuffer.setHistoryProvider(this.defaultHistoryProvider)
    this.textBuffer = null
    this.defaultHistoryProvider = null
  }

  setBufferProxy (bufferProxy) {
    this.bufferProxy = bufferProxy
    this.textBuffer.setHistoryProvider(this)
    while (this.pendingChanges.length > 0) {
      this.pushChange(this.pendingChanges.shift())
    }
    this.pendingChanges = null
  }

  setText (text) {
    this.textBuffer.setTextInRange(this.textBuffer.getRange(), text, {undo: 'skip'})
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
      this.textBuffer.setTextInRange(new Range(oldStart, oldEnd), newText, {undo: 'skip'})
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
