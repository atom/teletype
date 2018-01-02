const etch = require('etch')
const $ = etch.dom
const PortalListComponent = require('./portal-list-component')
const SignInComponent = require('./sign-in-component')
const PackageOutdatedComponent = require('./package-outdated-component')
const PackageInitializationErrorComponent = require('./package-initialization-error-component')

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
      commandRegistry, clipboard, workspace, notificationManager, packageManager
    } = this.props

    let activeComponent
    if (isClientOutdated) {
      activeComponent = $(PackageOutdatedComponent, {
        ref: 'packageOutdatedComponent',
        workspace
      })
    } else if (initializationError) {
      activeComponent = $(PackageInitializationErrorComponent, {
        ref: 'packageInitializationErrorComponent',
        packageManager
      })
    } else if (this.props.authenticationProvider.isSignedIn()) {
      activeComponent = $(PortalListComponent, {
        ref: 'portalListComponent',
        localUserIdentity: authenticationProvider.getIdentity(),
        portalBindingManager,
        clipboard,
        commandRegistry,
        notificationManager
      })
    } else {
      activeComponent = $(SignInComponent, {
        ref: 'signInComponent',
        authenticationProvider,
        commandRegistry
      })
    }

    return $.div({className: 'TeletypePopoverComponent'}, activeComponent)
  }
}
