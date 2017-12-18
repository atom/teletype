module.exports =
class TeletypeService {
  constructor ({teletypePackage}) {
    this.teletypePackage = teletypePackage
  }

  async getRemoteBuffers () {
    const portalBindingManager = await this.teletypePackage.getPortalBindingManager()
    if (portalBindingManager) {
      return portalBindingManager.getRemoteBuffers()
    } else {
      return null
    }
  }
}
