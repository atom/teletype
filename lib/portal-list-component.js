const etch = require('etch')
const $ = etch.dom

module.exports =
class PortalListComponent {
  constructor (portalBindingManager) {
    this.props = {
      hostPortal: null,
      guestPortals: []
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
    const hostPortalBinding = this.portalBindingManager.hostPortalBinding
    this.props.hostPortal = hostPortalBinding.portal

    const guestPortalBindings = await this.portalBindingManager.getGuestPortalBindings()
    this.props.guestPortals = guestPortalBindings.map((binding) => binding.portal)
  }

  update (props, children) {
    return etch.update(this)
  }

  render () {
    const hostPortalDescription = this.props.hostPortal
      ? this.props.hostPortal.id
      : 'None'

    const hostPortalComponent = $.div(null,
      $.p(null, `Hosting Portal: ${hostPortalDescription}`)
    )

    const guestPortalComponents = this.props.guestPortals.map((portal) =>
      $.p(null, `Guest of Portal ${portal.id}`)
    )

    return $.div(null,
      hostPortalComponent,
      guestPortalComponents
    )
  }
}
