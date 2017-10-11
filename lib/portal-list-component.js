const etch = require('etch')
const $ = etch.dom
const HostPortalBindingComponent = require('./host-portal-binding-component')

module.exports =
class PortalListComponent {
  constructor (portalBindingManager) {
    this.props = {initializing: true}
    this.portalBindingManager = portalBindingManager
    this.portalBindingManager.onDidChange(this.recomputePropertiesAndUpdate.bind(this))
    etch.initialize(this)

    this.recomputePropertiesAndUpdate()
  }

  async recomputePropertiesAndUpdate () {
    return this.update({
      initializing: false,
      hostPortalBinding: await this.portalBindingManager.getHostPortalBinding(),
      guestPortalBindings: await this.portalBindingManager.getGuestPortalBindings()
    })
  }

  update (props) {
    this.props = props
    return etch.update(this)
  }

  render () {
    if (this.props.initializing) {
      return $.div(null, 'initializing')
    } else {
      return $.div(null,
        this.renderHostPortalBindingComponent(),
        this.renderGuestPortalBindingComponents()
      )
    }
  }

  renderHostPortalBindingComponent () {
    return $(HostPortalBindingComponent, {
      portalBindingManager: this.portalBindingManager,
      portalBinding: this.props.hostPortalBinding
    })
  }

  renderGuestPortalBindingComponents () {
    return this.props.guestPortalBindings.map((binding) =>
      $.p(null, `Guest of Portal ${binding.portal.id}`)
    )
  }
}
