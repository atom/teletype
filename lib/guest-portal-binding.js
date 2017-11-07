const {CompositeDisposable, Emitter, TextEditor, TextBuffer} = require('atom')
const {Errors} = require('@atom/teletype-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
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
    this.activeEditorBinding = null
    this.editorBindingsByEditorProxy = new Map()
    this.bufferBindingsByBufferProxy = new Map()
    this.addedPaneItems = new WeakSet()
    this.emitter = new Emitter()
    this.lastSetActiveEditorProxyPromise = Promise.resolve()
  }

  async initialize () {
    try {
      this.portal = await this.client.joinPortal(this.portalId)
      if (!this.portal) return false

      this.portal.setDelegate(this)
      return true
    } catch (error) {
      this.didFailToJoin(error)
      return false
    }
  }

  dispose () {
    if (this.activePaneItemDestroySubscription) this.activePaneItemDestroySubscription.dispose()
    if (this.activePaneItem) this.activePaneItem.destroy()
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

  async setActiveEditorProxy (editorProxy) {
    this.lastSetActiveEditorProxyPromise = this.lastSetActiveEditorProxyPromise.then(async () => {
      if (editorProxy == null) {
        await this.replaceActivePaneItem(this.getEmptyPortalPaneItem())
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
            bufferBinding = new BufferBinding({
              buffer,
              didDispose: () => this.bufferBindingsByBufferProxy.delete(bufferProxy)
            })
            bufferBinding.setBufferProxy(bufferProxy)
            bufferProxy.setDelegate(bufferBinding)
            this.bufferBindingsByBufferProxy.set(bufferProxy, bufferBinding)
          }

          editor = new TextEditor({buffer, autoHeight: false})
          editorBinding = new EditorBinding({
            editor,
            portal: this.portal,
            isHost: false,
            didDispose: () => this.editorBindingsByEditorProxy.delete(editorProxy)
          })
          editorBinding.setEditorProxy(editorProxy)
          editorProxy.setDelegate(editorBinding)
          this.editorBindingsByEditorProxy.set(editorProxy, editorBinding)
        }

        this.activeEditorBinding = editorBinding
        await this.replaceActivePaneItem(editor)
      }
    })

    return this.lastSetActiveEditorProxyPromise
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
    if (this.portal) this.portal.dispose()
  }

  async replaceActivePaneItem (newActivePaneItem) {
    this.newActivePaneItem = newActivePaneItem

    if (this.activePaneItem) {
      const pane = this.workspace.paneForItem(this.activePaneItem)
      const index = pane.getItems().indexOf(this.activePaneItem)
      pane.addItem(newActivePaneItem, {index, moved: this.addedPaneItems.has(newActivePaneItem)})
      pane.removeItem(this.activePaneItem)
    } else {
      await this.workspace.open(newActivePaneItem)
    }
    this.addedPaneItems.add(newActivePaneItem)

    this.activePaneItem = this.newActivePaneItem
    if (this.activePaneItemDestroySubscription) this.activePaneItemDestroySubscription.dispose()
    this.activePaneItemDestroySubscription = this.activePaneItem.onDidDestroy(this.leave.bind(this))
    this.newActivePaneItem = null
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
