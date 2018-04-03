const FakeBufferProxy = require('./fake-buffer-proxy')
const BufferBinding = require('../../lib/buffer-binding')
const {TextBuffer} = require('atom')

let nextEditorProxyId = 1

module.exports =
class FakeEditorProxy {
  constructor (uri) {
    this.id = nextEditorProxyId++
    this.bufferProxy = new FakeBufferProxy({uri})
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
