const {CompositeDisposable, Emitter, TextEditor, TextBuffer} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')

module.exports =
class GuestPortalBinding {
  constructor ({portal, workspace, notificationManager, didDispose, addStatusBarIndicatorForPortal}) {
    this.portal = portal
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidDispose = didDispose
    this.addStatusBarIndicatorForPortal = addStatusBarIndicatorForPortal
    this.activePaneItem = null
    this.activePaneItemSubscriptions = null
    this.activeEditor = null
    this.activeEditorProxy = null

    this.emptyPortalItem = new EmptyPortalPaneItem()
    this.editorBindingsByEditorProxy = new WeakMap()
    this.bufferBindingsByBufferProxy = new WeakMap()
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
    this.emitDidDispose()
  }

  async setActiveEditorProxy (editorProxy) {
    if (editorProxy == null) {
      await this.replaceActivePaneItem(this.emptyPortalItem)
    } else {
      const {bufferProxy} = editorProxy
      let editor
      let editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      let bufferBinding = this.bufferBindingsByBufferProxy.get(bufferProxy)
      if (editorBinding) {
        editor = editorBinding.editor
      } else {
        let buffer
        if (bufferBinding) {
          buffer = bufferBinding.buffer
        } else {
          buffer = new TextBuffer()
          bufferBinding = new BufferBinding(buffer)
          bufferBinding.setBufferProxy(bufferProxy)
          bufferProxy.setDelegate(bufferBinding)
          this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding)
        }

        editor = new TextEditor({buffer, autoHeight: false})
        editorBinding = new EditorBinding({editor, isHost: false})
        editorBinding.setEditorProxy(editorProxy)
        editorProxy.setDelegate(editorBinding)
        editor.setCursorBufferPosition([0, 0], {autoscroll: false})
        this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)
      }
      await this.replaceActivePaneItem(editor)
      editorBinding.autoscrollToLastHostSelection()
      this.activeBufferBinding = bufferBinding
      this.activeEditorBinding = editorBinding
      this.activeEditor = editor
    }
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
      pane.removeItem(this.activePaneItem)
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
