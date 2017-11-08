const path = require('path')
const {Range, Disposable, CompositeDisposable} = require('atom')
const normalizeURI = require('./normalize-uri')
const {FollowState} = require('@atom/teletype-client')
const SitePositionsComponent = require('./site-positions-component')

function doNothing () {}

module.exports =
class EditorBinding {
  constructor ({editor, portal, isHost, didDispose}) {
    this.editor = editor
    this.portal = portal
    this.isHost = isHost
    this.emitDidDispose = didDispose || doNothing
    this.selectionsMarkerLayer = this.editor.selectionsMarkerLayer.bufferMarkerLayer
    this.markerLayersBySiteId = new Map()
    this.markersByLayerAndId = new WeakMap()
    this.subscriptions = new CompositeDisposable()
    this.preserveFollowState = false
    this.positionsBySiteId = {}
  }

  dispose () {
    this.subscriptions.dispose()

    this.markerLayersBySiteId.forEach((l) => l.destroy())
    this.markerLayersBySiteId.clear()
    if (!this.isHost) this.restoreOriginalEditorMethods(this.editor)
    if (this.localCursorLayerDecoration) this.localCursorLayerDecoration.destroy()

    this.aboveViewportSitePositionsComponent.destroy()
    this.insideViewportSitePositionsComponent.destroy()
    this.outsideViewportSitePositionsComponent.destroy()

    this.emitDidDispose()
  }

  setEditorProxy (editorProxy) {
    this.editorProxy = editorProxy
    if (this.isHost) {
      this.editor.onDidDestroy(() => this.editorProxy.dispose())
    } else {
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
    this.relayLocalSelections(true)

    this.aboveViewportSitePositionsComponent = this.buildSitePositionsComponent('upper-right')
    this.insideViewportSitePositionsComponent = this.buildSitePositionsComponent('middle-right')
    this.outsideViewportSitePositionsComponent = this.buildSitePositionsComponent('lower-right')

    this.editor.element.appendChild(this.aboveViewportSitePositionsComponent.element)
    this.editor.element.appendChild(this.insideViewportSitePositionsComponent.element)
    this.editor.element.appendChild(this.outsideViewportSitePositionsComponent.element)
  }

  monkeyPatchEditorMethods (editor, editorProxy) {
    const buffer = editor.getBuffer()
    const bufferProxy = editorProxy.bufferProxy
    const hostIdentity = this.portal.getSiteIdentity(1)
    const uriPrefix = hostIdentity ? `@${hostIdentity.login}` : 'remote'

    const bufferURI = normalizeURI(bufferProxy.uri)
    editor.getTitle = () => `${uriPrefix}: ${path.basename(bufferURI)}`
    editor.getURI = () => ''
    editor.copy = () => null
    editor.serialize = () => null
    editor.isRemote = true
    buffer.getPath = () => `${uriPrefix}:${bufferURI}`
    buffer.save = () => {}
    buffer.isModified = () => false
    editor.element.classList.add('teletype-RemotePaneItem')
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

    editor.element.classList.remove('teletype-RemotePaneItem')
    editor.emitter.emit('did-change-title', editor.getTitle())
  }

  observeMarker (marker, relayLocalSelections = true) {
    const didChangeDisposable = marker.onDidChange(({textChanged}) => {
      if (textChanged) {
        if (marker.getRange().isEmpty()) marker.clearTail()
      } else {
        this.editorProxy.updateSelections({
          [marker.id]: getSelectionState(marker)
        }, this.preserveFollowState)
      }
    })
    const didDestroyDisposable = marker.onDidDestroy(() => {
      didChangeDisposable.dispose()
      didDestroyDisposable.dispose()
      this.subscriptions.remove(didChangeDisposable)
      this.subscriptions.remove(didDestroyDisposable)

      this.editorProxy.updateSelections({
        [marker.id]: null
      }, this.preserveFollowState)
    })
    this.subscriptions.add(didChangeDisposable)
    this.subscriptions.add(didDestroyDisposable)
    if (relayLocalSelections) this.relayLocalSelections()
  }

  async editorDidChangeScrollTop () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.updateActivePositions(this.positionsBySiteId)
    this.editorProxy.didScroll()
  }

  async editorDidChangeScrollLeft () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.updateActivePositions(this.positionsBySiteId)
    this.editorProxy.didScroll()
  }

  async editorDidResize () {
    const {element} = this.editor
    await element.component.getNextUpdatePromise()
    this.updateActivePositions(this.positionsBySiteId)
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

  isPositionVisible (bufferPosition) {
    return this.getDirectionFromViewportToPosition(bufferPosition) === 'inside'
  }

  updateTether (state, position) {
    const localCursorDecorationProperties = {type: 'cursor'}

    if (state === FollowState.RETRACTED) {
      this.editor.destroyFoldsIntersectingBufferRange(Range(position, position))

      this.preserveFollowState = true
      this.editor.setCursorBufferPosition(position)
      this.preserveFollowState = false

      localCursorDecorationProperties.style = {opacity: 0}
    } else {
      localCursorDecorationProperties.class = cursorClassForSiteId(this.editorProxy.siteId)
    }

    this.localCursorLayerDecoration.setProperties(localCursorDecorationProperties)
  }

  updateActivePositions (positionsBySiteId) {
    const aboveViewportSiteIds = []
    const insideViewportSiteIds = []
    const outsideViewportSiteIds = []
    const followedSiteId = this.editorProxy.getFollowedSiteId()

    for (let siteId in positionsBySiteId) {
      siteId = parseInt(siteId)
      const position = positionsBySiteId[siteId]
      switch (this.getDirectionFromViewportToPosition(position)) {
        case 'upward':
          aboveViewportSiteIds.push(siteId)
          break
        case 'inside':
          insideViewportSiteIds.push(siteId)
          break
        case 'downward':
        case 'leftward':
        case 'rightward':
          outsideViewportSiteIds.push(siteId)
          break
      }
    }

    this.aboveViewportSitePositionsComponent.update({siteIds: aboveViewportSiteIds, followedSiteId})
    this.insideViewportSitePositionsComponent.update({siteIds: insideViewportSiteIds, followedSiteId})
    this.outsideViewportSitePositionsComponent.update({siteIds: outsideViewportSiteIds, followedSiteId})
    this.positionsBySiteId = positionsBySiteId
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

  relayLocalSelections (initialUpdate = false) {
    const selectionUpdates = {}
    const selectionMarkers = this.selectionsMarkerLayer.getMarkers()
    for (let i = 0; i < selectionMarkers.length; i++) {
      const marker = selectionMarkers[i]
      selectionUpdates[marker.id] = getSelectionState(marker)
    }
    this.editorProxy.updateSelections(selectionUpdates, initialUpdate)
  }

  buildSitePositionsComponent (position) {
    return new SitePositionsComponent({
      position,
      displayedParticipantsCount: 3,
      portal: this.portal,
      onSelectSiteId: this.toggleFollowingForSiteId.bind(this)
    })
  }

  toggleFollowingForSiteId (siteId) {
    if (siteId === this.editorProxy.getFollowedSiteId()) {
      this.editorProxy.unfollow()
    } else {
      this.editorProxy.follow(siteId)
    }
  }
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

function cursorClassForSiteId (siteId, {blink}={}) {
  let className = 'ParticipantCursor--site-' + siteId
  if (blink === false) className += ' non-blinking'
  return className
}

function subscribeToResizeEvents (element, callback) {
  const resizeObserver = new ResizeObserver(callback)
  resizeObserver.observe(element)
  return new Disposable(() => resizeObserver.disconnect())
}
