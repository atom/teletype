const FakeBufferProxy = require('./fake-buffer-proxy')
const BufferBinding = require('../../lib/buffer-binding')
const {TextBuffer} = require('atom')

let nextEditorProxyId = 1

module.exports =
class FakeEditorProxy {
  constructor (uri) {
    this.id = nextEditorProxyId++
    const buffer = new TextBuffer('test?')
    const binding = new BufferBinding({buffer, isHost: false})
    this.bufferProxy = new FakeBufferProxy(binding, buffer.getText())
    this.bufferProxy.uri = uri
    binding.setBufferProxy(this.bufferProxy)
  }

  dispose () {
    if (this.delegate) this.delegate.dispose()
  }

  follow () {}

  didScroll () {}

  setDelegate (delegate) {
    this.delegate = delegate
  }

  updateSelections () {}
}
