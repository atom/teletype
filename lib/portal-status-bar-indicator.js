const PopoverComponent = require('./popover-component')

module.exports =
class PortalStatusBarIndicator {
  constructor ({realTimeClient, portalBindingManager, tooltipManager}) {
    this.element = document.createElement('a')
    this.element.classList.add('realtime-PortalStatusBarIndicator', 'icon', 'inline-block')
    this.tooltip = tooltipManager.add(
      this.element,
      {
        item: new PopoverComponent({realTimeClient, portalBindingManager}),
        class: 'RealTimePopoverComponent',
        trigger: 'click',
        placement: 'top'
      }
    )
  }

  dispose () {
    this.tooltip.dispose()
  }
}
