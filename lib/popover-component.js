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
      isClientOutdated, hasInitializationError,
      authenticationProvider, portalBindingManager,
      commandRegistry, clipboard, workspace, notificationManager, packageManager, getAtomVersion
    } = this.props

    let activeComponent
    if (isClientOutdated()) {
      if (!PackageOutdatedComponent) PackageOutdatedComponent = require('./package-outdated-component')
      activeComponent = $(PackageOutdatedComponent, {
        ref: 'packageOutdatedComponent',
        workspace
      })
    } else if (hasInitializationError()) {
      if (!PackageInitializationErrorComponent) PackageInitializationErrorComponent = require('./package-initialization-error-component')
      activeComponent = $(PackageInitializationErrorComponent, {
        ref: 'packageInitializationErrorComponent',
        packageManager,
        getAtomVersion,
        initializationError
      })
    } else if (authenticationProvider.isSignedIn()) {
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
