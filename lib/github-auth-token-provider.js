const {CompositeDisposable, Disposable, TextEditor} = require('atom')

module.exports =
class GithubAuthTokenProvider {
  constructor ({commandRegistry, workspace, openURL, passwordManager}) {
    this.commandRegistry = commandRegistry
    this.workspace = workspace
    this.openURL = openURL
    this.passwordManager = passwordManager
    this.confirm = this.confirm.bind(this)
    this.dismiss = this.dismiss.bind(this)

    this.element = document.createElement('div')

    this.label = document.createElement('div')
    this.label.style.padding = '2px'

    this.labelIcon = document.createElement('span')
    this.labelIcon.classList.add('icon', 'icon-lock')
    this.label.appendChild(this.labelIcon)

    this.labelText = document.createElement('span')
    this.labelText.textContent = 'Enter the token:'
    this.label.appendChild(this.labelText)

    this.element.appendChild(this.label)

    this.editor = new TextEditor({mini: true})
    this.element.appendChild(this.editor.element)

    this.disposables = new CompositeDisposable()
    this.disposables.add(commandRegistry.add(this.element, {
      'core:confirm': this.confirm,
      'core:cancel': this.dismiss
    }))

    this.editor.element.addEventListener('blur', this.dismiss)
    this.disposables.add(new Disposable(() => this.editor.element.removeEventListener('blur', this.dismiss)))
  }

  getToken () {
    return new Promise(async (resolve, reject) => {
      const password = await this.passwordManager.getPassword('oauth-token')
      if (password) {
        resolve(password)
      } else {
        this.resolveLastLoginPromise = resolve
        this.rejectLastLoginPromise = reject
        this.panel = this.workspace.addModalPanel({item: this.element})
        this.openURL('https://tachyon.atom.io/login')

        const didFocus = (e) => {
          window.removeEventListener('focus', didFocus)

          // Focus the editor element after the Atom focus event handler
          // (https://git.io/vdqrj) is executed to prevent it from stealing
          // focus.
          setTimeout(() => this.editor.element.focus(), 1)
        }
        window.addEventListener('focus', didFocus)
      }
    })
  }

  async confirm () {
    const password = this.editor.getText()

    await this.passwordManager.setPassword('oauth-token', password)
    this.resolveLastLoginPromise(password)
    this.reset()
  }

  dismiss () {
    this.rejectLastLoginPromise(new Error('Logging in is required'))
    this.reset()
  }

  reset () {
    this.editor.setText('')
    this.panel.destroy()

    this.resolveLastLoginPromise = null
    this.rejectLastLoginPromise = null
    this.panel = null
  }
}
