const {CompositeDisposable} = require('atom')
const SitePositionsComponent = require('./site-positions-component')

module.exports =
class SitePositionsController {
  constructor ({portal, workspace}) {
    this.portal = portal
    this.workspace = workspace
    this.subscriptions = new CompositeDisposable()
    this.editorBindingsByEditorProxy = new WeakMap()
    this.visible = false
    this.sitePositionsComponent = this.buildSitePositionsComponent()

    this.positionsBySiteId = {}
  }

  destroy () {
    this.subscriptions.dispose()
    this.sitePositionsComponent.destroy()
  }

  show (containerElement) {
    containerElement.appendChild(this.sitePositionsComponent.element)
    this.visible = true
  }

  hide () {
    this.sitePositionsComponent.element.remove()
    this.visible = false
  }

  addEditorBinding (editorBinding) {
    this.editorBindingsByEditorProxy.set(editorBinding.editorProxy, editorBinding)

    editorBinding.onDidDispose(() => {
      this.editorBindingsByEditorProxy.delete(editorBinding.editorProxy)
    })
  }

  updateActivePositions (positionsBySiteId) {
    const insideEditorSiteIds = []
    const outsideEditorSiteIds = []

    for (let siteId in positionsBySiteId) {
      siteId = parseInt(siteId)
      if (siteId === this.portal.siteId) continue

      const {editorProxy, position} = positionsBySiteId[siteId]
      const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      if (position && editorBinding && editorBinding.editor === this.workspace.getActivePaneItem()) {
        insideEditorSiteIds.push(siteId)
      } else {
        outsideEditorSiteIds.push(siteId)
      }
    }

    const followedSiteId = this.portal.getFollowedSiteId()
    this.sitePositionsComponent.update({insideEditorSiteIds, outsideEditorSiteIds, followedSiteId})
    this.positionsBySiteId = positionsBySiteId
  }

  // Private
  buildSitePositionsComponent () {
    return new SitePositionsComponent({
      displayedParticipantsCount: 3,
      portal: this.portal,
      onSelectSiteId: (siteId) => {
        if (siteId === this.portal.getFollowedSiteId()) {
          this.portal.unfollow()
        } else {
          this.portal.follow(siteId)
        }
      }
    })
  }
}
