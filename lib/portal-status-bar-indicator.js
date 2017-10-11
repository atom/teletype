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
        class: 'RealTimePopoverComponent',
        trigger: 'click',
        placement: 'top'
      }
    )
  }

  showPopover () {
    if (!this.isPopoverVisible()) this.element.click()
  }

  isPopoverVisible () {
    return document.contains(this.popoverComponent.element)
  }

  dispose () {
    this.tooltip.dispose()
  }
}
