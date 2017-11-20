const etch = require('etch')
const $ = etch.dom
const {TextEditor} = require('atom')

module.exports =
class JoinPortalComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)
    this.disposables = this.props.commandRegistry.add(this.element, {
      'core:confirm': this.joinPortal.bind(this),
      'core:cancel': this.hidePrompt.bind(this)
    })
  }

  destroy () {
    this.disposables.dispose()
    return etch.destroy(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  readAfterUpdate () {
    const previousPortalIdEditor = this.portalIdEditor
    this.portalIdEditor = this.refs.portalIdEditor

    if (!previousPortalIdEditor && this.portalIdEditor) {
      this.portalIdEditor.onDidChange(() => {
        const portalId = this.refs.portalIdEditor.getText().trim()
        this.refs.joinButton.disabled = !isUUID(portalId)
      })
    }
  }

  writeAfterUpdate () {
    // This fixes a visual glitch due to the editor component using stale font
    // measurements when rendered for the first time.
    if (this.refs.portalIdEditor) {
      const {component} = this.refs.portalIdEditor
      component.didUpdateStyles()
      component.updateSync()
    }
  }

  render () {
    const {joining, promptVisible} = this.props
    if (joining) {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.span({ref: 'joiningSpinner', className: 'loading loading-spinner-tiny inline-block'})
      )
    } else if (promptVisible) {
      return $.div({className: 'JoinPortalComponent--prompt', tabIndex: -1},
        $(TextEditor, {ref: 'portalIdEditor', mini: true, placeholderText: 'Enter a host portal ID...'}),
        $.button({ref: 'joinButton', type: 'button', disabled: true, className: 'btn btn-xs', onClick: this.joinPortal}, 'Join')
      )
    } else {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.label({ref: 'joinPortalLabel', onClick: this.showPrompt}, 'Join a portal')
      )
    }
  }

  async showPrompt () {
    await this.update({promptVisible: true})

    let clipboardText = this.props.clipboard.read()
    if (clipboardText) clipboardText = clipboardText.trim()
    if (isUUID(clipboardText)) {
      this.refs.portalIdEditor.setText(clipboardText)
    }
    this.refs.portalIdEditor.element.focus()
  }

  async hidePrompt () {
    await this.update({promptVisible: false})
  }

  async joinPortal () {
    const {portalBindingManager} = this.props
    const portalId = this.refs.portalIdEditor.getText().trim()

    if (!isUUID(portalId)) {
      this.props.notificationManager.addError('Invalid portal ID format', {
        description: 'This doesn\'t look like a valid portal ID. Please ask your host to provide you with their current portal ID and try again.',
        dismissable: true
      })
      return
    }

    await this.update({joining: true})
    if (await portalBindingManager.createGuestPortalBinding(portalId)) {
      await this.update({joining: false, promptVisible: false})
    } else {
      await this.update({joining: false})
    }
  }
}

const UUID_REGEXP = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/
function isUUID (string) {
  return UUID_REGEXP.test(string)
}
