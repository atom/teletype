const RealTimePackage = require('./lib/real-time-package')
module.exports = new RealTimePackage({
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard,
  pusherKey: atom.config.get('real-time.pusherKey'),
  baseURL: atom.config.get('real-time.baseURL')
})
