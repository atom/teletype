const {CompositeDisposable, TextEditor} = require('atom')
const etch = require('etch')
const $ = etch.dom

module.exports =
class SignInComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)

    this.refs.editor.onDidChange(() => {
      const token = this.refs.editor.getText().trim()
      this.refs.loginButton.disabled = !token
    })

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

  render () {
    return $.div({className: 'SignInComponent', tabIndex: -1},
      $.span({className: 'SignInComponent-GitHubLogo'}),
      $.h3(null, 'Sign in with GitHub'),
      this.renderSigningInIndicator(),
      this.renderTokenPrompt()
    )
  }

  renderSigningInIndicator () {
    let props = {}
    if (this.props.authenticationProvider.isSigningIn()) {
      props.className = 'loading loading-spinner-tiny inline-block'
    } else {
      props.style = {display: 'none'}
    }

    return $.span(props)
  }

  renderTokenPrompt () {
    const props = this.props.authenticationProvider.isSigningIn() ? {style: {display: 'none'}} : null

    return $.div(props,
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
    const {editor} = this.refs
    const token = editor.getText().trim()
    const signedIn = token ? await this.props.authenticationProvider.signIn(token) : false

    if (signedIn) {
      await this.update({invalidToken: false})
    } else {
      editor.setText('')
      await this.update({invalidToken: true})
    }
  }
}
