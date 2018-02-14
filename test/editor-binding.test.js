const assert = require('assert')
const fs = require('fs')
const path = require('path')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const {TextEditor, TextBuffer, Range} = require('atom')
const EditorBinding = require('../lib/editor-binding')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {loadPackageStyleSheets} = require('./helpers/ui-helpers')
const {
  setEditorHeightInLines,
  setEditorWidthInChars,
  setEditorScrollTopInLines,
  setEditorScrollLeftInChars
} = require('./helpers/editor-helpers')
const {FollowState} = require('@atom/teletype-client')

suite('EditorBinding', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  let attachedElements = []

  setup(() => {
    // Load the editor default styles by instantiating a new AtomEnvironment.
    const environment = buildAtomEnvironment()
    loadPackageStyleSheets(environment)
    // Position editor absolutely to prevent its size from being affected by the
    // window size of the test runner. We also give it an initial width and
    // height so that the editor component can perform initial measurements.
    environment.styles.addStyleSheet(`
      atom-text-editor {
        position: absolute;
        top: 0;
        left: 0;
        width: 50px;
        height: 50px;
      }
    `)
  })

  teardown(async () => {
    if (!global.debugContent) {
      let element
      while (element = attachedElements.pop()) { // eslint-disable-line no-cond-assign
        element.remove()
      }

      await destroyAtomEnvironments()
    }
  })

  test('relays local selections and creates cursor decorations on the local editor based on the remote ones', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor, portal: new FakePortal()})
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

  test('clears remote selections for disconnected remote site', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor, portal: new FakePortal()})
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

  test('clears the tail of remote selection markers when they become empty after an update', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    const originalRemoteSelection = {start: {row: 1, column: 0}, end: {row: 1, column: 5}}
    binding.updateSelectionsForSiteId(2, {1: {range: originalRemoteSelection}})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}}, // local selection
        {tail: {row: 1, column: 0}, head: {row: 1, column: 5}}  // remote selection
      ]
    )

    editor.getBuffer().setTextInRange(originalRemoteSelection, '', {undo: 'skip'})
    const remoteSelectionAfterDelete = {start: {row: 1, column: 0}, end: {row: 1, column: 0}}
    binding.updateSelectionsForSiteId(2, {1: {range: remoteSelectionAfterDelete}})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}}, // local selection
        {tail: {row: 1, column: 0}, head: {row: 1, column: 0}}  // remote selection
      ]
    )

    editor.getBuffer().setTextInRange([remoteSelectionAfterDelete.start, remoteSelectionAfterDelete.start], 'a', {undo: 'skip'})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}}, // local selection
        {tail: {row: 1, column: 1}, head: {row: 1, column: 1}}  // remote selection
      ]
    )
  })

  test('clears the tail of local and remote selection markers when they become empty after a text change', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setSelectedBufferRange([[0, 0], [0, 3]])

    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)
    binding.updateSelectionsForSiteId(2, {
      1: {
        range: {start: {row: 0, column: 0}, end: {row: 0, column: 1}}
      }
    })

    // Ensure tail of remote selections is cleared after they become empty as a
    // result of a local change.
    editor.backspace()
    editor.insertText('ABCDEFGH')
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 8}, head: {row: 0, column: 8}},
        {tail: {row: 0, column: 8}, head: {row: 0, column: 8}}
      ]
    )

    // Ensure tail of local selections is cleared after they become empty as a
    // result of a remote change.
    editor.setSelectedBufferRange([[0, 0], [0, 5]])
    editor.getBuffer().setTextInRange([[0, 0], [0, 5]], '', {undo: 'skip'})
    editor.getBuffer().setTextInRange([[0, 0], [0, 0]], '123', {undo: 'skip'})
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 6}, head: {row: 0, column: 6}},
        {tail: {row: 0, column: 3}, head: {row: 0, column: 3}}
      ]
    )
  })

  test('relays exclusivity but does not apply it to the markers', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    editor.setCursorBufferPosition([0, 0])

    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    // Ensure exclusivity is being relayed. This enables teletype-crdt to resolve
    // logical ranges correctly when the local site performs an insertion right
    // at a remote site cursor position, but before such cursor has been relayed
    // to the local site.
    assert.deepEqual(editorProxy.selections, {
      1: {
        range: editor.getSelectedBufferRange(),
        reversed: false,
        exclusive: true
      }
    })

    // Ensure exclusivity is not overridden on the markers. This is because
    // exclusivity is computed automatically based on whether the marker is
    // empty or not. Overriding it would cause markers to not change their
    // exclusivity if a later text update makes them become empty or non-empty.
    binding.updateSelectionsForSiteId(2, {
      1: {
        range: {start: {row: 0, column: 2}, end: {row: 0, column: 3}},
        reversed: false,
        exclusive: false
      }
    })
    editor.getBuffer().setTextInRange([[0, 1], [0, 4]], '')
    editor.getBuffer().insert([0, 1], 'ABC')
    assert.deepEqual(
      getCursorDecoratedRanges(editor),
      [
        {tail: {row: 0, column: 0}, head: {row: 0, column: 0}},
        {tail: {row: 0, column: 4}, head: {row: 0, column: 4}}
      ]
    )
  })

  test('does not relay local selection changes if the associated marker moves because of a textual change', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)

    const binding = new EditorBinding({editor, portal: new FakePortal()})
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

  test('does not relay selections that are already destroyed when their creation event is emitted', () => {
    const editor = new TextEditor({buffer: new TextBuffer(SAMPLE_TEXT)})
    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    editor.setSelectedBufferRange([[0, 2], [0, 6]])
    editor.addSelectionForBufferRange([[0, 3], [0, 9]])
    assert.deepEqual(editorProxy.selections, {
      1: {
        range: {start: {row: 0, column: 2}, end: {row: 0, column: 9}},
        exclusive: false,
        reversed: false
      }
    })
  })

  suite('guest editor binding', () => {
    test('overrides the editor methods when setting the proxy', () => {
      const buffer = new TextBuffer({text: SAMPLE_TEXT})
      const editor = new TextEditor({buffer})

      const binding = new EditorBinding({editor, portal: new FakePortal(), isHost: false})
      const editorProxy = new FakeEditorProxy(binding)
      binding.setEditorProxy(editorProxy)
      assert.equal(editor.getTitle(), '@site-1: fake-buffer-proxy-uri')
      assert.equal(editor.copy(), null)
      assert.equal(editor.serialize(), null)
      assert.equal(buffer.getPath(), '@site-1:fake-buffer-proxy-uri')
      assert(editor.element.classList.contains('teletype-RemotePaneItem'))
      assert(!editor.getBuffer().isModified())

      editor.save()
      editor.save()
      assert.equal(editorProxy.bufferProxy.saveRequestCount, 2)
    })
  })

  test('decorates each cursor with a site-specific class name', () => {
    const editor = new TextEditor()
    editor.setText(SAMPLE_TEXT)
    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding, {siteId: 2})

    binding.setEditorProxy(editorProxy)
    assert.deepEqual(getCursorClasses(editor), ['ParticipantCursor--site-2'])

    binding.updateSelectionsForSiteId(1, {1: {range: Range([0, 0], [0, 0])}})
    assert.deepEqual(getCursorClasses(editor), ['ParticipantCursor--site-2', 'ParticipantCursor--site-1 non-blinking'])

    binding.updateSelectionsForSiteId(3, {1: {range: Range([0, 0], [0, 0])}})
    assert.deepEqual(getCursorClasses(editor), ['ParticipantCursor--site-2', 'ParticipantCursor--site-1 non-blinking', 'ParticipantCursor--site-3 non-blinking'])

    binding.clearSelectionsForSiteId(1)
    assert.deepEqual(getCursorClasses(editor), ['ParticipantCursor--site-2', 'ParticipantCursor--site-3 non-blinking'])

    binding.dispose()
    assert.deepEqual(getCursorClasses(editor), [])
  })

  test('isScrollNeededToViewPosition(position)', async () => {
    const editor = new TextEditor({autoHeight: false})
    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    // If the editor is not yet attached to the DOM, scrolling isn't gonna help.
    assert(!binding.isScrollNeededToViewPosition({row: 1, column: 0}))
    assert(!binding.isScrollNeededToViewPosition({row: 0, column: 9}))

    attachToDOM(editor.element)
    await setEditorHeightInLines(editor, 4)
    await setEditorWidthInChars(editor, 7)

    editor.setText('a pretty long line\n'.repeat(100))

    assert(!binding.isScrollNeededToViewPosition({row: 1, column: 0}))
    assert(binding.isScrollNeededToViewPosition({row: 0, column: 9}))
    assert(binding.isScrollNeededToViewPosition({row: 6, column: 0}))

    // Ensure text is rendered, so that we can scroll down/right.
    await editor.component.getNextUpdatePromise()

    setEditorScrollTopInLines(editor, 5)
    setEditorScrollLeftInChars(editor, 5)

    assert(!binding.isScrollNeededToViewPosition({row: 6, column: 7}))
    assert(binding.isScrollNeededToViewPosition({row: 6, column: 0}))
    assert(binding.isScrollNeededToViewPosition({row: 3, column: 7}))
  })

  test('destroys folds intersecting the position of the leader', async () => {
    const buffer = new TextBuffer({text: SAMPLE_TEXT})
    const editor = new TextEditor({buffer})
    const binding = new EditorBinding({editor, portal: new FakePortal()})
    const editorProxy = new FakeEditorProxy(binding)
    binding.setEditorProxy(editorProxy)

    editor.foldBufferRange([[5, 4], [6, 12]])
    editor.foldBufferRange([[9, 0], [10, 3]])
    assert(editor.isFoldedAtBufferRow(5))
    assert(editor.isFoldedAtBufferRow(10))

    binding.updateTether(FollowState.RETRACTED, {row: 6, column: 0})
    assert(!editor.isFoldedAtBufferRow(5))
    assert(editor.isFoldedAtBufferRow(10))

    binding.updateTether(FollowState.EXTENDED, {row: 9, column: 1})
    assert(!editor.isFoldedAtBufferRow(5))
    assert(editor.isFoldedAtBufferRow(10))

    binding.updateTether(FollowState.RETRACTED, {row: 9, column: 1})
    assert(!editor.isFoldedAtBufferRow(5))
    assert(!editor.isFoldedAtBufferRow(10))
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

  function getCursorClasses (editor) {
    const {decorationManager} = editor
    const decorationsByMarker = decorationManager.decorationPropertiesByMarkerForScreenRowRange(0, Infinity)
    const cursorDecorations = []
    for (const [marker, decorations] of decorationsByMarker) { // eslint-disable-line no-unused-vars
      let className = ''
      for (const decoration of decorations) {
        if (decoration.type === 'cursor' && decoration.class) {
          className += ' ' + decoration.class
        }
      }

      if (className) cursorDecorations.push(className.slice(1))
    }

    return cursorDecorations
  }

  function attachToDOM (element) {
    attachedElements.push(element)
    document.body.insertBefore(element, document.body.firstChild)
  }
})

class FakeEditorProxy {
  constructor (delegate, {siteId} = {}) {
    this.delegate = delegate
    this.bufferProxy = {
      uri: 'fake-buffer-proxy-uri',
      saveRequestCount: 0,
      requestSave () {
        this.saveRequestCount++
      }
    }
    this.selections = {}
    this.siteId = (siteId == null) ? 1 : siteId
    this.disposed = false
  }

  dispose () {
    this.disposed = true
  }

  didScroll () {}

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

class FakePortal {
  getSiteIdentity (siteId) {
    return {login: 'site-' + siteId}
  }
}
