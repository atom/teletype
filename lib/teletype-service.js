module.exports =
class TeletypeService {
  constructor ({teletypePackage}) {
    this.teletypePackage = teletypePackage
  }

  async getRemoteEditors () {
    const portalBindingManager = await this.teletypePackage.getPortalBindingManager()
    if (portalBindingManager) {
      return portalBindingManager.getRemoteEditors()
    } else {
      return []
    }
  }
}
