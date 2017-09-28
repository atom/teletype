const {TextEditor} = require('atom')
const etch = require('etch')
const $ = etch.dom

module.exports =
class LoginDialog {
  constructor (props) {
    this.props = props
    etch.initialize(this)
    this.refs.editor.element.addEventListener('blur', this.didBlur.bind(this))
  }

  focus () {
    this.refs.editor.element.focus()
  }

  didBlur ({relatedTarget}) {
    if (this.element !== relatedTarget && !this.element.contains(relatedTarget)) {
      this.props.didBlur()
    }
  }

  render () {
    const errorMessage = this.props.previousTokenWasInvalid
      ? $.p({className: 'error-messages'}, 'That token does not appear to be valid. Please try again.')
      : null

    return $.div({className: 'realtime-LoginDialog', tabIndex: -1, on: {blur: this.didBlur}},
      $.p(null, 'Step 1: Visit ', $.a({href: 'https://tachyon.atom.io/login', className: 'text-info'}, 'tachyon.atom.io/login'), ' to generate an authentication token'),
      $.p(null, 'Step 2: Enter the token below'),
      errorMessage,

      $(TextEditor, {ref: 'editor', mini: true, placeholderText: 'Enter your token...'}),
      $.div(null,
        $.button(
          {
            type: 'button',
            className: 'btn inline-block-tight',
            onClick: () => this.props.didBlur()
          },
          'Cancel'
        ),
        $.button(
          {
            type: 'button',
            onClick: () => {
              this.props.didConfirm(this.refs.editor.getText())
            }
            className: 'btn btn-primary inline-block-tight',
          },
          'Login'
        )
      )
    )
  }

  update (props) {
    Object.assign(this.props, props)
    etch.update(this)
  }
}
