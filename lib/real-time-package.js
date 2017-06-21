const Client = require('@atom-team/real-time-client')
const BufferBinding = require('./buffer-binding')
const EditorBinding = require('./editor-binding')
const GuestPortalBinding = require('./guest-portal-binding')
const JoinPortalDialog = require('./join-portal-dialog')

module.exports =
class RealTimePackage {
  constructor ({workspace, commandRegistry, clipboard, restGateway, pubSubGateway, pusherKey, baseURL, heartbeatIntervalInMilliseconds}) {
    this.workspace = workspace
    this.commandRegistry = commandRegistry
    this.clipboard = clipboard
    this.restGateway = restGateway
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.heartbeatIntervalInMilliseconds = heartbeatIntervalInMilliseconds
    this.guestPortalBindings = []
    this.sharedEditorsByEditor = new WeakMap()
  }

  activate () {
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

    this.clipboard.write(portal.id)
    this.workspace.notificationManager.addSuccess('Your portal is open for business', {
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
    const portalBinding = new GuestPortalBinding({workspace: this.workspace})
    this.guestPortalBindings.push(portalBinding)
    portal.setDelegate(portalBinding)
  }

  toggleFollowHostCursor (editor) {
    const binding = this.bindingForEditor(editor)
    binding.setFollowHostCursor(!binding.isFollowingHostCursor())
  }

  getClient () {
    if (!this.client) {
      this.client = new Client({
        pusherKey: this.pusherKey,
        baseURL: this.baseURL,
        restGateway: this.restGateway,
        pubSubGateway: this.pubSubGateway,
        heartbeatIntervalInMilliseconds: this.heartbeatIntervalInMilliseconds
      })
    }

    return this.client
  }

  bindingForEditor (editor) {
    const portalBinding = this.guestPortalBindings.find((binding) => binding.activeEditor === editor)
    return portalBinding.activeEditorBinding
  }
}
