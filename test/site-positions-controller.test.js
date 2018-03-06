const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {loadPackageStyleSheets} = require('./helpers/ui-helpers')
const {
  setEditorHeightInLines,
  setEditorWidthInChars,
  setEditorScrollTopInLines,
  setEditorScrollLeftInChars
} = require('./helpers/editor-helpers')
const {TextEditor, TextBuffer} = require('atom')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const FakePortal = require('./helpers/fake-portal')

const EditorBinding = require('../lib/editor-binding')
const SitePositionsController = require('../lib/site-positions-controller')

suite('SitePositionsController', () => {
  let attachedElements = []

  teardown(async () => {
    while (attachedElements.length > 0) {
      attachedElements.pop().remove()
    }

    await destroyAtomEnvironments()
  })

  test('show() and hide()', async () => {
    const {workspace} = buildAtomEnvironment()
    const controller = new SitePositionsController({
      workspace,
      portal: {},
      editorBindingForEditorProxy: () => {}
    })

    const element1 = document.createElement('div')
    controller.show(element1)
    assert(element1.contains(controller.sitePositionsComponent.element))

    const element2 = document.createElement('div')
    controller.show(element2)
    assert(element2.contains(controller.sitePositionsComponent.element))

    controller.hide()
    assert(!controller.sitePositionsComponent.element.parentElement)
  })

  test('updateActivePositions(positionsBySiteId)', async () => {
    const environment = buildAtomEnvironment()
    loadPackageStyleSheets(environment)
    const {workspace} = environment
    attachToDOM(workspace.getElement())

    const portal = new FakePortal()
    const controller = new SitePositionsController({workspace, portal})

    const editorProxy1 = new FakeEditorProxy()
    const editor1 = new TextEditor({autoHeight: false, buffer: new TextBuffer(SAMPLE_TEXT)})
    const editorBinding1 = new EditorBinding({portal, editor: editor1})
    editorBinding1.setEditorProxy(editorProxy1)
    controller.addEditorBinding(editorBinding1)

    const editorProxy2 = new FakeEditorProxy()
    const editor2 = new TextEditor({autoHeight: false, buffer: new TextBuffer(SAMPLE_TEXT)})
    const editorBinding2 = new EditorBinding({portal, editor: editor2})
    editorBinding2.setEditorProxy(editorProxy2)
    controller.addEditorBinding(editorBinding2)

    const {sitePositionsComponent} = controller

    await workspace.open(editor1)
    await setEditorHeightInLines(editor1, 3)
    await setEditorWidthInChars(editor1, 5)
    await setEditorScrollTopInLines(editor1, 5)
    await setEditorScrollLeftInChars(editor1, 5)

    const activePositionsBySiteId = {
      1: {editorProxy: editorProxy1, position: {row: 2, column: 5}}, // collaborator above visible area
      2: {editorProxy: editorProxy1, position: {row: 9, column: 5}}, // collaborator below visible area
      3: {editorProxy: editorProxy1, position: {row: 6, column: 1}}, // collaborator to the left of visible area
      4: {editorProxy: editorProxy1, position: {row: 6, column: 15}}, // collaborator to the right of visible area
      5: {editorProxy: editorProxy1, position: {row: 6, column: 6}}, // collaborator inside of visible area
      6: {editorProxy: editorProxy2, position: {row: 0, column: 0}} // collaborator in a different editor
    }
    controller.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(sitePositionsComponent.props.insideEditorSiteIds, [1, 2, 3, 4, 5])
    assert.deepEqual(sitePositionsComponent.props.outsideEditorSiteIds, [6])

    await workspace.open(editor2)
    controller.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(sitePositionsComponent.props.insideEditorSiteIds, [6])
    assert.deepEqual(sitePositionsComponent.props.outsideEditorSiteIds, [1, 2, 3, 4, 5])

    await workspace.open(new TextEditor())
    controller.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(sitePositionsComponent.props.insideEditorSiteIds, [])
    assert.deepEqual(sitePositionsComponent.props.outsideEditorSiteIds, [1, 2, 3, 4, 5, 6])

    await workspace.open(editor1)
    controller.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(sitePositionsComponent.props.insideEditorSiteIds, [1, 2, 3, 4, 5])
    assert.deepEqual(sitePositionsComponent.props.outsideEditorSiteIds, [6])

    // Selecting a site will follow them.
    sitePositionsComponent.props.onSelectSiteId(42)
    assert.equal(controller.portal.getFollowedSiteId(), 42)

    // Selecting the same site again will unfollow them.
    sitePositionsComponent.props.onSelectSiteId(42)
    assert.equal(controller.portal.getFollowedSiteId(), null)
  })

  function attachToDOM (element) {
    attachedElements.push(element)
    document.body.insertBefore(element, document.body.firstChild)
  }
})

class FakeEditorProxy {
  constructor () {
    this.bufferProxy = {uri: 'fake-buffer-proxy-uri'}
  }

  didScroll () {}

  updateSelections () {}
}
