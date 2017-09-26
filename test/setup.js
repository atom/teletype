const {createRunner} = require('atom-mocha-test-runner')
const {ipcRenderer} = require('electron')
ipcRenderer.setMaxListeners(15)

module.exports = createRunner({}, function (mocha) {
  mocha.ui('tdd')
})
