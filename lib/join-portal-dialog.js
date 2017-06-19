const {TextEditor, CompositeDisposable, Disposable} = require('atom')

module.exports =
class JoinPortalDialog {
  constructor ({workspace, clipboard, commandRegistry, didConfirm, didCancel}) {
    this.cancel = this.cancel.bind(this)
    this.confirm = this.confirm.bind(this)

    this.workspace = workspace
    this.clipboard = clipboard
    this.commandRegistry = commandRegistry
    this.didConfirm = didConfirm
    this.didCancel = didCancel

    this.element = document.createElement('div')
    this.editor = new TextEditor({mini: true})
    this.element.appendChild(this.editor.element)
  }

  confirm () {
    if (this.didConfirm) this.didConfirm(this.editor.getText())
    this.hide()
  }

  cancel () {
    if (this.didCancel) this.didCancel()
    this.hide()
  }

  show () {
    this.disposables = new CompositeDisposable()
    this.disposables.add(this.commandRegistry.add(this.element, {
      'core:confirm': this.confirm,
      'core:cancel': this.cancel
    }))
    this.editor.element.addEventListener('blur', this.cancel)
    this.disposables.add(new Disposable(() => this.editor.element.removeEventListener('blur', this.cancel)))

    this.panel = this.workspace.addModalPanel({item: this})
    if (this.clipboard) {
      const clipboardText = this.clipboard.read()
      if (isUUID(clipboardText)) this.editor.setText(clipboardText)
    }
    this.editor.element.focus()
  }

  hide () {
    this.editor.setText('')
    this.disposables.dispose()
    this.panel.destroy()
  }
}

const UUID_REGEXP = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/
function isUUID (string) {
  return UUID_REGEXP.test(string)
}
