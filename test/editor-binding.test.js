const assert = require('assert')
const fs = require('fs')
const path = require('path')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const {TextEditor} = require('atom')
const EditorBinding = require('../lib/editor-binding')

describe('EditorBinding', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  it('relays local selections and creates cursor decorations on the local editor based on the remote ones', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(editor)
    const clientEditor = new FakeClientEditor(binding)
    binding.setClientEditor(clientEditor)
    assert.deepEqual(
      clientEditor.rangesByMarkerId,
      {
        1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}
      }
    )

    editor.setSelectedBufferRanges([
      [[10, 0], [11, 4]],
      [[20, 0], [20, 5]]
    ])
    assert.deepEqual(
      clientEditor.rangesByMarkerId,
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

  it('clears remote selections for disconnected remote site', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(editor)
    const clientEditor = new FakeClientEditor(binding)
    binding.setClientEditor(clientEditor)

    editor.setSelectedBufferRanges([
      [[10, 0], [11, 4]],
      [[20, 0], [20, 5]]
    ])
    binding.setSelectionMarkerLayerForSiteId(2, {
      1: {start: {row: 3, column: 0}, end: {row: 4, column: 2}}
    })
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {start: {row: 3, column: 0}, end: {row: 4, column: 2}},
        {start: {row: 10, column: 0}, end: {row: 11, column: 4}},
        {start: {row: 20, column: 0}, end: {row: 20, column: 5}}
      ]
    )

    binding.setSelectionMarkerLayerForSiteId(2, null)
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {start: {row: 10, column: 0}, end: {row: 11, column: 4}},
        {start: {row: 20, column: 0}, end: {row: 20, column: 5}}
      ]
    )
  })

  it('clears the tail of remote selection markers when they become empty', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(editor)
    const clientEditor = new FakeClientEditor(binding)
    binding.setClientEditor(clientEditor)

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
    binding.setSelectionMarkerLayerForSiteId(2, {1: remoteSelectionAfterDelete})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        originalLocalSelection,
        remoteSelectionAfterDelete
      ]
    )

    editor.getBuffer().insert(remoteSelectionAfterDelete.start, 'a')
    const remoteSelectionAfterInsert = {start: {row: 1, column: 1}, end: {row: 1, column: 1}}
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        originalLocalSelection,
        remoteSelectionAfterInsert
      ]
    )
  })

  it('does not relay local selection changes if the associated marker moves because of a textual change', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)

    const binding = new EditorBinding(editor)
    const clientEditor = new FakeClientEditor(binding)
    binding.setClientEditor(clientEditor)

    editor.setCursorBufferPosition([0, 0])
    clientEditor.rangesByMarkerId = {}
    editor.insertText('X')
    assert.deepEqual(clientEditor.rangesByMarkerId, {})

    // After deleting text in the selected range, the editor will set the cursor
    // buffer position to the start of the selection.
    editor.setSelectedBufferRange([[0, 0], [0, 3]])
    editor.delete()
    assert.deepEqual(clientEditor.rangesByMarkerId, {
      1: {start: {row: 0, column: 0}, end: {row: 0, column: 0}}
    })
  })

  it('updates the scroll position based on the position of the last cursor on the host', () => {
    const guestEditor = new TextEditor()
    guestEditor.setText(SAMPLE_TEXT)
    guestEditor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(guestEditor)
    binding.setClientEditor(new FakeClientEditor(binding))

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

  it('does not try to update the scroll position when the host has no cursor', () => {
    const guestEditor = new TextEditor()
    guestEditor.setText(SAMPLE_TEXT)
    guestEditor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding(guestEditor)
    binding.setClientEditor(new FakeClientEditor(binding))

    const scrollRequests = []
    guestEditor.onDidRequestAutoscroll(({screenRange}) => scrollRequests.push(screenRange))

    binding.setSelectionMarkerLayerForSiteId(1, {})
    assert.deepEqual(scrollRequests, [])
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

class FakeClientEditor {
  constructor (delegate) {
    this.delegate = delegate
  }

  setSelectionRanges (rangesByMarkerId) {
    this.rangesByMarkerId = rangesByMarkerId
  }
}
