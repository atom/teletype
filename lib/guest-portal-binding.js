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
    let editor
    if (sharedEditor == null) {
      if (this.activeEditor) this.activeEditor.destroy()
      if (this.activeSharedEditor) this.activeSharedEditor.dispose()
    } else {
      const {sharedBuffer} = sharedEditor

      editor = new TextEditor({autoHeight: false})
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

      this.activeEditorBinding = editorBinding

      editor.setCursorBufferPosition([0, 0])

      if (this.activeEditor) {
        const pane = this.workspace.paneForItem(this.activeEditor)
        const index = pane.getItems().indexOf(this.activeEditor)
        pane.addItem(editor, {index})
        this.activeEditor.destroy()
        this.activeSharedEditor.dispose()
      } else {
        await this.workspace.open(editor)
      }
    }

    this.activeSharedEditor = sharedEditor
    this.activeEditor = editor
  }
}
