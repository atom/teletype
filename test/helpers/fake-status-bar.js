module.exports =
class FakeStatusBar {
  constructor () {
    this.rightTiles = []
  }

  getRightTiles () {
    return this.rightTiles
  }

  addRightTile (tile) {
    this.rightTiles.push(tile)
    return {
      getItem: () => tile.item,
      destroy: () => {
        const index = this.rightTiles.indexOf(tile)
        this.rightTiles.splice(index, 1)
      }
    }
  }
}
