const assert = require('assert')

const RealTimePackage = require('../lib/real-time-package')

const suiteSetup = global.before
const suiteTeardown = global.after
const setup = global.beforeEach
const suite = global.describe
const test = global.it

suite('RealTimePackage', () => {
  let testServer

  suiteSetup(async () => {
    const {startTestServer} = require('real-time-server')
    testServer = await startTestServer({databaseURL: 'postgres://localhost:5432/real-time-server-test'})
  })

  suiteTeardown(() => {
    return testServer.stop()
  })

  setup(() => {
    return testServer.reset()
  })

  test('sharing and joining buffers', async () => {
    let clipboardText
    const env1 = buildAtomEnvironment()
    const env1Package = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env1.workspace,
      commands: env1.commands,
      clipboard: {
        write (text) {
          clipboardText = text
        }
      }
    })

    const env2 = buildAtomEnvironment()
    const env2Package = new RealTimePackage({
      restGateway: testServer.restGateway,
      pubSubGateway: testServer.pubSubGateway,
      workspace: env2.workspace,
      commands: env2.commands,
      clipboard: {
        read () {
          return clipboardText
        }
      }
    })

    const env1Editor = await env1.workspace.open()
    env1Editor.setText('hello world')

    await env1Package.shareBuffer(env1Editor.getBuffer())
    await env2Package.joinBuffer(clipboardText)

    const env2Editor = env2.workspace.getActiveTextEditor()
    assert.equal(env2Editor.getText(), 'hello world')
  })
})
