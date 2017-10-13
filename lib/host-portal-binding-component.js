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
    if (this.props.portalBinding) {
      const selectedClass = this.props.showSharingInstructions ? 'selected' : ''
      return $.div({className: 'btn-group'},
        $.label({
          className: `PortalParticipants-guests-add btn ${selectedClass}`,
          onClick: this.toggleSharingInstructions
        })
      )
    } else {
      return null
    }
  }

  renderSharingInstructions () {
    const {showSharingInstructions, showCopiedConfirmation} = this.props
    if (showSharingInstructions) {
      const copyButtonText = showCopiedConfirmation ? 'Copied' : 'Copy'
      return $.div({className: 'HostPortalComponent-sharing-instructions'},
        $.div({className: 'HostPortalComponent-sharing-instructions-heading'},
          $.h1(null, 'Share your portal ID')
        ),
        $.div({className: 'HostPortalComponent-sharing-instructions-portal-info'},
          $.input({className: 'input-text', type: 'text', disabled: true, value: this.getPortalId()}),
          $.label({className: 'btn', onClick: this.copyPortalIdToClipboard}, copyButtonText)
        ),
        $.div({className: 'HostPortalComponent-sharing-instructions-explanation text-smaller text-subtle'},
          $.p(null, 'Invite people to collaborate with you using your portal ID above.')
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
    const {clipboard} = this.props
    clipboard.write(this.getPortalId())

    if (this.copiedConfirmationResetTimeoutId) {
      clearTimeout(this.copiedConfirmationResetTimeoutId)
    }

    this.props.showCopiedConfirmation = true
    etch.update(this)
    this.copiedConfirmationResetTimeoutId = setTimeout(() => {
      this.props.showCopiedConfirmation = false
      etch.update(this)
      this.copiedConfirmationResetTimeoutId = null
    }, 2000)
  }

  getPortalId () {
    if (this.props.portalBinding) {
      return this.props.portalBinding.portal.id
    }
  }
}

function avatarURLForUser (login, siteId) {
  const size = siteId === 1 ? 80 : 52
  return `https://avatars.githubusercontent.com/${login}?s=${size}`
}
