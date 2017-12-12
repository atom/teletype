const assert = require('assert')
const FakeAuthenticationProvider = require('./helpers/fake-authentication-provider')
const SignInComponent = require('../lib/sign-in-component')
const FakeNotificationManager = require('./helpers/fake-notification-manager')
const FakeCommandRegistry = require('./helpers/fake-command-registry')

suite('SignInComponent', function () {
  test('has correct fields', () => {
    const component = buildComponent()
    assert(component.refs.editor)
    assert(component.refs.loginButton)
    assert(!component.refs.errorMessage)
  })

  test('disables button when empty token specified', () => {
    {
      // It should be disabled by default
      const component = buildComponent()
      assert(component.refs.loginButton.disabled)
    }

    {
      // Whitespace should also leave the button disabled
      const component = buildComponent()
      component.refs.editor.setText('    ')
      assert(component.refs.loginButton.disabled)
    }

    {
      // It should be disabled when set to an empty string
      const component = buildComponent()
      component.refs.editor.setText('')
      assert(component.refs.loginButton.disabled)
    }
  })

  test('enables button when non-empty token specified', () => {
    const component = buildComponent()
    component.refs.editor.setText('some-token')
    assert(!component.refs.loginButton.disabled)
  })

  test('reports errors attempting to sign in', async () => {
    {
      const component = buildComponent()
      const {authenticationProvider} = component.props
      const notifications = authenticationProvider.notificationManager

      authenticationProvider.signIn = (token) => {
        notifications.addError()
        return false
      }
      component.refs.editor.setText('some-token')
      await component.signIn()

      // It should display an error message when the login attempt fails
      assert.equal(notifications.errorCount, 1)
    }

    {
      const component = buildComponent()

      await component.signIn()

      // It should show an error message about an invalid token
      assert(component.refs.errorMessage)
      assert.equal(component.refs.errorMessage.innerHTML, 'That token does not appear to be valid.')
    }
  })

  function buildComponent () {
    return new SignInComponent({
      commandRegistry: new FakeCommandRegistry(),
      authenticationProvider: new FakeAuthenticationProvider({
        notificationManager: new FakeNotificationManager()
      })
    })
  }
})
