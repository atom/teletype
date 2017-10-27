const PopoverComponent = require('./popover-component')

module.exports =
class PortalStatusBarIndicator {
  constructor (props) {
    this.element = buildElement()
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
    const transmitting = await this.portalBindingManager.hasActivePortals()
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

function buildElement () {
  const anchor = document.createElement('a')
  anchor.classList.add('PortalStatusBarIndicator', 'inline-block')

  const icon = document.createElement('span')
  icon.classList.add('icon', 'icon-radio-tower')
  anchor.appendChild(icon)

  return anchor
}
