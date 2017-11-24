module.exports =
class FakeNotificationManager {
  constructor () {
    this.errorCount = 0
  }

  addInfo () {}

  addSuccess () {}

  addError () {
    this.errorCount++
  }
}
