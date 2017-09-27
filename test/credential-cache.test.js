const assert = require('assert')
const CredentialCache = require('../lib/credential-cache')
const {KeytarStrategy, SecurityBinaryStrategy, InMemoryStrategy} = CredentialCache

suite('CredentialCache', async () => {
  test('get, set, and delete with various strategies', async () => {
    const cache = new CredentialCache()

    if (await KeytarStrategy.isValid()) {
      cache.strategy = new KeytarStrategy()

      await cache.set('foo', 'bar')
      assert.equal(await cache.get('foo'), 'bar')
      await cache.delete('foo')
      assert.equal(await cache.get('foo'), null)
    } else {
      console.warn('Skipping tests for CredentialCache.KeytarStrategy because keytar is not working in this build of Atom')
    }

    if (SecurityBinaryStrategy.isValid()) {
      cache.strategy = new SecurityBinaryStrategy()

      await cache.set('foo', 'bar')
      assert.equal(await cache.get('foo'), 'bar')
      await cache.delete('foo')
      assert.equal(await cache.get('foo'), null)
    } else {
      console.warn('Skipping tests for credential.SecurityBinaryStrategy because it only works on macOS')
    }

    cache.strategy = new InMemoryStrategy()
    await cache.set('foo', 'bar')
    assert.equal(await cache.get('foo'), 'bar')
    await cache.delete('foo')
    assert.equal(await cache.get('foo'), null)
  })
})
