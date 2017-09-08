const path = require('path')
const {CompositeDisposable, Emitter, TextEditor} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const normalizeURI = require('./normalize-uri')

module.exports =
class GuestPortalBinding {
  constructor ({portal, workspace, notificationManager, didLeave, hostDidDisconnect}) {
    this.portal = portal
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidLeave = didLeave
    this.emitHostDidDisconnect = hostDidDisconnect
    this.activePaneItem = null
    this.activePaneItemSubscriptions = null
    this.activeEditor = null
    this.activeEditorProxy = null
    this.monkeyPatchesByEditor = new WeakMap()

    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBufferProxy = new Map()
  }

  async setActiveEditorProxy (editorProxy) {
    if (editorProxy == null) {
      await this.replaceActivePaneItem(new EmptyPortalPaneItem())
    } else {
      const bufferProxy = editorProxy.bufferProxy

      const editor = new TextEditor({autoHeight: false})
      this.remotify(editor, editorProxy)
      await this.replaceActivePaneItem(editor)

      const bufferBinding = new BufferBinding(editor.getBuffer())
      bufferBinding.setBufferProxy(bufferProxy)
      bufferProxy.setDelegate(bufferBinding)

      const editorBinding = new EditorBinding(editor)
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)
      editor.setCursorBufferPosition([0, 0], {autoscroll: false})
      this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)

      this.activeEditor = editor
      this.activeEditorProxy = editorProxy
      this.activeEditorBinding = editorBinding
      this.activeBufferBinding = bufferBinding
    }
  }

  remotify (editor, editorProxy) {
    const buffer = editor.getBuffer()
    const bufferProxy = editorProxy.bufferProxy

    const originalEditorGetTitle = editor.getTitle.bind(editor)
    const originalBufferGetPath = buffer.getPath.bind(buffer)
    const originalBufferSave = buffer.save.bind(buffer)
    const originalBufferIsModified = buffer.isModified.bind(buffer)
    this.monkeyPatchesByEditor.set(editor, {
      originalEditorGetTitle, originalBufferGetPath, originalBufferSave,
      originalBufferIsModified
    })

    const bufferURI = normalizeURI(bufferProxy.uri)
    editor.getTitle = () => `Remote Buffer: ${path.basename(bufferURI)}`
    editor.getBuffer().getPath = () => `remote:${bufferURI}`
    editor.getBuffer().save = () => {}
    editor.getBuffer().isModified = () => false
    editor.element.classList.add('realtime-RemotePaneItem')
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
    editor.element.classList.remove('realtime-RemotePaneItem')
    editor.emitter.emit('did-change-title', editor.getTitle())

    this.monkeyPatchesByEditor.delete(editor)
  }

  hostDidClosePortal () {
    this.disconnect()
    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    })
  }

  hostDidLoseConnection () {
    this.disconnect()
    this.notificationManager.addInfo('Portal closed', {
      description: (
        'We haven\'t heard from the host in a while.\n' +
        'Once your host is back online, they can share a new portal with you to resume collaborating.'
      ),
      dismissable: true
    })
  }

  // Private
  disconnect () {
    if (this.activePaneItem) {
      if (this.activePaneItem !== this.activeEditor) this.disposeEmptyPortalPaneItem()
      this.activePaneItem = null
    }

    if (this.activeEditorBinding) {
      this.activeEditorBinding.dispose()
      this.activeEditorBinding = null
    }

    if (this.activeBufferBinding) {
      this.activeBufferBinding.dispose()
      this.activeBufferBinding = null
    }

    if (this.activeEditorProxy) {
      this.activeEditorProxy.setDelegate(null)
      this.activeEditorProxy.bufferProxy.setDelegate(null)
      this.activeEditorProxy = null
    }

    if (this.activeEditor) {
      this.deremotify(this.activeEditor)
      this.activeEditor = null
    }

    this.emitHostDidDisconnect()
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
    this.activePaneItemSubscriptions = new CompositeDisposable()
    this.activePaneItemSubscriptions.add(
      this.activePaneItem.onDidDestroy(() => {
        this.portal.dispose()
        this.emitDidLeave()
      })
    )
    this.newActivePaneItem = null
  }

  getActivePaneItem () {
    return this.newActivePaneItem ? this.newActivePaneItem : this.activePaneItem
  }

  toggleFollowHostCursorOnActiveEditorProxy () {
    const isFollowingHostCursor = this.activeEditorBinding.isFollowingHostCursor()
    this.activeEditorBinding.setFollowHostCursor(!isFollowingHostCursor)
  }

  dispose () {
    this.portal.dispose()
    this.disposeActivePaneItem()
  }

  disposeActivePaneItem () {
    this.activePaneItemSubscriptions.dispose()

    if (this.activePaneItem === this.activeEditor) {
      this.disposeActiveEditorProxy()
    } else {
      this.disposeEmptyPortalPaneItem()
    }
    this.activePaneItem = null
  }

  disposeActiveEditorProxy () {
    if (this.activeEditorBinding) {
      this.activeEditorBinding.dispose()
      this.activeEditorBinding = null
    }

    if (this.activeBufferBinding) {
      this.activeBufferBinding.dispose()
      this.activeBufferBinding = null
    }

    if (this.activeEditorProxy) {
      this.activeEditorProxy.setDelegate(null)
      this.activeEditorProxy.bufferProxy.setDelegate(null)
      this.activeEditorProxy = null
    }

    if (this.activeEditor) {
      this.activeEditor.destroy()
      this.monkeyPatchesByEditor.delete(this.activeEditor)
      this.activeEditor = null
    }
  }

  disposeEmptyPortalPaneItem () {
    const pane = this.workspace.paneForItem(this.activePaneItem)
    if (pane) pane.removeItem(this.activePaneItem)
  }
}

class EmptyPortalPaneItem {
  constructor () {
    this.emitter = new Emitter()
    this.element = document.createElement('div')
    this.element.tabIndex = -1
    this.element.classList.add('realtime-RemotePaneItem')
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

  destroy () {
    this.emitter.emit('did-destroy')
  }

  onDidDestroy (callback) {
    return this.emitter.once('did-destroy', callback)
  }
}
