module.exports =
class FakeCommandRegistry {
  constructor () {
    this.items = new Set()
  }

  add (elem, commands) {
    this.items.add({ elem, commands })
    return this
  }

  dispose () {
    this.items.forEach(({elem, command}) => {
      elem.dispose()
    })
  }
}
