const etch = require('etch')
const $ = etch.dom
const HostPortalBindingComponent = require('./host-portal-binding-component')

module.exports =
class PortalListComponent {
  constructor (props) {
    this.props = props
    this.props.initializing = true
    this.subscribeToPortalBindingManagerChanges(this.props.portalBindingManager)
    etch.initialize(this)

    this.fetchModel().then(() => {
      this.props.initializing = false
      etch.update(this)
    })
  }

  async fetchModel () {
    const {portalBindingManager} = this.props
    this.props.hostPortalBinding = await portalBindingManager.getHostPortalBinding()
    this.props.guestPortalBindings = await portalBindingManager.getGuestPortalBindings()
  }

  subscribeToPortalBindingManagerChanges (portalBindingManager) {
    if (this.subscriptions) this.subscriptions.dispose()
    this.subscriptions = portalBindingManager.onDidChange(async () => {
      await this.fetchModel()
      etch.update(this)
    })
  }

  async update (props) {
    if (props.portalBindingManager !== this.props.portalBindingManager) {
      this.subscribeToPortalBindingManagerChanges(props.portalBindingManager)
    }

    this.props = props
    await this.fetchModel()
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
      portalBindingManager: this.props.portalBindingManager,
      portalBinding: this.props.hostPortalBinding
    })
  }

  renderGuestPortalBindingComponents () {
    return this.props.guestPortalBindings.map((binding) =>
      $.p(null, `Guest of Portal ${binding.portal.id}`)
    )
  }
}
