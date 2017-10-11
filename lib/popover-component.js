const etch = require('etch')
const $ = etch.dom
const PortalListComponent = require('./portal-list-component')

module.exports =
class PopoverComponent {
  constructor (props) {
    this.props = props
    this.props.realTimeClient.onSignInChange(() => { this.update() })
    etch.initialize(this)
  }

  update () {
    return etch.update(this)
  }

  render () {
    const {realTimeClient, portalBindingManager} = this.props
    if (realTimeClient.isSignedIn()) {
      const localUserIdentity = realTimeClient.getLocalUserIdentity()
      return $(PortalListComponent, {localUserIdentity, portalBindingManager})
    } else {
      return $(SignInComponent, {realTimeClient})
    }
  }
}
