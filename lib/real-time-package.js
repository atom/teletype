const {TextEditor} = require('atom')
const Client = require('real-time-client')
const BufferBinding = require('./buffer-binding')

module.exports =
class RealTimePackage {
  constructor ({workspace, commands, clipboard, restGateway, pubSubGateway, pusherKey, baseURL}) {
    this.workspace = workspace
    this.commands = commands
    this.clipboard = clipboard
    this.restGateway = restGateway
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
  }

  activate () {
    this.commands.add('atom-text-editor:not(.mini)', {
      'real-time:share-buffer': (event) => {
        const editor = event.target.closest('atom-text-editor').getModel()
        this.shareBuffer(editor.getBuffer())
      }
    })
    this.commands.add('atom-workspace', {
      'real-time:join-buffer': (event) => {
        this.joinBuffer()
      }
    })
  }

  async shareBuffer (buffer) {
    const binding = new BufferBinding(buffer)
    const sharedBuffer = await this.getClient().createSharedBuffer(binding)
    binding.setSharedBuffer(sharedBuffer)
    this.clipboard.write(sharedBuffer.id.toString())
  }

  async joinBuffer () {
    const sharedBufferId = Number(this.clipboard.read())
    const editor = new TextEditor({autoHeight: false})
    const binding = new BufferBinding(editor.getBuffer())
    const sharedBuffer = await this.getClient().joinSharedBuffer(sharedBufferId, binding)
    binding.setSharedBuffer(sharedBuffer)
    await this.workspace.open(editor)
  }

  getClient () {
    if (!this.client) {
      this.client = new Client({
        pusherKey: this.pusherKey,
        baseURL: this.baseURL,
        restGateway: this.restGateway,
        pubSubGateway: this.pubSubGateway
      })
    }

    return this.client
  }
}
