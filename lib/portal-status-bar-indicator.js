const PopoverComponent = require('./popover-component')

module.exports =
class PortalStatusBarIndicator {
  constructor (props) {
    this.element = document.createElement('a')
    this.element.classList.add('PortalStatusBarIndicator', 'icon', 'inline-block')
    this.popoverComponent = new PopoverComponent(props)
    this.tooltip = props.tooltipManager.add(
      this.element,
      {
        item: this.popoverComponent,
        class: 'RealTimePopoverTooltip',
        trigger: 'click',
        placement: 'top'
      }
    )
    this.portalBindingManager = props.portalBindingManager
    this.subscriptions = this.portalBindingManager.onDidChange(() => {
      this.updatePortalStatus()
    })
  }

  showPopover () {
    if (!this.isPopoverVisible()) this.element.click()
  }

  isPopoverVisible () {
    return document.contains(this.popoverComponent.element)
  }

  async updatePortalStatus () {
    const hostPortalBinding = await this.portalBindingManager.getHostPortalBinding()
    const guestPortalBindings = await this.portalBindingManager.getGuestPortalBindings()

    const transmitting = (hostPortalBinding != null) || (guestPortalBindings.length > 0)
    if (transmitting) {
      this.element.classList.add('transmitting')
    } else {
      this.element.classList.remove('transmitting')
    }
  }

  dispose () {
    this.tooltip.dispose()
    this.subscriptions.dispose()
  }
}
