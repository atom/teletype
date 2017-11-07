const {execFile} = require('child_process')
const path = require('path')

const SERVICE_NAME = 'atom-teletype'

class CredentialCache {
  async get (key) {
    const strategy = await this.getStrategy()
    return strategy.get(SERVICE_NAME, key)
  }

  async set (key, value) {
    const strategy = await this.getStrategy()
    return strategy.set(SERVICE_NAME, key, value)
  }

  async delete (key) {
    const strategy = await this.getStrategy()
    return strategy.delete(SERVICE_NAME, key)
  }

  async getStrategy () {
    if (!this.strategy) {
      if (await KeytarStrategy.isValid()) {
        this.strategy = new KeytarStrategy()
      } else if (SecurityBinaryStrategy.isValid()) {
        this.strategy = new SecurityBinaryStrategy()
      } else {
        console.warn('Falling back to storing credentials in memory. Auth tokens will only be stored for the lifetime of the current window.')
        this.strategy = new InMemoryStrategy()
      }
    }

    return this.strategy
  }
}

let keytar
function getKeytar () {
  if (!keytar) {
    const bundledKeytarPath = path.join(atom.getLoadSettings().resourcePath, 'node_modules', 'keytar')
    keytar = require(bundledKeytarPath)
  }

  return keytar
}

class KeytarStrategy {
  static async isValid () {
    try {
      await getKeytar().setPassword('atom-test-service', 'test-key', 'test-value')
      const value = await getKeytar().getPassword('atom-test-service', 'test-key')
      getKeytar().deletePassword('atom-test-service', 'test-key')
      return value === 'test-value'
    } catch (err) {
      return false
    }
  }

  get (service, key) {
    return getKeytar().getPassword(service, key)
  }

  set (service, key, value) {
    return getKeytar().setPassword(service, key, value)
  }

  delete (service, key) {
    return getKeytar().deletePassword(service, key)
  }
}

class SecurityBinaryStrategy {
  static isValid () {
    return process.platform === 'darwin'
  }

  async get (service, key) {
    try {
      const value = await this.execSecurityBinary(['find-generic-password', '-s', service, '-a', key, '-w'])
      return value.trim() || null
    } catch (error) {
      return null
    }
  }

  set (service, key, value) {
    return this.execSecurityBinary(['add-generic-password', '-s', service, '-a', key, '-w', value, '-U'])
  }

  delete (service, key) {
    return this.execSecurityBinary(['delete-generic-password', '-s', service, '-a', key])
  }

  execSecurityBinary (args) {
    return new Promise((resolve, reject) => {
      execFile('security', args, (error, stdout) => {
        if (error) { return reject(error) }
        return resolve(stdout)
      })
    })
  }
}

class InMemoryStrategy {
  constructor () {
    this.credentials = new Map()
  }

  get (service, key) {
    const valuesByKey = this.credentials.get(service)
    if (valuesByKey) {
      return Promise.resolve(valuesByKey.get(key))
    } else {
      return Promise.resolve(null)
    }
  }

  set (service, key, value) {
    let valuesByKey = this.credentials.get(service)
    if (!valuesByKey) {
      valuesByKey = new Map()
      this.credentials.set(service, valuesByKey)
    }

    valuesByKey.set(key, value)
    return Promise.resolve()
  }

  delete (service, key) {
    const valuesByKey = this.credentials.get(service)
    if (valuesByKey) valuesByKey.delete(key)
    return Promise.resolve()
  }
}

Object.assign(CredentialCache, {KeytarStrategy, SecurityBinaryStrategy, InMemoryStrategy})
module.exports = CredentialCache
