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
    this.monkeyPatchesByEditor = new WeakMap()
  }

  async setActiveSharedEditor (sharedEditor) {
    if (sharedEditor == null) {
      this.disposeActiveSharedEditor()
    } else {
      const editor = new TextEditor({autoHeight: false})
      this.remotify(editor, sharedEditor)

      if (this.activeEditor) {
        const pane = this.workspace.paneForItem(this.activeEditor)
        const index = pane.getItems().indexOf(this.activeEditor)
        pane.addItem(editor, {index})
        this.disposeActiveSharedEditor()
      } else {
        await this.workspace.open(editor)
      }

      const bufferBinding = new BufferBinding(editor.getBuffer())
      const {sharedBuffer} = sharedEditor
      bufferBinding.setSharedBuffer(sharedBuffer)
      sharedBuffer.setDelegate(bufferBinding)

      const editorBinding = new EditorBinding(editor)
      editorBinding.setSharedEditor(sharedEditor)
      sharedEditor.setDelegate(editorBinding)
      editor.setCursorBufferPosition([0, 0], {autoscroll: false})

      this.activeEditor = editor
      this.activeEditorBinding = editorBinding
      this.activeSharedEditor = sharedEditor
    }
  }

  remotify (editor, sharedEditor) {
    const buffer = editor.getBuffer()
    const {sharedBuffer} = sharedEditor

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
  }

  deremotify (editor) {
    const {
      originalEditorGetTitle, originalBufferGetPath, originalBufferSave,
      originalBufferIsModified
    } = this.monkeyPatchesByEditor.get(editor)
    editor.getTitle = originalEditorGetTitle
    editor.getBuffer().getPath = originalBufferGetPath
    editor.getBuffer().save = originalBufferSave
    editor.getBuffer().isModified = originalBufferIsModified
    editor.element.classList.remove('remote-editor')
    editor.emitter.emit('did-change-title', editor.getTitle())

    this.monkeyPatchesByEditor.delete(editor)
  }

  hostDidDisconnect () {
    if (this.activeEditor) this.deremotify(this.activeEditor)

    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    })
  }

  disposeActiveSharedEditor () {
    if (this.activeEditor) {
      this.activeEditor.destroy()
      this.monkeyPatchesByEditor.delete(this.activeEditor)
      this.activeEditor = null
    }

    if (this.activeSharedEditor) {
      this.activeSharedEditor.dispose()
      this.activeSharedEditor = null
    }
  }
}
