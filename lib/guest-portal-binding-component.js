const etch = require('etch')
const $ = etch.dom

module.exports =
class GuestPortalBindingComponent {
  constructor (props) {
    this.props = props
    this.subscribeToPortalBindingChanges(this.props.portalBinding)
    etch.initialize(this)
  }

  destroy () {
    if (this.subscriptions) this.subscriptions.dispose()
    return etch.destroy(this)
  }

  update (props) {
    if (props.portalBinding !== this.props.portalBinding) {
      this.subscribeToPortalBindingChanges(props.portalBinding)
    }

    this.props = props
    return etch.update(this)
  }

  subscribeToPortalBindingChanges (portalBinding) {
    if (this.subscriptions) this.subscriptions.dispose()
    if (portalBinding) {
      this.subscriptions = portalBinding.onDidChange(() => etch.update(this))
    }
  }

  render () {
    return $.div({className: 'block GuestPortalComponent'},
      // TODO: extract participants component
      $.div({className: 'GuestPortalComponent-participants'}, this.renderParticipants()),
      $.button({className: 'btn GuestPortalComponent-leave', onClick: this.leavePortal}, 'Leave')
    )
  }

  renderParticipants () {
    const {portal} = this.props.portalBinding
    const siteIds = portal.getActiveSiteIds().sort((a, b) => a - b)
    return siteIds.map((siteId) => {
      const {login} = portal.getSiteIdentity(siteId)
      return $.div(
        {className: `PortalParticipants-participant PortalParticipants-site-${siteId}`},
        $.img({src: avatarURLForUser(login, siteId)})
      )
    })
  }

  leavePortal () {
    this.props.portalBinding.leave()
  }
}

function avatarURLForUser (login, siteId) {
  const size = siteId === 1 ? 80 : 52
  return `https://avatars.githubusercontent.com/${login}?s=${size}`
}
