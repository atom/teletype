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
        $.div({className: 'HostPortalComponent-participants'},
          // TODO: extract participants component
          this.renderParticipants(),
          $.button({className: 'btn HostPortalComponent-guests-add'})
        ),
        $.div({className: 'HostPortalComponent-share-toggle'},
          $.label({className: 'HostPortalComponent-share-toggle-label'},
            'Share ',
            $.input({
              className: 'input-toggle',
              type: 'checkbox',
              onClick: this.toggleShare,
              checked: isSharing
            })
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
          {className: `HostPortalComponent-participant HostPortalComponent-site-${siteId}`},
          $.img({src: `https://github.com/${login}.png`})
        )
      })
    } else {
      const {login} = this.props.localUserIdentity
      return $.div(
        {className: 'HostPortalComponent-participant HostPortalComponent-site-1'},
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
