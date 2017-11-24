const {Disposable} = require('atom')

module.exports =
class FakeWorkspace {
  async open () {}

  getElement () {
    return document.createElement('div')
  }

  observeActiveTextEditor () {
    return new Disposable(() => {})
  }
}
