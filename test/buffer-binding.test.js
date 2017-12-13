const assert = require('assert')
const fs = require('fs')
const temp = require('temp')
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

  test('flushes changes to disk when receiving a save request', async () => {
    const buffer = new TextBuffer('hello\nworld')
    // This line ensures saving works correctly even if the save function has been monkey-patched.
    buffer.save = () => {}

    const binding = new BufferBinding({buffer})
    const bufferProxy = new FakeBufferProxy(binding, buffer.getText())
    binding.setBufferProxy(bufferProxy)

    // Calling binding.save with an in-memory buffer is ignored.
    try {
      await binding.save()
    } catch (error) {
      assert.ifError(error)
    }

    // Calling binding.save with an on-disk buffer flushes changes to disk.
    const filePath = temp.path()
    await buffer.saveAs(filePath)

    buffer.setText('changed')
    await binding.save()
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'changed')
  })

  suite('destroying the buffer', () => {
    test('on the host, disposes the underlying buffer proxy', () => {
      const buffer = new TextBuffer('')
      const binding = new BufferBinding({buffer, isHost: true})
      const bufferProxy = new FakeBufferProxy(binding, buffer.getText())
      binding.setBufferProxy(bufferProxy)

      buffer.destroy()
      assert(bufferProxy.disposed)
    })

    test('on guests, disposes the buffer binding', () => {
      const buffer = new TextBuffer('')
      const binding = new BufferBinding({buffer, isHost: false})
      const bufferProxy = new FakeBufferProxy(binding, buffer.getText())
      binding.setBufferProxy(bufferProxy)

      buffer.destroy()
      assert(binding.disposed)
      assert(!bufferProxy.disposed)
    })
  })

  class FakeBufferProxy {
    constructor (delegate, text) {
      this.delegate = delegate
      this.text = text
      this.disposed = false
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
