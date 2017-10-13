const etch = require('etch')
const $ = etch.dom
const {TextEditor} = require('atom')

module.exports =
class JoinPortalComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)
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
    const {joining, promptVisible} = this.props
    if (joining) {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.span({ref: 'joiningSpinner', className: 'loading loading-spinner-tiny inline-block'})
      )
    } else if (promptVisible) {
      return $.div({className: 'JoinPortalComponent--prompt'},
        $(TextEditor, {ref: 'portalIdEditor', mini: true, placeholderText: 'Enter a host portal ID...'}),
        $.button({type: 'button', className: 'btn', onClick: this.joinPortal}, 'Join')
      )
    } else {
      return $.div({className: 'JoinPortalComponent--no-prompt'},
        $.label({ref: 'joinPortalLabel', onClick: this.showPrompt}, 'Join a portal')
      )
    }
  }

  async showPrompt () {
    await this.update({promptVisible: true})
    this.refs.portalIdEditor.element.focus()
  }

  async joinPortal () {
    const {portalBindingManager} = this.props
    const portalId = this.refs.portalIdEditor.getText()

    await this.update({joining: true})
    if (await portalBindingManager.createGuestPortalBinding(portalId)) {
      await this.update({joining: false, promptVisible: false})
    } else {
      await this.update({joining: false})
    }
  }
}
