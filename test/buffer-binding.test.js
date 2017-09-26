const assert = require('assert')
const {TextBuffer, Point} = require('atom')
const BufferBinding = require('../lib/buffer-binding')

suite('BufferBinding', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  test('relays changes to and from the shared buffer', () => {
    const buffer = new TextBuffer('hello\nworld')
    const binding = new BufferBinding({buffer})
    const bufferProxy = new FakeBufferProxy(binding, buffer.getText())
    binding.setBufferProxy(bufferProxy)

    bufferProxy.simulateRemoteTextUpdate([
      {oldStart: {row: 0, column: 0}, oldEnd: {row: 0, column: 5}, newText: 'goodbye'},
      {oldStart: {row: 1, column: 0}, oldEnd: {row: 1, column: 0}, newText: 'cruel\n'}
    ])
    assert.equal(buffer.getText(), 'goodbye\ncruel\nworld')
    assert.equal(bufferProxy.text, 'goodbye\ncruel\nworld')

    buffer.setTextInRange([[1, 0], [1, 5]], 'wonderful')
    assert.equal(buffer.getText(), 'goodbye\nwonderful\nworld')
    assert.equal(bufferProxy.text, 'goodbye\nwonderful\nworld')

    buffer.transact(() => {
      buffer.setTextInRange([[0, 0], [0, 4]], 'bye\n')
      buffer.setTextInRange([[2, 0], [3, 0]], '')
      buffer.setTextInRange([[2, 3], [2, 5]], 'ms')
    })
    assert.equal(buffer.getText(), 'bye\nbye\nworms')
    assert.equal(bufferProxy.text, 'bye\nbye\nworms')
  })

  test('does not relay empty changes to the shared buffer', () => {
    const buffer = new TextBuffer('hello\nworld')
    const binding = new BufferBinding({buffer})
    const bufferProxy = new FakeBufferProxy(binding, buffer.getText())
    binding.setBufferProxy(bufferProxy)

    buffer.setTextInRange([[0, 0], [0, 0]], '')
    assert.equal(buffer.getText(), 'hello\nworld')
    assert.equal(bufferProxy.text, 'hello\nworld')
  })

  class FakeBufferProxy {
    constructor (delegate, text) {
      this.delegate = delegate
      this.text = text
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

    createCheckpoint () {
      return 1
    }

    groupChangesSinceCheckpoint () {
      return []
    }

    applyGroupingInterval () {

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
