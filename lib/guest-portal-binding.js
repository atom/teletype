const path = require('path')
const {CompositeDisposable, Emitter, TextEditor} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const normalizeURI = require('./normalize-uri')

module.exports =
class GuestPortalBinding {
  constructor ({portal, workspace, notificationManager, didDispose, addStatusBarIndicatorForPortal}) {
    this.portal = portal
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidDisposePortalBinding = didDispose
    this.addStatusBarIndicatorForPortal = addStatusBarIndicatorForPortal
    this.activePaneItem = null
    this.activePaneItemSubscriptions = null
    this.activeEditor = null
    this.activeEditorProxy = null

    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBufferProxy = new Map()
  }

  initialize () {
    this.statusBarTile = this.addStatusBarIndicatorForPortal(this.portal, {isHost: false})
    this.workspace.observeActivePaneItem(this.didChangeActivePaneItem.bind(this))
    this.portal.setDelegate(this)
  }

  didChangeActivePaneItem (paneItem) {
    if (this.statusBarTile) {
      const item = this.statusBarTile.getItem()
      item.setFocused(paneItem === this.getActivePaneItem())
    }
  }

  dispose () {
    if (this.statusBarTile) {
      this.statusBarTile.getItem().dispose()
      this.statusBarTile.destroy()
    }
    this.disposeActivePaneItem()
    this.portal.dispose()
    this.emitDidDisposePortalBinding()
  }

  async setActiveEditorProxy (editorProxy) {
    if (editorProxy == null) {
      await this.replaceActivePaneItem(new EmptyPortalPaneItem())
    } else {
      const bufferProxy = editorProxy.bufferProxy

      const editor = new TextEditor({autoHeight: false})
      this.monkeyPatchEditorMethods(editor, editorProxy)
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

  monkeyPatchEditorMethods (editor, editorProxy) {
    const buffer = editor.getBuffer()
    const bufferProxy = editorProxy.bufferProxy

    const bufferURI = normalizeURI(bufferProxy.uri)
    editor.getTitle = () => `Remote Buffer: ${path.basename(bufferURI)}`
    editor.getBuffer().getPath = () => `remote:${bufferURI}`
    editor.getBuffer().save = () => {}
    editor.getBuffer().isModified = () => false
    editor.element.classList.add('realtime-RemotePaneItem')
  }

  restoreOriginalEditorMethods (editor) {
    const buffer = editor.getBuffer()

    // Deleting the object-level overrides causes future calls to fall back
    // to original methods stored on the prototypes of the editor and buffer
    delete editor.getTitle
    delete buffer.getPath
    delete buffer.save
    delete buffer.isModified

    editor.element.classList.remove('realtime-RemotePaneItem')
    editor.emitter.emit('did-change-title', editor.getTitle())
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
      this.restoreOriginalEditorMethods(this.activeEditor)
      this.activeEditor = null
    }

    this.dispose()
  }

  async replaceActivePaneItem (newActivePaneItem) {
    this.newActivePaneItem = newActivePaneItem

    if (this.activePaneItem) {
      const pane = this.workspace.paneForItem(this.activePaneItem)
      const index = pane.getItems().indexOf(this.activePaneItem)
      pane.addItem(newActivePaneItem, {index})
      // TODO: Always use the same editor binding for a given editor proxy
      // so we don't have to clear out the old selections
      if (this.activePaneItem === this.activeEditor) {
        this.activeEditorBinding.clearLocalSelections()
      }
      this.disposeActivePaneItem()
    } else {
      await this.workspace.open(newActivePaneItem)
    }

    this.activePaneItem = this.newActivePaneItem
    this.activePaneItemSubscriptions = new CompositeDisposable()
    this.activePaneItemSubscriptions.add(this.activePaneItem.onDidDestroy(this.dispose.bind(this)))
    this.newActivePaneItem = null
  }

  getActivePaneItem () {
    return this.newActivePaneItem ? this.newActivePaneItem : this.activePaneItem
  }

  toggleFollowHostCursorOnActiveEditorProxy () {
    const isFollowingHostCursor = this.activeEditorBinding.isFollowingHostCursor()
    this.activeEditorBinding.setFollowHostCursor(!isFollowingHostCursor)
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
