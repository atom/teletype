const assert = require('assert')
const {Point} = require('atom')

let nextBufferProxyId = 1

module.exports =
class FakeBufferProxy {
  constructor ({delegate, text, uri} = {}) {
    this.id = nextBufferProxyId++
    this.delegate = delegate
    this.disposed = false
    this.text = text || ''
    this.uri = uri || `uri-${this.id}`
    this.saveRequestCount = 0
  }

  setDelegate (delegate) {
    this.delegate = delegate
  }

  dispose () {
    this.disposed = true
  }

  getHistory () {
    return {undoStack: [], redoStack: [], nextCheckpointId: 1}
  }

  setTextInRange (oldStart, oldEnd, newText) {
    const oldStartIndex = characterIndexForPosition(this.text, oldStart)
    const oldEndIndex = characterIndexForPosition(this.text, oldEnd)
    this.text = this.text.slice(0, oldStartIndex) + newText + this.text.slice(oldEndIndex)
  }

  simulateRemoteTextUpdate (changes) {
    assert(changes.length > 0, 'Must update text with at least one change')

    for (let i = changes.length - 1; i >= 0; i--) {
      const {oldStart, oldEnd, newText} = changes[i]
      this.setTextInRange(oldStart, oldEnd, newText)
    }

    this.delegate.updateText(changes)
  }

  simulateRemoteURIChange (newURI) {
    this.uri = newURI
    this.delegate.didChangeURI(newURI)
  }

  createCheckpoint () {
    return 1
  }

  groupChangesSinceCheckpoint () {
    return []
  }

  groupLastChanges () {
    return true
  }

  requestSave () {
    this.saveRequestCount++
  }

  setURI (newUri) {
    this.uri = newUri
  }

  applyGroupingInterval () {}

  revertToCheckpoint () {}
}

function characterIndexForPosition (text, target) {
  target = Point.fromObject(target)
  const position = Point(0, 0)
  let index = 0
  while (position.compare(target) < 0 && index < text.length) {
    if (text[index] === '\n') {
      position.row++
      position.column = 0
    } else {
      position.column++
    }

    index++
  }

  return index
}
