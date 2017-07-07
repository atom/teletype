const PRODUCTION_REAL_TIME_PUSHER_KEY = 'f119821248b7429bece3'
const PRODUCTION_REAL_TIME_BASE_URL = 'https://atom-tachyon.herokuapp.com'

const RealTimePackage = require('./lib/real-time-package')
module.exports = new RealTimePackage({
  workspace: atom.workspace,
  notificationManager: atom.notifications,
  commandRegistry: atom.commands,
  tooltipManager: atom.tooltips,
  clipboard: atom.clipboard,
  pusherKey: process.env.REAL_TIME_PUSHER_KEY || PRODUCTION_REAL_TIME_PUSHER_KEY,
  baseURL: process.env.REAL_TIME_BASE_URL || PRODUCTION_REAL_TIME_BASE_URL
})
