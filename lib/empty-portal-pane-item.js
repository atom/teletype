const {Emitter} = require('atom')

module.exports =
class EmptyPortalPaneItem {
  constructor ({hostIdentity}) {
    this.hostLogin = `@${hostIdentity.login}`
    this.emitter = new Emitter()
    this.element = document.createElement('div')
    this.element.tabIndex = -1
    this.element.classList.add('teletype-RemotePaneItem')
    this.element.style.position = 'absolute'
    this.element.style.width = '100%'
    this.element.style.top = '50%'
    this.element.style.fontSize = '24px'
    this.element.style.textAlign = 'center'
    this.element.innerHTML = `
      ${this.hostLogin} is doing something else right now.<br/>
      Sharing will resume once ${this.hostLogin} is editing again.
    `
  }

  copy () {
    // Prevents item from being copied.
    return null
  }

  serialize () {
    // Prevents item from being serialized.
    return null
  }

  getTitle () {
    return `${this.hostLogin}: No Active File`
  }

  destroy () {
    this.emitter.emit('did-destroy')
  }

  onDidDestroy (callback) {
    return this.emitter.once('did-destroy', callback)
  }
}
