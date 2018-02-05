const TeletypePackage = require('./lib/teletype-package')
module.exports = new TeletypePackage({
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  packageManager: atom.packages,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard,
  pusherKey: atom.config.get('teletype.pusherKey'),
  pusherOptions: {
    cluster: atom.config.get('teletype.pusherCluster'),
    disableStats: true
  },
  baseURL: atom.config.get('teletype.baseURL'),
  getAtomVersion: atom.getVersion.bind(atom)
})
