const etch = require('etch')
const $ = etch.dom
let PortalListComponent = null
let SignInComponent = null
let PackageOutdatedComponent = null
let PackageInitializationErrorComponent = null

module.exports =
class PopoverComponent {
  constructor (props) {
    this.props = props
    if (this.props.authenticationProvider) {
      this.props.authenticationProvider.onDidChange(() => { this.update() })
    }
    etch.initialize(this)
  }

  update () {
    return etch.update(this)
  }

  render () {
    const {
      isClientOutdated, initializationError,
      authenticationProvider, portalBindingManager,
      commandRegistry, credentialCache, clipboard, workspace, notificationManager
    } = this.props

    let activeComponent
    if (isClientOutdated) {
      if (!PackageOutdatedComponent) PackageOutdatedComponent = require('./package-outdated-component')
      activeComponent = $(PackageOutdatedComponent, {
        ref: 'packageOutdatedComponent',
        workspace
      })
    } else if (initializationError) {
      if (!PackageInitializationErrorComponent) PackageInitializationErrorComponent = require('./package-initialization-error-component')
      activeComponent = $(PackageInitializationErrorComponent, {
        ref: 'packageInitializationErrorComponent'
      })
    } else if (this.props.authenticationProvider.isSignedIn()) {
      if (!PortalListComponent) PortalListComponent = require('./portal-list-component')
      activeComponent = $(PortalListComponent, {
        ref: 'portalListComponent',
        localUserIdentity: authenticationProvider.getIdentity(),
        portalBindingManager,
        clipboard,
        commandRegistry,
        notificationManager
      })
    } else {
      if (!SignInComponent) SignInComponent = require('./sign-in-component')
      activeComponent = $(SignInComponent, {
        ref: 'signInComponent',
        authenticationProvider,
        commandRegistry
      })
    }

    return $.div({className: 'TeletypePopoverComponent'}, activeComponent)
  }
}
