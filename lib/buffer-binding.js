const {CompositeDisposable} = require('atom')

module.exports =
class BufferBinding {
  constructor (textBuffer) {
    this.textBuffer = textBuffer
    this.subscriptions = new CompositeDisposable()
    this.applyingRemoteChanges = false
  }

  setSharedBuffer (sharedBuffer) {
    this.sharedBuffer = sharedBuffer
    this.subscriptions.add(this.textBuffer.onDidChangeText(({changes}) => this.relayLocalChanges(changes)))
  }

  getText () {
    return this.textBuffer.getText()
  }

  setText (text) {
    this.textBuffer.setText(text)
  }

  relayLocalChanges (changes) {
    if (this.applyingRemoteChanges) return

    const operations = []
    for (let i = 0; i < changes.length; i++) {
      const {oldRange, oldText, newText} = changes[i]
      const position = this.textBuffer.characterIndexForPosition(oldRange.start)
      const oldExtent = oldText.length
      if (newText.length > 0) operations.push({type: 'insert', position, text: newText})
      if (oldExtent > 0) operations.push({type: 'delete', position, extent: oldExtent})
    }
    this.sharedBuffer.applyMany(operations)
  }

  applyMany (operations) {
    this.applyingRemoteChanges = true

    this.textBuffer.transact(() => {
      for (let i = operations.length - 1; i >= 0; i--) {
        const op = operations[i]
        const position = this.textBuffer.positionForCharacterIndex(op.position)
        switch (op.type) {
          case 'insert':
            this.textBuffer.insert(position, op.text)
            break
          case 'delete':
            const end = this.textBuffer.positionForCharacterIndex(op.position + op.extent)
            this.textBuffer.delete([position, end])
            break
          default:
            throw new Error('Unsupported operation type: ' + op.type)
        }
      }
    })

    this.applyingRemoteChanges = false
  }
}
