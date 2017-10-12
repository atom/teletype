const etch = require('etch')
const $ = etch.dom

module.exports =
class HostPortalBindingComponent {
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

    Object.assign(this.props, props)
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
            this.renderParticipantInvitationButton()
          ),
          $.div({className: 'HostPortalComponent-share-toggle'},
            $.label(null,
              'Share ',
              $.input({
                ref: 'toggleShareCheckbox',
                className: 'input-toggle',
                type: 'checkbox',
                onClick: this.toggleShare,
                checked: isSharing
              })
            )
          )
        ),
        this.renderSharingInstructions()
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

  renderParticipantInvitationButton () {
    if (this.props.portalBinding) {
      return $.button({className: 'btn PortalParticipants-guests-add', onClick: this.toggleSharingInstructions})
    } else {
      return null
    }
  }

  renderSharingInstructions () {
    if (this.props.showSharingInstructions) {
      return $.div({className: 'HostPortalComponent-sharing-instructions'},
        $.div({className: 'HostPortalComponent-sharing-instructions-heading'},
          $.h1(null, 'Share your portal ID'),
          $.span({onClick: this.toggleSharingInstructions})
        ),
        $.div({className: 'HostPortalComponent-sharing-instructions-portal-info'},
          $.input({className: 'input-text', type: 'text', readonly: 'readonly', value: this.getPortalId()}),
          $.button({className: 'btn', onClick: this.copyPortalIdToClipboard}, 'Copy')
        ),
        $.div({className: 'HostPortalComponent-sharing-instructions-explanation text-smaller text-subtle'},
          // FIXME Replace the paragraph text with the text below and find a way to make it NOT overflow out of the popover.
          // "Invite people to collaborate with you using your portal ID above."
          $.p(null, 'Invite people to collaborate with you ☝️')
        )
      )
    } else {
      return null
    }
  }

  async toggleShare () {
    if (this.props.portalBinding) {
      this.props.showSharingInstructions = false
      this.props.portalBinding.close()
    } else {
      this.props.showSharingInstructions = true
      await this.props.portalBindingManager.createHostPortalBinding()
    }
  }

  toggleSharingInstructions () {
    this.props.showSharingInstructions = !this.props.showSharingInstructions
    etch.update(this)
  }

  copyPortalIdToClipboard () {
    this.props.clipboard.write(this.getPortalId())
    // TODO Provide some indication to the user communicating that we've copied the portal ID to their clipboard
  }

  getPortalId () {
    if (this.props.portalBinding) {
      return this.props.portalBinding.portal.id
    }
  }
}
