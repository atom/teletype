const {CompositeDisposable, Disposable, TextEditor} = require('atom')

module.exports =
class GithubAuthenticationProvider {
  constructor ({commandRegistry, workspace, openURL, passwordManager}) {
    this.commandRegistry = commandRegistry
    this.workspace = workspace
    this.openURL = openURL
    this.passwordManager = passwordManager
    this.confirm = this.confirm.bind(this)
    this.dismiss = this.dismiss.bind(this)

    this.element = document.createElement('div')
    this.editor = new TextEditor({mini: true})
    this.element.appendChild(this.editor.element)

    this.disposables = new CompositeDisposable()
    this.disposables.add(commandRegistry.add(this.element, {
      'core:confirm': this.confirm,
      'core:cancel': this.dismiss
    }))

    this.editor.element.addEventListener('blur', this.dismiss)
    this.disposables.add(new Disposable(() => this.editor.element.removeEventListener('blur', this.cancel)))
  }

  authenticate () {
    return new Promise(async (resolve, reject) => {
      const password = await this.passwordManager.get()
      if (password) {
        resolve(password)
      } else {
        this.resolveLastLoginPromise = resolve
        this.rejectLastLoginPromise = reject
        this.panel = this.workspace.addModalPanel({item: this.element})
        this.openURL('https://tachyon.atom.io/login')
      }
    })
  }

  async confirm () {
    const password = this.editor.getText()

    await this.passwordManager.set(password)
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
