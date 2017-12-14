const path = require('path')
const {CompositeDisposable, Emitter} = require('atom')
const {FollowState} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const SitePositionsController = require('./site-positions-controller')

module.exports =
class HostPortalBinding {
  constructor ({client, workspace, notificationManager, didDispose}) {
    this.client = client
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.editorBindingsByEditor = new WeakMap()
    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBuffer = new WeakMap()
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.lastUpdateTetherPromise = Promise.resolve()
    this.didDispose = didDispose
  }

  async initialize () {
    try {
      this.portal = await this.client.createPortal()
      if (!this.portal) return false

      this.sitePositionsController = new SitePositionsController({portal: this.portal, workspace: this.workspace})

      this.portal.setDelegate(this)
      this.disposables.add(
        this.workspace.observeActiveTextEditor(this.didChangeActiveTextEditor.bind(this)),
        this.workspace.onDidDestroyPaneItem(this.didDestroyPaneItem.bind(this))
      )

      this.workspace.getElement().classList.add('teletype-Host')
      return true
    } catch (error) {
      this.notificationManager.addError('Failed to share portal', {
        description: `Attempting to share a portal failed with error: <code>${error.message}</code>`,
        dismissable: true
      })
      return false
    }
  }

  dispose () {
    this.workspace.getElement().classList.remove('teletype-Host')
    this.sitePositionsController.destroy()
    this.disposables.dispose()
    this.didDispose()
  }

  close () {
    this.portal.dispose()
  }

  siteDidJoin (siteId) {
    const {login} = this.portal.getSiteIdentity(siteId)
    this.notificationManager.addInfo(`@${login} has joined your portal`)
    this.emitter.emit('did-change')
  }

  siteDidLeave (siteId) {
    const {login} = this.portal.getSiteIdentity(siteId)
    this.notificationManager.addInfo(`@${login} has left your portal`)
    this.emitter.emit('did-change')
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }

  didChangeActiveTextEditor (editor) {
    if (editor && !editor.isRemote) {
      const editorProxy = this.findOrCreateEditorProxyForEditor(editor)
      this.portal.activateEditorProxy(editorProxy)
      this.sitePositionsController.show(editor.element)
    } else {
      this.portal.activateEditorProxy(null)
      this.sitePositionsController.hide()
    }
  }

  updateActivePositions (positionsBySiteId) {
    this.sitePositionsController.updateActivePositions(positionsBySiteId)
  }

  updateTether (followState, editorProxy, position) {
    if (editorProxy) {
      this.lastUpdateTetherPromise = this.lastUpdateTetherPromise.then(() =>
        this._updateTether(followState, editorProxy, position)
      )
    }

    return this.lastUpdateTetherPromise
  }

  // Private
  async _updateTether (followState, editorProxy, position) {
    const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)

    if (followState === FollowState.RETRACTED) {
      await this.workspace.open(editorBinding.editor, {searchAllPanes: true})
      if (position) editorBinding.updateTether(followState, position)
    } else {
      this.editorBindingsByEditorProxy.forEach((b) => b.updateTether(followState))
    }
  }

  didDestroyPaneItem ({item}) {
    const editorBinding = this.editorBindingsByEditor.get(item)
    if (editorBinding) {
      this.portal.removeEditorProxy(editorBinding.editorProxy)
    }
  }

  findOrCreateEditorProxyForEditor (editor) {
    let editorBinding = this.editorBindingsByEditor.get(editor)
    if (editorBinding) {
      return editorBinding.editorProxy
    } else {
      const bufferProxy = this.findOrCreateBufferProxyForBuffer(editor.getBuffer())
      const editorProxy = this.portal.createEditorProxy({bufferProxy})
      editorBinding = new EditorBinding({editor, portal: this.portal, isHost: true})
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)

      this.editorBindingsByEditor.set(editor, editorBinding)
      this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)
      editorBinding.onDidDispose(() => {
        this.editorBindingsByEditorProxy.delete(editorProxy)
      })

      this.sitePositionsController.addEditorBinding(editorBinding)

      return editorProxy
    }
  }

  findOrCreateBufferProxyForBuffer (buffer) {
    let bufferBinding = this.bufferBindingsByBuffer.get(buffer)
    if (bufferBinding) {
      return bufferBinding.bufferProxy
    } else {
      bufferBinding = new BufferBinding({buffer, isHost: true})
      const bufferProxy = this.portal.createBufferProxy({
        uri: this.getBufferProxyURI(buffer),
        history: buffer.getHistory()
      })
      bufferBinding.setBufferProxy(bufferProxy)
      bufferProxy.setDelegate(bufferBinding)

      this.bufferBindingsByBuffer.set(buffer, bufferBinding)

      return bufferProxy
    }
  }

  getBufferProxyURI (buffer) {
    if (!buffer.getPath()) return 'untitled'

    const [projectPath, relativePath] = this.workspace.project.relativizePath(buffer.getPath())
    if (projectPath) {
      const projectName = path.basename(projectPath)
      return path.join(projectName, relativePath)
    } else {
      return relativePath
    }
  }
}
