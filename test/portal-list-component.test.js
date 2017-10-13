const assert = require('assert')
const etch = require('etch')
const condition = require('./helpers/condition')
const {Disposable} = require('atom')
const FakeClipboard = require('./helpers/fake-clipboard')
const {RealTimeClient} = require('@atom/real-time-client')
const {startTestServer} = require('@atom/real-time-server')
const PortalBindingManager = require('../lib/portal-binding-manager')
const PortalListComponent = require('../lib/portal-list-component')

suite('PortalListComponent', function () {
  if (process.env.CI) this.timeout(process.env.TEST_TIMEOUT_IN_MS)

  let testServer, portalBindingManagers

  suiteSetup(async function () {
    testServer = await startTestServer({databaseURL: 'postgres://localhost:5432/real-time-test'})
  })

  suiteTeardown(() => {
    return testServer.stop()
  })

  setup(() => {
    portalBindingManagers = []
    return testServer.reset()
  })

  teardown(async () => {
    for (const portalBindingManager of portalBindingManagers) {
      await portalBindingManager.dispose()
    }
  })

  test('initialization', async () => {
    const portalBindingManager = await buildPortalBindingManager()
    const component = new PortalListComponent({
      portalBindingManager,
      commandRegistry: new FakeCommandRegistry(),
      localUserIdentity: {login: 'some-user'}
    })
    assert(component.refs.initializationSpinner)
    assert(!component.refs.hostPortalBindingComponent)

    await etch.getScheduler().getNextUpdatePromise()
    assert(!component.refs.initializationSpinner)
    assert(component.refs.hostPortalBindingComponent)
  })

  test('sharing portals', async () => {
    const {component, element, portalBindingManager} = await buildComponent()

    const {hostPortalBindingComponent} = component.refs
    assert(!hostPortalBindingComponent.refs.toggleShareCheckbox.checked)

    // Toggle sharing on.
    component.refs.hostPortalBindingComponent.toggleShare()
    await etch.getScheduler().getNextUpdatePromise()
    assert(hostPortalBindingComponent.refs.toggleShareCheckbox.checked)

    // Simulate multiple guests joining.
    const {portal} = await portalBindingManager.getHostPortalBinding()

    const guestPortalBindingManager1 = await buildPortalBindingManager()
    await guestPortalBindingManager1.createGuestPortalBinding(portal.id)

    const guestPortalBindingManager2 = await buildPortalBindingManager()
    await guestPortalBindingManager2.createGuestPortalBinding(portal.id)

    await condition(() => queryParticipantElements(element).length === 3)
    assert(queryParticipantElement(element, 1))
    assert(queryParticipantElement(element, 2))
    assert(queryParticipantElement(element, 3))

    // Toggle sharing off.
    hostPortalBindingComponent.toggleShare()

    await condition(() => queryParticipantElements(element).length === 1)
    assert(!hostPortalBindingComponent.refs.toggleShareCheckbox.checked)
  })

  test('automatically showing and hiding host connection info', async () => {
    const {component, element, portalBindingManager} = await buildComponent()

    const {hostPortalBindingComponent} = component.refs
    assert(!hostPortalBindingComponent.props.isConnectionInfoVisible)

    hostPortalBindingComponent.toggleShare()

    await etch.getScheduler().getNextUpdatePromise()
    assert(hostPortalBindingComponent.props.isConnectionInfoVisible)

    const hostPortalBinding = await portalBindingManager.getHostPortalBinding()
    hostPortalBinding.close()

    await etch.getScheduler().getNextUpdatePromise()
    assert(!hostPortalBindingComponent.props.isConnectionInfoVisible)
  })

  test('joining portals', async () => {
    const {component, element, portalBindingManager} = await buildComponent()
    const {joinPortalComponent, guestPortalBindingsContainer} = component.refs

    assert(joinPortalComponent.refs.joinPortalLabel)
    assert(!joinPortalComponent.refs.portalIdEditor)
    assert(!joinPortalComponent.refs.joiningSpinner)

    await joinPortalComponent.showPrompt()

    assert(!joinPortalComponent.refs.joinPortalLabel)
    assert(joinPortalComponent.refs.portalIdEditor)
    assert(!joinPortalComponent.refs.joiningSpinner)

    // Insert an invalid portal id.
    joinPortalComponent.refs.portalIdEditor.setText('invalid-portal-id')
    joinPortalComponent.joinPortal()

    await condition(() => (
      !joinPortalComponent.refs.joinPortalLabel &&
      joinPortalComponent.refs.joiningSpinner &&
      !joinPortalComponent.refs.portalIdEditor
    ))
    await condition(() => (
      !joinPortalComponent.refs.joinPortalLabel &&
      !joinPortalComponent.refs.joiningSpinner &&
      joinPortalComponent.refs.portalIdEditor
    ))

    // Insert a valid portal id.
    const hostPortalBindingManager = await buildPortalBindingManager()
    const {portal: hostPortal} = await hostPortalBindingManager.createHostPortalBinding()

    joinPortalComponent.refs.portalIdEditor.setText(hostPortal.id)
    joinPortalComponent.joinPortal()

    await condition(() => (
      !joinPortalComponent.refs.joinPortalLabel &&
      joinPortalComponent.refs.joiningSpinner &&
      !joinPortalComponent.refs.portalIdEditor
    ))
    await condition(() => (
      joinPortalComponent.refs.joinPortalLabel &&
      !joinPortalComponent.refs.joiningSpinner &&
      !joinPortalComponent.refs.portalIdEditor
    ))
    await condition(() => queryParticipantElements(guestPortalBindingsContainer).length === 2)
    assert(queryParticipantElement(guestPortalBindingsContainer, 1))
    assert(queryParticipantElement(guestPortalBindingsContainer, 2))

    // Simulate another guest joining the portal.
    const newGuestPortalBindingManager = await buildPortalBindingManager()
    await newGuestPortalBindingManager.createGuestPortalBinding(hostPortal.id)

    await condition(() => queryParticipantElements(guestPortalBindingsContainer).length === 3)
    assert(queryParticipantElement(guestPortalBindingsContainer, 1))
    assert(queryParticipantElement(guestPortalBindingsContainer, 2))
    assert(queryParticipantElement(guestPortalBindingsContainer, 3))
  })

  function queryParticipantElement (element, siteId) {
    const participants = element.querySelectorAll('.PortalParticipants-site-' + siteId)
    assert.equal(participants.length, 1)
    return participants[0]
  }

  function queryParticipantElements (element) {
    return element.querySelectorAll('.PortalParticipants-participant')
  }

  async function buildComponent () {
    const portalBindingManager = await buildPortalBindingManager()
    const component = new PortalListComponent({
      portalBindingManager,
      commandRegistry: new FakeCommandRegistry(),
      localUserIdentity: portalBindingManager.client.getLocalUserIdentity()
    })

    await etch.getScheduler().getNextUpdatePromise()
    return {component, element: component.element, portalBindingManager}
  }

  async function buildPortalBindingManager () {
    const client = new RealTimeClient({
      baseURL: testServer.address,
      pubSubGateway: testServer.pubSubGateway
    })
    await client.initialize()
    await client.signIn('some-token')

    const portalBindingManager = new PortalBindingManager({
      client,
      workspace: new FakeWorkspace(),
      notificationManager: new FakeNotificationManager(),
      clipboard: new FakeClipboard()
    })
    portalBindingManagers.push(portalBindingManager)
    return portalBindingManager
  }
})

class FakeWorkspace {
  async open () {}

  getElement () {
    return document.createElement('div')
  }

  observeActiveTextEditor () {
    return new Disposable(() => {})
  }
}

class FakeNotificationManager {
  addInfo () {}

  addSuccess () {}

  addError () {}
}

class FakeCommandRegistry {
  add () {}
}
