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
    this.bindingsByEditor = new WeakMap()
    this.sharedEditorsByEditor = new WeakMap()
    this.activeGuestEditor = null
    this.activeGuestSharedEditor = null
  }

  activate () {
    this.commands.add('atom-workspace', {
      'real-time:share-portal': this.sharePortal.bind(this)
    })
    this.commands.add('atom-workspace', {
      'real-time:join-portal': this.joinPortal.bind(this)
    })
    this.commands.add('atom-text-editor.remote-editor:not(.mini)', {
      'real-time:toggle-follow-host-cursor': (event) => {
        const editor = event.target.closest('atom-text-editor').getModel()
        this.toggleFollowHostCursor(editor)
      }
    })
  }

  async sharePortal () {
    const portal = await this.getClient().createPortal()

    this.workspace.observeActiveTextEditor(async (editor) => {
      if (editor == null) return

      let sharedEditor = this.sharedEditorsByEditor.get(editor)
      if (sharedEditor == null) {
        const buffer = editor.getBuffer()
        const bufferBinding = new BufferBinding(buffer)
        const sharedBuffer = await portal.createSharedBuffer({
          uri: buffer.getPath(),
          text: buffer.getText()
        })
        bufferBinding.setSharedBuffer(sharedBuffer)
        sharedBuffer.setDelegate(bufferBinding)

        const editorBinding = new EditorBinding(editor)
        sharedEditor = await portal.createSharedEditor({
          sharedBuffer,
          selectionRanges: editor.selectionsMarkerLayer.bufferMarkerLayer.index.dump()
        })
        editorBinding.setSharedEditor(sharedEditor)
        sharedEditor.setDelegate(editorBinding)
        this.sharedEditorsByEditor.set(editor, sharedEditor)
      }

      await portal.setActiveSharedEditor(sharedEditor)
    })

    this.clipboard.write(portal.id)
    this.workspace.notificationManager.addSuccess('Your portal is open for business', {
      description: "Invite people to collaborate with you using your portal ID above. It's already on your clipboard. 👌",
      detail: portal.id,
      dismissable: true
    })

    return portal.id
  }

  async joinPortal (portalId) {
    const portal = await this.getClient().joinPortal(portalId)
    portal.setDelegate({
      setActiveSharedEditor: async (sharedEditor) => {
        const {sharedBuffer} = sharedEditor

        const editor = (new TextEditor({autoHeight: false}))
        const originalGetTitle = editor.getTitle.bind(editor)
        editor.getTitle = () => `Remote Buffer: ${originalGetTitle()}`
        editor.getBuffer().getPath = () => sharedBuffer.uri
        editor.getBuffer().save = () => {}
        editor.getBuffer().isModified = () => false
        editor.element.classList.add('remote-editor')

        const bufferBinding = new BufferBinding(editor.getBuffer())
        bufferBinding.setSharedBuffer(sharedBuffer)
        sharedBuffer.setDelegate(bufferBinding)

        const editorBinding = new EditorBinding(editor)
        editorBinding.setSharedEditor(sharedEditor)
        sharedEditor.setDelegate(editorBinding)

        this.bindingsByEditor.set(editor, editorBinding)

        editor.setCursorBufferPosition([0, 0])

        if (this.activeGuestEditor) {
          const pane = this.workspace.paneForItem(this.activeGuestEditor)
          const index = pane.getItems().indexOf(this.activeGuestEditor)
          pane.addItem(editor, {index})
          this.activeGuestEditor.destroy()
          this.activeGuestSharedEditor.dispose()
        } else {
          await this.workspace.open(editor)
        }

        this.activeGuestSharedEditor = sharedEditor
        this.activeGuestEditor = editor
      }
    })
  }

  toggleFollowHostCursor (editor) {
    const binding = this.bindingForEditor(editor)
    binding.setFollowHostCursor(!binding.isFollowingHostCursor())
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

  bindingForEditor (editor) {
    return this.bindingsByEditor.get(editor)
  }
}
