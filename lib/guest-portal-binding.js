const {TextEditor} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class GuestPortalBinding {
  constructor ({workspace, notificationManager}) {
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.activeEditor = null
    this.activeEditorBinding = null
    this.activeSharedEditor = null
    this.monkeyPatchesByEditor = new Map()
  }

  async setActiveSharedEditor (sharedEditor) {
    if (sharedEditor == null) {
      this.disposeActiveSharedEditor()
    } else {
      const {sharedBuffer} = sharedEditor

      const editor = new TextEditor({autoHeight: false})
      const buffer = editor.getBuffer()

      const originalEditorGetTitle = editor.getTitle.bind(editor)
      const originalBufferGetPath = buffer.getPath.bind(buffer)
      const originalBufferSave = buffer.save.bind(buffer)
      const originalBufferIsModified = buffer.isModified.bind(buffer)
      this.monkeyPatchesByEditor.set(editor, {
        originalEditorGetTitle, originalBufferGetPath, originalBufferSave,
        originalBufferIsModified
      })

      editor.getTitle = () => `Remote Buffer: ${originalEditorGetTitle()}`
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

  hostDidDisconnect () {
    if (this.activeEditor) {
      const {
        originalEditorGetTitle, originalBufferGetPath, originalBufferSave,
        originalBufferIsModified
      } = this.monkeyPatchesByEditor.get(this.activeEditor)
      this.activeEditor.getTitle = originalEditorGetTitle
      this.activeEditor.getBuffer().getPath = originalBufferGetPath
      this.activeEditor.getBuffer().save = originalBufferSave
      this.activeEditor.getBuffer().isModified = originalBufferIsModified
      this.activeEditor.element.classList.remove('remote-editor')
      this.activeEditor.emitter.emit('did-change-title', this.activeEditor.getTitle())

      this.monkeyPatchesByEditor.delete(this.activeEditor)
    }

    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    })
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

    this.originalEditorGetTitle = null
    this.originalBufferGetPath = null
    this.originalBufferSave = null
    this.originalBufferIsModified = null
  }
}
