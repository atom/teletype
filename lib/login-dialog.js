const {CompositeDisposable, Disposable, TextEditor} = require('atom')
const etch = require('etch')
const $ = etch.dom

module.exports =
class LoginDialog {
  constructor (props) {
    this.props = props
    etch.initialize(this)
    this.refs.editor.element.addEventListener('blur', this.didBlur.bind(this))
    this.disposables = new CompositeDisposable()
    this.disposables.add(this.props.commandRegistry.add(this.element, {
      'core:confirm': this.confirm.bind(this),
      'core:cancel': this.cancel.bind(this)
    }))
  }

  dispose () {
    this.disposables.dispose()
  }

  focus () {
    this.refs.editor.element.focus()
  }

  didBlur ({relatedTarget}) {
    if (this.element !== relatedTarget && !this.element.contains(relatedTarget)) {
      this.cancel()
    }
  }

  render () {
    const errorMessage = this.props.invalidToken
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
            onClick: this.cancel
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

  getNextTokenPromise () {
    if (!this.nextTokenPromise) {
      this.nextTokenPromise = new Promise((resolve) => {
        this.resolveNextTokenPromise = resolve
      })
    }

    return this.nextTokenPromise
  }

  async confirm () {
    if (!this.nextTokenPromise) return

    this.resolveNextTokenPromise(this.refs.editor.getText())
    this.nextTokenPromise = null
    this.resolveNextTokenPromise = null
  }

  cancel () {
    if (!this.nextTokenPromise) return

    this.resolveNextTokenPromise(null)
    this.nextTokenPromise = null
    this.resolveNextTokenPromise = null
  }
}
