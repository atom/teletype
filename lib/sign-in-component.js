const {CompositeDisposable, TextEditor} = require('atom')
const etch = require('etch')
const $ = etch.dom

module.exports =
class SignInComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)

    // We call this here to initially wire up the
    // editor for change events.
    this.attachChangeEvent()
    this.disposables = new CompositeDisposable()
    this.disposables.add(this.props.authenticationProvider.onDidChange(() => {
      etch.update(this)
    }))
    this.disposables.add(this.props.commandRegistry.add(this.element, {
      'core:confirm': this.signIn.bind(this)
    }))
  }

  destroy () {
    this.disposables.dispose()
    return etch.destroy(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  readAfterUpdate () {
    // Since the sign in process changes the view,
    // we need to rewire the onDidChange event on the
    // token input field.
    this.attachChangeEvent()
  }

  render () {
    return $.div({className: 'SignInComponent', tabIndex: -1},
      $.span({className: 'SignInComponent-GitHubLogo'}),
      $.h3(null, 'Sign in with GitHub'),
      this.props.authenticationProvider.isSigningIn()
        ? this.renderSigningInIndicator()
        : this.renderTokenPrompt()
    )
  }

  renderSigningInIndicator () {
    return $.span({className: 'loading loading-spinner-tiny inline-block'})
  }

  renderTokenPrompt () {
    return $.div(null,
      $.p(null,
        'Visit ',
        $.a({href: 'https://teletype.atom.io/login', className: 'text-info'}, 'teletype.atom.io/login'),
        ' to generate an authentication token and paste it below:'
      ),
      this.renderErrorMessage(),

      $(TextEditor, {ref: 'editor', mini: true, placeholderText: 'Enter your token...'}),
      $.div(null,
        $.button(
          {
            ref: 'loginButton',
            type: 'button',
            className: 'btn btn-primary btn-sm inline-block-tight',
            onClick: this.signIn,
            disabled: true
          },
          'Sign in'
        )
      )
    )
  }

  renderErrorMessage () {
    return this.props.invalidToken
      ? $.p({ref: 'errorMessage', className: 'error-messages'}, 'That token does not appear to be valid.')
      : null
  }

  async signIn () {
    const token = this.refs.editor.getText().trim()

    if (!token) {
      await this.update({invalidToken: true})
      return
    }

    await this.update({invalidToken: false})

    const signedIn = await this.props.authenticationProvider.signIn(token)
    if (!signedIn) await this.update({invalidToken: true})
  }

  attachChangeEvent () {
    // This enables/disables the login button
    // based on the current input in the editor.
    const previousTokenEditor = this.editor
    this.editor = this.refs.editor

    if (!previousTokenEditor && this.editor) {
      this.editor.onDidChange(() => {
        const token = this.refs.editor.getText().trim()
        this.refs.loginButton.disabled = !token
      })
    }
  }
}
