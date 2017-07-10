const {CompositeDisposable} = require('atom')
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
      workspace, notificationManager, commandRegistry, clipboard, restGateway,
      pubSubGateway, pusherKey, baseURL, heartbeatIntervalInMilliseconds,
      didCreateOrJoinPortal
    } = options

    this.workspace = workspace
    this.notificationManager = notificationManager
    this.commandRegistry = commandRegistry
    this.clipboard = clipboard
    this.restGateway = restGateway
    this.pubSubGateway = pubSubGateway
    this.pusherKey = pusherKey
    this.baseURL = baseURL
    this.heartbeatIntervalInMilliseconds = heartbeatIntervalInMilliseconds
    this.didCreateOrJoinPortal = didCreateOrJoinPortal
    this.hostPortal = null
    this.hostPortalDisposables = null
    this.guestPortalBindings = []
    this.sharedEditorsByEditor = null
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
    this.hostPortal = await this.getClient().createPortal()
    this.hostPortalDisposables = new CompositeDisposable()
    this.sharedEditorsByEditor = new WeakMap()

    const activeTextEditorDisposable = this.workspace.observeActiveTextEditor(async (editor) => {
      if (editor == null) {
        await this.hostPortal.setActiveSharedEditor(null)
        return
      }

      let sharedEditor = this.sharedEditorsByEditor.get(editor)
      if (sharedEditor == null) {
        const buffer = editor.getBuffer()
        const bufferBinding = new BufferBinding(buffer)
        const sharedBuffer = await this.hostPortal.createSharedBuffer({
          uri: buffer.getPath(),
          text: buffer.getText()
        })
        bufferBinding.setSharedBuffer(sharedBuffer)
        sharedBuffer.setDelegate(bufferBinding)

        const editorBinding = new EditorBinding(editor)
        sharedEditor = await this.hostPortal.createSharedEditor({
          sharedBuffer,
          selectionRanges: editor.selectionsMarkerLayer.bufferMarkerLayer.index.dump()
        })
        editorBinding.setSharedEditor(sharedEditor)
        sharedEditor.setDelegate(editorBinding)
        this.sharedEditorsByEditor.set(editor, sharedEditor)

        this.hostPortalDisposables.add(bufferBinding, editorBinding)
      }

      await this.hostPortal.setActiveSharedEditor(sharedEditor)
    })

    const closePortalCommandDisposable = this.commandRegistry.add('atom-workspace', {
      'real-time:close-portal': this.closePortal.bind(this)
    })

    this.hostPortalDisposables.add(activeTextEditorDisposable)
    this.hostPortalDisposables.add(closePortalCommandDisposable)

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
    const portal = await this.getClient().joinPortal(portalId)
    const portalBinding = new GuestPortalBinding({
      workspace: this.workspace,
      notificationManager: this.notificationManager
    })
    this.guestPortalBindings.push(portalBinding)
    portal.setDelegate(portalBinding)
  }

  closePortal () {
    this.hostPortalDisposables.dispose()
    this.hostPortal.close()

    this.notificationManager.addInfo('Portal closed', {
      description: 'You are no longer sharing your editor.',
    })
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
