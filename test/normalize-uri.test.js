const assert = require('assert')
const normalizeURI = require('../lib/normalize-uri')

suite('normalizeURI(uri, targetPlatform)', () => {
  test('posix to posix', () => {
    assert.equal(normalizeURI('/home/src/main.js', '/'), '/home/src/main.js')
    assert.equal(normalizeURI('src/main.js', '/'), 'src/main.js')
  })

  test('posix to win32', () => {
    assert.equal(normalizeURI('/home/src/main.js', '\\'), '\\home\\src\\main.js')
    assert.equal(normalizeURI('src/main.js', '\\'), 'src\\main.js')
  })

  test('win32 to posix', () => {
    assert.equal(normalizeURI('C:\\home\\src\\main.js', '/'), 'C:/home/src/main.js')
    assert.equal(normalizeURI('src\\main.js', '/'), 'src/main.js')
  })

  test('win32 to win32', () => {
    assert.equal(normalizeURI('C:\\home\\src\\main.js', '\\'), 'C:\\home\\src\\main.js')
    assert.equal(normalizeURI('src\\main.js', '\\'), 'src\\main.js')
  })
})
