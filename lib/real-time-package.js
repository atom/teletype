const path = require('path')
const {CompositeDisposable} = require('atom')
const {RealTimeClient, PortalNotFoundError} = require('@atom/real-time-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const JoinPortalDialog = require('./join-portal-dialog')
const PortalStatusBarIndicator = require('./portal-status-bar-indicator')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      restGateway, pubSubGateway, pusherKey, baseURL
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.tooltipManager = tooltipManager
    this.clipboard = clipboard
    this.restGateway = restGateway
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.hostPortal = null
    this.hostPortalDisposables = null
    this.guestPortalBindings = []
    this.clientEditorsByEditor = null
    this.statusBarTilesByPortalId = new Map()
  }

  async dispose () {
    if (this.hostPortal) await this.hostPortal.dispose()

    if (this.hostPortalDisposables) this.hostPortalDisposables.dispose()

    for (const binding of this.guestPortalBindings) {
      await binding.dispose()
    }
  }

  activate () {
    console.log('real-time: Using pusher key:', this.pusherKey)
    console.log('real-time: Using base URL:', this.baseURL)

    this.commandRegistry.add('atom-workspace:not(.realtime-Host):not(.realtime-Guest)', {
      'real-time:share-portal': this.sharePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace:not(.realtime-Host)', {
      'real-time:join-portal': this.showJoinPortalDialog.bind(this)
    })
    this.commandRegistry.add('atom-workspace.realtime-Host', {
      'real-time:close-portal': this.closePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace .realtime-RemotePaneItem', {
      'real-time:leave-portal': this.leavePortal.bind(this)
    })
    this.commandRegistry.add('atom-text-editor.realtime-RemotePaneItem', {
      'real-time:toggle-follow-host-cursor': this.toggleFollowHostCursor.bind(this)
    })
    this.commandRegistry.add('atom-workspace.realtime-Host, atom-text-editor.realtime-RemotePaneItem', {
      'real-time:copy-debug-info-to-clipboard': this.copyDebugInfoToClipboard.bind(this)
    })
  }

  async sharePortal () {
    const client = await this.getClient()
    this.hostPortal = await client.createPortal()
    this.hostPortalDisposables = new CompositeDisposable()
    this.clientEditorsByEditor = new WeakMap()

    const activeTextEditorDisposable = this.workspace.observeActiveTextEditor(async (editor) => {
      if (editor == null) {
        await this.hostPortal.setActiveTextEditor(null)
        return
      }

      let clientEditor = this.clientEditorsByEditor.get(editor)
      if (clientEditor == null) {
        const buffer = editor.getBuffer()
        const bufferBinding = new BufferBinding(buffer)
        const clientBuffer = await this.hostPortal.createTextBuffer({
          uri: this.getClientBufferURI(buffer),
          text: buffer.getText()
        })
        bufferBinding.setClientBuffer(clientBuffer)
        clientBuffer.setDelegate(bufferBinding)

        const editorBinding = new EditorBinding(editor)
        clientEditor = await this.hostPortal.createTextEditor({
          textBuffer: clientBuffer,
          selectionRanges: editor.selectionsMarkerLayer.bufferMarkerLayer.index.dump()
        })
        editorBinding.setClientEditor(clientEditor)
        clientEditor.setDelegate(editorBinding)
        this.clientEditorsByEditor.set(editor, clientEditor)

        this.hostPortalDisposables.add(bufferBinding, editorBinding)
      }

      await this.hostPortal.setActiveTextEditor(clientEditor)
    })

    this.hostPortalDisposables.add(activeTextEditorDisposable)

    this.workspace.getElement().classList.add('realtime-Host')
    this.addStatusBarIndicatorForPortal(this.hostPortal, {isHost: true})
    this.clipboard.write(this.hostPortal.id)
    this.notificationManager.addSuccess('Your portal is open for business', {
      description: "Invite people to collaborate with you using your portal ID above. It's already on your clipboard. 👌",
      detail: this.hostPortal.id,
      dismissable: true
    })

    return this.hostPortal
  }

  showJoinPortalDialog () {
    const dialog = new JoinPortalDialog({
      workspace: this.workspace,
      commandRegistry: this.commandRegistry,
      clipboard: this.clipboard,
      didConfirm: (portalId) => { this.joinPortal(portalId) }
    })
    dialog.show()
  }

  async joinPortal (portalId) {
    const client = await this.getClient()
    try {
      const portal = await client.joinPortal(portalId)
      this.workspace.getElement().classList.add('realtime-Guest')
      this.addStatusBarIndicatorForPortal(portal, {isHost: false})
      const portalBinding = new GuestPortalBinding({
        portal,
        workspace: this.workspace,
        notificationManager: this.notificationManager,
        hostDidDisconnect: () => { this.disposeGuestPortalForBinding(portalBinding) },
        didLeave: () => { this.disposeGuestPortalForBinding(portalBinding) }
      })
      this.guestPortalBindings.push(portalBinding)
      portal.setDelegate(portalBinding)

      return portal
    } catch (error) {
      // TODO Make error messages ✨💎✨
      let message, description
      if (error instanceof PortalNotFoundError) {
        message = 'Portal not found'
        description = 'No portal exists with that ID'
      } else {
        message = 'Failed to join portal'
        description = ''
      }
      this.notificationManager.addError(message, {
        description,
        dismissable: true
      })
    }
  }

  closePortal () {
    this.workspace.getElement().classList.remove('realtime-Host')
    this.removeStatusBarIndicatorForPortal(this.hostPortal)
    this.hostPortalDisposables.dispose()
    this.hostPortal.dispose()

    this.notificationManager.addInfo('Portal closed', {
      description: 'You are no longer sharing your editor.'
    })
  }

  leavePortal () {
    const portalBinding = this.getActiveGuestPortalBinding()
    portalBinding.portal.dispose()
    this.disposeGuestPortalForBinding(portalBinding)
  }

  disposeGuestPortalForBinding (portalBinding) {
    const index = this.guestPortalBindings.indexOf(portalBinding)
    const portal = portalBinding.portal
    portalBinding.dispose()
    this.guestPortalBindings.splice(index, 1)

    this.removeStatusBarIndicatorForPortal(portal)
    if (this.guestPortalBindings.length === 0) {
      this.workspace.getElement().classList.remove('realtime-Guest')
    }
  }

  toggleFollowHostCursor () {
    const portalBinding = this.guestPortalBindings.find(b => b.getActivePaneItem() === this.workspace.getActivePaneItem())
    portalBinding.toggleFollowHostCursorOnActiveClientEditor()
  }

  copyDebugInfoToClipboard () {
    const debugInfo = this.hostPortal
      ? this.hostPortal.getDebugInfo()
      : this.getActiveGuestPortalBinding().portal.getDebugInfo()

    this.clipboard.write(JSON.stringify(debugInfo))
    this.notificationManager.addInfo('Debug info copied to clipboard', {
      description: 'Please write it to a file and share it with the Atom team. Thanks!'
    })
  }

  consumeStatusBar (statusBar) {
    this.statusBar = statusBar
    this.workspace.observeActivePaneItem(this.didChangeActivePaneItem.bind(this))
  }

  didChangeActivePaneItem (paneItem) {
    for (let i = 0; i < this.guestPortalBindings.length; i++) {
      const portalBinding = this.guestPortalBindings[i]
      const isFocused = (paneItem === portalBinding.getActivePaneItem())
      const statusBarTile = this.statusBarTilesByPortalId.get(portalBinding.portal.id)
      if (statusBarTile) statusBarTile.getItem().setFocused(isFocused)
    }
  }

  addStatusBarIndicatorForPortal (portal, {isHost}) {
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    if (this.statusBar) {
      const indicator = new PortalStatusBarIndicator({
        clipboard: this.clipboard,
        tooltipManager: this.tooltipManager,
        portal
      })
      if (isHost) indicator.setFocused(true)
      const tile = this.statusBar.addRightTile({item: indicator, priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR})
      this.statusBarTilesByPortalId.set(portal.id, tile)
    }
  }

  removeStatusBarIndicatorForPortal (portal) {
    const tile = this.statusBarTilesByPortalId.get(portal.id)
    if (tile) {
      tile.getItem().dispose()
      tile.destroy()
      this.statusBarTilesByPortalId.delete(portal.id)
    }
  }

  async getClient () {
    if (!this.client) {
      this.client = new RealTimeClient({
        pusherKey: this.pusherKey,
        baseURL: this.baseURL,
        restGateway: this.restGateway,
        pubSubGateway: this.pubSubGateway
      })
      await this.client.initialize()
    }

    return this.client
  }

  getClientBufferURI (buffer) {
    if (!buffer.getPath()) return 'untitled'

    const [projectPath, relativePath] = this.workspace.project.relativizePath(buffer.getPath())
    if (projectPath) {
      const projectName = path.basename(projectPath)
      return path.join(projectName, relativePath)
    } else {
      return relativePath
    }
  }

  getActiveGuestPortalBinding () {
    return this.guestPortalBindings.find(b => b.getActivePaneItem() === this.workspace.getActivePaneItem())
  }
}
