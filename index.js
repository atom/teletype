const TeletypePackage = require('./lib/teletype-package')
module.exports = new TeletypePackage({
  config: atom.config,
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  packageManager: atom.packages,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard,
  pusherKey: atom.config.get('teletype.dev.pusherKey'),
  pusherOptions: {
    cluster: atom.config.get('teletype.dev.pusherCluster'),
    disableStats: true
  },
  baseURL: atom.config.get('teletype.dev.baseURL'),
  getAtomVersion: atom.getVersion.bind(atom)
})
