const {Range, CompositeDisposable} = require('atom')

module.exports =
class EditorBinding {
  constructor (editor) {
    this.editor = editor
    this.selectionsMarkerLayer = this.editor.selectionsMarkerLayer.bufferMarkerLayer
    this.markerLayersBySiteId = new Map()
    this.markersByLayerAndId = new WeakMap()
    this.subscriptions = new CompositeDisposable()
    this.followHostCursor = true
  }

  dispose () {
    this.subscriptions.dispose()
    this.markerLayersBySiteId.forEach((l) => l.destroy())
    this.markerLayersBySiteId.clear()
    this.editor = null
    this.selectionsMarkerLayer = null
    this.markerLayersBySiteId = null
    this.markersByLayerAndId = null
  }

  setEditorProxy (editorProxy) {
    this.editorProxy = editorProxy
    const markers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < markers.length; i++) {
      this.observeMarker(markers[i], false)
    }
    this.subscriptions.add(this.selectionsMarkerLayer.onDidCreateMarker(this.observeMarker.bind(this)))
    this.relayLocalSelections()
  }

  observeMarker (marker, relayLocalSelections = true) {
    const didChangeDisposable = marker.onDidChange(({textChanged}) => {
      if (!textChanged) this.relayLocalSelections()
    })
    const didDestroyDisposable = marker.onDidDestroy(() => {
      this.relayLocalSelections()
      didChangeDisposable.dispose()
      didDestroyDisposable.dispose()
      this.subscriptions.remove(didChangeDisposable)
      this.subscriptions.remove(didDestroyDisposable)
    })
    this.subscriptions.add(didChangeDisposable)
    this.subscriptions.add(didDestroyDisposable)
    if (relayLocalSelections) this.relayLocalSelections()
  }

  updateSelectionsForSiteId (siteId, selections) {
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
    for (const markerId in selections) {
      maxMarkerId = maxMarkerId ? Math.max(maxMarkerId, markerId) : markerId
      let marker = markersById.get(markerId)
      const {start, end} = selections[markerId].range
      const newRange = Range(start, end)
      if (marker) {
        marker.setBufferRange(newRange)
      } else {
        marker = markerLayer.markBufferRange(newRange, {invalidate: 'never'})
        markersById.set(markerId, marker)
      }
      if (newRange.isEmpty()) marker.bufferMarker.clearTail()
    }

    markersById.forEach((marker, id) => {
      if (!selections.hasOwnProperty(id)) {
        marker.destroy()
        markersById.delete(id)
      }
    })

    if (isHost(siteId) && maxMarkerId && this.followHostCursor) {
      const marker = markersById.get(maxMarkerId.toString())
      this.editor.scrollToScreenRange(marker.getScreenRange(), {center: true})
    }
  }

  clearSelectionsForSiteId (siteId) {
    const markerLayer = this.markerLayersBySiteId.get(siteId)
    if (markerLayer != null) markerLayer.destroy()
    this.markerLayersBySiteId.delete(siteId)
    this.markersByLayerAndId.delete(markerLayer)
  }

  isFollowingHostCursor () {
    return this.followHostCursor
  }

  setFollowHostCursor (followHostCursor) {
    this.followHostCursor = followHostCursor
  }

  relayLocalSelections () {
    const selections = this.selectionsMarkerLayer.createSnapshot()
    this.editorProxy.updateSelections(selections)
  }
}

const COLORS = [
  '#2ECC40', '#FF851B', '#85144b', '#FFDC00', '#39CCCC', '#0074D9', '#3D9970',
  '#001f3f', '#FF4136', '#F012BE', '#01FF70', '#B10DC9', '#7FDBFF', '#111111'
]

function colorForSiteId (siteId) {
  return COLORS[(siteId - 1) % COLORS.length]
}

function isHost (siteId) {
  return siteId === 1
}
