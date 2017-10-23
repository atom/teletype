const etch = require('etch')
const $ = etch.dom
const getAvatarURL = require('./get-avatar-url')

module.exports =
class SitePositionsComponent {
  constructor (props) {
    this.props = Object.assign({siteIds: []}, props)
    etch.initialize(this)
  }

  destroy () {
    return etch.destroy(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  render () {
    return $.div({className: 'SitePositionsComponent', style: this.getContainerStyle()},
      this.props.siteIds.map((siteId) => this.renderSite(siteId))
    )
  }

  renderSite (siteId) {
    const {portal} = this.props
    const {login} = portal.getSiteIdentity(siteId)

    return $.img({
      src: getAvatarURL(login, 80),
      onClick: () => this.props.onSelectSiteId(siteId)
    })
  }

  getContainerStyle () {
    const style = {position: 'absolute'}

    switch (this.props.position) {
      case 'left':
        style.left = 0
        style.top = '50%'
        style.transform = 'translateY(-50%)'
        break
      case 'right':
        style.right = 0
        style.top = '50%'
        style.transform = 'translateY(-50%)'
        break
      case 'top':
        style.top = 0
        style.left = '50%'
        style.transform = 'translateX(-50%)'
        break
      case 'bottom':
        style.bottom = 0
        style.left = '50%'
        style.transform = 'translateX(-50%)'
        break
      default:
        throw new Error('Unknown position ' + this.props.position)
    }

    return style
  }
}
