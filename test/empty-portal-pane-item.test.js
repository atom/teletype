const assert = require('assert')
const EmptyPortalPaneItem = require('../lib/empty-portal-pane-item')

suite('EmptyPortalPaneItem', () => {
  test('copy()', () => {
    const paneItem = new EmptyPortalPaneItem({hostIdentity: {login: 'host'}})
    assert.equal(paneItem.copy(), null)
  })

  test('serialize()', () => {
    const paneItem = new EmptyPortalPaneItem({hostIdentity: {login: 'host'}})
    assert.equal(paneItem.serialize(), null)
  })

  test('getTitle()', () => {
    const hostIdentity = {login: 'some-host'}
    const paneItem = new EmptyPortalPaneItem({hostIdentity})
    assert.equal(paneItem.getTitle(), '@some-host: No Active File')
  })
})
