const {CompositeDisposable} = require('atom')
const PopoverComponent = require('./popover-component')

module.exports =
class PortalStatusBarIndicator {
  constructor (props) {
    this.props = props
    this.subscriptions = new CompositeDisposable()
    this.element = buildElement(props)
    this.popoverComponent = new PopoverComponent(props)
    this.tooltip = props.tooltipManager.add(
      this.element,
      {
        item: this.popoverComponent,
        class: 'TeletypePopoverTooltip',
        trigger: 'click',
        placement: 'top'
      }
    )

    if (props.portalBindingManager) {
      this.portalBindingManager = props.portalBindingManager
      this.subscriptions.add(this.portalBindingManager.onDidChange(() => {
        this.updatePortalStatus()
      }))
    }
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

function buildElement (props) {
  const anchor = document.createElement('a')
  anchor.classList.add('PortalStatusBarIndicator', 'inline-block')
  if (props.isClientOutdated) anchor.classList.add('outdated')

  const icon = document.createElement('span')
  icon.classList.add('icon', 'icon-radio-tower')
  anchor.appendChild(icon)

  return anchor
}
