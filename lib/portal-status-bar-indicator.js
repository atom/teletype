module.exports =
class PortalStatusBarIndicator {
  constructor ({clipboard, tooltipManager, portal}) {
    this.focused = false
    this.element = document.createElement('span')
    this.element.classList.add('realtime-PortalStatusBarIndicator')
    this.element.onclick = () => clipboard.write(portal.id)
    this.tooltip = tooltipManager.add(
      this.element,
      {title: 'Click to copy the portal ID to your clipboard'}
    )
  }

  dispose () {
    this.element.onclick = null
    this.tooltip.dispose()
  }

  setFocused (focused) {
    if (focused && !this.focused) {
      this.element.classList.add('focused')
    } else if (!focused && this.focused) {
      this.element.classList.remove('focused')
    }

    this.focused = focused
  }
}
