const etch = require('etch')
const $ = etch.dom

module.exports =
class PortalListComponent {
  constructor (portalBindingManager) {
    this.portalBindingManager = portalBindingManager
    etch.initialize(this)
  }

  update (props, children) {
    return etch.update(this)
  }

  render () {
    return $.div(null,
      $.h1(null, '👋 TODO')
    )
  }
}
