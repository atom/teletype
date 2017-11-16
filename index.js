const TeletypePackage = require('./lib/teletype-package')
module.exports = new TeletypePackage({
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard,
  pusherKey: atom.config.get('teletype.pusherKey'),
  pusherOptions: {
    cluster: atom.config.get('teletype.pusherCluster'),
  },
  baseURL: atom.config.get('teletype.baseURL')
})
