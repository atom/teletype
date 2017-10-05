const path = require('path')
const {Range, CompositeDisposable} = require('atom')
const normalizeURI = require('./normalize-uri')

function doNothing () {}

module.exports =
class EditorBinding {
  constructor ({editor, isHost, didDispose}) {
    this.editor = editor
    this.isHost = isHost
    this.emitDidDispose = didDispose || doNothing
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
    if (!this.isHost) this.restoreOriginalEditorMethods(this.editor)
    this.emitDidDispose()
  }

  setEditorProxy (editorProxy) {
    this.editorProxy = editorProxy
    if (this.isHost) {
      this.editor.onDidDestroy(() => this.editorProxy.dispose())
    } else {
      this.monkeyPatchEditorMethods(this.editor, this.editorProxy)
    }
    const markers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < markers.length; i++) {
      this.observeMarker(markers[i], false)
    }
    this.subscriptions.add(this.selectionsMarkerLayer.onDidCreateMarker(this.observeMarker.bind(this)))
    this.relayLocalSelections()
  }

  monkeyPatchEditorMethods (editor, editorProxy) {
    const buffer = editor.getBuffer()
    const bufferProxy = editorProxy.bufferProxy

    const bufferURI = normalizeURI(bufferProxy.uri)
    editor.getTitle = () => `Remote Buffer: ${path.basename(bufferURI)}`
    editor.getURI = () => ''
    editor.copy = () => null
    editor.serialize = () => null
    editor.isRemote = () => true
    buffer.getPath = () => `remote:${bufferURI}`
    buffer.save = () => {}
    buffer.isModified = () => false
    editor.element.classList.add('realtime-RemotePaneItem')
  }

  restoreOriginalEditorMethods (editor) {
    const buffer = editor.getBuffer()

    // Deleting the object-level overrides causes future calls to fall back
    // to original methods stored on the prototypes of the editor and buffer
    delete editor.getTitle
    delete editor.getURI
    delete editor.copy
    delete editor.serialize
    delete editor.isRemote
    delete buffer.getPath
    delete buffer.save
    delete buffer.isModified

    editor.element.classList.remove('realtime-RemotePaneItem')
    editor.emitter.emit('did-change-title', editor.getTitle())
  }

  observeMarker (marker, relayLocalSelections = true) {
    const didChangeDisposable = marker.onDidChange(({textChanged}) => {
      if (textChanged) {
        if (marker.getRange().isEmpty()) marker.clearTail()
      } else {
        this.editorProxy.updateSelections({
          [marker.id]: getSelectionState(marker)
        })
      }
    })
    const didDestroyDisposable = marker.onDidDestroy(() => {
      didChangeDisposable.dispose()
      didDestroyDisposable.dispose()
      this.subscriptions.remove(didChangeDisposable)
      this.subscriptions.remove(didDestroyDisposable)
      this.editorProxy.updateSelections({
        [marker.id]: null
      })
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
    for (let markerId in selections) {
      const markerUpdate = selections[markerId]
      markerId = parseInt(markerId)
      let marker = markersById.get(markerId)

      if (markerUpdate) {
        maxMarkerId = maxMarkerId ? Math.max(maxMarkerId, markerId) : markerId

        const {start, end} = markerUpdate.range
        const newRange = Range(start, end)
        if (marker) {
          marker.setBufferRange(newRange, {reversed: markerUpdate.reversed})
        } else {
          marker = markerLayer.markBufferRange(newRange, {invalidate: 'never', reversed: markerUpdate.reversed})
          marker.bufferMarker.onDidChange(({textChanged}) => {
            if (textChanged && marker.getBufferRange().isEmpty()) {
              marker.clearTail()
            }
          })

          markersById.set(markerId, marker)
        }

        if (newRange.isEmpty()) marker.clearTail()
      } else {
        marker.destroy()
        markersById.delete(markerId)
      }
    }

    if (isHost(siteId) && maxMarkerId && this.followHostCursor) {
      this.lastHostSelectionMarker = markersById.get(maxMarkerId)
      this.autoscrollToLastHostSelection()
    }
  }

  autoscrollToLastHostSelection () {
    this.editor.scrollToScreenRange(
      this.lastHostSelectionMarker.getScreenRange(),
      {center: true}
    )
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
    const selectionUpdates = {}
    const selectionMarkers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < selectionMarkers.length; i++) {
      const marker = selectionMarkers[i]
      selectionUpdates[marker.id] = getSelectionState(marker)
    }
    this.editorProxy.updateSelections(selectionUpdates)
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

function getSelectionState (marker) {
  return {
    range: marker.getRange(),
    exclusive: marker.isExclusive(),
    reversed: marker.isReversed()
  }
}
