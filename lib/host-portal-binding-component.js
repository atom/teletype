const etch = require('etch')
const $ = etch.dom

module.exports =
class HostPortalBindingComponent {
  constructor (props) {
    this.props = props
    this.subscribeToPortalBindingChanges(this.props.portalBinding)
    etch.initialize(this)
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
    const isSharing = this.props.portalBinding != null
    return (
      $.div({className: 'block HostPortalComponent'},
        $.div({className: 'HostPortalComponent-status'},
          $.div({className: 'PortalParticipants'},
            // TODO: extract participants component
            this.renderParticipants(),
            $.button({className: 'btn PortalParticipants-guests-add'})
          ),
          $.div({className: 'HostPortalComponent-share-toggle'},
            $.label(null,
              'Share ',
              $.input({
                className: 'input-toggle',
                type: 'checkbox',
                onClick: this.toggleShare,
                checked: isSharing
              })
            )
          )
        ),
        $.div({className: 'HostPortalComponent-sharing-instructions'},
          $.div({className: 'HostPortalComponent-sharing-instructions-heading'},
            $.h1(null, 'Share your portal ID'),
            $.span()
          ),
          $.div({className: 'HostPortalComponent-sharing-instructions-portal-info'},
            $.input({className: 'input-text', type: 'text', readonly: 'readonly', value: '2c26c856-bfa5-4433-82f1-e27f94ae0d22'}),
            $.button({className: 'btn'}, 'Copy')
          ),
          $.div({className: 'HostPortalComponent-sharing-instructions-explanation text-smaller text-subtle'},
            $.p(null, 'Invite people to collaborate with you using your portal ID above.')
          )
        )
      )
    )
  }

  renderParticipants () {
    if (this.props.portalBinding) {
      const {portal} = this.props.portalBinding
      return portal.getActiveSiteIds().map((siteId) => {
        const {login} = portal.getSiteIdentity(siteId)
        return $.div(
          {className: `PortalParticipants-participant PortalParticipants-site-${siteId}`},
          $.img({src: `https://github.com/${login}.png`})
        )
      })
    } else {
      const {login} = this.props.localUserIdentity
      return $.div(
        {className: 'PortalParticipants-participant PortalParticipants-site-1'},
        $.img({src: `https://github.com/${login}.png`})
      )
    }
  }

  async toggleShare () {
    if (this.props.portalBinding) {
      this.props.portalBinding.close()
    } else {
      await this.props.portalBindingManager.createHostPortalBinding()
    }
  }
}
