const etch = require('etch')
const $ = etch.dom
const getAvatarURL = require('./get-avatar-url')

module.exports =
class SitePositionIndicatorsComponent {
  constructor (props) {
    this.props = Object.assign({sites: []}, props)
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
    const siteComponents = this.props.sites.map(({login}) => (
      $.img({src: getAvatarURL(login, 52)})
    ))
    return $.div({className: 'ActivePositionsComponent', style: this.getContainerStyle()},
      siteComponents
    )
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
