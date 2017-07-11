const {TextEditor} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class GuestPortalBinding {
  constructor ({portal, workspace, notificationManager, hostDidDisconnect}) {
    this.portal = portal
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitHostDidDisconnect = hostDidDisconnect
    this.activePaneItem = null
    this.activeEditor = null
    this.activeEditorBinding = null
    this.activeSharedEditor = null
    this.monkeyPatchesByEditor = new WeakMap()
  }

  async setActiveSharedEditor (sharedEditor) {
    if (sharedEditor == null) {
      await this.replaceActivePaneItem(new EmptyPortalPaneItem())
    } else {
      const editor = new TextEditor({autoHeight: false})
      this.remotify(editor, sharedEditor)
      await this.replaceActivePaneItem(editor)

      const bufferBinding = new BufferBinding(editor.getBuffer())
      const {sharedBuffer} = sharedEditor
      bufferBinding.setSharedBuffer(sharedBuffer)
      sharedBuffer.setDelegate(bufferBinding)

      const editorBinding = new EditorBinding(editor)
      editorBinding.setSharedEditor(sharedEditor)
      sharedEditor.setDelegate(editorBinding)
      editor.setCursorBufferPosition([0, 0], {autoscroll: false})

      this.activeEditor = editor
      this.activeSharedEditor = sharedEditor
      this.activeEditorBinding = editorBinding
      this.activeBufferBinding = bufferBinding
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
    if (this.activePaneItem) {
      if (this.activePaneItem !== this.activeEditor) this.disposeEmptyPortalPaneItem()
      this.activePaneItem = null
    }

    if (this.activeEditor) {
      this.deremotify(this.activeEditor)
      this.activeEditor = null
    }

    if (this.activeSharedEditor) {
      this.activeSharedEditor.dispose()
      this.activeSharedEditor = null
    }

    if (this.activeEditorBinding) {
      this.activeEditorBinding.dispose()
      this.activeEditorBinding = null
    }

    if (this.activeBufferBinding) {
      this.activeBufferBinding.dispose()
      this.activeBufferBinding = null
    }

    this.emitHostDidDisconnect()
    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    })
  }

  async replaceActivePaneItem (newActivePaneItem) {
    this.newActivePaneItem = newActivePaneItem

    if (this.activePaneItem) {
      const pane = this.workspace.paneForItem(this.activePaneItem)
      const index = pane.getItems().indexOf(this.activePaneItem)
      pane.addItem(newActivePaneItem, {index})
      this.disposeActivePaneItem()
    } else {
      await this.workspace.open(newActivePaneItem)
    }

    this.activePaneItem = this.newActivePaneItem
    this.newActivePaneItem = null
  }

  getActivePaneItem () {
    return this.newActivePaneItem ? this.newActivePaneItem : this.activePaneItem
  }

  disposeActivePaneItem () {
    if (this.activePaneItem === this.activeEditor) {
      this.disposeActiveSharedEditor()
    } else {
      this.disposeEmptyPortalPaneItem()
    }
    this.activePaneItem = null
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

    if (this.activeEditorBinding) {
      this.activeEditorBinding.dispose()
      this.activeEditorBinding = null
    }

    if (this.activeBufferBinding) {
      this.activeBufferBinding.dispose()
      this.activeBufferBinding = null
    }
  }

  disposeEmptyPortalPaneItem () {
    const pane = this.workspace.paneForItem(this.activePaneItem)
    pane.removeItem(this.activePaneItem)
  }
}

class EmptyPortalPaneItem {
  constructor () {
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.width = '100%'
    this.element.style.top = '50%'
    this.element.style.fontSize = '24px'
    this.element.style.textAlign = 'center'
    // TODO: Replace "host" with the person's first name (or @username) once we
    // implement authentication.
    this.element.innerHTML = `
      Your host is doing something else right now.<br/>
      Sharing will resume once the host is editing again.
    `
  }

  getTitle () {
    return 'Portal: No Active File'
  }
}
