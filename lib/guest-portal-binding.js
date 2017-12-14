const {CompositeDisposable, Emitter, TextEditor, TextBuffer} = require('atom')
const {Errors, FollowState} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const EmptyPortalPaneItem = require('./empty-portal-pane-item')
const SitePositionsController = require('./site-positions-controller')

module.exports =
class GuestPortalBinding {
  constructor ({client, portalId, workspace, notificationManager, didDispose}) {
    this.client = client
    this.portalId = portalId
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidDispose = didDispose
    this.lastActivePaneItem = null
    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBufferProxy = new Map()
    this.editorProxiesByEditor = new WeakMap()
    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()
    this.lastEditorProxyChangePromise = Promise.resolve()
    this.shouldRelayActiveEditorChanges = true
  }

  async initialize () {
    try {
      this.portal = await this.client.joinPortal(this.portalId)
      if (!this.portal) return false

      this.sitePositionsController = new SitePositionsController({portal: this.portal, workspace: this.workspace})
      this.subscriptions.add(this.workspace.onDidChangeActivePaneItem(this.didChangeActivePaneItem.bind(this)))
      this.subscriptions.add(this.workspace.onDidDestroyPaneItem(this.didDestroyPaneItem.bind(this)))

      await this.portal.setDelegate(this)
      await this.toggleEmptyPortalPaneItem()

      return true
    } catch (error) {
      this.didFailToJoin(error)
      return false
    }
  }

  dispose () {
    this.subscriptions.dispose()
    this.sitePositionsController.destroy()
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
    // TODO Implement in order to allow guests to open any editor that's in the host's workspace
  }

  removeEditorProxy (editorProxy) {
    this.lastEditorProxyChangePromise = this.lastEditorProxyChangePromise.then(async () => {
      const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      if (editorBinding) {
        editorBinding.dispose()
        if (this.editorBindingsByEditorProxy.size === 0) {
          this.portal.follow(1)
        }

        await this.toggleEmptyPortalPaneItem()

        const isRetracted = this.portal.resolveFollowState() === FollowState.RETRACTED
        this.shouldRelayActiveEditorChanges = !isRetracted
        this.lastDestroyedEditorWasRemovedByHost = true
        editorBinding.editor.destroy()
        this.lastDestroyedEditorWasRemovedByHost = false
        this.shouldRelayActiveEditorChanges = true
      }
    })

    return this.lastEditorProxyChangePromise
  }

  updateActivePositions (positionsBySiteId) {
    this.sitePositionsController.updateActivePositions(positionsBySiteId)
  }

  updateTether (followState, editorProxy, position) {
    if (editorProxy) {
      this.lastEditorProxyChangePromise = this.lastEditorProxyChangePromise.then(() =>
        this._updateTether(followState, editorProxy, position)
      )
    }

    return this.lastEditorProxyChangePromise
  }

  // Private
  async _updateTether (followState, editorProxy, position) {
    if (followState === FollowState.RETRACTED) {
      const editor = this.findOrCreateEditorForEditorProxy(editorProxy)
      this.shouldRelayActiveEditorChanges = false
      await this.openPaneItem(editor)
      this.shouldRelayActiveEditorChanges = true
      await this.toggleEmptyPortalPaneItem()
    } else {
      this.editorBindingsByEditorProxy.forEach((b) => b.updateTether(followState))
    }

    const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
    if (editorBinding && position) {
      editorBinding.updateTether(followState, position)
    }
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
        isHost: false
      })
      editorBinding.setEditorProxy(editorProxy)
      editorProxy.setDelegate(editorBinding)

      this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)
      this.editorProxiesByEditor.set(editor, editorProxy)
      editorBinding.onDidDispose(() => {
        this.editorProxiesByEditor.delete(editor)
        this.editorBindingsByEditorProxy.delete(editorProxy)
      })

      this.sitePositionsController.addEditorBinding(editorBinding)
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
        isHost: false,
        didDispose: () => this.bufferBindingsByBufferProxy.delete(bufferProxy)
      })
      bufferBinding.setBufferProxy(bufferProxy)
      bufferProxy.setDelegate(bufferBinding)
      this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding)
    }
    return buffer
  }

  // Private
  async toggleEmptyPortalPaneItem () {
    const emptyPortalItem = this.getEmptyPortalPaneItem()
    const pane = this.workspace.paneForItem(emptyPortalItem)
    if (this.editorBindingsByEditorProxy.size === 0) {
      if (!pane) await this.openPaneItem(emptyPortalItem)
    } else {
      if (pane) emptyPortalItem.destroy()
    }
  }

  activate () {
    const paneItem = this.lastActivePaneItem
    const pane = this.workspace.paneForItem(paneItem)
    if (pane && paneItem) {
      pane.activateItem(paneItem)
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
  }

  hostDidLoseConnection () {
    this.notificationManager.addInfo('Portal closed', {
      description: (
        'We haven\'t heard from the host in a while.\n' +
        'Once your host is back online, they can share a new portal with you to resume collaborating.'
      ),
      dismissable: true
    })
  }

  leave () {
    this.editorBindingsByEditorProxy.forEach((binding) => {
      binding.editor.destroy()
    })

    if (this.portal) this.portal.dispose()
  }

  async openPaneItem (newActivePaneItem) {
    this.newActivePaneItem = newActivePaneItem
    await this.workspace.open(newActivePaneItem, {searchAllPanes: true})
    this.lastActivePaneItem = this.newActivePaneItem
    this.newActivePaneItem = null
  }

  didChangeActivePaneItem (paneItem) {
    const editorProxy = this.editorProxiesByEditor.get(paneItem)

    if (editorProxy || paneItem === this.getEmptyPortalPaneItem()) {
      this.sitePositionsController.show(paneItem.element)
    } else {
      this.sitePositionsController.hide()
    }

    if (this.shouldRelayActiveEditorChanges && paneItem !== this.getEmptyPortalPaneItem()) {
      this.portal.activateEditorProxy(editorProxy)
    }
  }

  didDestroyPaneItem () {
    const emptyPortalItem = this.getEmptyPortalPaneItem()
    const hasNoPortalPaneItem = this.workspace.getPaneItems().every((item) => (
      item !== emptyPortalItem && !this.editorProxiesByEditor.has(item)
    ))
    const lastDestroyedEditorWasClosedManually = !this.lastDestroyedEditorWasRemovedByHost
    if (hasNoPortalPaneItem && lastDestroyedEditorWasClosedManually) {
      this.leave()
    }
  }

  hasPaneItem (paneItem) {
    return (
      paneItem === this.getEmptyPortalPaneItem() ||
      this.editorProxiesByEditor.has(paneItem)
    )
  }

  getActivePaneItem () {
    return this.newActivePaneItem || this.workspace.getActivePaneItem()
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
