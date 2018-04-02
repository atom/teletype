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
      $.div({className: 'HostPortalComponent'},
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
                checked: this.isSharing() || this.props.creatingPortal
              })
            )
          )
        )
      )
    )
  }

  renderConnectionInfo () {
    const {creatingPortal, showCopiedConfirmation} = this.props
    const statusClassName = creatingPortal ? 'creating-portal' : ''
    if (creatingPortal || this.isSharing()) {
      const copyButtonText = showCopiedConfirmation ? 'Copied' : 'Copy'
      return $.div({className: 'HostPortalComponent-connection-info'},
        creatingPortal ? this.renderCreatingPortalSpinner() : null,
        $.div({className: 'HostPortalComponent-connection-info-heading ' + statusClassName},
          $.h1(null, 'Invite collaborators to join your portal with this URL')
        ),
        $.div({className: 'HostPortalComponent-connection-info-portal-url ' + statusClassName},
          $.input({className: 'input-text host-id-input', type: 'text', disabled: true, value: this.getPortalURI()}),
          $.button({className: 'btn btn-xs', onClick: this.copyPortalURLToClipboard}, copyButtonText)
        )
      )
    } else {
      return null
    }
  }

  renderCreatingPortalSpinner () {
    return $.span({ref: 'creatingPortalSpinner', className: 'HostPortalComponent-connection-info-spinner loading loading-spinner-tiny'})
  }

  async toggleShare () {
    if (this.props.portalBinding) {
      this.props.portalBinding.close()
    } else {
      await this.update({creatingPortal: true})
      await this.props.portalBindingManager.createHostPortalBinding()
      await this.update({creatingPortal: false})
    }
  }

  copyPortalURLToClipboard () {
    const {clipboard} = this.props
    clipboard.write(this.getPortalURI())

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

  getPortalURI () {
    if (this.props.portalBinding) {
      return this.props.portalBinding.uri
    }
  }
}
