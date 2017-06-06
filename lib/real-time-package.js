const Client = require('real-time-client')
const BufferBinding = require('./buffer-binding')

module.exports =
class RealTimePackage {
  activate () {
    atom.commands.add('atom-text-editor:not(.mini)', {
      'real-time:share-buffer': (event) => {
        this.shareBuffer(event.target.getModel())
      }
    })
    atom.commands.add('atom-workspace', {
      'real-time:join-buffer': (event) => {
        this.joinBuffer()
      }
    })
  }

  shareBuffer () {

  }

  joinBuffer () {

  }
}
