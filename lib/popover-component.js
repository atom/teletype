const etch = require('etch')
const $ = etch.dom
const PortalListComponent = require('./portal-list-component')
const SignInComponent = require('./sign-in-component')

module.exports =
class PopoverComponent {
  constructor (props) {
    this.props = props
    this.props.authenticationProvider.onDidChange(() => { this.update() })
    etch.initialize(this)
  }

  update () {
    return etch.update(this)
  }

  render () {
    const {
      authenticationProvider, portalBindingManager,
      commandRegistry, credentialCache
    } = this.props

    let activeComponent
    if (this.props.authenticationProvider.isSignedIn()) {
      activeComponent = $(PortalListComponent, {
        ref: 'portalListComponent',
        localUserIdentity: authenticationProvider.getIdentity(),
        portalBindingManager
      })
    } else {
      activeComponent = $(SignInComponent, {
        ref: 'signInComponent',
        authenticationProvider,
        commandRegistry
      })
    }

    return $.div(null, activeComponent)
  }
}
