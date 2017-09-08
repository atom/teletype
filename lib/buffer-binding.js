const {CompositeDisposable, Point, Range} = require('atom')

module.exports =
class BufferBinding {
  constructor (textBuffer) {
    this.textBuffer = textBuffer
    this.subscriptions = new CompositeDisposable()
    this.applyingRemoteChanges = false
    this.subscriptions.add(this.textBuffer.onDidChange((change) => this.relayLocalChange(change)))
    this.pendingChanges = []
  }

  dispose () {
    this.subscriptions.dispose()
    this.textBuffer = null
  }

  setBufferProxy (bufferProxy) {
    this.bufferProxy = bufferProxy
    while (this.pendingChanges.length > 0) {
      this.relayLocalChange(this.pendingChanges.shift())
    }
    this.pendingChanges = null
  }

  setText (text) {
    this.applyingRemoteChanges = true
    this.textBuffer.setText(text)
    this.applyingRemoteChanges = false
  }

  relayLocalChange (change) {
    if (this.applyingRemoteChanges) return

    if (this.bufferProxy) {
      const {oldRange, newText} = change
      this.bufferProxy.setTextInRange(oldRange.start, oldRange.end, newText)
    } else {
      this.pendingChanges.push(change)
    }
  }

  updateText (textUpdates) {
    this.applyingRemoteChanges = true

    for (let i = textUpdates.length - 1; i >= 0; i--) {
      const {oldStart, oldEnd, newText} = textUpdates[i]
      this.textBuffer.setTextInRange(new Range(oldStart, oldEnd), newText)
    }

    this.applyingRemoteChanges = false
  }
}
