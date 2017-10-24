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
    return (
      $.div({className: 'block HostPortalComponent'},
        this.renderConnectionInfo(),
        $.div({className: 'HostPortalComponent-status'},
          $(ParticipantsComponent, {
            portalBinding: this.props.portalBinding,
            localUserIdentity: this.props.localUserIdentity
          }),
          $.div({className: 'HostPortalComponent-share-toggle'},
            $.label(null,
              'Share ',
              $.input({
                ref: 'toggleShareCheckbox',
                className: 'input-toggle',
                type: 'checkbox',
                onClick: this.toggleShare,
                checked: this.isSharing()
              })
            )
          )
        )
      )
    )
  }

  renderConnectionInfo () {
    if (this.isSharing()) {
      const copyButtonText = this.props.showCopiedConfirmation ? 'Copied' : 'Copy'
      return $.div({className: 'HostPortalComponent-connection-info'},
        $.div({className: 'HostPortalComponent-connection-info-heading'},
          $.h1(null, 'Invite collaborators to join your portal with this ID')
        ),
        $.div({className: 'HostPortalComponent-connection-info-portal-id'},
          $.input({className: 'input-text host-id-input', type: 'text', disabled: true, value: this.getPortalId()}),
          $.span({className: 'btn btn-xs', onClick: this.copyPortalIdToClipboard}, copyButtonText)
        )
      )
    } else {
      return null
    }
  }

  async toggleShare () {
    if (this.props.portalBinding) {
      this.props.portalBinding.close()
    } else {
      await this.props.portalBindingManager.createHostPortalBinding()
    }
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

  isSharing () {
    return this.props.portalBinding != null
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
