const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {loadPackageStyleSheets} = require('./helpers/ui-helpers')
const {FollowState, TeletypeClient} = require('@atom/teletype-client')
const GuestPortalBinding = require('../lib/guest-portal-binding')
const SAMPLE_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.js'), 'utf8')
const {
  setEditorHeightInLines,
  setEditorWidthInChars,
  setEditorScrollTopInLines,
  setEditorScrollLeftInChars
} = require('./helpers/editor-helpers')

suite('GuestPortalBinding', () => {
  let attachedElements = []

  teardown(async () => {
    while (attachedElements.length > 0) {
      attachedElements.pop().remove()
    }

    await destroyAtomEnvironments()
  })

  test('handling an unexpected error when joining a portal', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    client.joinPortal = function () {
      throw new Error('It broke!')
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'portal-id')

    const result = await portalBinding.initialize()
    assert.equal(result, false)

    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    const {message, options} = atomEnv.notifications.getNotifications()[0]
    assert.equal(message, 'Failed to join portal')
    assert(options.description.includes('It broke!'))
  })

  test('showing notifications when sites join or leave', async () => {
    const portal = new FakePortal()
    const client = {
      joinPortal () {
        return portal
      }
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'portal-id')
    await portalBinding.initialize()

    atomEnv.notifications.clear()
    portal.delegate.siteDidJoin(2)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-1'))
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-2'))

    atomEnv.notifications.clear()
    portal.delegate.siteDidLeave(3)
    assert.equal(atomEnv.notifications.getNotifications().length, 1)
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-1'))
    assert(atomEnv.notifications.getNotifications()[0].message.includes('@site-3'))
  })

  test('switching the active editor in rapid succession', async () => {
    const stubPubSubGateway = {}
    const client = new TeletypeClient({pubSubGateway: stubPubSubGateway})
    const portal = new FakePortal()
    client.joinPortal = function () {
      return portal
    }
    const atomEnv = buildAtomEnvironment()
    const portalBinding = buildGuestPortalBinding(client, atomEnv, 'some-portal')
    await portalBinding.initialize()

    const activePaneItemChangeEvents = []
    const disposable = atomEnv.workspace.onDidChangeActivePaneItem((item) => {
      activePaneItemChangeEvents.push(item)
    })

    portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-1'))
    portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-2'))
    await portalBinding.updateTether(FollowState.RETRACTED, new FakeEditorProxy('uri-3'))

    assert.deepEqual(
      activePaneItemChangeEvents.map((i) => i.getTitle()),
      ['@site-1: uri-1', '@site-1: uri-2', '@site-1: uri-3']
    )
    assert.deepEqual(
      atomEnv.workspace.getPaneItems().map((i) => i.getTitle()),
      ['@site-1: uri-1', '@site-1: uri-2', '@site-1: uri-3']
    )

    disposable.dispose()
  })

  test('showing the active position of other collaborators', async () => {
    const environment = buildAtomEnvironment()

    loadPackageStyleSheets(environment)
    const {workspace} = environment
    attachToDOM(workspace.getElement())

    const client = {
      joinPortal () {
        return new FakePortal()
      }
    }
    const portalBinding = buildGuestPortalBinding(client, environment, 'some-portal')
    await portalBinding.initialize()

    const editorProxy1 = new FakeEditorProxy('editor-1')
    const editorProxy2 = new FakeEditorProxy('editor-2')
    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy1)

    const editor1 = workspace.getActiveTextEditor()
    editor1.buffer.setTextInRange([[0, 0], [0, 0]], SAMPLE_TEXT, {undo: 'skip'})

    const {
      aboveViewportSitePositionsComponent,
      insideViewportSitePositionsComponent,
      outsideViewportSitePositionsComponent
    } = portalBinding
    assert(workspace.element.contains(aboveViewportSitePositionsComponent.element))
    assert(workspace.element.contains(insideViewportSitePositionsComponent.element))
    assert(workspace.element.contains(outsideViewportSitePositionsComponent.element))

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
    portalBinding.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [1])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [5])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [2, 3, 4, 6])

    await setEditorScrollLeftInChars(editor1, 0)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [1])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [3])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [2, 4, 5, 6])

    await setEditorScrollTopInLines(editor1, 2)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [1, 2, 3, 4, 5, 6])

    await setEditorHeightInLines(editor1, 7)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [3])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [1, 2, 4, 5, 6])

    await setEditorWidthInChars(editor1, 10)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [1, 3, 5])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [2, 4, 6])

    await portalBinding.updateTether(FollowState.RETRACTED, editorProxy2)
    portalBinding.updateActivePositions(activePositionsBySiteId)

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [6])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [1, 2, 3, 4, 5])

    // Selecting a site will follow them.
    outsideViewportSitePositionsComponent.props.onSelectSiteId(2)
    assert.equal(portalBinding.portal.getFollowedSiteId(), 2)

    // Selecting the same site again will unfollow them.
    outsideViewportSitePositionsComponent.props.onSelectSiteId(2)
    assert.equal(portalBinding.portal.getFollowedSiteId(), null)

    // Focusing a pane item that does not belong to the portal will hide site positions.
    await workspace.open()

    assert(!workspace.element.contains(aboveViewportSitePositionsComponent.element))
    assert(!workspace.element.contains(insideViewportSitePositionsComponent.element))
    assert(!workspace.element.contains(outsideViewportSitePositionsComponent.element))

    // Focusing a pane item that belongs to the portal will show site positions again.
    await workspace.open(editor1)
    portalBinding.updateActivePositions(activePositionsBySiteId)

    assert(workspace.element.contains(aboveViewportSitePositionsComponent.element))
    assert(workspace.element.contains(insideViewportSitePositionsComponent.element))
    assert(workspace.element.contains(outsideViewportSitePositionsComponent.element))

    assert.deepEqual(aboveViewportSitePositionsComponent.props.siteIds, [])
    assert.deepEqual(insideViewportSitePositionsComponent.props.siteIds, [1, 3, 5])
    assert.deepEqual(outsideViewportSitePositionsComponent.props.siteIds, [2, 4, 6])
  })

  function buildGuestPortalBinding (client, atomEnv, portalId) {
    return new GuestPortalBinding({
      client,
      portalId,
      notificationManager: atomEnv.notifications,
      workspace: atomEnv.workspace
    })
  }

  function attachToDOM (element) {
    attachedElements.push(element)
    document.body.insertBefore(element, document.body.firstChild)
  }

  class FakeEditorProxy {
    constructor (uri) {
      this.bufferProxy = {
        uri,
        dispose () {},
        setDelegate () {},
        createCheckpoint () {},
        groupChangesSinceCheckpoint () {},
        applyGroupingInterval () {}
      }
    }

    follow () {}

    didScroll () {}

    setDelegate () {}

    updateSelections () {}
  }

  class FakePortal {
    follow (siteId) {
      this.followedSiteId = siteId
    }

    unfollow () {
      this.followedSiteId = null
    }

    getFollowedSiteId () {
      return this.followedSiteId
    }

    activateEditorProxy () {}

    setDelegate (delegate) {
      this.delegate = delegate
    }

    getSiteIdentity (siteId) {
      return {login: 'site-' + siteId}
    }
  }
})
