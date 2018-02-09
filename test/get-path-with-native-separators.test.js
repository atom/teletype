const assert = require('assert')
const getPathWithNativeSeparators = require('../lib/get-path-with-native-separators')

suite('getPathWithNativeSeparators(uri, targetPlatform)', () => {
  test('posix to posix', () => {
    assert.equal(getPathWithNativeSeparators('/home/src/main.js', '/'), '/home/src/main.js')
    assert.equal(getPathWithNativeSeparators('src/main.js', '/'), 'src/main.js')
  })

  test('posix to win32', () => {
    assert.equal(getPathWithNativeSeparators('/home/src/main.js', '\\'), '\\home\\src\\main.js')
    assert.equal(getPathWithNativeSeparators('src/main.js', '\\'), 'src\\main.js')
  })

  test('win32 to posix', () => {
    assert.equal(getPathWithNativeSeparators('C:\\home\\src\\main.js', '/'), 'C:/home/src/main.js')
    assert.equal(getPathWithNativeSeparators('src\\main.js', '/'), 'src/main.js')
  })

  test('win32 to win32', () => {
    assert.equal(getPathWithNativeSeparators('C:\\home\\src\\main.js', '\\'), 'C:\\home\\src\\main.js')
    assert.equal(getPathWithNativeSeparators('src\\main.js', '\\'), 'src\\main.js')
  })
})
