const assert = require('assert')
const TeletypeService = require('../lib/teletype-service')

suite('TeletypeService', function () {
  suite('getRemoteEditors()', function () {
    test('returns an empty array when PortalBindingManager is unavailable', async () => {
      const teletypePackage = {
        getPortalBindingManager: () => {}
      }
      const service = new TeletypeService({teletypePackage})

      assert.deepEqual(await service.getRemoteEditors(), [])
    })
  })
})
