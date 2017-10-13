const etch = require('etch')
const $ = etch.dom

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
    return $.div({className: 'PortalParticipants'},
      this.renderParticipants(),
      this.props.isInvitationButtonVisible ? this.renderParticipantInvitationButton() : null
    )
  }

  renderParticipants () {
    if (this.props.portalBinding) {
      const {portal} = this.props.portalBinding
      const activeSiteIds = portal.getActiveSiteIds().sort((a, b) => a - b)
      return activeSiteIds.map((siteId) => {
        const {login} = portal.getSiteIdentity(siteId)
        return $.div(
          {className: `PortalParticipants-participant PortalParticipants-site-${siteId}`},
          $.img({src: avatarURLForUser(login, siteId)})
        )
      })
    } else {
      const {login} = this.props.localUserIdentity
      return $.div(
        {className: 'PortalParticipants-participant PortalParticipants-site-1'},
        $.img({src: avatarURLForUser(login, 1)})
      )
    }
  }

  renderParticipantInvitationButton () {
    const selectedClass = this.props.isInvitationButtonToggled ? 'selected' : ''
    return $.div({className: 'btn-group'},
      $.label({
        className: `PortalParticipants-guests-add btn ${selectedClass}`,
        onClick: this.didClickInvitationButton
      })
    )
  }

  didClickInvitationButton () {
    if (this.props.onInvitationButtonClick) {
      this.props.onInvitationButtonClick()
    }
  }
}

function avatarURLForUser (login, siteId) {
  const size = siteId === 1 ? 80 : 52
  return `https://avatars.githubusercontent.com/${login}?s=${size}`
}
