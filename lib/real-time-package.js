const {TextEditor} = require('atom')
const Client = require('@atom-team/real-time-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')

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
      'real-time:share-editor': (event) => {
        const editor = event.target.closest('atom-text-editor').getModel()
        this.shareEditor(editor)
      }
    })
    this.commands.add('atom-workspace', {
      'real-time:join-editor': (event) => {
        this.joinEditor()
      }
    })
  }

  async shareEditor (editor) {
    const buffer = editor.getBuffer()
    const bufferBinding = new BufferBinding(buffer)
    const sharedBuffer = await this.getClient().createSharedBuffer({
      uri: buffer.getPath(),
      text: buffer.getText()
    })
    bufferBinding.setSharedBuffer(sharedBuffer)
    sharedBuffer.setDelegate(bufferBinding)

    const editorBinding = new EditorBinding(editor)
    const sharedEditor = await this.getClient().createSharedEditor({
      sharedBuffer,
      selectionRanges: editor.selectionsMarkerLayer.bufferMarkerLayer.index.dump()
    })
    editorBinding.setSharedEditor(sharedEditor)
    sharedEditor.setDelegate(editorBinding)

    this.clipboard.write(sharedEditor.id.toString())
  }

  async joinEditor () {
    const sharedEditorId = Number(this.clipboard.read())
    const sharedEditor = await this.getClient().joinSharedEditor(sharedEditorId)
    const {sharedBuffer} = sharedEditor

    const editor = new TextEditor({autoHeight: false})
    const originalGetTitle = editor.getTitle.bind(editor)
    editor.getTitle = () => `Remote Buffer: ${originalGetTitle()}`
    editor.getBuffer().getPath = () => sharedBuffer.uri
    editor.getBuffer().save = () => {}
    editor.getBuffer().isModified = () => false

    const bufferBinding = new BufferBinding(editor.getBuffer())
    bufferBinding.setSharedBuffer(sharedBuffer)
    sharedBuffer.setDelegate(bufferBinding)

    const editorBinding = new EditorBinding(editor)
    editorBinding.setSharedEditor(sharedEditor)
    sharedEditor.setDelegate(editorBinding)

    await this.workspace.open(editor)
  }

  async joinBuffer () {
    const sharedBufferId = Number(this.clipboard.read())
    const editor = new TextEditor({autoHeight: false})
    const binding = new BufferBinding(editor.getBuffer())
    const sharedBuffer = await this.getClient().joinSharedBuffer(sharedBufferId, binding)

    const originalGetTitle = editor.getTitle.bind(editor)
    editor.getTitle = () => `Remote Buffer: ${originalGetTitle()}`
    editor.getBuffer().getPath = () => sharedBuffer.uri
    editor.getBuffer().save = () => {}
    editor.getBuffer().isModified = () => false

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
