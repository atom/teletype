module.exports =
class FakeEditorProxy {
  constructor (uri) {
    this.bufferProxy = {
      uri,
      dispose () {},
      setDelegate () {},
      createCheckpoint () {},
      groupChangesSinceCheckpoint () {},
      applyGroupingInterval () {}
    }
  }

  follow () {}

  didScroll () {}

  setDelegate () {}

  updateSelections () {}
}
