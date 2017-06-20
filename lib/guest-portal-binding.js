const {TextEditor} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class GuestPortalBinding {
  constructor ({workspace}) {
    this.workspace = workspace
    this.activeEditor = null
    this.activeEditorBinding = null
    this.activeSharedEditor = null
  }

  async setActiveSharedEditor (sharedEditor) {
    if (sharedEditor == null) {
      this.disposeActiveSharedEditor()
    } else {
      const {sharedBuffer} = sharedEditor

      const editor = new TextEditor({autoHeight: false})
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

      editor.setCursorBufferPosition([0, 0])

      if (this.activeEditor) {
        const pane = this.workspace.paneForItem(this.activeEditor)
        const index = pane.getItems().indexOf(this.activeEditor)
        pane.addItem(editor, {index})
        this.disposeActiveSharedEditor()
      } else {
        await this.workspace.open(editor)
      }

      this.activeEditor = editor
      this.activeEditorBinding = editorBinding
      this.activeSharedEditor = sharedEditor
    }
  }

  disposeActiveSharedEditor () {
    if (this.activeEditor) {
      this.activeEditor.destroy()
      this.activeEditor = null
    }
    if (this.activeSharedEditor) {
      this.activeSharedEditor.dispose()
      this.activeSharedEditor = null
    }
  }
}
