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
    this.handleJoinButtonClick = this.handleJoinButtonClick.bind(this)
    this.handleBlur = this.handleBlur.bind(this)
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
    // We explicitly add the modal as hidden because of a bug in the auto-focus
    // feature that prevents it from working correctly when using visible: true.
    this.panel = this.workspace.addModalPanel({item: this, visible: false, autoFocus: true})
    this.panel.show()
    this.element.focus()
    this.element.addEventListener('blur', this.handleBlur)
    return new Promise((resolve) => {
      this.panel.onDidDestroy(() => {
        this.panel = null
        this.element.removeEventListener('blur', this.handleBlur)
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
          $.input({
            ref: 'askBeforeJoiningCheckbox',
            className: 'input-checkbox',
            type: 'checkbox',
            checked: true
          }),
          $.span(null, 'Ask before joining a portal')
        ),
        $.button(
          {className: 'btn btn-primary', onClick: this.handleJoinButtonClick},
          'Join portal'
        )
      )
    )
  }

  update (props) {
    this.props = props
    return etch.update(this)
  }

  handleJoinButtonClick () {
    if (this.refs.askBeforeJoiningCheckbox.checked) {
      this.confirmOnce()
    } else {
      this.confirmAlways()
    }
  }

  handleBlur (event) {
    if (document.hasFocus() && !this.element.contains(event.relatedTarget)) {
      this.cancel()
    }
  }
}

module.exports.EXIT_STATUS = {
  CONFIRM_ALWAYS: 0,
  CONFIRM_ONCE: 1,
  CANCEL: 2
}
