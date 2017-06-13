const {Range} = require('atom')

module.exports =
class EditorBinding {
  constructor (editor) {
    this.editor = editor
    this.markerLayersBySiteId = new Map()
    this.markersByLayerAndId = new WeakMap()
  }

  setSharedEditor (sharedEditor) {
    this.sharedEditor = sharedEditor
    this.relayLocalSelections()
    this.editor.selectionsMarkerLayer.onDidUpdate(this.relayLocalSelections.bind(this))
  }

  setSelectionMarkerLayerForSiteId (siteId, selectionMarkerLayer) {
    this.applyingRemoteChanges = true
    let markerLayer = this.markerLayersBySiteId.get(siteId)
    if (!markerLayer) {
      markerLayer = this.editor.addMarkerLayer()
      this.editor.decorateMarkerLayer(markerLayer, {type: 'cursor', style: {borderLeftColor: colorForSiteId(siteId)}})
      this.editor.decorateMarkerLayer(markerLayer, {type: 'highlight', class: 'selection'})
      this.markerLayersBySiteId.set(siteId, markerLayer)
    }

    let markersById = this.markersByLayerAndId.get(markerLayer)
    if (!markersById) {
      markersById = new Map()
      this.markersByLayerAndId.set(markerLayer, markersById)
    }

    let maxMarkerId
    for (const markerId in selectionMarkerLayer) {
      maxMarkerId = maxMarkerId ? Math.max(maxMarkerId, markerId) : markerId
      const marker = markersById.get(markerId)
      const {start, end} = selectionMarkerLayer[markerId]
      const newRange = Range(start, end)
      if (marker) {
        marker.setBufferRange(newRange)
      } else {
        markersById.set(
          markerId,
          markerLayer.markBufferRange(newRange, {invalidate: 'never'})
        )
      }
    }

    markersById.forEach((marker, id) => {
      if (!selectionMarkerLayer.hasOwnProperty(id)) {
        marker.destroy()
        markersById.delete(id)
      }
    })
    this.applyingRemoteChanges = false

    if (this.isHost(siteId)) {
      const marker = markersById.get((maxMarkerId).toString())
      this.editor.scrollToScreenRange(marker.getScreenRange(), {center: true})
    }
  }

  isHost (siteId) {
    return siteId === 1
  }

  relayLocalSelections () {
    if (this.applyingRemoteChanges) return

    const {selectionsMarkerLayer} = this.editor
    const indexDump = selectionsMarkerLayer.bufferMarkerLayer.index.dump()
    const markersById = {}
    for (const markerId in indexDump) {
      const {start, end} = indexDump[markerId]
      markersById[markerId] = {
        start: {row: start.row, column: start.column},
        end: {row: end.row, column: end.column}
      }
    }
    this.sharedEditor.setSelectionRanges(markersById)
  }
}

const COLORS = [
  '#2ECC40', '#FF851B', '#85144b', '#FFDC00', '#39CCCC', '#0074D9', '#3D9970',
  '#001f3f', '#FF4136', '#F012BE', '#01FF70', '#B10DC9', '#7FDBFF', '#111111'
]

function colorForSiteId (siteId) {
  return COLORS[siteId % COLORS.length]
}
