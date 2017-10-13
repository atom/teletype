const etch = require('etch')
const $ = etch.dom
const ParticipantsComponent = require('./participants-component')

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
          $(ParticipantsComponent, {
            portalBinding: this.props.portalBinding,
            localUserIdentity: this.props.localUserIdentity,
            isInvitationButtonVisible: isSharing,
            isInvitationButtonToggled: this.props.isConnectionInfoVisible,
            onInvitationButtonClick: this.toggleConnectionInfo.bind(this)
          }),
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
        this.renderConnectionInfo()
      )
    )
  }

  renderConnectionInfo () {
    const {isConnectionInfoVisible, showCopiedConfirmation} = this.props
    if (isConnectionInfoVisible) {
      const copyButtonText = showCopiedConfirmation ? 'Copied' : 'Copy'
      return $.div({className: 'HostPortalComponent-connection-info'},
        $.div({className: 'HostPortalComponent-connection-info-heading'},
          $.h1(null, 'Share your portal ID')
        ),
        $.div({className: 'HostPortalComponent-connection-info-portal-id'},
          $.input({className: 'input-text', type: 'text', disabled: true, value: this.getPortalId()}),
          $.label({className: 'btn', onClick: this.copyPortalIdToClipboard}, copyButtonText)
        ),
        $.div({className: 'HostPortalComponent-connection-info-explanation text-smaller text-subtle'},
          $.p(null, 'Invite people to collaborate with you using your portal ID above.')
        )
      )
    } else {
      return null
    }
  }

  async toggleShare () {
    if (this.props.portalBinding) {
      this.props.isConnectionInfoVisible = false
      this.props.portalBinding.close()
    } else {
      this.props.isConnectionInfoVisible = true
      await this.props.portalBindingManager.createHostPortalBinding()
    }
  }

  toggleConnectionInfo () {
    this.props.isConnectionInfoVisible = !this.props.isConnectionInfoVisible
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
