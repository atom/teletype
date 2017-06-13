const assert = require('assert')
const fs = require('fs')
const path = require('path')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const {TextEditor} = require('atom')
const EditorBinding = require('../lib/editor-binding')

describe('EditorBinding', () => {
  it('relays local selections and creates cursor decorations on the local editor based on the remote ones', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(editor)
    const sharedEditor = new FakeSharedEditor(binding)
    binding.setSharedEditor(sharedEditor)
    assert.deepEqual(
      sharedEditor.rangesByMarkerId,
      {
        1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}
      }
    )

    editor.setSelectedBufferRanges([
      [[10, 0], [11, 4]],
      [[20, 0], [20, 5]]
    ])
    assert.deepEqual(
      sharedEditor.rangesByMarkerId,
      {
        1: {start: {row: 10, column: 0}, end: {row: 11, column: 4}},
        2: {start: {row: 20, column: 0}, end: {row: 20, column: 5}}
      }
    )

    binding.setSelectionMarkerLayerForSiteId(2, {
      1: {start: {row: 3, column: 0}, end: {row: 4, column: 2}},
      2: {start: {row: 5, column: 0}, end: {row: 6, column: 0}}
    })
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {start: {row: 3, column: 0}, end: {row: 4, column: 2}},
        {start: {row: 5, column: 0}, end: {row: 6, column: 0}},
        {start: {row: 10, column: 0}, end: {row: 11, column: 4}},
        {start: {row: 20, column: 0}, end: {row: 20, column: 5}}
      ]
    )
  })

  it('relays changes to local selections associated with a text change', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(editor)
    const sharedEditor = new FakeSharedEditor(binding)
    binding.setSharedEditor(sharedEditor)

    const originalLocalSelection = {start: {row: 0, column: 0}, end: {row: 0, column: 0}}
    const originalRemoteSelection = {start: {row: 1, column: 0}, end: {row: 1, column: 5}}
    binding.setSelectionMarkerLayerForSiteId(2, {1: originalRemoteSelection})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        originalLocalSelection,
        originalRemoteSelection
      ]
    )

    editor.getBuffer().delete(originalRemoteSelection)
    const remoteSelectionAfterDelete = {start: {row: 1, column: 0}, end: {row: 1, column: 0}}
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        originalLocalSelection,
        remoteSelectionAfterDelete
      ]
    )

    editor.getBuffer().insert(remoteSelectionAfterDelete, 'a')
    const remoteSelectionAfterInsert = {start: {row: 1, column: 0}, end: {row: 1, column: 1}}
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        originalLocalSelection,
        remoteSelectionAfterInsert
      ]
    )
  })

  it('updates the scroll position based on the position of the last cursor on the host', () => {
    const guestEditor = new TextEditor()
    guestEditor.setText(SAMPLE_TEXT)
    guestEditor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(guestEditor)
    binding.setSharedEditor(new FakeSharedEditor(binding))

    const scrollRequests = []
    guestEditor.onDidRequestAutoscroll(({screenRange}) => scrollRequests.push(screenRange))

    binding.setSelectionMarkerLayerForSiteId(1, {
      1: {start: {row: 3, column: 0}, end: {row: 4, column: 2}},
      2: {start: {row: 5, column: 0}, end: {row: 6, column: 1}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 5, column: 0}, end: {row: 6, column: 0}}])

    scrollRequests.length = 0
    binding.setSelectionMarkerLayerForSiteId(1, {
      1: {start: {row: 3, column: 0}, end: {row: 4, column: 2}},
      2: {start: {row: 5, column: 0}, end: {row: 6, column: 1}},
      3: {start: {row: 1, column: 0}, end: {row: 1, column: 3}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 1, column: 0}, end: {row: 1, column: 3}}])

    scrollRequests.length = 0
    binding.setSelectionMarkerLayerForSiteId(2, {
      1: {start: {row: 10, column: 0}, end: {row: 10, column: 2}}
    })
    assert.deepEqual(scrollRequests, [])

    binding.setFollowHostCursor(false)
    binding.setSelectionMarkerLayerForSiteId(1, {
      1: {start: {row: 6, column: 0}, end: {row: 7, column: 2}}
    })
    assert.deepEqual(scrollRequests, [])

    binding.setFollowHostCursor(true)
    binding.setSelectionMarkerLayerForSiteId(1, {
      1: {start: {row: 8, column: 0}, end: {row: 9, column: 2}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 8, column: 0}, end: {row: 9, column: 2}}])
  })

  function getCursorDecoratedRanges (editor) {
    const {decorationManager} = editor
    const decorationsByMarker = decorationManager.decorationPropertiesByMarkerForScreenRowRange(0, Infinity)
    const ranges = []
    for (const [marker, decorations] of decorationsByMarker) {
      const hasCursorDecoration = decorations.some((d) => d.type === 'cursor')
      if (hasCursorDecoration) ranges.push(marker.getBufferRange())
    }
    return ranges.sort((a, b) => a.compare(b))
  }
})

class FakeSharedEditor {
  constructor (delegate) {
    this.delegate = delegate
  }

  setSelectionRanges (rangesByMarkerId) {
    this.rangesByMarkerId = rangesByMarkerId
  }
}
