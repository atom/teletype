const etch = require('etch')
const $ = etch.dom
const getAvatarURL = require('./get-avatar-url')

module.exports =
class ParticipantsComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  render () {
    let participantComponents

    if (this.props.portalBinding) {
      const {portal} = this.props.portalBinding
      const activeSiteIds = portal.getActiveSiteIds().sort((a, b) => a - b)
      participantComponents = activeSiteIds.map((siteId) =>
        this.renderParticipant(siteId, portal.getSiteIdentity(siteId))
      )
    } else {
      const {localUserIdentity} = this.props
      participantComponents = [this.renderParticipant(1, localUserIdentity)]
    }

    return $.div({className: 'PortalParticipants'},
      participantComponents[0],
      $.div({className: 'PortalParticipants-guests'},
        participantComponents.slice(1)
      )
    )
  }

  renderParticipant (siteId, {login}) {
    const avatarSize = siteId === 1 ? 56 : 44
    return $.div(
      {className: `PortalParticipants-participant PortalParticipants-site-${siteId}`},
      $.img({src: getAvatarURL(login, avatarSize)})
    )
  }
}
