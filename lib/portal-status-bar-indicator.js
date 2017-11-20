const {CompositeDisposable} = require('atom')
const PopoverComponent = require('./popover-component')

module.exports =
class PortalStatusBarIndicator {
  constructor (props) {
    this.props = props
    this.subscriptions = new CompositeDisposable()
    this.element = buildElement(props)
    this.popoverComponent = new PopoverComponent(props)

    if (props.portalBindingManager) {
      this.portalBindingManager = props.portalBindingManager
      this.subscriptions.add(this.portalBindingManager.onDidChange(() => {
        this.updatePortalStatus()
      }))
    }
  }

  attach () {
    const PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR = -40
    this.tile = this.props.statusBar.addRightTile({
      item: this,
      priority: PRIORITY_BETWEEN_BRANCH_NAME_AND_GRAMMAR
    })
    this.tooltip = this.props.tooltipManager.add(
      this.element,
      {
        item: this.popoverComponent,
        class: 'TeletypePopoverTooltip',
        trigger: 'click',
        placement: 'top'
      }
    )
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
}

function buildElement (props) {
  const anchor = document.createElement('a')
  anchor.classList.add('PortalStatusBarIndicator', 'inline-block')
  if (props.isClientOutdated) anchor.classList.add('outdated')
  if (props.initializationError) anchor.classList.add('initialization-error')

  const icon = document.createElement('span')
  icon.classList.add('icon', 'icon-radio-tower')
  anchor.appendChild(icon)

  return anchor
}
