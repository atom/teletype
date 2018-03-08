const {CompositeDisposable, Emitter, TextEditor, TextBuffer} = require('atom')
const {Errors, FollowState} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const SitePositionsComponent = require('./site-positions-component')
const getPathWithNativeSeparators = require('./get-path-with-native-separators')
const getEditorURI = require('./get-editor-uri')
const NOOP = () => {}

module.exports =
class GuestPortalBinding {
  constructor ({client, portalId, workspace, notificationManager, didDispose}) {
    this.client = client
    this.portalId = portalId
    this.workspace = workspace
    this.notificationManager = notificationManager
    this.emitDidDispose = didDispose || NOOP
    this.lastActivePaneItem = null
    this.editorBindingsByEditorProxyId = new Map()
    this.bufferBindingsByBufferProxyId = new Map()
    this.editorProxiesByEditor = new WeakMap()
    this.editorProxiesMetadataById = new Map()
    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()
    this.lastEditorProxyChangePromise = Promise.resolve()
    this.shouldRelayActiveEditorChanges = true
  }

  async initialize () {
    try {
      this.portal = await this.client.joinPortal(this.portalId)
      if (!this.portal) return false

      this.sitePositionsComponent = new SitePositionsComponent({portal: this.portal, workspace: this.workspace})
      this.subscriptions.add(this.workspace.onDidChangeActivePaneItem(this.didChangeActivePaneItem.bind(this)))

      await this.portal.setDelegate(this)

      return true
    } catch (error) {
      this.didFailToJoin(error)
      return false
    }
  }

  dispose () {
    this.subscriptions.dispose()
    this.sitePositionsComponent.destroy()

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

  didChangeEditorProxies () {}

  getRemoteEditors () {
    const hostIdentity = this.portal.getSiteIdentity(1)
    const bufferProxyIds = new Set()
    const remoteEditors = []
    const editorProxiesMetadata = this.portal.getEditorProxiesMetadata()

    for (let i = 0; i < editorProxiesMetadata.length; i++) {
      const {id, bufferProxyId, bufferProxyURI} = editorProxiesMetadata[i]
      if (bufferProxyIds.has(bufferProxyId)) continue

      remoteEditors.push({
        hostGitHubUsername: hostIdentity.login,
        uri: getEditorURI(this.portal.id, id),
        path: getPathWithNativeSeparators(bufferProxyURI)
      })
      bufferProxyIds.add(bufferProxyId)
    }

    return remoteEditors
  }

  async getRemoteEditor (editorProxyId) {
    const editorProxy = await this.portal.findOrFetchEditorProxy(editorProxyId)
    if (editorProxy) {
      return this.findOrCreateEditorForEditorProxy(editorProxy)
    } else {
      return null
    }
  }

  updateActivePositions (positionsBySiteId) {
    this.sitePositionsComponent.update({positionsBySiteId})
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
    } else {
      this.editorBindingsByEditorProxyId.forEach((b) => b.updateTether(followState))
    }

    const editorBinding = this.editorBindingsByEditorProxyId.get(editorProxy.id)
    if (editorBinding && position) {
      editorBinding.updateTether(followState, position)
    }
  }

  // Private
  findOrCreateEditorForEditorProxy (editorProxy) {
    let editor
    let editorBinding = this.editorBindingsByEditorProxyId.get(editorProxy.id)
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

      this.editorBindingsByEditorProxyId.set(editorProxy.id, editorBinding)
      this.editorProxiesByEditor.set(editor, editorProxy)

      const didDestroyEditorSubscription = editor.onDidDestroy(() => editorBinding.dispose())
      editorBinding.onDidDispose(() => {
        didDestroyEditorSubscription.dispose()

        const isRetracted = this.portal.resolveFollowState() === FollowState.RETRACTED
        this.shouldRelayActiveEditorChanges = !isRetracted
        editor.destroy()
        this.shouldRelayActiveEditorChanges = true

        this.editorProxiesByEditor.delete(editor)
        this.editorBindingsByEditorProxyId.delete(editorProxy.id)
      })
    }
    return editor
  }

  // Private
  findOrCreateBufferForBufferProxy (bufferProxy) {
    let buffer
    let bufferBinding = this.bufferBindingsByBufferProxyId.get(bufferProxy.id)
    if (bufferBinding) {
      buffer = bufferBinding.buffer
    } else {
      buffer = new TextBuffer()
      bufferBinding = new BufferBinding({
        buffer,
        isHost: false,
        didDispose: () => this.bufferBindingsByBufferProxyId.delete(bufferProxy.id)
      })
      bufferBinding.setBufferProxy(bufferProxy)
      bufferProxy.setDelegate(bufferBinding)
      this.bufferBindingsByBufferProxyId.set(bufferProxy.id, bufferBinding)
    }
    return buffer
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

    if (editorProxy) {
      this.sitePositionsComponent.show(paneItem.element)
    } else {
      this.sitePositionsComponent.hide()
    }

    if (this.shouldRelayActiveEditorChanges) {
      this.portal.activateEditorProxy(editorProxy)
    }
  }

  hasPaneItem (paneItem) {
    return this.editorProxiesByEditor.has(paneItem)
  }

  getActivePaneItem () {
    return this.newActivePaneItem || this.workspace.getActivePaneItem()
  }

  onDidChange (callback) {
    return this.emitter.on('did-change', callback)
  }
}
