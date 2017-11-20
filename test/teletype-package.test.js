const TeletypePackage = require('../lib/teletype-package')
const {Errors} = require('@atom/teletype-client')
const {TextBuffer, TextEditor} = require('atom')

const {buildAtomEnvironment, destroyAtomEnvironments} = require('./helpers/atom-environments')
const assert = require('assert')
const condition = require('./helpers/condition')
const deepEqual = require('deep-equal')
const EmptyPortalPaneItem = require('../lib/empty-portal-pane-item')
const FakeCredentialCache = require('./helpers/fake-credential-cache')
const FakeClipboard = require('./helpers/fake-clipboard')
const FakeStatusBar = require('./helpers/fake-status-bar')
const fs = require('fs')
const path = require('path')
const temp = require('temp').track()

suite('TeletypePackage', function () {
  this.timeout(process.env.TEST_TIMEOUT_IN_MS || 5000)

  let testServer, containerElement, environments, packages, portals

  suiteSetup(async function () {
    const {startTestServer} = require('@atom/teletype-server')
    testServer = await startTestServer({
      databaseURL: 'postgres://localhost:5432/teletype-test',
      // Uncomment and provide credentials to test against Pusher.
      // pusherCredentials: {
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
    await condition(() =>
      getRemotePaneItems(guestOnlyEnv).length === 1 &&
        getRemotePaneItems(guestOnlyEnv)[0] instanceof EmptyPortalPaneItem
    )
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
    guestAndHostPackage.joinPortal(portal1Id)
    hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-1'))
    const guestAndHostRemotePaneItem1 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1])

    // While already participating as a guest in Portal 1, share a new portal as a host (Portal 2)
    const guestAndHostLocalEditor = await guestAndHostEnv.workspace.open(path.join(temp.path(), 'host+guest'))
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem1, guestAndHostLocalEditor])
    const portal2Id = (await guestAndHostPackage.sharePortal()).id
    guestOnlyPackage.joinPortal(portal2Id)
    const guestOnlyRemotePaneItem1 = await getNextRemotePaneItemPromise(guestOnlyEnv)
    assert(guestOnlyRemotePaneItem1 instanceof TextEditor)
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])

    // Portal 2 host continues to exist as a guest in Portal 1
    hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-2'))
    const guestAndHostRemotePaneItem2 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem2, guestAndHostLocalEditor])
    assert.deepEqual(getPaneItems(guestOnlyEnv), [guestOnlyRemotePaneItem1])

    // No transitivity: When Portal 2 host is viewing contents of Portal 1, Portal 2 guests are placed on hold
    guestAndHostEnv.workspace.getActivePane().activateItemAtIndex(0)
    assert.equal(guestAndHostEnv.workspace.getActivePaneItem(), guestAndHostRemotePaneItem2)
    await condition(() =>
      getRemotePaneItems(guestOnlyEnv).length === 1 &&
        getRemotePaneItems(guestOnlyEnv)[0] instanceof EmptyPortalPaneItem
    )

    // Portal 2 guests remain on hold while Portal 2 host observes changes in Portal 1
    await hostOnlyEnv.workspace.open(path.join(temp.path(), 'host-only-buffer-3'))
    const guestAndHostRemotePaneItem3 = await getNextRemotePaneItemPromise(guestAndHostEnv)
    assert.deepEqual(getPaneItems(guestAndHostEnv), [guestAndHostRemotePaneItem3, guestAndHostLocalEditor])
    await condition(() =>
      getRemotePaneItems(guestOnlyEnv).length === 1 &&
        getRemotePaneItems(guestOnlyEnv)[0] instanceof EmptyPortalPaneItem
    )
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
      popoverComponent.refs.signInComponent.refs.editor
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
    isTransmitting = function (statusBar) {
      return statusBar.getRightTiles()[0].item.element.classList.contains('transmitting')
    }

    const host1Env = buildAtomEnvironment()
    const host1Package = await buildPackage(host1Env)
    const host1StatusBar = new FakeStatusBar()
    await host1Package.consumeStatusBar(host1StatusBar)
    assert(!isTransmitting(host1StatusBar))

    const host1Portal = await host1Package.sharePortal()
    await condition(() => isTransmitting(host1StatusBar))

    const host2Env = buildAtomEnvironment()
    const host2Package = await buildPackage(host2Env)
    const host2Portal = await host2Package.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const guestStatusBar = new FakeStatusBar()
    await guestPackage.consumeStatusBar(guestStatusBar)
    assert(!isTransmitting(guestStatusBar))

    guestPackage.joinPortal(host1Portal.id)
    await condition(() => isTransmitting(guestStatusBar))
    await guestPackage.joinPortal(host2Portal.id)
    assert(isTransmitting(guestStatusBar))

    assert.equal(guestEnv.workspace.getPaneItems().length, 2)
    guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
    assert(isTransmitting(guestStatusBar))
    guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
    await condition(() => !isTransmitting(guestStatusBar))

    await host1Package.closeHostPortal()
    await condition(() => !isTransmitting(host1StatusBar))
  })

  test('attempting to join a nonexistent portal', async () => {
    const guestPackage = await buildPackage(buildAtomEnvironment())
    const notifications = []
    guestPackage.notificationManager.onDidAddNotification((n) => notifications.push(n))

    const guestPortal = await guestPackage.joinPortal('some-nonexistent-portal-id')
    const errorNotification = notifications.find((n) => n.message === 'Portal not found')
    assert(errorNotification, 'Expected notifications to include "Portal not found" error')
  })

  test('preserving guest portal position in workspace', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)

    const guestLocalEditor1 = await guestEnv.workspace.open(path.join(temp.path(), 'guest-1'))
    assert.deepEqual(getPaneItems(guestEnv), [guestLocalEditor1])

    const portal = await hostPackage.sharePortal()
    await guestPackage.joinPortal(portal.id)
    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'host-1'))
    const guestRemoteEditor1 = await getNextRemotePaneItemPromise(guestEnv)
    const guestLocalEditor2 = await guestEnv.workspace.open(path.join(temp.path(), 'guest-2'))
    assert.deepEqual(getPaneItems(guestEnv), [guestLocalEditor1, guestRemoteEditor1, guestLocalEditor2])

    const hostEditor2 = await hostEnv.workspace.open(path.join(temp.path(), 'host-2'))
    const guestRemoteEditor2 = await getNextRemotePaneItemPromise(guestEnv)

    assert.deepEqual(getPaneItems(guestEnv), [guestLocalEditor1, guestRemoteEditor2, guestLocalEditor2])
  })

  test('host without an active text editor', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    guestPackage.joinPortal(portalId)
    let guestEditor = await getNextRemotePaneItemPromise(guestEnv)
    assert(guestEditor instanceof EmptyPortalPaneItem)

    const hostEditor1 = await hostEnv.workspace.open()
    guestEditor = await getNextRemotePaneItemPromise(guestEnv)
    assert(guestEditor instanceof TextEditor)

    hostEditor1.destroy()
    guestEditor = await getNextRemotePaneItemPromise(guestEnv)
    assert(guestEditor instanceof EmptyPortalPaneItem)

    await hostEnv.workspace.open()
    guestEditor = await getNextRemotePaneItemPromise(guestEnv)
    assert(guestEditor instanceof TextEditor)
  })

  suite('guest leaving portal', async () => {
    test('via closing text editor portal pane item', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const hostPortal = await hostPackage.sharePortal()
      await hostEnv.workspace.open(path.join(temp.path(), 'some-file'))

      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      const guestEditor = getRemotePaneItems(guestEnv)[0]
      assert(guestEditor instanceof TextEditor)
      guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
      assert(guestPortal.disposed)
    })

    test('via closing empty portal pane item', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = await buildPackage(hostEnv)
      const hostPortal = await hostPackage.sharePortal()

      const guestEnv = buildAtomEnvironment()
      const guestPackage = await buildPackage(guestEnv)
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      const guestEditor = getRemotePaneItems(guestEnv)[0]
      assert(guestEditor instanceof EmptyPortalPaneItem)
      guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
      assert(guestPortal.disposed)
    })
  })

  test('host closing portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const hostPortal = await hostPackage.sharePortal()
    guestPackage.joinPortal(hostPortal.id)
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

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'file-1'))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])
    await getNextActiveTextEditorPromise(guestEnv)

    const hostEditor2 = await hostEnv.workspace.open(path.join(temp.path(), 'file-2'))
    hostEditor2.setText('const goodnight = "moon"')
    hostEditor2.setCursorBufferPosition([0, 2])
    await condition(() => guestEnv.workspace.getActiveTextEditor().getText() === 'const goodnight = "moon"')

    const guestEditor = guestEnv.workspace.getActiveTextEditor()
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor2), getCursorDecoratedRanges(guestEditor)))
    guestEditor.setCursorBufferPosition([0, 5])

    const guestEditorTitleChangeEvents = []
    guestEditor.onDidChangeTitle((title) => guestEditorTitleChangeEvents.push(title))

    hostPackage.closeHostPortal()
    await condition(() => guestEditor.getTitle() === 'untitled')
    assert.deepEqual(guestEditorTitleChangeEvents, ['untitled'])
    assert.equal(guestEditor.getText(), 'const goodnight = "moon"')
    assert(guestEditor.isModified())
    assert.deepEqual(getCursorDecoratedRanges(guestEditor), [
      {start: {row: 0, column: 5}, end: {row: 0, column: 5}}
    ])

    // Ensure that the guest can still edit the buffer or modify selections.
    guestEditor.getBuffer().setTextInRange([[0, 0], [0, 5]], 'let')
    guestEditor.setCursorBufferPosition([0, 7])
    assert.equal(guestEditor.getText(), 'let goodnight = "moon"')
    assert.deepEqual(getCursorDecoratedRanges(guestEditor), [
      {start: {row: 0, column: 7}, end: {row: 0, column: 7}}
    ])
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

  test('splitting editors', async () => {
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

  test('tethering to other collaborators', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = await buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = await buildPackage(guestEnv)
    const guestWorkspaceElement = guestEnv.views.getView(guestEnv.workspace)
    guestWorkspaceElement.style.height = '100px'
    guestWorkspaceElement.style.width = '250px'
    containerElement.appendChild(guestWorkspaceElement)

    const hostEditor1 = await hostEnv.workspace.open()
    hostEditor1.setText(('x'.repeat(30) + '\n').repeat(30))
    hostEditor1.setCursorBufferPosition([2, 2])

    const portal = await hostPackage.sharePortal()
    guestPackage.joinPortal(portal.id)

    const guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)

    // Jump to host cursor when joining
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))

    // Initially, guests follow the host's cursor
    hostEditor1.setCursorBufferPosition([3, 3])
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))

    // When followers move their cursor, their cursor does not follow the
    // leader's cursor so long as the leader's cursor stays within the
    // follower's viewport
    guestEditor1.setCursorBufferPosition([2, 10])
    hostEditor1.setCursorBufferPosition([3, 5])
    hostEditor1.insertText('y')
    await condition(() => guestEditor1.lineTextForBufferRow(3).includes('y'))
    assert(guestEditor1.getCursorBufferPosition().isEqual([2, 10]))

    // When the leader moves their cursor out of the follower's viewport, the
    // follower's cursor moves to the same position if the unfollow period
    // has elapsed.
    await timeout(guestPackage.tetherDisconnectWindow)
    hostEditor1.setCursorBufferPosition([20, 10])
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))

    // If the leader moves to non-visible columns (not just rows), we update
    // the tether
    await condition(() => guestEditor1.getFirstVisibleScreenRow() > 0)
    guestEditor1.setCursorBufferPosition([20, 9])
    await timeout(guestPackage.tetherDisconnectWindow)
    hostEditor1.setCursorBufferPosition([20, 30])
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))

    // Disconnect tether if leader's cursor position moves within the tether
    // disconnect window
    guestEditor1.setCursorBufferPosition([20, 29])
    hostEditor1.setCursorBufferPosition([0, 0])
    hostEditor1.insertText('y')
    await condition(() => guestEditor1.lineTextForBufferRow(0).includes('y'))
    assert(guestEditor1.getCursorBufferPosition().isEqual([20, 29]))
    await timeout(guestPackage.tetherDisconnectWindow)
    hostEditor1.setCursorBufferPosition([1, 0])
    hostEditor1.insertText('y')
    await condition(() => guestEditor1.lineTextForBufferRow(1).includes('y'))
    assert(guestEditor1.getCursorBufferPosition().isEqual([20, 29]))

    // Reconnect and retract the tether when the host switches editors
    const hostEditor2 = await hostEnv.workspace.open()
    hostEditor2.setText(('y'.repeat(30) + '\n').repeat(30))
    hostEditor2.setCursorBufferPosition([2, 2])
    const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv)
    await condition(() => deepEqual(guestEditor2.getCursorBufferPosition(), hostEditor2.getCursorBufferPosition()))
    hostEditor2.setCursorBufferPosition([4, 4])
    await condition(() => deepEqual(guestEditor2.getCursorBufferPosition(), hostEditor2.getCursorBufferPosition()))

    // Disconnect tether if guest scrolls the tether position out of view
    guestEditor2.setCursorBufferPosition([20, 0])
    await timeout(guestPackage.tetherDisconnectWindow)
    hostEditor2.setCursorBufferPosition([4, 5])
    hostEditor2.insertText('z')
    await condition(() => guestEditor2.lineTextForBufferRow(4).includes('z'))
    assert(guestEditor2.getCursorBufferPosition().isEqual([20, 0]))

    // When host switches back to an existing editor, reconnect the tether
    hostEnv.workspace.getActivePane().activateItem(hostEditor1)
    await getNextActiveTextEditorPromise(guestEnv)
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))
    hostEditor1.setCursorBufferPosition([1, 20])
    await condition(() => deepEqual(guestEditor1.getCursorBufferPosition(), hostEditor1.getCursorBufferPosition()))
  })

  test('adding and removing workspace element classes when sharing a portal', async () => {
    const host1Env = buildAtomEnvironment()
    const host1Package = await buildPackage(host1Env)
    const host1Portal = await host1Package.sharePortal()
    assert(host1Env.workspace.getElement().classList.contains('teletype-Host'))
    await host1Package.closeHostPortal()
    assert(!host1Env.workspace.getElement().classList.contains('teletype-Host'))
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
    assert.deepEqual(openedURIs, ['atom://config/packages/teletype'])
  })

  test('reports errors attempting to initialize the client', async () => {
    {
      const env = buildAtomEnvironment()
      const pack = await buildPackage(env, {signIn: false})
      pack.client.initialize = async function () {
        throw new Error('an error')
      }

      await pack.sharePortal()

      assert.equal(env.notifications.getNotifications().length, 1)
      const {type, message, options} = env.notifications.getNotifications()[0]
      const {description} = options
      assert.equal(type, 'error')
      assert.equal(message, 'Failed to initialize the teletype package')
      assert(description.includes('an error'))
    }

    {
      const env = buildAtomEnvironment()
      const pack = await buildPackage(env, {signIn: false})
      pack.client.initialize = async function () {
        throw new Error('an error')
      }

      await pack.joinPortal()

      assert.equal(env.notifications.getNotifications().length, 1)
      const {type, message, options} = env.notifications.getNotifications()[0]
      const {description} = options
      assert.equal(type, 'error')
      assert.equal(message, 'Failed to initialize the teletype package')
      assert(description.includes('an error'))
    }

    {
      const env = buildAtomEnvironment()
      const pack = await buildPackage(env, {signIn: false})
      pack.client.initialize = async function () {
        throw new Error('an error')
      }

      await pack.consumeStatusBar(new FakeStatusBar())

      assert.equal(env.notifications.getNotifications().length, 1)
      const {type, message, options} = env.notifications.getNotifications()[0]
      const {description} = options
      assert.equal(type, 'error')
      assert.equal(message, 'Failed to initialize the teletype package')
      assert(description.includes('an error'))

      const {popoverComponent} = pack.portalStatusBarIndicator
      assert(pack.portalStatusBarIndicator.element.classList.contains('initialization-error'))
      assert(popoverComponent.refs.packageInitializationErrorComponent)
    }
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
      tetherDisconnectWindow: 300,
      credentialCache
    })

    if (options.signIn == null || options.signIn) {
      await credentialCache.set('oauth-token', 'token-' + nextTokenId++)
      await pack.signInUsingSavedToken()
    }
    packages.push(pack)
    return pack
  }

  async function getNextActiveTextEditorPromise ({workspace}) {
    const currentEditor = workspace.getActiveTextEditor()
    await condition(() => workspace.getActiveTextEditor() != currentEditor)
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
