const etch = require('etch')
const $ = etch.dom

module.exports =
class JoinViaExternalAppDialog {
  constructor ({config, commandRegistry, workspace}) {
    this.commandRegistry = commandRegistry
    this.workspace = workspace
    this.confirmOnce = this.confirmOnce.bind(this)
    this.confirmAlways = this.confirmAlways.bind(this)
    this.cancel = this.cancel.bind(this)
    this.props = {}
    etch.initialize(this)
    this.disposables = this.commandRegistry.add(this.element, 'core:cancel', this.cancel)
  }

  destroy () {
    if (this.panel) this.panel.destroy()

    this.disposables.dispose()
    etch.destroy(this)
  }

  async show (uri) {
    await this.update({uri})
    this.panel = this.workspace.addModalPanel({item: this, visible: true, autoFocus: true})
    this.element.focus()

    // TODO Currently, this causes all buttons to trigger `this.cancel`. We need
    // to figure out how to ensure that this only triggers when the user clicks
    // outside of the modal without choosing one of the buttons.
    // this.element.addEventListener('blur', this.cancel)

    return new Promise((resolve) => {
      this.panel.onDidDestroy(() => {
        this.panel = null
        this.element.removeEventListener('blur', this.cancel)
        resolve(this.exitStatus)
      })
    })
  }

  confirmOnce () {
    this.exitStatus = this.constructor.EXIT_STATUS.CONFIRM_ONCE
    this.panel.destroy()
  }

  confirmAlways () {
    this.exitStatus = this.constructor.EXIT_STATUS.CONFIRM_ALWAYS
    this.panel.destroy()
  }

  cancel () {
    this.exitStatus = this.constructor.EXIT_STATUS.CANCEL
    this.panel.destroy()
  }

  render () {
    if (this.props.uri == null) return $.div()

    return $.div({className: 'JoinViaExternalAppDialog', tabIndex: -1},
      $.div(null,
        $.h1(null, 'Join this portal?'),
        $.a({className: 'JoinViaExternalAppDialog-cancel icon icon-x', onClick: this.cancel})
      ),
      $.p({className: 'JoinViaExternalAppDialog-uri'}, this.props.uri),
      $.p(null, 'By joining this portal, other collaborators will be able to see your GitHub username, avatar and anything you type.'),
      $.footer({className: 'JoinViaExternalAppDialog-footer'},
        $.label({className: 'input-label'},
          $.input({className: 'input-checkbox', type: 'checkbox', checked: true}),
          $.span(null, 'Ask before joining a portal')
        ),
        $.button(
          {
            className: 'btn btn-primary',
            onClick: this.confirmOnce
          },
          'Join portal'
        )
      )
    )
  }

  update (props) {
    this.props = props
    return etch.update(this)
  }
}

module.exports.EXIT_STATUS = {
  CONFIRM_ALWAYS: 0,
  CONFIRM_ONCE: 1,
  CANCEL: 2
}
