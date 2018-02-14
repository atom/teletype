const {CompositeDisposable} = require('atom')
let PopoverComponent = null

module.exports =
class PortalStatusBarIndicator {
  constructor (props) {
    this.props = props
    this.subscriptions = new CompositeDisposable()
    this.element = buildElement(props)
    this.element.onclick = this.handleInitialClick.bind(this)
  }

  attach () {
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    this.tile = this.props.statusBar.addRightTile({
      item: this,
      priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR
    })
  }

  destroy () {
    if (this.tile) this.tile.destroy()
    if (this.tooltip) this.tooltip.dispose()
    this.subscriptions.dispose()
  }

  showPopover () {
    if (!this.isPopoverVisible()) this.element.click()
  }

  hidePopover () {
    if (this.isPopoverVisible()) this.element.click()
  }

  isPopoverVisible () {
    if (!this.popoverComponent) return false
    return document.contains(this.popoverComponent.element)
  }

  async updatePortalStatus () {
    const transmitting = await this.portalBindingManager.hasActivePortals()
    if (transmitting) {
      this.element.classList.add('transmitting')
    } else {
      this.element.classList.remove('transmitting')
    }
  }

  async handleInitialClick () {
    this.initialOpenPromise = new Promise((resolve, reject) => this.resolveInitialOpenPromise = resolve)
    this.element.onclick = null
    this.portalBindingManager = await this.props.getPortalBindingManager()
    if (this.portalBindingManager) {
      this.subscriptions.add(this.portalBindingManager.onDidChange(() => {
        this.updatePortalStatus()
      }))
    }

    this.authenticationProvider = await this.props.getAuthenticationProvider()
    if (this.authenticationProvider) await this.authenticationProvider.signInUsingSavedToken()

    if (!PopoverComponent) PopoverComponent = require('./popover-component')
    this.popoverComponent = new PopoverComponent(Object.assign(
      {portalBindingManager: this.portalBindingManager},
      {authenticationProvider: this.authenticationProvider},
      this.props
    ))
    this.tooltip = this.props.tooltipManager.add(
      this.element,
      {
        item: this.popoverComponent,
        class: 'TeletypePopoverTooltip',
        trigger: 'click',
        placement: 'top'
      }
    )

    if (this.props.isClientOutdated()) this.element.classList.add('outdated')
    if (this.props.hasInitializationError()) this.element.classList.add('initialization-error')

    this.element.click()
    this.resolveInitialOpenPromise(this.popoverComponent)
  }
}

function buildElement () {
  const anchor = document.createElement('a')
  anchor.classList.add('PortalStatusBarIndicator', 'inline-block')

  const icon = document.createElement('span')
  icon.classList.add('icon', 'icon-radio-tower')
  anchor.appendChild(icon)

  return anchor
}
