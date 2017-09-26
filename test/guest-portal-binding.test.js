const assert = require('assert')
const {RealTimeClient} = require('@atom/real-time-client')
const GuestPortalBinding = require('../lib/guest-portal-binding')

suite('GuestPortalBinding', () => {
  test('handling an unexpected error when joining a portal', async () => {
    const client = new RealTimeClient({})
    client.joinPortal = function () {
      throw new Error('It broke!')
    }
    const notificationManager = {
      errors: [],
      addError (...args) { this.errors.push(args) }
    }
    const portalBinding = new GuestPortalBinding({
      client,
      portalId: 'foo',
      notificationManager
    })

    const result = await portalBinding.initialize()
    assert.equal(result, false)

    assert.equal(notificationManager.errors.length, 1)
    const [[message, params]] = notificationManager.errors
    assert.equal(message, 'Failed to join portal')
    assert(params.description.includes('It broke!'))
  })
})
