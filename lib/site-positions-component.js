const etch = require('etch')
const $ = etch.dom
const getAvatarURL = require('./get-avatar-url')

module.exports =
class SitePositionsComponent {
  constructor (props) {
    this.props = {siteIds: [], displayedParticipantsCount: Infinity}
    Object.assign(this.props, props)
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
    const siteIds = this.props.siteIds.slice(0, this.props.displayedParticipantsCount)
    return $.div({className: 'SitePositionsComponent ' + this.props.position},
      siteIds.map((siteId) => this.renderSite(siteId))
    )
  }

  renderSite (siteId) {
    const {portal, followedSiteId} = this.props
    const {login} = portal.getSiteIdentity(siteId)

    return $.div({className: 'SitePositionsComponent-site'},
      (followedSiteId === siteId) ? $.div({className: 'icon icon-link'}) : null,
      $.img({
        src: getAvatarURL(login, 80),
        onClick: () => this.props.onSelectSiteId(siteId)
      })
    )
  }
}
