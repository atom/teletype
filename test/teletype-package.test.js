const TeletypePackage = require('../lib/teletype-package')
const {Errors} = require('@atom/teletype-client')
const {TextBuffer, TextEditor} = require('atom')

const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const {loadPackageStyleSheets} = require('./helpers/ui-helpers')
const assert = require('assert')
const condition = require('./helpers/condition')
const deepEqual = require('deep-equal')
const FakeCredentialCache = require('./helpers/fake-credential-cache')
const FakeClipboard = require('./helpers/fake-clipboard')
const FakeStatusBar = require('./helpers/fake-status-bar')
const fs = require('fs')
const path = require('path')
const temp = require('temp').track()

suite('TeletypePackage', function () {
  this.timeout(process.env.TEST_TIMEOUT_IN_MS || 5000)

  let testServer, containerElement, packages

  suiteSetup(async function () {
    const {startTestServer} = require('@atom/teletype-server')
    testServer = await startTestServer({
      databaseURL: 'postgres://localhost:5432/teletype-test'
      // Uncomment and provide credentials to test against Pusher.
      // , pusherCredentials: {
      //   appId: '123',
      //   key: '123',
      //   secret: '123'
      // }
    })
  })

  suiteTeardown(() => {
    return testServer.stop()
  })

  setup(() => {
    packages = []
    containerElement = document.createElement('div')
    document.body.appendChild(containerElement)

    return testServer.reset()
  })

  teardown(async () => {
    containerElement.remove()

    for (const pack of packages) {
      await pack.deactivate()
    }
    await destroyAtomEnvironments()
  })

  test('sharing and joining a portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)

    // Ensure we don't emit an add event more than once for a given guest editor
    const observedGuestItems = new Set()
    guestEnv.workspace.onDidAddPaneItem(({item}) => {
      assert(!observedGuestItems.has(item))
      observedGuestItems.add(item)
    })

    const portalId = (await hostPackage.sharePortal()).id

    guestPackage.joinPortal(portalId)

    const hostEditor1 = await hostEnv.workspace.open(temp.path({extension: '.js'}))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])

    let guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor1.getText(), 'const hello = "world"')
    assert(!guestEditor1.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))

    hostEditor1.setSelectedBufferRanges([
      [[0, 0], [0, 2]],
      [[0, 4], [0, 6]]
    ])
    guestEditor1.setSelectedBufferRanges([
      [[0, 1], [0, 3]],
      [[0, 5], [0, 7]]
    ])
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))
    await timeout(guestPackage.tetherDisconnectWindow)

    const hostEditor2 = await hostEnv.workspace.open(temp.path({extension: '.md'}))
    hostEditor2.setText('# Hello, World')
    hostEditor2.setCursorBufferPosition([0, 2])

    const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor2.getText(), '# Hello, World')
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor2), getCursorDecoratedRanges(guestEditor2)))

    hostEnv.workspace.paneForItem(hostEditor1).activateItem(hostEditor1)
    guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor1.getText(), 'const hello = "world"')
    assert(!guestEditor1.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))

    assert.equal(observedGuestItems.size, 2)
  })

  suite('remote editor URIs', () => {
    test('opening URIs for editors that the guest has already seen', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const portal = await hostPackage.sharePortal()
      await guestPackage.joinPortal(portal.id)

      const hostEditor = await hostEnv.workspace.open(path.join(temp.path(), 'a.md'))
      hostEditor.setText('some text')
      await hostEnv.workspace.open(path.join(temp.path(), 'b.txt'))
      await condition(() => getRemotePaneItems(guestEnv).length === 2)

      let guestEditor = guestEnv.workspace.getPaneItems()[0]
      const editorURI = guestEditor.getURI()
      guestEditor.destroy()

      guestEditor = await guestEnv.workspace.open(editorURI)
      assert(guestEditor.getTitle().endsWith('a.md'))
      assert.equal(guestEditor.getURI(), editorURI)
      assert.equal(guestEditor.getText(), 'some text')

      guestEditor.insertText('abc')
      await condition(() => hostEditor.getText() === guestEditor.getText())
    })

    test('opening URIs for editors that the guest has not yet seen', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const portal = await hostPackage.sharePortal()
      const hostEditor = await hostEnv.workspace.open(path.join(temp.path(), 'a.md'))
      const hostEditorProxy = portal.activeEditorProxyForSiteId(1)
      const hostEditorURI = `atom://teletype/portal/${portal.id}/editor/${hostEditorProxy.id}`
      hostEditor.setText('some text')

      await hostEnv.workspace.open(path.join(temp.path(), 'b.txt'))

      guestPackage.joinPortal(portal.id)
      await condition(() => getRemotePaneItems(guestEnv).length === 1)

      const guestEditor = await guestEnv.workspace.open(hostEditorURI)
      assert(guestEditor.getTitle().endsWith('a.md'))
      assert.equal(guestEditor.getURI(), hostEditorURI)
      assert.equal(guestEditor.getText(), 'some text')

      guestEditor.insertText('abc')
      await condition(() => hostEditor.getText() === guestEditor.getText())
    })

    test('opening URIs for editors that do not exist in the portal', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const portal = await hostPackage.sharePortal()
      await guestPackage.joinPortal(portal.id)

      const nonexistentEditorURI = `atom://teletype/portal/${portal.id}/editor/999`
      assert.equal(await guestEnv.workspace.open(nonexistentEditorURI), null)
    })

    test('opening URIs when not signed in', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv, {signIn: false}) // eslint-disable-line no-unused-vars

      const portal = await hostPackage.sharePortal()
      await hostEnv.workspace.open()
      const hostEditorProxy = portal.activeEditorProxyForSiteId(1)
      const hostEditorURI = `atom://teletype/portal/${portal.id}/editor/${hostEditorProxy.id}`
      assert.equal(await guestEnv.workspace.open(hostEditorURI), null)
    })

    test('opening malformed URIs', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const portal = await hostPackage.sharePortal()
      await guestPackage.joinPortal(portal.id)

      assert.equal(await guestEnv.workspace.open('atom://teletype/'), null)
      assert.equal(await guestEnv.workspace.open('atom://teletype///'), null)

      await hostEnv.workspace.open()
      const editorProxy = portal.activeEditorProxyForSiteId(1)
      assert.equal(
        await guestEnv.workspace.open(`atom://teletype/x/${portal.id}/y/${editorProxy.id}`),
        null
      )
    })
  })

  test('opening and closing multiple editors on the host', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    guestPackage.joinPortal(portalId)

    const hostEditor1 = await hostEnv.workspace.open()
    const guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(getPaneItems(guestEnv).length, 1)

    const hostEditor2 = await hostEnv.workspace.open()
    const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv) // eslint-disable-line no-unused-vars
    assert.equal(getPaneItems(guestEnv).length, 2)

    hostEnv.workspace.paneForItem(hostEditor1).activateItem(hostEditor1)
    assert.equal(await getNextActiveTextEditorPromise(guestEnv), guestEditor1)
    assert.equal(getPaneItems(guestEnv).length, 2)

    hostEditor1.destroy()
    await condition(() => getPaneItems(guestEnv).length === 1)

    hostEditor2.destroy()
    await condition(() => getPaneItems(guestEnv).length === 0)

    await hostEnv.workspace.open()
    const guestEditor3 = await getNextRemotePaneItemPromise(guestEnv)
    assert(guestEditor3 instanceof TextEditor)
    assert.equal(getPaneItems(guestEnv).length, 1)
  })

  test('host joining another portal as a guest', async () => {
    const hostAndGuestEnv = buildAtomEnvironment()
    const hostAndGuestPackage = await buildPackage(hostAndGuestEnv)
    const guestOnlyEnv = buildAtomEnvironment()
    const guestOnlyPackage = await buildPackage(guestOnlyEnv)
    const hostOnlyEnv = buildAtomEnvironment()
    const hostOnlyPackage = await buildPackage(hostOnlyEnv)

    // Start out as a host sharing a portal with a guest (Portal 1)
    const portal1Id = (await hostAndGuestPackage.sharePortal()).id
    await guestOnlyPackage.joinPortal(portal1Id)
    const hostAndGuestLocalEditor = await hostAndGuestEnv.workspace.open(path.join(temp.path(), 'host+guest'))
    const guestOnlyRemotePaneItem1 = await getNextRemotePaneItemPromise(guestOnlyEnv)
    assert(guestOnlyRemotePaneItem1 instanceof TextEditor)
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])

    // While already hosting Portal 1, join Portal 2 as a guest
    const portal2Id = (await hostOnlyPackage.sharePortal()).id
    hostAndGuestPackage.joinPortal(portal2Id)
    hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only'))
    const hostAndGuestRemotePaneItem = await getNextRemotePaneItemPromise(hostAndGuestEnv)
    await condition(() => deepEqual(getPaneItems(hostAndGuestEnv), [hostAndGuestLocalEditor, hostAndGuestRemotePaneItem]))

    // No transitivity: When Portal 1 host is viewing contents of Portal 2, Portal 1 guests are placed on hold
    assert.equal(hostAndGuestEnv.workspace.getActivePaneItem(), hostAndGuestRemotePaneItem)
    await condition(() => deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1]))
  })

  test('guest sharing another portal as a host', async () => {
    const guestAndHostEnv = buildAtomEnvironment()
    const guestAndHostPackage = await buildPackage(guestAndHostEnv)
    const hostOnlyEnv = buildAtomEnvironment()
    const hostOnlyPackage = await buildPackage(hostOnlyEnv)
    const guestOnlyEnv = buildAtomEnvironment()
    const guestOnlyPackage = await buildPackage(guestOnlyEnv)

    // Start out as a guest in another user's portal (Portal 1)
    const portal1Id = (await hostOnlyPackage.sharePortal()).id
    const guestAndHostPortal1 = await guestAndHostPackage.joinPortal(portal1Id)
    hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-1'))
    const guestAndHostRemotePaneItem1 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1])

    // While already participating as a guest in Portal 1, share a new portal as a host (Portal 2)
    const guestAndHostLocalEditor1 = await guestAndHostEnv.workspace.open(path.join(temp.path(), 'host+guest-buffer-1'))
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1, guestAndHostLocalEditor1])
    const portal2Id = (await guestAndHostPackage.sharePortal()).id
    guestOnlyPackage.joinPortal(portal2Id)
    const guestOnlyRemotePaneItem1 = await getNextRemotePaneItemPromise(guestOnlyEnv)
    assert(guestOnlyRemotePaneItem1 instanceof TextEditor)
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])
    guestAndHostPortal1.follow(1) // reconnect tether after disconnecting it due to opening a local editor.

    // Portal 2 host continues to exist as a guest in Portal 1
    hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-2'))
    const guestAndHostRemotePaneItem2 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1, guestAndHostRemotePaneItem2, guestAndHostLocalEditor1])
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])

    // No transitivity: When Portal 2 host is viewing contents of Portal 1, Portal 2 guests can only see contents of Portal 2
    guestAndHostEnv.workspace.getActivePane().activateItemAtIndex(0)
    assert.equal(guestAndHostEnv.workspace.getActivePaneItem(), guestAndHostRemotePaneItem1)
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])
    guestAndHostPortal1.follow(1) // reconnect tether after disconnecting it due to switching to a different editor.

    // As Portal 2 host observes changes in Portal 1, Portal 2 guests continue to only see contents of Portal 2
    await hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-3'))
    const guestAndHostRemotePaneItem3 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1, guestAndHostRemotePaneItem2, guestAndHostRemotePaneItem3, guestAndHostLocalEditor1])
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])

    // When Portal 2 host shares another local buffer, Portal 2 guests see that buffer
    await guestAndHostEnv.workspace.open(path.join(temp.path(), 'host+guest-buffer-2'))
    const guestOnlyRemotePaneItem2 = await getNextRemotePaneItemPromise(guestOnlyEnv)
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1, guestOnlyRemotePaneItem2])
  })

  test('host attempting to share another portal', async () => {
    const hostPackage = await buildPackage(buildAtomEnvironment())

    const portal1Id = (await hostPackage.sharePortal()).id
    const portal2Id = (await hostPackage.sharePortal()).id
    assert.equal(portal1Id, portal2Id)

    await hostPackage.closeHostPortal()

    const portal3Id = (await hostPackage.sharePortal()).id
    assert.notEqual(portal3Id, portal1Id)
  })

  test('prompting for an auth token', async () => {
    testServer.identityProvider.setIdentitiesByToken({
      'invalid-token': null,
      'valid-token': {login: 'defunkt'}
    })

    const env = buildAtomEnvironment()
    // Ensure errors make the test fail instead of showing a notification.
    env.notifications.addError = (message) => { throw new Error(message) }

    const pack = await buildPackage(env, {signIn: false})
    await pack.consumeStatusBar(new FakeStatusBar())

    // Show popover when running the "Share Portal" command, but prevent sharing unless user is authenticated.
    assert(!pack.portalStatusBarIndicator.isPopoverVisible())
    assert(!await pack.sharePortal())
    assert(pack.portalStatusBarIndicator.isPopoverVisible())

    // Show popover when running the "Join Portal" command, but prevent sharing unless user is authenticated.
    pack.portalStatusBarIndicator.hidePopover()
    assert(!pack.portalStatusBarIndicator.isPopoverVisible())
    assert(!await pack.joinPortal('some-portal-id'))
    assert(pack.portalStatusBarIndicator.isPopoverVisible())

    const {popoverComponent} = pack.portalStatusBarIndicator
    assert(popoverComponent.refs.signInComponent)
    assert(!popoverComponent.refs.portalListComponent)

    // Enter an invalid token and wait for error message to appear.
    popoverComponent.refs.signInComponent.refs.editor.setText('invalid-token')
    popoverComponent.refs.signInComponent.signIn()
    await condition(() => (
      popoverComponent.refs.signInComponent.props.invalidToken &&
      popoverComponent.refs.signInComponent.refs.editor.getText() === '' &&
      popoverComponent.refs.signInComponent.refs.loginButton.disabled
    ))
    assert.equal(await pack.credentialCache.get('oauth-token'), null)
    assert(!env.workspace.element.classList.contains('teletype-Authenticated'))

    // Show portal list component after entering a valid token.
    popoverComponent.refs.signInComponent.refs.editor.setText('valid-token')
    popoverComponent.refs.signInComponent.signIn()
    await condition(() => (
      !popoverComponent.refs.signInComponent &&
      popoverComponent.refs.portalListComponent
    ))
    assert.equal(await pack.credentialCache.get('oauth-token'), 'valid-token')
    assert(env.workspace.element.classList.contains('teletype-Authenticated'))

    // Go back to sign in component after signing out.
    pack.portalStatusBarIndicator.hidePopover()
    pack.signOut()
    await condition(() => (
      popoverComponent.refs.signInComponent &&
      !popoverComponent.refs.portalListComponent
    ))
    assert(pack.portalStatusBarIndicator.isPopoverVisible())
    assert.equal(await pack.credentialCache.get('oauth-token'), null)
    assert(!env.workspace.element.classList.contains('teletype-Authenticated'))
  })

  test('prompting for a portal ID when joining', async () => {
    const pack = await buildPackage(buildAtomEnvironment())
    await pack.consumeStatusBar(new FakeStatusBar())

    assert(!pack.portalStatusBarIndicator.isPopoverVisible())
    await pack.joinPortal()
    assert(pack.portalStatusBarIndicator.isPopoverVisible())

    const {popoverComponent} = pack.portalStatusBarIndicator
    const {portalListComponent} = popoverComponent.refs
    const {joinPortalComponent} = portalListComponent.refs
    const {portalIdEditor} = joinPortalComponent.refs
    assert(portalIdEditor.element.contains(document.activeElement))
  })

  test('joining the same portal more than once', async () => {
    const host1Env = buildAtomEnvironment()
    const host1Package = await buildPackage(host1Env)
    const host2Env = buildAtomEnvironment()
    const host2Package = await buildPackage(host2Env)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)

    await host1Env.workspace.open(path.join(temp.path(), 'host-1'))
    const portal1 = await host1Package.sharePortal()

    await host2Env.workspace.open(path.join(temp.path(), 'host-2'))
    const portal2 = await host2Package.sharePortal()

    const guestEditor1Pane = guestEnv.workspace.getActivePane()
    guestPackage.joinPortal(portal1.id)
    guestPackage.joinPortal(portal1.id)
    const guestEditor1 = await getNextRemotePaneItemPromise(guestEnv)
    assert.deepEqual(getPaneItems(guestEnv), [guestEditor1])

    const guestEditor2Pane = guestEditor1Pane.splitRight()
    guestPackage.joinPortal(portal2.id)
    const guestEditor2 = await getNextRemotePaneItemPromise(guestEnv)
    assert.deepEqual(getPaneItems(guestEnv), [guestEditor1, guestEditor2])

    assert.equal(guestEnv.workspace.getActivePaneItem(), guestEditor2)
    assert.equal(guestEnv.workspace.getActivePane(), guestEditor2Pane)

    guestPackage.joinPortal(portal1.id)
    await condition(() => guestEnv.workspace.getActivePaneItem() === guestEditor1)
    assert.deepEqual(guestEnv.workspace.getPaneItems(), [guestEditor1, guestEditor2])
  })

  test('indicating portal status via status bar icon', async () => {
    const isTransmitting = function (statusBar) {
      return statusBar.getRightTiles()[0].item.element.classList.contains('transmitting')
    }

    const host1Env = buildAtomEnvironment()
    const host1Package = await buildPackage(host1Env)
    const host1StatusBar = new FakeStatusBar()
    await host1Package.consumeStatusBar(host1StatusBar)
    assert(!isTransmitting(host1StatusBar))

    const host1Portal = await host1Package.sharePortal()
    await host1Env.workspace.open()
    await condition(() => isTransmitting(host1StatusBar))

    const host2Env = buildAtomEnvironment()
    const host2Package = await buildPackage(host2Env)
    const host2Portal = await host2Package.sharePortal()
    await host2Env.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const guestStatusBar = new FakeStatusBar()
    await guestPackage.consumeStatusBar(guestStatusBar)
    assert(!isTransmitting(guestStatusBar))

    guestPackage.joinPortal(host1Portal.id)
    await condition(() => isTransmitting(guestStatusBar))
    await guestPackage.joinPortal(host2Portal.id)
    assert(isTransmitting(guestStatusBar))

    await guestPackage.leavePortal()
    assert(isTransmitting(guestStatusBar))

    await guestPackage.leavePortal()
    await condition(() => !isTransmitting(guestStatusBar))

    await host1Package.closeHostPortal()
    await condition(() => !isTransmitting(host1StatusBar))
  })

  test('attempting to join a nonexistent portal', async () => {
    const pack = await buildPackage(buildAtomEnvironment())
    const notifications = []
    pack.notificationManager.onDidAddNotification((n) => notifications.push(n))

    await pack.joinPortal('some-nonexistent-portal-id')
    const errorNotification = notifications.find((n) => n.message === 'Portal not found')
    assert(errorNotification, 'Expected notifications to include "Portal not found" error')
  })

  suite('guest leaving portal', () => {
    test('via explicit leave action', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      const portal = await hostPackage.sharePortal()
      await guestPackage.joinPortal(portal.id)

      await hostEnv.workspace.open()
      await hostEnv.workspace.open()
      await hostEnv.workspace.open()
      await condition(() => getPaneItems(guestEnv).length === 3)

      await guestPackage.leavePortal()
      await condition(() => getPaneItems(guestEnv).length === 0)
    })
  })

  test('host closing portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const hostPortal = await hostPackage.sharePortal()

    guestPackage.joinPortal(hostPortal.id)
    await hostEnv.workspace.open()
    await condition(() => getRemotePaneItems(guestEnv).length === 1)

    hostPackage.closeHostPortal()
    await condition(() => getRemotePaneItems(guestEnv).length === 0)
  })

  test('host losing connection', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)

    guestPackage.joinPortal(hostPortal.id)
    await hostEnv.workspace.open()
    await condition(() => getRemotePaneItems(guestEnv).length === 1)

    hostPortal.peerPool.disconnect()
    await condition(() => getRemotePaneItems(guestEnv).length === 0)
  })

  test('host disconnecting while there is an active shared editor', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const hostPortal = await hostPackage.sharePortal()
    await guestPackage.joinPortal(hostPortal.id)

    await hostEnv.workspace.open()
    await getNextActiveTextEditorPromise(guestEnv)

    await hostEnv.workspace.open()
    await getNextActiveTextEditorPromise(guestEnv)

    hostPackage.closeHostPortal()
    await condition(() => getRemotePaneItems(guestEnv).length === 0)
  })

  test('peers undoing their own edits', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const hostEditor = await hostEnv.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    hostEditor.insertText('h1 ')
    await condition(() => guestEditor.getText() === 'h1 ')
    guestEditor.insertText('g1 ')
    await condition(() => hostEditor.getText() === 'h1 g1 ')
    hostEditor.insertText('h2 ')
    await condition(() => guestEditor.getText() === 'h1 g1 h2 ')
    guestEditor.insertText('g2')
    guestEditor.setTextInBufferRange([[0, 3], [0, 5]], 'g3')
    await condition(() => hostEditor.getText() === 'h1 g3 h2 g2')

    guestEditor.undo()
    assert.equal(guestEditor.getText(), 'h1 g1 h2 g2')
    await condition(() => hostEditor.getText() === 'h1 g1 h2 g2')

    hostEditor.undo()
    assert.equal(hostEditor.getText(), 'h1 g1 g2')
    await condition(() => guestEditor.getText() === 'h1 g1 g2')

    guestEditor.redo()
    assert.equal(guestEditor.getText(), 'h1 g3 g2')
    await condition(() => hostEditor.getText() === 'h1 g3 g2')

    hostEditor.redo()
    assert.equal(hostEditor.getText(), 'h1 g3 h2 g2')
    await condition(() => guestEditor.getText() === 'h1 g3 h2 g2')

    guestEditor.undo()
    assert.equal(guestEditor.getText(), 'h1 g1 h2 g2')
    await condition(() => hostEditor.getText() === 'h1 g1 h2 g2')

    guestEditor.undo()
    assert.equal(guestEditor.getText(), 'h1 g1 h2 ')
    await condition(() => hostEditor.getText() === 'h1 g1 h2 ')
  })

  test('preserving the history when sharing and closing a portal', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostEditor = await hostEnv.workspace.open()
    hostEditor.insertText('h1 ')
    hostEditor.insertText('h2 ')
    hostEditor.insertText('h3 ')
    hostEditor.undo()
    hostEditor.undo()
    const hostPortal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)
    await editorsEqual(guestEditor, hostEditor)

    hostEditor.redo()
    hostEditor.redo()
    assert.equal(hostEditor.getText(), 'h1 h2 h3 ')
    await editorsEqual(guestEditor, hostEditor)

    hostEditor.insertText('h4')
    assert.equal(hostEditor.getText(), 'h1 h2 h3 h4')

    hostEditor.undo()
    hostEditor.undo()
    assert.equal(hostEditor.getText(), 'h1 h2 ')
    await editorsEqual(guestEditor, hostEditor)

    await hostPackage.closeHostPortal()
    hostEditor.redo()
    hostEditor.redo()
    assert.equal(hostEditor.getText(), 'h1 h2 h3 h4')
    hostEditor.undo()
    hostEditor.undo()
    hostEditor.undo()
    assert.equal(hostEditor.getText(), 'h1 ')
  })

  test('undoing and redoing past the history boundaries', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()

    const hostBuffer = new TextBuffer('abcdefg')
    const hostEditor = new TextEditor({buffer: hostBuffer})
    await hostEnv.workspace.open(hostEditor)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    hostEditor.undo()
    assert.equal(hostEditor.getText(), 'abcdefg')

    guestEditor.undo()
    assert.equal(guestEditor.getText(), 'abcdefg')

    guestEditor.redo()
    assert.equal(guestEditor.getText(), 'abcdefg')

    hostEditor.redo()
    assert.equal(hostEditor.getText(), 'abcdefg')
  })

  test('checkpoints', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostEditor = await hostEnv.workspace.open()
    hostEditor.setText('abcdefg')
    const portal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    guestPackage.joinPortal(portal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    const checkpoint = hostEditor.createCheckpoint()
    hostEditor.setCursorBufferPosition([0, 7])
    hostEditor.insertText('h')
    hostEditor.insertText('i')
    hostEditor.insertText('j')
    assert.equal(hostEditor.getText(), 'abcdefghij')
    await editorsEqual(hostEditor, guestEditor)

    const changesSinceCheckpoint = hostEditor.getBuffer().getChangesSinceCheckpoint(checkpoint)
    assert.equal(changesSinceCheckpoint.length, 1)
    assert.deepEqual(changesSinceCheckpoint[0].oldRange, {start: {row: 0, column: 7}, end: {row: 0, column: 7}})
    assert.deepEqual(changesSinceCheckpoint[0].oldText, '')
    assert.deepEqual(changesSinceCheckpoint[0].newRange, {start: {row: 0, column: 7}, end: {row: 0, column: 10}})
    assert.deepEqual(changesSinceCheckpoint[0].newText, 'hij')

    hostEditor.revertToCheckpoint(checkpoint)
    assert.equal(hostEditor.getText(), 'abcdefg')
    await editorsEqual(hostEditor, guestEditor)
  })

  test('reloading a shared editor', async () => {
    const env = buildAtomEnvironment()
    const pack = await buildPackage(env)
    await pack.sharePortal()

    const filePath = path.join(temp.path(), 'standalone.js')
    const editor = await env.workspace.open(filePath)
    editor.setText('hello world!')
    await env.workspace.getActiveTextEditor().save()
    fs.writeFileSync(filePath, 'goodbye world.')
    await env.workspace.getActiveTextEditor().getBuffer().reload()
    assert.equal(editor.getText(), 'goodbye world.')
    editor.undo()
    assert.equal(editor.getText(), 'hello world!')
  })

  test('history serialization', async () => {
    let serializedEnvironment

    {
      const env = buildAtomEnvironment()
      const pack = await buildPackage(env)
      await pack.sharePortal()

      const editor = await env.workspace.open()
      editor.insertText('a')
      editor.insertText('b')
      editor.insertText('c')

      serializedEnvironment = env.serialize({isUnloading: true})
    }

    {
      const env = buildAtomEnvironment()
      await env.deserialize(serializedEnvironment)

      const editor = env.workspace.getActiveTextEditor()
      assert.equal(editor.getText(), 'abc')

      editor.undo()
      assert.equal(editor.getText(), 'ab')

      editor.redo()
      assert.equal(editor.getText(), 'abc')
    }
  })

  suite('host splitting editors', async () => {
    test('supporting distinct selections per editor with a shared undo stack for the buffer', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const portal = await hostPackage.sharePortal()

      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      guestPackage.joinPortal(portal.id)

      const hostEditor1 = await hostEnv.workspace.open()
      hostEditor1.setText('hello = "world"')
      hostEditor1.setCursorBufferPosition([0, 0])
      hostEditor1.insertText('const ')

      hostEnv.workspace.paneForItem(hostEditor1).splitRight({copyActiveItem: true})
      const hostEditor2 = hostEnv.workspace.getActiveTextEditor()
      hostEditor2.setCursorBufferPosition([0, 8])

      assert.equal(hostEditor2.getBuffer(), hostEditor1.getBuffer())

      const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv)
      guestEditor2.setCursorBufferPosition([0, Infinity])
      guestEditor2.insertText('\nconst goodbye = "moon"')
      await editorsEqual(guestEditor2, hostEditor2)
      await timeout(guestPackage.tetherDisconnectWindow)

      hostEditor2.undo()
      assert.equal(hostEditor2.getText(), 'hello = "world"\nconst goodbye = "moon"')
      assert.equal(hostEditor1.getText(), hostEditor2.getText())
      await editorsEqual(hostEditor2, guestEditor2)

      hostEnv.workspace.paneForItem(hostEditor1).activate()
      const guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
      assert.equal(guestEditor1.getBuffer(), guestEditor2.getBuffer())
      await editorsEqual(guestEditor1, hostEditor1)

      guestEditor1.undo()
      assert.equal(guestEditor1.getText(), 'hello = "world"')
      assert.equal(guestEditor2.getText(), guestEditor1.getText())
      await editorsEqual(guestEditor1, hostEditor1)
    })

    test('remotifying guest editors and buffers', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const portal = await hostPackage.sharePortal()

      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      guestPackage.joinPortal(portal.id)

      const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'a.txt'))
      const guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)

      hostEnv.workspace.paneForItem(hostEditor1).splitRight({copyActiveItem: true})
      const hostEditor2 = hostEnv.workspace.getActiveTextEditor()
      const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv)

      assert.deepEqual(getPaneItems(guestEnv), [guestEditor1, guestEditor2])
      assert(guestEditor1.isRemote)
      assert(guestEditor1.getTitle().endsWith('a.txt'))
      assert(guestEditor1.getBuffer().getPath().endsWith('a.txt'))
      assert(guestEditor2.isRemote)
      assert(guestEditor2.getTitle().endsWith('a.txt'))
      assert(guestEditor2.getBuffer().getPath().endsWith('a.txt'))

      hostEditor2.destroy()
      await condition(() => deepEqual(getPaneItems(guestEnv), [guestEditor1]))

      assert(guestEditor1.isRemote)
      assert(guestEditor1.getTitle().endsWith('a.txt'))
      assert(guestEditor1.getBuffer().getPath().endsWith('a.txt'))
    })
  })

  test('propagating nested marker layer updates that depend on text updates in a nested transaction', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const hostEditor = await hostEnv.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    hostEditor.transact(() => {
      hostEditor.setText('abc\ndef')
      hostEditor.transact(() => {
        hostEditor.setCursorBufferPosition([1, 2])
      })
    })

    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor), getCursorDecoratedRanges(guestEditor)))
  })

  suite('tethering', () => {
    test('guest following host', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const hostPortal = await hostPackage.sharePortal()
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      const hostEditor1 = await hostEnv.workspace.open()
      hostEditor1.setText(('x'.repeat(30) + '\n').repeat(30))
      hostEditor1.setCursorBufferPosition([2, 2])

      const hostEditor2 = await hostEnv.workspace.open()
      hostEditor2.setText(('y'.repeat(30) + '\n').repeat(30))
      hostEditor2.setCursorBufferPosition([2, 2])

      await condition(() => guestEnv.workspace.getTextEditors().length === 2)

      await verifyTetheringRules({
        leaderEnv: hostEnv,
        leaderPortal: hostPortal,
        followerEnv: guestEnv,
        followerPortal: guestPortal
      })
    })

    test('host following guest', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)

      const hostPortal = await hostPackage.sharePortal()
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      const hostEditor1 = await hostEnv.workspace.open()
      hostEditor1.setText(('x'.repeat(30) + '\n').repeat(30))
      hostEditor1.setCursorBufferPosition([2, 2])

      const hostEditor2 = await hostEnv.workspace.open()
      hostEditor2.setText(('y'.repeat(30) + '\n').repeat(30))
      hostEditor2.setCursorBufferPosition([2, 2])

      await condition(() => guestEnv.workspace.getTextEditors().length === 2)

      await verifyTetheringRules({
        leaderEnv: guestEnv,
        leaderPortal: guestPortal,
        followerEnv: hostEnv,
        followerPortal: hostPortal
      })
    })

    test('guest following guest', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)

      const guest1Env = buildAtomEnvironment()
      const guest1Package = await buildPackage(guest1Env)

      const guest2Env = buildAtomEnvironment()
      const guest2Package = await buildPackage(guest2Env)

      const hostPortal = await hostPackage.sharePortal()
      const guest1Portal = await guest1Package.joinPortal(hostPortal.id)
      const guest2Portal = await guest2Package.joinPortal(hostPortal.id)

      const hostEditor1 = await hostEnv.workspace.open()
      hostEditor1.setText(('x'.repeat(30) + '\n').repeat(30))
      hostEditor1.setCursorBufferPosition([2, 2])

      const hostEditor2 = await hostEnv.workspace.open()
      hostEditor2.setText(('y'.repeat(30) + '\n').repeat(30))
      hostEditor2.setCursorBufferPosition([2, 2])

      await condition(() => guest1Env.workspace.getTextEditors().length === 2)
      await condition(() => guest2Env.workspace.getTextEditors().length === 2)

      await verifyTetheringRules({
        leaderEnv: guest1Env,
        leaderPortal: guest1Portal,
        followerEnv: guest2Env,
        followerPortal: guest2Portal
      })
    })

    async function verifyTetheringRules ({leaderEnv, leaderPortal, followerEnv, followerPortal}) {
      // Setup DOM for follower's workspace.
      loadPackageStyleSheets(followerEnv)
      const followerWorkspaceElement = followerEnv.views.getView(followerEnv.workspace)
      followerWorkspaceElement.style.height = '100px'
      followerWorkspaceElement.style.width = '250px'
      containerElement.appendChild(followerWorkspaceElement)

      const leaderEditors = leaderEnv.workspace.getTextEditors()
      const followerEditors = followerEnv.workspace.getTextEditors()

      // Reset follow state.
      leaderPortal.unfollow()
      followerPortal.unfollow()

      // Jump to leader cursor and follow it as it moves.
      leaderEnv.workspace.getActivePane().activateItem(leaderEditors[0])
      followerPortal.follow(leaderPortal.siteId)
      await condition(() => (
        followerEnv.workspace.getActivePaneItem() === followerEditors[0] &&
        deepEqual(followerEditors[0].getCursorBufferPosition(), leaderEditors[0].getCursorBufferPosition())
      ))

      leaderEditors[0].setCursorBufferPosition([3, 3])
      await condition(() => deepEqual(followerEditors[0].getCursorBufferPosition(), leaderEditors[0].getCursorBufferPosition()))

      // When followers move their cursor, their cursor does not follow the
      // leader's cursor so long as the leader's cursor stays within the
      // follower's viewport.
      followerEditors[0].setCursorBufferPosition([2, 10])
      leaderEditors[0].setCursorBufferPosition([3, 5])
      leaderEditors[0].insertText('Y')
      await condition(() => followerEditors[0].lineTextForBufferRow(3).includes('Y'))
      assert(followerEditors[0].getCursorBufferPosition().isEqual([2, 10]))

      // When the leader moves their cursor out of the follower's viewport, the
      // follower's cursor moves to the same position if the unfollow period
      // has elapsed.
      await timeout(followerPortal.tetherDisconnectWindow)
      leaderEditors[0].setCursorBufferPosition([20, 10])
      await condition(() => deepEqual(followerEditors[0].getCursorBufferPosition(), leaderEditors[0].getCursorBufferPosition()))

      // If the leader moves to non-visible columns (not just rows), we update
      // the tether.
      await condition(() => followerEditors[0].getFirstVisibleScreenRow() > 0)
      followerEditors[0].setCursorBufferPosition([20, 9])
      await timeout(followerPortal.tetherDisconnectWindow)
      leaderEditors[0].setCursorBufferPosition([20, 30])
      await condition(() => deepEqual(followerEditors[0].getCursorBufferPosition(), leaderEditors[0].getCursorBufferPosition()))

      // Disconnect tether if leader's cursor position moves within the tether
      // disconnect window.
      followerEditors[0].setCursorBufferPosition([20, 29])
      leaderEditors[0].setCursorBufferPosition([0, 0])
      leaderEditors[0].insertText('Y')
      await condition(() => followerEditors[0].lineTextForBufferRow(0).includes('Y'))
      assert(followerEditors[0].getCursorBufferPosition().isEqual([20, 29]))
      await timeout(followerPortal.tetherDisconnectWindow)
      leaderEditors[0].setCursorBufferPosition([1, 0])
      leaderEditors[0].insertText('Y')
      await condition(() => followerEditors[0].lineTextForBufferRow(1).includes('Y'))
      assert(followerEditors[0].getCursorBufferPosition().isEqual([20, 29]))

      // When re-following, ensure that you are taken to the leader's current tab.
      leaderEnv.workspace.paneForItem(leaderEditors[1]).activateItem(leaderEditors[1])
      followerPortal.follow(leaderPortal.siteId)

      await condition(() => deepEqual(followerEditors[1].getCursorBufferPosition(), leaderEditors[1].getCursorBufferPosition()))
      leaderEditors[1].setCursorBufferPosition([4, 4])
      await condition(() => deepEqual(followerEditors[1].getCursorBufferPosition(), leaderEditors[1].getCursorBufferPosition()))

      // Disconnect tether if follower scrolls the tether position out of view.
      followerEditors[1].setCursorBufferPosition([20, 0])
      await timeout(followerPortal.tetherDisconnectWindow)
      leaderEditors[1].setCursorBufferPosition([4, 5])
      leaderEditors[1].insertText('Z')
      await condition(() => followerEditors[1].lineTextForBufferRow(4).includes('Z'))
      assert(followerEditors[1].getCursorBufferPosition().isEqual([20, 0]))

      // Retract follower's tether and ensure it gets disconnected after switching to a different tab.
      followerPortal.follow(leaderPortal.siteId)
      await condition(() => deepEqual(followerEditors[1].getCursorBufferPosition(), leaderEditors[1].getCursorBufferPosition()))

      followerEnv.workspace.getActivePane().activateItem(followerEditors[0])
      await timeout(followerPortal.tetherDisconnectWindow)

      followerEditors[0].setCursorBufferPosition([3, 4])
      leaderEditors[1].setCursorBufferPosition([8, 2])
      leaderEditors[1].insertText('X')

      await condition(() => followerEditors[1].lineTextForBufferRow(8).includes('X'))

      assert.equal(followerEnv.workspace.getActivePaneItem(), followerEditors[0])
      assert(getCursorDecoratedRanges(followerEditors[0]).find((r) => r.isEqual([[3, 4], [3, 4]])))

      assert.equal(leaderEnv.workspace.getActivePaneItem(), leaderEditors[1])
      assert(getCursorDecoratedRanges(leaderEditors[1]).find((r) => r.isEqual([[8, 3], [8, 3]])))
    }
  })

  suite('services', () => {
    test('getRemoteEditors()', async () => {
      testServer.identityProvider.setIdentitiesByToken({
        'token-1': {login: 'user-1'},
        'token-2': {login: 'user-2'}
      })

      const host1Env = buildAtomEnvironment()
      const host1Package = await buildPackage(host1Env, {signIn: false})
      await host1Package.credentialCache.set('oauth-token', 'token-1')
      await host1Package.signInUsingSavedToken()

      const host1EditorA = await host1Env.workspace.open(path.join(temp.path(), 'a')) // eslint-disable-line no-unused-vars
      const host1Portal = await host1Package.sharePortal()
      const host1EditorB = await host1Env.workspace.open(path.join(temp.path(), 'b'))

      const host2Env = buildAtomEnvironment()
      const host2Package = await buildPackage(host2Env, {signIn: false})
      await host2Package.credentialCache.set('oauth-token', 'token-2')
      await host2Package.signInUsingSavedToken()

      const host2EditorC = await host2Env.workspace.open(path.join(temp.path(), 'c')) // eslint-disable-line no-unused-vars
      host2EditorC.setText('some text')
      const host2Portal = await host2Package.sharePortal()
      const host2EditorD = await host2Env.workspace.open(path.join(temp.path(), 'd')) // eslint-disable-line no-unused-vars
      // Create multiple editors for a single buffer (e.g. split panes), ensuring only one of them is returned.
      const host2EditorDCopy = await host2Env.workspace.open(host2EditorD.copy()) // eslint-disable-line no-unused-vars

      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      const guestService = guestPackage.provideTeletype()
      await guestPackage.joinPortal(host1Portal.id)
      await guestPackage.joinPortal(host2Portal.id)

      host1EditorB.destroy()
      await condition(async () => (await guestService.getRemoteEditors()).length === 3)
      const remoteEditors = await guestService.getRemoteEditors()

      assert.equal(remoteEditors[0].hostGitHubUsername, 'user-1')
      assert.equal(remoteEditors[0].path, host1EditorA.getPath())

      assert.equal(remoteEditors[1].hostGitHubUsername, 'user-2')
      assert.equal(remoteEditors[1].path, host2EditorC.getPath())

      assert.equal(remoteEditors[2].hostGitHubUsername, 'user-2')
      assert.equal(remoteEditors[2].path, host2EditorD.getPath())

      const guestEditorC = await guestEnv.workspace.open(remoteEditors[1].uri)
      assert(guestEditorC.isRemote)
      assert.equal(guestEditorC.getTitle(), '@user-2: c')
      assert.equal(guestEditorC.getURI(), remoteEditors[1].uri)
      assert.equal(guestEditorC.getText(), 'some text')

      guestEditorC.setText('modified text')
      await condition(() => host2EditorC.getText() === 'modified text')
    })
  })

  test('adding and removing workspace element classes when sharing a portal', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    await hostPackage.sharePortal()
    assert(hostEnv.workspace.getElement().classList.contains('teletype-Host'))
    await hostPackage.closeHostPortal()
    assert(!hostEnv.workspace.getElement().classList.contains('teletype-Host'))
  })

  test('reports when the package needs to be upgraded due to an out-of-date protocol version', async () => {
    const env = buildAtomEnvironment()
    const pack = await buildPackage(env, {signIn: false})
    pack.client.initialize = async function () {
      throw new Errors.ClientOutOfDateError()
    }

    await pack.consumeStatusBar(new FakeStatusBar())
    const {portalStatusBarIndicator} = pack
    const {popoverComponent} = portalStatusBarIndicator
    const {packageOutdatedComponent} = popoverComponent.refs

    assert(portalStatusBarIndicator.element.classList.contains('outdated'))

    assert(packageOutdatedComponent)
    assert(!popoverComponent.refs.portalListComponent)
    assert(!popoverComponent.refs.signInComponent)

    const openedURIs = []
    env.workspace.open = (uri) => openedURIs.push(uri)
    packageOutdatedComponent.refs.viewPackageSettingsButton.click()
    assert.deepEqual(openedURIs, ['atom://config/updates'])
  })

  test('reports errors attempting to initialize the client', async () => {
    {
      const env = buildAtomEnvironment()
      const pack = await buildPackage(env, {signIn: false})
      pack.client.initialize = async function () {
        throw new Error('an error')
      }

      await pack.consumeStatusBar(new FakeStatusBar())

      const {popoverComponent} = pack.portalStatusBarIndicator
      assert(pack.portalStatusBarIndicator.element.classList.contains('initialization-error'))
      assert(popoverComponent.refs.packageInitializationErrorComponent)
      assert(popoverComponent.refs.packageInitializationErrorComponent.props.initializationError.message.includes('an error'))
    }
  })

  test('client connection errors', async () => {
    const env = buildAtomEnvironment()
    const pack = await buildPackage(env)
    await pack.sharePortal()
    env.notifications.clear()

    pack.client.emitter.emit('connection-error', new ErrorEvent('error', {message: 'connection-error'}))
    assert.equal(env.notifications.getNotifications().length, 1)
    const {type, message, options} = env.notifications.getNotifications()[0]
    const {description} = options
    assert.equal(type, 'error')
    assert.equal(message, 'Connection Error')
    assert(description.includes('connection-error'))
  })

  test('reports errors attempting to sign in', async () => {
    const env = buildAtomEnvironment()
    const pack = await buildPackage(env, {signIn: false})
    await pack.consumeStatusBar(new FakeStatusBar())
    pack.client.signIn = async function () {
      throw new Error('some error')
    }

    const {popoverComponent} = pack.portalStatusBarIndicator
    popoverComponent.refs.signInComponent.refs.editor.setText('some-token')
    await popoverComponent.refs.signInComponent.signIn()

    assert.equal(env.notifications.getNotifications().length, 1)
    const {type, message, options} = env.notifications.getNotifications()[0]
    const {description} = options
    assert.equal(type, 'error')
    assert.equal(message, 'Failed to authenticate to teletype')
    assert(description.includes('some error'))
  })

  let nextTokenId = 0
  async function buildPackage (env, options = {}) {
    const credentialCache = new FakeCredentialCache()
    const pack = new TeletypePackage({
      baseURL: testServer.address,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env.workspace,
      notificationManager: env.notifications,
      commandRegistry: env.commands,
      tooltipManager: env.tooltips,
      clipboard: new FakeClipboard(),
      getAtomVersion: function () { return 'x.y.z' },
      tetherDisconnectWindow: 300,
      credentialCache
    })
    pack.registerRemoteEditorOpener()

    if (options.signIn == null || options.signIn) {
      await credentialCache.set('oauth-token', 'token-' + nextTokenId++)
      await pack.signInUsingSavedToken()
    }
    packages.push(pack)
    return pack
  }

  async function getNextActiveTextEditorPromise ({workspace}) {
    const currentEditor = workspace.getActiveTextEditor()
    await condition(() => workspace.getActiveTextEditor() !== currentEditor)
    return workspace.getActiveTextEditor()
  }

  async function getNextRemotePaneItemPromise (environment) {
    const getTitles = (paneItems) => paneItems.map((item) => item.getTitle())

    const originalRemotePaneItems = getRemotePaneItems(environment)
    await condition(() => {
      return !deepEqual(
        getTitles(originalRemotePaneItems),
        getTitles(getRemotePaneItems(environment))
      )
    })

    const newRemotePaneItem = getRemotePaneItems(environment).find((item) => {
      const originalRemotePaneItemTitles = getTitles(originalRemotePaneItems)
      return !originalRemotePaneItemTitles.includes(item.getTitle())
    })

    return newRemotePaneItem
  }

  function editorsEqual (editor1, editor2) {
    return condition(() => (
      editor1.getText() === editor2.getText() &&
      deepEqual(getCursorDecoratedRanges(editor1), getCursorDecoratedRanges(editor2))
    ))
  }
})

function getPaneItems ({workspace}) {
  return workspace.getPaneItems()
}

function getRemotePaneItems ({workspace}) {
  return workspace.getPaneItems().filter((item) => {
    return item.element.classList.contains('teletype-RemotePaneItem')
  })
}

function getCursorDecoratedRanges (editor) {
  const {decorationManager} = editor
  const decorationsByMarker = decorationManager.decorationPropertiesByMarkerForScreenRowRange(0, Infinity)
  const ranges = []
  for (const [marker, decorations] of decorationsByMarker) {
    const cursorDecorations = decorations.filter((d) => d.type === 'cursor')
    const hasVisibleCursorDecoration = (
      cursorDecorations.length > 0 &&
      cursorDecorations.every((d) => !d.style || d.style.opacity !== 0)
    )

    if (hasVisibleCursorDecoration) {
      ranges.push(marker.getBufferRange())
    }
  }
  return ranges.sort((a, b) => a.compare(b))
}

function timeout (t) {
  return new Promise((resolve) => window.setTimeout(resolve, t))
}
