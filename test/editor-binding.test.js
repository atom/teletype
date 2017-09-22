const assert = require('assert')
const fs = require('fs')
const path = require('path')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const {TextEditor, TextBuffer, Range} = require('atom')
const EditorBinding = require('../lib/editor-binding')

describe('EditorBinding', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  it('relays local selections and creates cursor decorations on the local editor based on the remote ones', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)
    assert.deepEqual(
      editorProxy.selections,
      {
        1: {
          range: Range.fromObject([[0, 0], [0, 0]]),
          exclusive: true,
          reversed: false
        }
      }
    )

    editor.setSelectedBufferRanges([
      [[10, 0], [11, 4]],
      [[20, 0], [20, 5]]
    ])
    editor.getLastSelection().setBufferRange([[20, 0], [20, 5]], {reversed: true})
    assert.deepEqual(
      editorProxy.selections,
      {
        1: {
          range: Range.fromObject([[10, 0], [11, 4]]),
          exclusive: false,
          reversed: false
        },
        2: {
          range: Range.fromObject([[20, 0], [20, 5]]),
          exclusive: false,
          reversed: true
        }
      }
    )

    binding.updateSelectionsForSiteId(2, {
      1: {range: {start: {row: 3, column: 0}, end: {row: 4, column: 2}}},
      2: {range: {start: {row: 5, column: 0}, end: {row: 6, column: 0}}, reversed: true}
    })
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 3, column: 0}, head: {row: 4, column: 2}},
        {tail: {row: 6, column: 0}, head: {row: 5, column: 0}},
        {tail: {row: 10, column: 0}, head: {row: 11, column: 4}},
        {tail: {row: 20, column: 5}, head: {row: 20, column: 0}}
      ]
    )

    editor.setSelectedBufferRanges([
      [[0, 0], [0, 4]]
    ])
    assert.deepEqual(
      editorProxy.selections,
      {
        1: {
          range: Range.fromObject([[0, 0], [0, 4]]),
          exclusive: false,
          reversed: false
        }
      }
    )
  })

  it('clears remote selections for disconnected remote site', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    editor.setSelectedBufferRanges([
      [[10, 0], [11, 4]],
      [[20, 0], [20, 5]]
    ])
    binding.updateSelectionsForSiteId(2, {
      1: {range: {start: {row: 3, column: 0}, end: {row: 4, column: 2}}}
    })
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 3, column: 0}, head: {row: 4, column: 2}},
        {tail: {row: 10, column: 0}, head: {row: 11, column: 4}},
        {tail: {row: 20, column: 0}, head: {row: 20, column: 5}}
      ]
    )

    binding.clearSelectionsForSiteId(2)
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 10, column: 0}, head: {row: 11, column: 4}},
        {tail: {row: 20, column: 0}, head: {row: 20, column: 5}}
      ]
    )
  })

  it('clears the tail of remote selection markers when they become empty', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    const originalLocalSelection = {start: {row: 0, column: 0}, end: {row: 0, column: 0}}
    const originalRemoteSelection = {start: {row: 1, column: 0}, end: {row: 1, column: 5}}
    binding.updateSelectionsForSiteId(2, {1: {range: originalRemoteSelection}})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}},
        {tail: {row: 1, column: 0}, head: {row: 1, column: 5}}
      ]
    )

    editor.getBuffer().delete(originalRemoteSelection)
    const remoteSelectionAfterDelete = {start: {row: 1, column: 0}, end: {row: 1, column: 0}}
    binding.updateSelectionsForSiteId(2, {1: {range: remoteSelectionAfterDelete}})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}},
        {tail: {row: 1, column: 0}, head: {row: 1, column: 0}}
      ]
    )

    editor.getBuffer().insert(remoteSelectionAfterDelete.start, 'a')
    const remoteSelectionAfterInsert = {start: {row: 1, column: 1}, end: {row: 1, column: 1}}
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}},
        {tail: {row: 1, column: 1}, head: {row: 1, column: 1}}
      ]
    )
  })

  it('does not relay local selection changes if the associated marker moves because of a textual change', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)

    const binding = new EditorBinding({editor})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    editor.setCursorBufferPosition([0, 0])
    editorProxy.selections = {}
    editor.insertText('X')
    assert.deepEqual(editorProxy.selections, {})

    // After deleting text in the selected range, the editor will set the cursor
    // buffer position to the start of the selection.
    editor.setSelectedBufferRange([[0, 0], [0, 3]])
    editor.delete()
    assert.deepEqual(editorProxy.selections, {
      1: {
        range: {start: {row: 0, column: 0}, end: {row: 0, column: 0}},
        exclusive: true,
        reversed: false
      }
    })
  })

  it('updates the scroll position based on the position of the last cursor on the host', () => {
    const guestEditor = new TextEditor()
    guestEditor.setText(SAMPLE_TEXT)
    guestEditor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor: guestEditor})
    binding.setEditorProxy(new FakeEditorProxy(binding))

    const scrollRequests = []
    guestEditor.onDidRequestAutoscroll(({screenRange}) => scrollRequests.push(screenRange))

    binding.updateSelectionsForSiteId(1, {
      1: {range: {start: {row: 3, column: 0}, end: {row: 4, column: 2}}},
      2: {range: {start: {row: 5, column: 0}, end: {row: 6, column: 1}}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 5, column: 0}, end: {row: 6, column: 0}}])

    scrollRequests.length = 0
    binding.updateSelectionsForSiteId(1, {
      1: {range: {start: {row: 3, column: 0}, end: {row: 4, column: 2}}},
      2: {range: {start: {row: 5, column: 0}, end: {row: 6, column: 1}}},
      3: {range: {start: {row: 1, column: 0}, end: {row: 1, column: 3}}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 1, column: 0}, end: {row: 1, column: 3}}])

    scrollRequests.length = 0
    binding.updateSelectionsForSiteId(2, {
      1: {range: {start: {row: 10, column: 0}, end: {row: 10, column: 2}}}
    })
    assert.deepEqual(scrollRequests, [])

    binding.setFollowHostCursor(false)
    binding.updateSelectionsForSiteId(1, {
      1: {range: {start: {row: 6, column: 0}, end: {row: 7, column: 2}}}
    })
    assert.deepEqual(scrollRequests, [])

    binding.setFollowHostCursor(true)
    binding.updateSelectionsForSiteId(1, {
      1: {range: {start: {row: 8, column: 0}, end: {row: 9, column: 2}}}
    })
    assert.deepEqual(scrollRequests, [{start: {row: 8, column: 0}, end: {row: 9, column: 2}}])
  })

  it('does not try to update the scroll position when the host has no cursor', () => {
    const guestEditor = new TextEditor()
    guestEditor.setText(SAMPLE_TEXT)
    guestEditor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor: guestEditor})
    binding.setEditorProxy(new FakeEditorProxy(binding))

    const scrollRequests = []
    guestEditor.onDidRequestAutoscroll(({screenRange}) => scrollRequests.push(screenRange))

    binding.updateSelectionsForSiteId(1, {})
    assert.deepEqual(scrollRequests, [])
  })

  it('overrides the editor methods when setting the proxy, and restores them on dispose', () => {
    const buffer = new TextBuffer({text: SAMPLE_TEXT})
    const editor = new TextEditor({buffer})

    const binding = new EditorBinding({editor, isHost: false})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)
    assert.equal(editor.getTitle(), 'Remote Buffer: fake-buffer-proxy-uri')
    assert.equal(editor.getURI(), '')
    assert.equal(buffer.getPath(), 'remote:fake-buffer-proxy-uri')
    assert(editor.element.classList.contains('realtime-RemotePaneItem'))
    assert(!editor.getBuffer().isModified())

    binding.dispose()
    assert.equal(editor.getTitle(), 'untitled')
    assert.equal(editor.getURI(), null)
    assert.equal(buffer.getPath(), null)
    assert(!editor.element.classList.contains('realtime-RemotePaneItem'))
    assert(editor.getBuffer().isModified())
  })

  function getCursorDecoratedRanges (editor) {
    const {decorationManager} = editor
    const decorationsByMarker = decorationManager.decorationPropertiesByMarkerForScreenRowRange(0, Infinity)
    const markers = []
    for (const [marker, decorations] of decorationsByMarker) {
      const hasCursorDecoration = decorations.some((d) => d.type === 'cursor')
      if (hasCursorDecoration) markers.push(marker)
    }

    return markers.sort((a, b) => a.compare(b)).map(m => {
      return {head: m.getHeadBufferPosition(), tail: m.getTailBufferPosition()}
    })
  }
})

class FakeEditorProxy {
  constructor (delegate) {
    this.delegate = delegate
    this.bufferProxy = {uri: 'fake-buffer-proxy-uri'}
    this.selections = {}
  }

  updateSelections (selectionUpdates) {
    for (const id in selectionUpdates) {
      const selectionUpdate = selectionUpdates[id]
      if (selectionUpdate) {
        this.selections[id] = selectionUpdate
      } else {
        delete this.selections[id]
      }
    }
  }
}
