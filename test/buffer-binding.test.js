const assert = require('assert')
const {TextBuffer, Point} = require('atom')
const BufferBinding = require('../lib/buffer-binding')

describe('BufferBinding', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  it('relays changes to and from the shared buffer', () => {
    const buffer = new TextBuffer('hello\nworld')
    const binding = new BufferBinding(buffer)
    const sharedBuffer = new FakeSharedBuffer(binding, buffer.getText())
    binding.setSharedBuffer(sharedBuffer)

    sharedBuffer.simulateRemoteOperations([
      {type: 'delete', position: {row: 0, column: 0}, extent: {row: 0, column: 5}},
      {type: 'insert', position: {row: 0, column: 0}, text: 'goodbye'},
      {type: 'insert', position: {row: 1, column: 0}, text: 'cruel\n'}
    ])
    assert.equal(buffer.getText(), 'goodbye\ncruel\nworld')
    assert.equal(sharedBuffer.text, 'goodbye\ncruel\nworld')

    buffer.setTextInRange([[1, 0], [1, 5]], 'wonderful')
    assert.equal(buffer.getText(), 'goodbye\nwonderful\nworld')
    assert.equal(sharedBuffer.text, 'goodbye\nwonderful\nworld')

    buffer.transact(() => {
      buffer.setTextInRange([[0, 0], [0, 4]], 'bye\n')
      buffer.setTextInRange([[2, 0], [3, 0]], '')
      buffer.setTextInRange([[2, 3], [2, 5]], 'ms')
    })
    assert.equal(buffer.getText(), 'bye\nbye\nworms')
    assert.equal(sharedBuffer.text, 'bye\nbye\nworms')
  })

  class FakeSharedBuffer {
    constructor (delegate, text) {
      this.delegate = delegate
      this.text = text
    }

    simulateRemoteOperations (operations) {
      this.applyMany(operations)
      this.delegate.applyMany(operations)
    }

    applyMany (operations) {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i]
        switch (op.type) {
          case 'insert':
            const index = characterIndexForPosition(this.text, op.position)
            this.text = this.text.slice(0, index) + op.text + this.text.slice(index)
            break
          case 'delete':
            const startIndex = characterIndexForPosition(this.text, op.position)
            const endIndex = characterIndexForPosition(this.text, Point.fromObject(op.position).traverse(op.extent))
            this.text = this.text.slice(0, startIndex) + this.text.slice(endIndex)
            break
          default:
            throw new Error('Unknown operation type: ' + op.type)
        }
      }
    }
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
})
