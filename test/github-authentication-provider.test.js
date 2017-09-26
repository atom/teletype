const assert = require('assert')
const deepEqual = require('deep-equal')
const FakePasswordManager = require('./helpers/fake-password-manager')
const GithubAuthenticationProvider = require('../lib/github-authentication-provider')
const condition = require('./helpers/condition')

suite('GithubAuthenticationProvider', () => {
  let atomEnv, commandRegistry, workspace

  setup(() => {
    atomEnv = global.buildAtomEnvironment()
    commandRegistry = atomEnv.commands
    workspace = atomEnv.workspace
  })

  teardown(() => {
    atomEnv.destroy()
    atomEnv = null
  })

  test('authenticate', async () => {
    const fakePasswordManager = new FakePasswordManager()
    const openedURLs = []
    const openURL = (url) => openedURLs.push(url)

    {
      openedURLs.length = 0

      // Prompts the user when no suitable password can be found in the password manager.
      const provider = new GithubAuthenticationProvider({
        commandRegistry,
        workspace,
        openURL,
        passwordManager: fakePasswordManager
      })

      const loginPromise = provider.authenticate()

      await condition(() => deepEqual(openedURLs, ['https://tachyon.atom.io/login']))
      assert.equal(workspace.getModalPanels().length, 1)

      const modalPanel = workspace.getModalPanels()[0]
      provider.editor.setText('oauth-token')
      commandRegistry.dispatch(modalPanel.item, 'core:confirm')

      assert.equal(await loginPromise, 'oauth-token')
      assert.equal(await fakePasswordManager.get(), 'oauth-token')
      assert.equal(workspace.getModalPanels().length, 0)
    }

    {
      openedURLs.length = 0

      // Retrieves the password from the password manager without first opening a dialog.
      const provider = new GithubAuthenticationProvider({
        commandRegistry,
        workspace,
        passwordManager: fakePasswordManager
      })

      assert.equal(await provider.authenticate(), 'oauth-token')
      assert.equal(openedURLs.length, 0)
      assert.equal(workspace.getModalPanels().length, 0)
    }
  })

  test('dismissing the login dialog', async () => {
    const provider = new GithubAuthenticationProvider({
      commandRegistry,
      workspace,
      openURL: () => {},
      passwordManager: new FakePasswordManager()
    })

    const loginPromise = provider.authenticate()
    await condition(() => workspace.getModalPanels().length === 1)
    commandRegistry.dispatch(workspace.getModalPanels()[0].item, 'core:cancel')

    let error
    try {
      await loginPromise
    } catch (e) {
      error = e
    }

    assert(error)
  })
})
