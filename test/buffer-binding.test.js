const assert = require('assert')
const {TextBuffer} = require('atom')
const BufferBinding = require('../lib/buffer-binding')

describe('BufferBinding', () => {
  it('relays changes to and from the shared buffer', () => {
    const buffer = new TextBuffer('hello\nworld')
    const binding = new BufferBinding(buffer)
    const sharedBuffer = new FakeSharedBuffer(binding)
    binding.setSharedBuffer(sharedBuffer)

    sharedBuffer.simulateRemoteOperations([
      {type: 'insert', position: 0, text: 'goodbye'},
      {type: 'delete', position: 0, extent: 5},
      {type: 'insert', position: 6, text: 'cruel\n'}
    ])

    assert.equal(buffer.getText(), 'goodbye\ncruel\nworld')
    assert.equal(sharedBuffer.text, 'goodbye\ncruel\nworld')

    buffer.setTextInRange([[1, 0], [1, 5]], 'wonderful')

    assert.equal(buffer.getText(), 'goodbye\nwonderful\nworld')
    assert.equal(sharedBuffer.text, 'goodbye\nwonderful\nworld')
  })

  class FakeSharedBuffer {
    constructor (delegate) {
      this.delegate = delegate
      this.text = this.delegate.getText()
    }

    simulateRemoteOperations (operations) {
      this.applyMany(operations)
      this.delegate.applyMany(operations)
    }

    applyMany (operations) {
      for (let i = operations.length - 1; i >= 0; i--) {
        const op = operations[i]
        switch (op.type) {
          case 'insert':
            this.text = this.text.slice(0, op.position) + op.text + this.text.slice(op.position)
            break
          case 'delete':
            this.text = this.text.slice(0, op.position) + this.text.slice(op.position + op.extent)
            break
          default:
            throw new Error('Unknown operation type: ' + op.type)
        }
      }
    }
  }
})
