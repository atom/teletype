const {allowUnsafeNewFunction} = require('loophole')

// Bypass CSP errors caused by Protobuf in Tachyon.
// TODO: Remove this once Atom 1.20 reaches stable.
let Client
allowUnsafeNewFunction(() => { Client = require('@atom/real-time-client') })

const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const JoinPortalDialog = require('./join-portal-dialog')

module.exports =
class RealTimePackage {
  constructor (options) {
    const {
      workspace, notificationManager, commandRegistry, tooltipManager, clipboard,
      restGateway, pubSubGateway, pusherKey, baseURL, heartbeatIntervalInMilliseconds,
      didCreateOrJoinPortal
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
    this.heartbeatIntervalInMilliseconds = heartbeatIntervalInMilliseconds
    this.didCreateOrJoinPortal = didCreateOrJoinPortal
    this.guestPortalBindings = []
    this.sharedEditorsByEditor = new WeakMap()
    this.statusBarDisposablesByPortalId = new Map()
  }

  activate () {
    console.log('real-time: Using pusher key:', this.pusherKey)
    console.log('real-time: Using base URL:', this.baseURL)

    this.commandRegistry.add('atom-workspace', {
      'real-time:share-portal': this.sharePortal.bind(this)
    })
    this.commandRegistry.add('atom-workspace', {
      'real-time:join-portal': this.showJoinPortalDialog.bind(this)
    })
    this.commandRegistry.add('atom-text-editor.remote-editor:not(.mini)', {
      'real-time:toggle-follow-host-cursor': (event) => {
        const editor = event.target.closest('atom-text-editor').getModel()
        this.toggleFollowHostCursor(editor)
      }
    })
  }

  async sharePortal () {
    const portal = await this.getClient().createPortal()

    this.workspace.observeActiveTextEditor(async (editor) => {
      if (editor == null) {
        await portal.setActiveSharedEditor(null)
        return
      }

      let sharedEditor = this.sharedEditorsByEditor.get(editor)
      if (sharedEditor == null) {
        const buffer = editor.getBuffer()
        const bufferBinding = new BufferBinding(buffer)
        const sharedBuffer = await portal.createSharedBuffer({
          uri: buffer.getPath(),
          text: buffer.getText()
        })
        bufferBinding.setSharedBuffer(sharedBuffer)
        sharedBuffer.setDelegate(bufferBinding)

        const editorBinding = new EditorBinding(editor)
        sharedEditor = await portal.createSharedEditor({
          sharedBuffer,
          selectionRanges: editor.selectionsMarkerLayer.bufferMarkerLayer.index.dump()
        })
        editorBinding.setSharedEditor(sharedEditor)
        sharedEditor.setDelegate(editorBinding)
        this.sharedEditorsByEditor.set(editor, sharedEditor)
      }

      await portal.setActiveSharedEditor(sharedEditor)
    })

    this.addStatusBarIndicatorForPortal(portal)
    this.clipboard.write(portal.id)
    this.notificationManager.addSuccess('Your portal is open for business', {
      description: "Invite people to collaborate with you using your portal ID above. It's already on your clipboard. 👌",
      detail: portal.id,
      dismissable: true
    })

    return portal
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
    const portal = await this.getClient().joinPortal(portalId)
    this.addStatusBarIndicatorForPortal(portal)
    const portalBinding = new GuestPortalBinding({
      workspace: this.workspace,
      notificationManager: this.notificationManager,
      hostDidDisconnect: () => this.removeStatusBarIndicatorForPortal(portal)
    })
    this.guestPortalBindings.push(portalBinding)
    portal.setDelegate(portalBinding)
  }

  toggleFollowHostCursor (editor) {
    const binding = this.bindingForEditor(editor)
    binding.setFollowHostCursor(!binding.isFollowingHostCursor())
  }

  consumeStatusBar (statusBar) {
    this.statusBar = statusBar
  }

  addStatusBarIndicatorForPortal (portal) {
    if (this.statusBar) {
      const item = document.createElement('span')
      item.className = 'icon icon-radio-tower'
      item.style.color = 'green'
      item.style.cursor = 'pointer'
      item.onclick = () => this.clipboard.write(portal.id)
      const tooltip = this.tooltipManager.add(
        item,
        {title: 'Click to copy the portal ID to your clipboard'}
      )

      const statusBarIndicator = this.statusBar.addRightTile({item})
      this.statusBarDisposablesByPortalId.set(portal.id, {
        dispose () {
          statusBarIndicator.destroy()
          tooltip.dispose()
        }
      })
    }
  }

  removeStatusBarIndicatorForPortal (portal) {
    const disposable = this.statusBarDisposablesByPortalId.get(portal.id)
    if (disposable) {
      disposable.dispose()
      this.statusBarDisposablesByPortalId.delete(portal.id)
    }
  }

  getClient () {
    if (!this.client) {
      this.client = new Client({
        pusherKey: this.pusherKey,
        baseURL: this.baseURL,
        restGateway: this.restGateway,
        pubSubGateway: this.pubSubGateway,
        heartbeatIntervalInMilliseconds: this.heartbeatIntervalInMilliseconds,
        didCreateOrJoinPortal: this.didCreateOrJoinPortal
      })
    }

    return this.client
  }

  bindingForEditor (editor) {
    const portalBinding = this.guestPortalBindings.find((binding) => binding.activeEditor === editor)
    return portalBinding.activeEditorBinding
  }
}
