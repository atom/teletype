const path = require('path')
const {CompositeDisposable, Emitter} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')

module.exports =
class HostPortalBinding {
  constructor ({client, workspace, notificationManager, didDispose}) {
    this.client = client
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.editorBindingsByEditor = new WeakMap()
    this.bufferBindingsByBuffer = new WeakMap()
    this.disposables = new CompositeDisposable()
    this.emitter = new Emitter()
    this.didDispose = didDispose
  }

  async initialize () {
    try {
      this.portal = await this.client.createPortal()
      if (!this.portal) return false

      this.portal.setDelegate(this)
      this.disposables.add(this.workspace.observeActiveTextEditor(
        this.didChangeActiveTextEditor.bind(this)
      ))

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
    if (editor == null || editor.isRemote) {
      this.portal.setActiveEditorProxy(null)
      return
    }

    let editorBinding = this.editorBindingsByEditor.get(editor)
    if (!editorBinding) {
      const buffer = editor.getBuffer()

      let bufferBinding = this.bufferBindingsByBuffer.get(buffer)
      let bufferProxy = bufferBinding ? bufferBinding.bufferProxy : null
      if (!bufferBinding) {
        bufferBinding = new BufferBinding({buffer})
        bufferProxy = this.portal.createBufferProxy({
          uri: this.getBufferProxyURI(buffer),
          history: buffer.getHistory()
        })
        bufferBinding.setBufferProxy(bufferProxy)
        bufferProxy.setDelegate(bufferBinding)

        this.bufferBindingsByBuffer.set(buffer, bufferBinding)
      }

      editorBinding = new EditorBinding({editor, portal: this.portal, isHost: true})
      const editorProxy = this.portal.createEditorProxy({
        bufferProxy,
        selections: editor.selectionsMarkerLayer.bufferMarkerLayer.createSnapshot()
      })
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)

      this.editorBindingsByEditor.set(editor, editorBinding)
    }

    this.portal.setActiveEditorProxy(editorBinding.editorProxy)
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
