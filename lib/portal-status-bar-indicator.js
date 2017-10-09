const PortalListComponent = require('./portal-list-component')

module.exports =
class PortalStatusBarIndicator {
  constructor ({portalBindingManager, tooltipManager}) {
    this.element = document.createElement('a')
    this.element.classList.add('realtime-PortalStatusBarIndicator', 'icon', 'inline-block')
    this.tooltip = tooltipManager.add(
      this.element,
      {item: new PortalListComponent(portalBindingManager)}
    )
  }

  dispose () {
    this.element.onclick = null
    this.tooltip.dispose()
  }
}
