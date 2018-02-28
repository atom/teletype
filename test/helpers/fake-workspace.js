const {Disposable} = require('atom')

module.exports =
class FakeWorkspace {
  async open () {}

  getCenter () {
    return {
      paneContainer: {
        getElement () {
          return document.createElement('div')
        }
      }
    }
  }

  getElement () {
    return document.createElement('div')
  }

  observeTextEditors () {
    return new Disposable(() => {})
  }

  observeActiveTextEditor () {
    return new Disposable(() => {})
  }

  onDidDestroyPaneItem () {
    return new Disposable(() => {})
  }

  onDidChangeActivePaneItem () {
    return new Disposable(() => {})
  }

  paneForItem () {}
}
