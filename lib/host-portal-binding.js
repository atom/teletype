const path = require('path')
const {CompositeDisposable, Emitter} = require('atom')
const {FollowState} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const SitePositionsComponent = require('./site-positions-component')

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

      this.sitePositionsComponent = new SitePositionsComponent({portal: this.portal, workspace: this.workspace})

      this.portal.setDelegate(this)
      this.disposables.add(
        this.workspace.observeTextEditors(this.didAddTextEditor.bind(this)),
        this.workspace.observeActiveTextEditor(this.didChangeActiveTextEditor.bind(this))
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
    this.sitePositionsComponent.destroy()
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
      this.sitePositionsComponent.show(editor.element)
    } else {
      this.portal.activateEditorProxy(null)
      this.sitePositionsComponent.hide()
    }
  }

  updateActivePositions (positionsBySiteId) {
    this.sitePositionsComponent.update({positionsBySiteId})
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

  didAddTextEditor (editor) {
    if (!editor.isRemote) this.findOrCreateEditorProxyForEditor(editor)
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

      const didDestroyEditorSubscription = editor.onDidDestroy(() => editorProxy.dispose())
      editorBinding.onDidDispose(() => {
        didDestroyEditorSubscription.dispose()
        this.editorBindingsByEditorProxy.delete(editorProxy)
      })

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
