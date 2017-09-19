require('./setup')

const RealTimePackage = require('../lib/real-time-package')
const {TextBuffer, TextEditor} = require('atom')

const assert = require('assert')
const deepEqual = require('deep-equal')
const fs = require('fs')
const path = require('path')
const suiteSetup = global.before
const suiteTeardown = global.after
const setup = global.beforeEach
const teardown = global.afterEach
const suite = global.describe
const test = global.it
const temp = require('temp').track()

suite('RealTimePackage', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  let testServer, containerElement, environments, packages, portals

  suiteSetup(async function () {
    const {startTestServer} = require('@atom/real-time-server')
    testServer = await startTestServer({
      databaseURL: 'postgres://localhost:5432/real-time-test',
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
    environments = []
    packages = []
    containerElement = document.createElement('div')
    document.body.appendChild(containerElement)

    return testServer.reset()
  })

  teardown(async () => {
    containerElement.remove()

    for (const pack of packages) {
      await pack.dispose()
    }
    for (const env of environments) {
      await env.destroy()
    }
  })

  test('sharing and joining a portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    guestPackage.joinPortal(portalId)

    const hostEditor1 = await hostEnv.workspace.open(temp.path({extension: '.js'}))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])

    let guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor1.getText(), 'const hello = "world"')
    assert.equal(guestEditor1.getTitle(), `Remote Buffer: ${hostEditor1.getTitle()}`)
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
    assert.equal(guestEditor2.getTitle(), `Remote Buffer: ${hostEditor2.getTitle()}`)
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor2), getCursorDecoratedRanges(guestEditor2)))

    hostEnv.workspace.paneForItem(hostEditor1).activateItem(hostEditor1)
    guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor1.getText(), 'const hello = "world"')
    assert.equal(guestEditor1.getTitle(), `Remote Buffer: ${hostEditor1.getTitle()}`)
    assert(!guestEditor1.isModified())
    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor1), getCursorDecoratedRanges(guestEditor1)))
  })

  test('attempting to join a nonexistent portal', async () => {
    const guestPackage = buildPackage(buildAtomEnvironment())
    const notifications = []
    guestPackage.notificationManager.onDidAddNotification((n) => notifications.push(n))

    const guestPortal = await guestPackage.joinPortal('some-nonexistent-portal-id')
    const errorNotification = notifications.find((n) => n.message === 'Portal not found')
    assert(errorNotification, 'Expected notifications to include "Portal not found" error')
  })

  test('preserving guest portal position in workspace', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)

    await guestEnv.workspace.open(path.join(temp.path(), 'guest-1'))

    const portalId = (await hostPackage.sharePortal()).id
    await guestPackage.joinPortal(portalId)

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'host-1'))
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['guest-1', 'Remote Buffer: host-1']))

    await guestEnv.workspace.open(path.join(temp.path(), 'guest-2'))
    assert.deepEqual(getPaneItemTitles(guestEnv), ['guest-1', 'Remote Buffer: host-1', 'guest-2'])

    await hostEnv.workspace.open(path.join(temp.path(), 'host-2'))
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['guest-1', 'Remote Buffer: host-2', 'guest-2']))

    hostEnv.workspace.paneForItem(hostEditor1).activateItem(hostEditor1)
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['guest-1', 'Remote Buffer: host-1', 'guest-2']))
  })

  test('host without an active text editor', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const portalId = (await hostPackage.sharePortal()).id

    await guestPackage.joinPortal(portalId)
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Portal: No Active File']))

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'some-file'))
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: some-file']))

    hostEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Portal: No Active File']))

    await hostEnv.workspace.open(path.join(temp.path(), 'some-file'))
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: some-file']))
  })

  suite('guest leaving portal', async () => {
    test('via explicit leave operation', async () => {
      const host1Env = buildAtomEnvironment()
      const host1Package = buildPackage(host1Env)
      const host1Portal = await host1Package.sharePortal()
      await host1Env.workspace.open(path.join(temp.path(), 'host-1'))

      const host2Env = buildAtomEnvironment()
      const host2Package = buildPackage(host2Env)
      const host2Portal = await host2Package.sharePortal()
      await host2Env.workspace.open(path.join(temp.path(), 'host-2'))

      const guestEnv = buildAtomEnvironment()
      const guestPackage = buildPackage(guestEnv)

      const guestPortal1 = await guestPackage.joinPortal(host1Portal.id)
      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: host-1']))
      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: host-1']))

      const guestPortal2 = await guestPackage.joinPortal(host2Portal.id)
      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: host-1', 'Remote Buffer: host-2']))

      guestPackage.leaveGuestPortal()
      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: host-1']))
      assert(guestPortal2.disposed)

      guestPackage.leaveGuestPortal()
      await condition(() => deepEqual(getPaneItemTitles(guestEnv), []))
      assert(guestPortal1.disposed)
    })

    test('via closing text editor portal pane item', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = buildPackage(hostEnv)
      const hostPortal = await hostPackage.sharePortal()
      await hostEnv.workspace.open(path.join(temp.path(), 'host-1'))

      const guestEnv = buildAtomEnvironment()
      const guestPackage = buildPackage(guestEnv)
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Remote Buffer: host-1']))
      guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
      assert(guestPortal.disposed)
    })

    test('via closing empty portal pane item', async () => {
      const hostEnv = buildAtomEnvironment()
      const hostPackage = buildPackage(hostEnv)
      const hostPortal = await hostPackage.sharePortal()

      const guestEnv = buildAtomEnvironment()
      const guestPackage = buildPackage(guestEnv)
      const guestPortal = await guestPackage.joinPortal(hostPortal.id)

      await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Portal: No Active File']))
      guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
      assert(guestPortal.disposed)
    })
  })

  test('host closing portal', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const hostPortal = await hostPackage.sharePortal()
    guestPackage.joinPortal(hostPortal.id)
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Portal: No Active File']))

    hostPackage.closeHostPortal()
    await condition(() => guestEnv.workspace.getPaneItems().length === 0)
  })

  test('host losing connection', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)
    await condition(() => deepEqual(getPaneItemTitles(guestEnv), ['Portal: No Active File']))

    hostPortal.simulateNetworkFailure()
    await condition(() => guestEnv.workspace.getPaneItems().length === 0)
  })

  test('host disconnecting while there is an active shared editor', async function () {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const hostPortal = await hostPackage.sharePortal()
    await guestPackage.joinPortal(hostPortal.id)

    const hostEditor1 = await hostEnv.workspace.open(path.join(temp.path(), 'file-1'))
    hostEditor1.setText('const hello = "world"')
    hostEditor1.setCursorBufferPosition([0, 4])
    await getNextActiveTextEditorPromise(guestEnv)

    const hostEditor2 = await hostEnv.workspace.open(path.join(temp.path(), 'file-2'))
    hostEditor2.setText('const goodnight = "moon"')
    hostEditor2.setCursorBufferPosition([0, 2])
    await condition(() => guestEnv.workspace.getActiveTextEditor().getTitle() === 'Remote Buffer: file-2')

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
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const hostEditor = await hostEnv.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    await guestPackage.joinPortal(hostPortal.id)
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
    const hostPackage = buildPackage(hostEnv)
    const hostEditor = await hostEnv.workspace.open()
    hostEditor.insertText('h1 ')
    hostEditor.insertText('h2 ')
    hostEditor.insertText('h3 ')
    hostEditor.undo()
    hostEditor.undo()
    const hostPortal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    await guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)
    assert.equal(guestEditor.getText(), 'h1 ')

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

    hostPackage.closeHostPortal()
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
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()

    const hostBuffer = new TextBuffer('abcdefg')
    const hostEditor = new TextEditor({buffer: hostBuffer})
    await hostEnv.workspace.open(hostEditor)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
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

  test('reverting to a checkpoint', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const hostEditor = await hostEnv.workspace.open()
    hostEditor.setText('abcdefg')
    const portal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    guestPackage.joinPortal(portal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    const checkpoint = hostEditor.createCheckpoint()
    hostEditor.setCursorBufferPosition([0, 7])
    hostEditor.insertText('h')
    hostEditor.insertText('i')
    hostEditor.insertText('j')
    assert.equal(hostEditor.getText(), 'abcdefghij')
    await editorsEqual(hostEditor, guestEditor)

    hostEditor.revertToCheckpoint(checkpoint)
    assert.equal(hostEditor.getText(), 'abcdefg')
    await editorsEqual(hostEditor, guestEditor)
  })

  test('reloading a shared editor', async () => {
    const env = buildAtomEnvironment()
    const pack = buildPackage(env)
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

  test('splitting editors', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const portal = await hostPackage.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
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
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const hostEditor = await hostEnv.workspace.open()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    await guestPackage.joinPortal(hostPortal.id)
    const guestEditor = await getNextActiveTextEditorPromise(guestEnv)

    hostEditor.transact(() => {
      hostEditor.setText('abc\ndef')
      hostEditor.transact(() => {
        hostEditor.setCursorBufferPosition([1, 2])
      })
    })

    await condition(() => deepEqual(getCursorDecoratedRanges(hostEditor), getCursorDecoratedRanges(guestEditor)))
  })

  test('autoscrolling to the host cursor position when changing the active editor', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    // Attach the workspace element to the DOM, and give it an extremely small
    // height so that we can be sure that the editor will be scrollable.
    const guestWorkspaceElement = guestEnv.views.getView(guestEnv.workspace)
    guestWorkspaceElement.style.height = '10px'
    containerElement.appendChild(guestWorkspaceElement)

    const portal = await hostPackage.sharePortal()
    guestPackage.joinPortal(portal.id)

    const hostEditor1 = await hostEnv.workspace.open()
    hostEditor1.setText('abc\ndef\nghi')
    hostEditor1.setCursorBufferPosition([2, 0])

    const guestEditor1 = await getNextActiveTextEditorPromise(guestEnv)
    await condition(() => guestEditor1.getScrollTopRow() === 2)

    const hostEditor2 = await hostEnv.workspace.open()
    hostEditor2.setText('jkl\nmno\npqr\nstu')
    hostEditor2.setCursorBufferPosition([3, 0])

    const guestEditor2 = await getNextActiveTextEditorPromise(guestEnv)
    await condition(() => guestEditor2.getScrollTopRow() === 3)

    guestPackage.toggleFollowHostCursor()
    hostEditor2.insertText('vwx')
    hostEditor2.setCursorBufferPosition([0, 0])
    await condition(() => guestEditor2.getText() === hostEditor2.getText())
    assert.equal(guestEditor2.getScrollTopRow(), 3)
  })

  test('guest portal file path', async () => {
    const hostEnv = buildAtomEnvironment()
    const hostPackage = buildPackage(hostEnv)
    const hostPortal = await hostPackage.sharePortal()
    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    guestPackage.joinPortal(hostPortal.id)

    const unsavedFileEditor = await hostEnv.workspace.open()
    await condition(() => deepEqual(getPaneItemTitles(guestEnv).pop(), 'Remote Buffer: untitled'))
    assert.equal(guestEnv.workspace.getActivePaneItem().getPath(), 'remote:untitled')

    const standaloneFilePath = path.join(temp.path(), 'standalone.js')
    hostEnv.workspace.open(standaloneFilePath)
    await condition(() => deepEqual(getPaneItemTitles(guestEnv).pop(), 'Remote Buffer: standalone.js'))
    assert.equal(guestEnv.workspace.getActivePaneItem().getPath(), 'remote:' + standaloneFilePath)

    const projectPath = path.join(temp.mkdirSync(), 'some-project')
    const projectSubDirPath = path.join(projectPath, 'sub-dir')
    fs.mkdirSync(projectPath)
    fs.mkdirSync(projectSubDirPath)
    hostEnv.workspace.project.setPaths([projectPath])
    hostEnv.workspace.open(path.join(projectSubDirPath, 'file.js'))
    await condition(() => deepEqual(getPaneItemTitles(guestEnv).pop(), 'Remote Buffer: file.js'))
    assert.equal(
      guestEnv.workspace.getActivePaneItem().getPath(),
      `remote:${path.join('some-project', 'sub-dir', 'file.js')}`
    )
  })

  test('status bar indicator', async () => {
    const host1Env = buildAtomEnvironment()
    const host1Package = buildPackage(host1Env)
    const host1StatusBar = new FakeStatusBar()
    host1Package.consumeStatusBar(host1StatusBar)

    const host1Portal = await host1Package.sharePortal()
    assert.equal(host1StatusBar.getRightTiles().length, 1)
    assert(host1StatusBar.getRightTiles()[0].item.element.classList.contains('focused'))

    host1Package.clipboard.write('')
    host1StatusBar.getRightTiles()[0].item.element.click()
    assert.equal(host1Package.clipboard.read(), host1Portal.id)

    const host2Env = buildAtomEnvironment()
    const host2Package = buildPackage(host2Env)
    const host2Portal = await host2Package.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)
    const guestStatusBar = new FakeStatusBar()
    guestPackage.consumeStatusBar(guestStatusBar)

    await guestPackage.joinPortal(host1Portal.id)
    await guestPackage.joinPortal(host2Portal.id)

    assert.equal(guestStatusBar.getRightTiles().length, 2)
    const [host1Tile, host2Tile] = guestStatusBar.getRightTiles()
    assert(!host1Tile.item.element.classList.contains('focused'))
    assert(host2Tile.item.element.classList.contains('focused'))

    guestEnv.workspace.getActivePane().activateItemAtIndex(0)
    assert(host1Tile.item.element.classList.contains('focused'))
    assert(!host2Tile.item.element.classList.contains('focused'))

    const localEditor = await guestEnv.workspace.open()
    assert(!host1Tile.item.element.classList.contains('focused'))
    assert(!host2Tile.item.element.classList.contains('focused'))
    localEditor.destroy()

    guestPackage.clipboard.write('')
    host1Tile.item.element.click()
    assert.equal(guestPackage.clipboard.read(), host1Portal.id)

    guestPackage.clipboard.write('')
    host2Tile.item.element.click()
    assert.equal(guestPackage.clipboard.read(), host2Portal.id)

    host1Package.closeHostPortal()
    assert.equal(host1StatusBar.getRightTiles().length, 0)
    await condition(() => deepEqual(guestStatusBar.getRightTiles(), [host2Tile]))

    guestPackage.leaveGuestPortal()
    assert.equal(guestStatusBar.getRightTiles().length, 0)

    await guestPackage.joinPortal(host2Portal.id)
    await condition(() => guestStatusBar.getRightTiles().length === 1)
    guestEnv.workspace.closeActivePaneItemOrEmptyPaneOrWindow()
    await condition(() => guestStatusBar.getRightTiles().length === 0)
  })

  test('workspace element classes', async () => {
    const host1Env = buildAtomEnvironment()
    const host1Package = buildPackage(host1Env)
    const host1Portal = await host1Package.sharePortal()
    assert(host1Env.workspace.getElement().classList.contains('realtime-Host'))

    const host2Env = buildAtomEnvironment()
    const host2Package = buildPackage(host2Env)
    const host2Portal = await host2Package.sharePortal()

    const guestEnv = buildAtomEnvironment()
    const guestPackage = buildPackage(guestEnv)

    guestPackage.joinPortal(host1Portal.id)
    guestPackage.joinPortal(host2Portal.id)
    await condition(() => guestEnv.workspace.getPaneItems().length === 2)
    assert(guestEnv.workspace.getElement().classList.contains('realtime-Guest'))

    guestPackage.leaveGuestPortal()
    await condition(() => guestEnv.workspace.getPaneItems().length === 1)
    assert(guestEnv.workspace.getElement().classList.contains('realtime-Guest'))

    guestPackage.leaveGuestPortal()
    await condition(() => guestEnv.workspace.getPaneItems().length === 0)
    assert(!guestEnv.workspace.getElement().classList.contains('realtime-Guest'))

    host1Package.closeHostPortal()
    assert(!host1Env.workspace.getElement().classList.contains('realtime-Host'))
  })

  function buildAtomEnvironment () {
    const env = global.buildAtomEnvironment()
    environments.push(env)
    return env
  }

  function buildPackage (env) {
    const pack = new RealTimePackage({
      baseURL: testServer.address,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env.workspace,
      notificationManager: env.notifications,
      commandRegistry: env.commands,
      tooltipManager: env.tooltips,
      clipboard: new FakeClipboard()
    })
    packages.push(pack)
    return pack
  }

  async function getNextActiveTextEditorPromise ({workspace}) {
    const currentEditor = workspace.getActiveTextEditor()
    await condition(() => workspace.getActiveTextEditor() != currentEditor)
    return workspace.getActiveTextEditor()
  }

  function editorsEqual (editor1, editor2) {
    return condition(() => (
      editor1.getText() === editor2.getText() &&
      deepEqual(getCursorDecoratedRanges(editor1), getCursorDecoratedRanges(editor2))
    ))
  }

  function condition (fn) {
    const timeoutError = new Error('Condition timed out: ' + fn.toString())
    Error.captureStackTrace(timeoutError, condition)

    return new Promise((resolve, reject) => {
      const intervalId = global.setInterval(() => {
        if (fn()) {
          global.clearTimeout(timeout)
          global.clearInterval(intervalId)
          resolve()
        }
      }, 5)

      const timeout = global.setTimeout(() => {
        global.clearInterval(intervalId)
        reject(timeoutError)
      }, 500)
    })
  }
})

function getPaneItemTitles (environment) {
  return environment.workspace.getPaneItems().map((i) => i.getTitle())
}

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

class FakeClipboard {
  constructor () {
    this.text = null
  }

  read () {
    return this.text
  }

  write (text) {
    this.text = text
  }
}

class FakeStatusBar {
  constructor () {
    this.rightTiles = []
  }

  getRightTiles () {
    return this.rightTiles
  }

  addRightTile (tile) {
    this.rightTiles.push(tile)
    return {
      getItem: () => tile.item,
      destroy: () => {
        const index = this.rightTiles.indexOf(tile)
        this.rightTiles.splice(index, 1)
      }
    }
  }
}
