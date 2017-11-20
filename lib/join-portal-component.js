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
    const {joining, promptVisible, isValidPortalId} = this.props
    if (joining) {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.span({ref: 'joiningSpinner', className: 'loading loading-spinner-tiny inline-block'})
      )
    } else if (promptVisible) {
      return $.div({className: 'JoinPortalComponent--prompt', tabIndex: -1},
        $(TextEditor, {ref: 'portalIdEditor', mini: true, placeholderText: 'Enter a host portal ID...'}),
        $.button({ref: 'joinButton', type: 'button', disabled: !isValidPortalId, className: 'btn btn-xs', onClick: this.joinPortal}, 'Join')
      )
    } else {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.label({ref: 'joinPortalLabel', onClick: this.showPrompt}, 'Join a portal')
      )
    }
  }

  async validatePortalId() {
    //here we validate the portal id is correct. 
    const portalId = this.refs.portalIdEditor.getText().trim()
    await this.update({ isValidPortalId: isUUID(portalId) })
  }

  async showPrompt () {
    await this.update({promptVisible: true})
    //setup the handler for when the portal id value changes
    this.disposables.add(this.refs.portalIdEditor.onDidChange(this.validatePortalId.bind(this)))

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
    
    //validate that the portal id has been specified. 
    if(!portalId){
        portalBindingManager.notificationManager.addError('Missing portal ID', {
            description: `A portal id must be specified.`,
            dismissable: true
        })
        return
    }

    //validate that the portal id is a valid UUID as well
    if(!isUUID(portalId)){
        portalBindingManager.notificationManager.addError('Invalid portal ID', {
            description: `The specified portal ID is invalid.`,
            dismissable: true
        })
        return
    }

    await this.update({joining: true})
    if (await portalBindingManager.createGuestPortalBinding(portalId)) {
      await this.update({joining: false, promptVisible: false, isValidPortalId: false})
    } else {
      await this.update({joining: false, isValidPortalId: false})
      //after a login attempt, the event is cleared. So set the handler again
      //when the join failed.
      this.disposables.add(this.refs.portalIdEditor.onDidChange(this.validatePortalId.bind(this)))
    }
  }
}

const UUID_REGEXP = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/
function isUUID (string) {
  return UUID_REGEXP.test(string)
}
