const etch = require('etch')
const $ = etch.dom
const HostPortalBindingComponent = require('./host-portal-binding-component')

module.exports =
class PortalListComponent {
  constructor (portalBindingManager) {
    this.props = {
      hostPortalBinding: null,
      guestPortalBindings: []
    }

    this.portalBindingManager = portalBindingManager
    this.portalBindingManager.onDidChange(async () => {
      await this.computeProperties()
      etch.update(this)
    })

    etch.initialize(this)
  }

  async computeProperties () {
    // TODO Add method to PortalBindingManager that fetches the current HostPortalBinding without creating one
    this.props.hostPortalBinding = this.portalBindingManager.hostPortalBinding
    this.props.guestPortalBindings = await this.portalBindingManager.getGuestPortalBindings()
  }

  update (props, children) {
    return etch.update(this)
  }

  render () {
    const hostPortalDescription = this.props.hostPortalBinding
      ? this.props.hostPortalBinding.portal.id
      : 'None'

    const hostPortalComponent = $.div(null,
      $.p(null, `Hosting Portal: ${hostPortalDescription}`)
    )

    const guestPortalComponents = this.props.guestPortalBindings.map((binding) =>
      $.p(null, `Guest of Portal ${binding.portal.id}`)
    )

    return $.div(null,
      $(HostPortalBindingComponent, {portalBindingManager: this.portalBindingManager, portalBinding: this.props.hostPortalBinding}),
      guestPortalComponents
    )
  }
}
