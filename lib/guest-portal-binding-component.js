const etch = require('etch')
const $ = etch.dom
const ParticipantsComponent = require('./participants-component')

module.exports =
class GuestPortalBindingComponent {
  constructor (props) {
    this.props = props
    this.subscribeToPortalBindingChanges(this.props.portalBinding)
    etch.initialize(this)
  }

  destroy () {
    if (this.subscriptions) this.subscriptions.dispose()
    return etch.destroy(this)
  }

  update (props) {
    if (props.portalBinding !== this.props.portalBinding) {
      this.subscribeToPortalBindingChanges(props.portalBinding)
    }

    this.props = props
    return etch.update(this)
  }

  subscribeToPortalBindingChanges (portalBinding) {
    if (this.subscriptions) this.subscriptions.dispose()
    if (portalBinding) {
      this.subscriptions = portalBinding.onDidChange(() => etch.update(this))
    }
  }

  render () {
    return $.div({className: 'GuestPortalComponent'},
      $(ParticipantsComponent, {portalBinding: this.props.portalBinding}),
      $.button({className: 'btn btn-xs GuestPortalComponent-leave', onClick: this.leavePortal}, 'Leave')
    )
  }

  leavePortal () {
    this.props.portalBinding.leave()
  }
}
