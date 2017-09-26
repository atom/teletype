const assert = require('assert')
const EmptyPortalPaneItem = require('../lib/empty-portal-pane-item')

suite('EmptyPortalPaneItem', () => {
  test('copy()', () => {
    const paneItem = new EmptyPortalPaneItem()
    assert.equal(paneItem.copy(), null)
  })

  test('serialize()', () => {
    const paneItem = new EmptyPortalPaneItem()
    assert.equal(paneItem.serialize(), null)
  })
})
