const {Emitter} = require('atom')

module.exports =
class EmptyPortalPaneItem {
  constructor () {
    this.emitter = new Emitter()
    this.element = document.createElement('div')
    this.element.tabIndex = -1
    this.element.classList.add('realtime-RemotePaneItem')
    this.element.style.position = 'absolute'
    this.element.style.width = '100%'
    this.element.style.top = '50%'
    this.element.style.fontSize = '24px'
    this.element.style.textAlign = 'center'
    // TODO: Replace "host" with the person's first name (or @username) once we
    // implement authentication.
    this.element.innerHTML = `
      Your host is doing something else right now.<br/>
      Sharing will resume once the host is editing again.
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
    return 'Portal: No Active File'
  }

  destroy () {
    this.emitter.emit('did-destroy')
  }

  onDidDestroy (callback) {
    return this.emitter.once('did-destroy', callback)
  }
}
