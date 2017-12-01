const {CompositeDisposable, Emitter, TextEditor, TextBuffer} = require('atom')
const {Errors, FollowState} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const EmptyPortalPaneItem = require('./empty-portal-pane-item')

module.exports =
class GuestPortalBinding {
  constructor ({client, portalId, workspace, notificationManager, didDispose}) {
    this.client = client
    this.portalId = portalId
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidDispose = didDispose
    this.activePaneItem = null
    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBufferProxy = new Map()
    this.editorProxiesByEditor = new WeakMap()
    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()
    this.lastEditorProxyChangePromise = Promise.resolve()
    this.openEditorProxies = new Set()
  }

  async initialize () {
    try {
      this.portal = await this.client.joinPortal(this.portalId)
      if (!this.portal) return false

      await this.portal.setDelegate(this)
      if (this.openEditorProxies.size === 0) {
        await this.openPaneItem(this.getEmptyPortalPaneItem())
      }

      this.subscriptions.add(this.workspace.onDidChangeActivePaneItem(this.didChangeActivePaneItem.bind(this)))
      return true
    } catch (error) {
      this.didFailToJoin(error)
      return false
    }
  }

  dispose () {
    this.subscriptions.dispose()
    this.openEditorProxies.clear()
    if (this.emptyPortalItem) this.emptyPortalItem.destroy()
    this.emitDidDispose()
  }

  siteDidJoin (siteId) {
    const {login: hostLogin} = this.portal.getSiteIdentity(1)
    const {login: siteLogin} = this.portal.getSiteIdentity(siteId)
    this.notificationManager.addInfo(`@${siteLogin} has joined @${hostLogin}'s portal`)
    this.emitter.emit('did-change')
  }

  siteDidLeave (siteId) {
    const {login: hostLogin} = this.portal.getSiteIdentity(1)
    const {login: siteLogin} = this.portal.getSiteIdentity(siteId)
    this.notificationManager.addInfo(`@${siteLogin} has left @${hostLogin}'s portal`)
    this.emitter.emit('did-change')
  }

  addEditorProxy (editorProxy) {

  }

  removeEditorProxy (editorProxy) {
    this.lastEditorProxyChangePromise = this.lastEditorProxyChangePromise.then(async () => {
      this.openEditorProxies.delete(editorProxy)
      if (this.openEditorProxies.size === 0) {
        await this.openPaneItem(this.getEmptyPortalPaneItem())
      }

      const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      editorBinding.editor.destroy()
    })

    return this.lastEditorProxyChangePromise
  }

  updateActivePositions () {}

  updateTether (followState, editorProxy, position) {
    if (!editorProxy) return

    this.lastEditorProxyChangePromise = this.lastEditorProxyChangePromise.then(async () => {
      if (followState === FollowState.RETRACTED) {
        const editor = this.findOrCreateEditorForEditorProxy(editorProxy)
        await this.openPaneItem(editor)

        this.openEditorProxies.add(editorProxy)
        if (this.openEditorProxies.size > 0) {
          this.getEmptyPortalPaneItem().destroy()
        }
      }

      const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      if (editorBinding && position) {
        editorBinding.updateTether(followState, position)
      }
    })

    return this.lastEditorProxyChangePromise
  }

  // Private
  findOrCreateEditorForEditorProxy (editorProxy) {
    let editor
    let editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
    if (editorBinding) {
      editor = editorBinding.editor
    } else {
      const {bufferProxy} = editorProxy
      const buffer = this.findOrCreateBufferForBufferProxy(bufferProxy)
      editor = new TextEditor({buffer, autoHeight: false})
      editorBinding = new EditorBinding({
        editor,
        portal: this.portal,
        isHost: false,
        didDispose: () => {
          this.editorBindingsByEditorProxy.delete(editorProxy)
          this.editorProxiesByEditor.delete(editor)
        }
      })
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)
      this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)
      this.editorProxiesByEditor.set(editor, editorProxy)
    }
    return editor
  }

  // Private
  findOrCreateBufferForBufferProxy (bufferProxy) {
    let buffer
    let bufferBinding = this.bufferBindingsByBufferProxy.get(bufferProxy)
    if (bufferBinding) {
      buffer = bufferBinding.buffer
    } else {
      buffer = new TextBuffer()
      bufferBinding = new BufferBinding({
        buffer,
        didDispose: () => this.bufferBindingsByBufferProxy.delete(bufferProxy)
      })
      bufferBinding.setBufferProxy(bufferProxy)
      bufferProxy.setDelegate(bufferBinding)
      this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding)
    }
    return buffer
  }

  activate () {
    const activePaneItem = this.getActivePaneItem()
    const pane = this.workspace.paneForItem(activePaneItem)
    if (pane && activePaneItem) {
      pane.activateItem(activePaneItem)
      pane.activate()
    }
  }

  didFailToJoin (error) {
    let message, description
    if (error instanceof Errors.PortalNotFoundError) {
      message = 'Portal not found'
      description = 'No portal exists with that ID. Please ask your host to provide you with their current portal ID.'
    } else {
      message = 'Failed to join portal'
      description =
        `Attempting to join portal ${this.portalId} failed with error: <code>${error.message}</code>\n\n` +
        'Please wait a few moments and try again.'
    }
    this.notificationManager.addError(message, {
      description,
      dismissable: true
    })
  }

  hostDidClosePortal () {
    this.notificationManager.addInfo('Portal closed', {
      description: 'Your host stopped sharing their editor.',
      dismissable: true
    })
    this.activePaneItem = null
  }

  hostDidLoseConnection () {
    this.notificationManager.addInfo('Portal closed', {
      description: (
        'We haven\'t heard from the host in a while.\n' +
        'Once your host is back online, they can share a new portal with you to resume collaborating.'
      ),
      dismissable: true
    })
    this.activePaneItem = null
  }

  leave () {
    this.editorBindingsByEditorProxy.forEach((binding) => {
      binding.editor.destroy()
    })

    if (this.portal) this.portal.dispose()
  }

  async openPaneItem (newActivePaneItem) {
    if (newActivePaneItem !== this.getActivePaneItem()) {
      this.newActivePaneItem = newActivePaneItem
      await this.workspace.open(newActivePaneItem)
      this.activePaneItem = this.newActivePaneItem
      this.newActivePaneItem = null
    }
  }

  didChangeActivePaneItem (paneItem) {
    if (paneItem !== this.getEmptyPortalPaneItem()) {
      const editorProxy = this.editorProxiesByEditor.get(paneItem)
      this.portal.activateEditorProxy(editorProxy)
    }
  }

  getActivePaneItem () {
    return this.newActivePaneItem ? this.newActivePaneItem : this.activePaneItem
  }

  getEmptyPortalPaneItem () {
    if (this.emptyPortalItem == null) {
      this.emptyPortalItem = new EmptyPortalPaneItem({
        hostIdentity: this.portal.getSiteIdentity(1)
      })
    }
    return this.emptyPortalItem
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }
}
