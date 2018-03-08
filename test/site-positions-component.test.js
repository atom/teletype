const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {TextEditor, TextBuffer} = require('atom')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const FakePortal = require('./helpers/fake-portal')
const FakeEditorProxy = require('./helpers/fake-editor-proxy')
const SitePositionsComponent = require('../lib/site-positions-component')

suite('SitePositionsComponent', () => {
  teardown(async () => {
    await destroyAtomEnvironments()
  })

  test('showing and hiding the component', async () => {
    const {workspace} = buildAtomEnvironment()
    const component = new SitePositionsComponent({
      workspace,
      portal: {},
      editorBindingForEditorProxy: () => {}
    })

    const element1 = document.createElement('div')
    component.show(element1)
    assert(element1.contains(component.element))

    const element2 = document.createElement('div')
    component.show(element2)
    assert(element2.contains(component.element))

    component.hide()
    assert(!component.element.parentElement)
  })

  test('rendering site position avatars', async () => {
    const {workspace} = buildAtomEnvironment()
    const portal = new FakePortal({siteId: 1})
    const component = new SitePositionsComponent({workspace, portal})

    const editorProxy1 = new FakeEditorProxy('editor-1')
    const editor1 = new TextEditor({buffer: new TextBuffer(SAMPLE_TEXT)})

    const editorProxy2 = new FakeEditorProxy('editor-2')
    const editor2 = new TextEditor({buffer: new TextBuffer(SAMPLE_TEXT)}) // eslint-disable-line no-unused-vars

    const element = component.element

    await workspace.open(editor1)

    const positionsBySiteId = {
      1: {editorProxy: editorProxy1, position: {row: 0, column: 0}}, // the local user
      2: {editorProxy: editorProxy1, position: {row: 0, column: 0}}, // a collaborator in the same editor
      3: {editorProxy: editorProxy2, position: {row: 0, column: 0}}, // a collaborator in a different editor
      4: {editorProxy: null, position: null} // a collaborator in a non-portal pane item
    }
    await component.update({positionsBySiteId})

    assert(!element.querySelector('.SitePositionsComponent-site.site-1'))
    assert(element.querySelector('.SitePositionsComponent-site.site-2.viewing-current-editor'))
    assert(element.querySelector('.SitePositionsComponent-site.site-3.viewing-other-editor'))
    assert(element.querySelector('.SitePositionsComponent-site.site-4.viewing-non-portal-item'))

    // Selecting a site will follow them.
    component.onSelectSiteId(42)
    assert.equal(component.props.portal.getFollowedSiteId(), 42)

    // Selecting the same site again will unfollow them.
    component.onSelectSiteId(42)
    assert.equal(component.props.portal.getFollowedSiteId(), null)
  })
})
