const assert = require('assert')

const JoinPortalDialog = require('../lib/join-portal-dialog')

const suiteSetup = global.before
const suiteTeardown = global.after
const setup = global.beforeEach
const teardown = global.afterEach
const suite = global.describe
const test = global.it

suite('JoinPortalDialog', function () {
  if (process.env.CI) this.timeout(10000)

  let atomEnv

  setup(() => {
    atomEnv = buildAtomEnvironment()
    const workspaceElement = atomEnv.views.getView(atomEnv.workspace)
    document.body.appendChild(workspaceElement)
  })

  teardown(() => {
    const workspaceElement = atomEnv.views.getView(atomEnv.workspace)
    workspaceElement.remove()
    atomEnv.destroy()
    atomEnv = null
  })

  test('prompt for portal id', function () {
    const confirmations = []
    const dialog = new JoinPortalDialog({
      workspace: atomEnv.workspace,
      commandRegistry: atomEnv.commands,
      didConfirm: (portalId) => { confirmations.push(portalId) }
    })

    dialog.show()
    assert.equal(atomEnv.workspace.getModalPanels().length, 1)
    assert(dialog.editor.element.contains(document.activeElement))

    dialog.editor.setText('some-portal-id')
    atomEnv.commands.dispatch(dialog.element, 'core:confirm')
    assert.equal(atomEnv.workspace.getModalPanels().length, 0)
    assert.deepEqual(confirmations, ['some-portal-id'])
  })

  test('cancel', () => {
    let confirmCount = 0
    let cancelCount = 0
    const dialog = new JoinPortalDialog({
      workspace: atomEnv.workspace,
      commandRegistry: atomEnv.commands,
      didConfirm: () => { confirmCount++ },
      didCancel: () => { cancelCount++ }
    })

    dialog.show()
    atomEnv.commands.dispatch(dialog.element, 'core:cancel')
    assert.equal(atomEnv.workspace.getModalPanels().length, 0)
    assert.equal(confirmCount, 0)
    assert.equal(cancelCount, 1)
  })

  test('blur', () => {
    let confirmCount = 0
    let cancelCount = 0
    const dialog = new JoinPortalDialog({
      workspace: atomEnv.workspace,
      commandRegistry: atomEnv.commands,
      didConfirm: () => { confirmCount++ },
      didCancel: () => { cancelCount++ }
    })

    dialog.show()
    assert(dialog.editor.element.contains(document.activeElement))

    document.body.focus()
    assert.equal(document.activeElement, document.body)
    assert.equal(atomEnv.workspace.getModalPanels().length, 0)
    assert.equal(confirmCount, 0)
    assert.equal(cancelCount, 1)
  })

  test('prefill portal id from clipboard', () => {
    const clipboard = {}
    const dialog = new JoinPortalDialog({
      workspace: atomEnv.workspace,
      commandRegistry: atomEnv.commands,
      clipboard
    })

    clipboard.read = () => 'bc282ad8-7643-42cb-80ca-c243771a618f'
    dialog.show()
    assert.equal(dialog.editor.getText(), 'bc282ad8-7643-42cb-80ca-c243771a618f')
    dialog.hide()

    clipboard.read = () => 'not a portal id'
    dialog.show()
    assert.equal(dialog.editor.getText(), '')
  })
})
