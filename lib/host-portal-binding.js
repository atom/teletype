const path = require('path')
const {CompositeDisposable} = require('atom')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')

module.exports =
class HostPortalBinding {
  constructor ({portal, workspace, clipboard, notificationManager, addStatusBarIndicatorForPortal}) {
    this.portal = portal
    this.workspace = workspace
    this.clipboard = clipboard
    this.notificationManager = notificationManager
    this.addStatusBarIndicatorForPortal = addStatusBarIndicatorForPortal
    this.editorBindingsByEditor = new WeakMap()
    this.bufferBindingsByBuffer = new WeakMap()
    this.disposables = new CompositeDisposable()
  }

  initialize () {
    this.portal.setDelegate(this)
    this.disposables.add(this.workspace.observeActiveTextEditor(
      this.didChangeActiveTextEditor.bind(this)
    ))

    this.workspace.getElement().classList.add('realtime-Host')
    this.statusBarTile = this.addStatusBarIndicatorForPortal(this.portal, {isHost: true})
    this.clipboard.write(this.portal.id)
    this.notificationManager.addSuccess('Your portal is open for business', {
      description: "Invite people to collaborate with you using your portal ID above. It's already on your clipboard. 👌",
      detail: this.portal.id,
      dismissable: true
    })
  }

  dispose () {
    this.workspace.getElement().classList.remove('realtime-Host')
    if (this.statusBarTile) {
      this.statusBarTile.getItem().dispose()
      this.statusBarTile.destroy()
    }
    this.disposables.dispose()
  }

  close () {
    this.notificationManager.addInfo('Portal closed', {
      description: 'You are no longer sharing your editor.',
    })
    this.portal.dispose()
  }

  async didChangeActiveTextEditor (editor) {
    if (editor == null) {
      await this.portal.setActiveEditorProxy(null)
      return
    }

    let editorBinding = this.editorBindingsByEditor.get(editor)
    if (!editorBinding) {
      const buffer = editor.getBuffer()

      let bufferBinding = this.bufferBindingsByBuffer.get(buffer)
      let bufferProxy = bufferBinding ? bufferBinding.bufferProxy : null
      if (!bufferBinding) {
        bufferBinding = new BufferBinding({buffer})
        bufferProxy = await this.portal.createBufferProxy({
          uri: this.getBufferProxyURI(buffer),
          text: buffer.getText()
        })
        bufferBinding.setBufferProxy(bufferProxy)
        bufferProxy.setDelegate(bufferBinding)

        this.bufferBindingsByBuffer.set(buffer, bufferBinding)
      }

      editorBinding = new EditorBinding({editor, isHost: true})
      const editorProxy = await this.portal.createEditorProxy({
        bufferProxy,
        selections: editor.selectionsMarkerLayer.bufferMarkerLayer.createSnapshot()
      })
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)

      this.editorBindingsByEditor.set(editor, editorBinding)
    }

    await this.portal.setActiveEditorProxy(editorBinding.editorProxy)
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
