/* global ResizeObserver */

const path = require('path')
const {Range, Emitter, Disposable, CompositeDisposable} = require('atom')
const getPathWithNativeSeparators = require('./get-path-with-native-separators')
const getEditorURI = require('./get-editor-uri')
const {FollowState} = require('@atom/teletype-client')

module.exports =
class EditorBinding {
  constructor ({editor, portal, isHost}) {
    this.editor = editor
    this.portal = portal
    this.isHost = isHost
    this.emitter = new Emitter()
    this.selectionsMarkerLayer = this.editor.selectionsMarkerLayer.bufferMarkerLayer
    this.markerLayersBySiteId = new Map()
    this.markersByLayerAndId = new WeakMap()
    this.subscriptions = new CompositeDisposable()
    this.preserveFollowState = false
    this.positionsBySiteId = {}
  }

  dispose () {
    if (this.disposed) return

    this.disposed = true
    this.subscriptions.dispose()

    this.markerLayersBySiteId.forEach((l) => l.destroy())
    this.markerLayersBySiteId.clear()
    if (this.localCursorLayerDecoration) this.localCursorLayerDecoration.destroy()

    this.emitter.emit('did-dispose')
    this.emitter.dispose()
  }

  setEditorProxy (editorProxy) {
    this.editorProxy = editorProxy
    if (!this.isHost) {
      this.monkeyPatchEditorMethods(this.editor, this.editorProxy)
    }

    this.localCursorLayerDecoration = this.editor.decorateMarkerLayer(
      this.selectionsMarkerLayer,
      {type: 'cursor', class: cursorClassForSiteId(editorProxy.siteId)}
    )

    const markers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < markers.length; i++) {
      this.observeMarker(markers[i], false)
    }
    this.subscriptions.add(this.selectionsMarkerLayer.onDidCreateMarker(this.observeMarker.bind(this)))
    this.subscriptions.add(this.editor.element.onDidChangeScrollTop(this.editorDidChangeScrollTop.bind(this)))
    this.subscriptions.add(this.editor.element.onDidChangeScrollLeft(this.editorDidChangeScrollLeft.bind(this)))
    this.subscriptions.add(subscribeToResizeEvents(this.editor.element, this.editorDidResize.bind(this)))
    this.relayLocalSelections()
  }

  monkeyPatchEditorMethods (editor, editorProxy) {
    const buffer = editor.getBuffer()
    const {bufferProxy} = editorProxy
    const hostIdentity = this.portal.getSiteIdentity(1)
    const prefix = hostIdentity ? `@${hostIdentity.login}` : 'remote'
    const bufferURI = getPathWithNativeSeparators(bufferProxy.uri)

    editor.getTitle = () => `${prefix}: ${path.basename(bufferURI)}`
    editor.getURI = () => getEditorURI(this.portal.id, editorProxy.id)
    editor.copy = () => null
    editor.serialize = () => null
    editor.isRemote = true

    let remoteEditorCountForBuffer = buffer.remoteEditorCount || 0
    buffer.remoteEditorCount = ++remoteEditorCountForBuffer
    buffer.getPath = () => `${prefix}:${bufferURI}`
    buffer.save = () => { bufferProxy.requestSave() }
    buffer.isModified = () => false

    editor.element.classList.add('teletype-RemotePaneItem')
  }

  observeMarker (marker, relay = true) {
    if (marker.isDestroyed()) return

    const didChangeDisposable = marker.onDidChange(({textChanged}) => {
      if (textChanged) {
        if (marker.getRange().isEmpty()) marker.clearTail()
      } else {
        this.updateSelections({
          [marker.id]: getSelectionState(marker)
        })
      }
    })
    const didDestroyDisposable = marker.onDidDestroy(() => {
      didChangeDisposable.dispose()
      didDestroyDisposable.dispose()
      this.subscriptions.remove(didChangeDisposable)
      this.subscriptions.remove(didDestroyDisposable)

      this.updateSelections({
        [marker.id]: null
      })
    })
    this.subscriptions.add(didChangeDisposable)
    this.subscriptions.add(didDestroyDisposable)

    if (relay) {
      this.updateSelections({
        [marker.id]: getSelectionState(marker)
      })
    }
  }

  async editorDidChangeScrollTop () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.editorProxy.didScroll()
    this.emitter.emit('did-scroll')
  }

  async editorDidChangeScrollLeft () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.editorProxy.didScroll()
    this.emitter.emit('did-scroll')
  }

  async editorDidResize () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.emitter.emit('did-resize')
  }

  onDidDispose (callback) {
    return this.emitter.on('did-dispose', callback)
  }

  onDidScroll (callback) {
    return this.emitter.on('did-scroll', callback)
  }

  onDidResize (callback) {
    return this.emitter.on('did-resize', callback)
  }

  updateSelectionsForSiteId (siteId, selections) {
    let markerLayer = this.markerLayersBySiteId.get(siteId)
    if (!markerLayer) {
      markerLayer = this.editor.addMarkerLayer()
      this.editor.decorateMarkerLayer(markerLayer, {type: 'cursor', class: cursorClassForSiteId(siteId, {blink: false})})
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
  }

  isScrollNeededToViewPosition (position) {
    const isPositionVisible = this.getDirectionFromViewportToPosition(position) === 'inside'
    const isEditorAttachedToDOM = document.body.contains(this.editor.element)
    return isEditorAttachedToDOM && !isPositionVisible
  }

  updateTether (state, position) {
    const localCursorDecorationProperties = {type: 'cursor'}

    if (state === FollowState.RETRACTED) {
      this.editor.destroyFoldsIntersectingBufferRange(Range(position, position))
      this.batchMarkerUpdates(() => this.editor.setCursorBufferPosition(position))

      localCursorDecorationProperties.style = {opacity: 0}
    } else {
      localCursorDecorationProperties.class = cursorClassForSiteId(this.editorProxy.siteId)
    }

    this.localCursorLayerDecoration.setProperties(localCursorDecorationProperties)
  }

  getDirectionFromViewportToPosition (bufferPosition) {
    const {element} = this.editor
    if (!document.contains(element)) return

    const {row, column} = this.editor.screenPositionForBufferPosition(bufferPosition)
    const top = element.component.pixelPositionAfterBlocksForRow(row)
    const left = column * this.editor.getDefaultCharWidth()

    if (top < element.getScrollTop()) {
      return 'upward'
    } else if (top >= element.getScrollBottom()) {
      return 'downward'
    } else if (left < element.getScrollLeft()) {
      return 'leftward'
    } else if (left >= element.getScrollRight()) {
      return 'rightward'
    } else {
      return 'inside'
    }
  }

  clearSelectionsForSiteId (siteId) {
    const markerLayer = this.markerLayersBySiteId.get(siteId)
    if (markerLayer != null) markerLayer.destroy()
    this.markerLayersBySiteId.delete(siteId)
    this.markersByLayerAndId.delete(markerLayer)
  }

  relayLocalSelections () {
    const selectionUpdates = {}
    const selectionMarkers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < selectionMarkers.length; i++) {
      const marker = selectionMarkers[i]
      selectionUpdates[marker.id] = getSelectionState(marker)
    }
    this.editorProxy.updateSelections(selectionUpdates, {initialUpdate: true})
  }

  batchMarkerUpdates (fn) {
    this.batchedMarkerUpdates = {}
    this.isBatchingMarkerUpdates = true
    fn()
    this.isBatchingMarkerUpdates = false
    this.editorProxy.updateSelections(this.batchedMarkerUpdates)
    this.batchedMarkerUpdates = null
  }

  updateSelections (update) {
    if (this.isBatchingMarkerUpdates) {
      Object.assign(this.batchedMarkerUpdates, update)
    } else {
      this.editorProxy.updateSelections(update)
    }
  }

  toggleFollowingForSiteId (siteId) {
    if (siteId === this.editorProxy.getFollowedSiteId()) {
      this.editorProxy.unfollow()
    } else {
      this.editorProxy.follow(siteId)
    }
  }
}

function getSelectionState (marker) {
  return {
    range: marker.getRange(),
    exclusive: marker.isExclusive(),
    reversed: marker.isReversed()
  }
}

function cursorClassForSiteId (siteId, {blink} = {}) {
  let className = 'ParticipantCursor--site-' + siteId
  if (blink === false) className += ' non-blinking'
  return className
}

function subscribeToResizeEvents (element, callback) {
  const resizeObserver = new ResizeObserver(callback)
  resizeObserver.observe(element)
  return new Disposable(() => resizeObserver.disconnect())
}
