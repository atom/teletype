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
    this.element.addEventListener('blur', this.cancel)

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
    return $("div", {className: 'JoinViaExternalAppDialog', tabIndex: -1})
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
