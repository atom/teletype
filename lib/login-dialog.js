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
    const errorMessage = this.props.tokenIsInvalid
      ? $.p({className: 'error-messages'}, 'That token does not appear to be valid.')
      : null

    return $.div({className: 'realtime-LoginDialog', tabIndex: -1, on: {blur: this.didBlur}},
      $.h1(null, 'Log in with ', $.span({className: 'realtime-LoginDialog-GitHubLogo'})),
      $.p(null,
        'Visit ',
        $.a({href: 'https://tachyon.atom.io/login', className: 'text-info'}, 'tachyon.atom.io/login'),
        ' to generate an authentication token and paste it below:'
      ),
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
            ref: 'loginButton',
            type: 'button',
            className: 'btn btn-primary inline-block-tight',
            onClick: this.confirm
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

  confirm () {
    const token = this.refs.editor.getText()
    if (token.length === 40) {
      this.props.didConfirm(token)
    } else {
      this.update({tokenIsInvalid: true})
    }
  }
}
