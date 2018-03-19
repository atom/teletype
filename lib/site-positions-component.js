const etch = require('etch')
const $ = etch.dom
const getAvatarURL = require('./get-avatar-url')

module.exports =
class SitePositionsComponent {
  constructor (props) {
    this.props = {
      positionsBySiteId: {}
    }
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

  show (containerElement) {
    containerElement.appendChild(this.element)
  }

  hide () {
    this.element.remove()
  }

  render () {
    const otherSiteIds = Object.keys(this.props.positionsBySiteId)
      .map((siteId) => parseInt(siteId))
      .filter((siteId) => siteId !== this.props.portal.siteId)

    return $.div({className: 'SitePositionsComponent'},
      otherSiteIds.map((siteId) => this.renderSite(siteId))
    )
  }

  renderSite (siteId) {
    const {portal} = this.props

    const {login} = portal.getSiteIdentity(siteId)
    const location = this.getLocationForSite(siteId)
    const onClick = (location === 'viewing-non-portal-item')
      ? () => {}
      : () => this.onSelectSiteId(siteId)

    return $.div({className: `SitePositionsComponent-site site-${siteId} ${location}`},
      (portal.getFollowedSiteId() === siteId) ? $.div({className: 'icon icon-link'}) : null,
      $.img({
        src: getAvatarURL(login, 80),
        onClick
      })
    )
  }

  onSelectSiteId (siteId) {
    if (siteId === this.props.portal.getFollowedSiteId()) {
      this.props.portal.unfollow()
    } else {
      this.props.portal.follow(siteId)
    }
  }

  // Private
  getLocationForSite (siteId) {
    const {portal, positionsBySiteId} = this.props
    const localPosition = positionsBySiteId[portal.siteId]
    const localEditorProxy = localPosition && localPosition.editorProxy
    const editorProxyForSite = positionsBySiteId[siteId].editorProxy

    if (editorProxyForSite == null) {
      return 'viewing-non-portal-item'
    } else if (editorProxyForSite === localEditorProxy) {
      return 'viewing-current-editor'
    } else {
      return 'viewing-other-editor'
    }
  }
}
