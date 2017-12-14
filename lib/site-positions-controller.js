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
    this.aboveViewportSitePositionsComponent = this.buildSitePositionsComponent('upper-right')
    this.insideViewportSitePositionsComponent = this.buildSitePositionsComponent('middle-right')
    this.outsideViewportSitePositionsComponent = this.buildSitePositionsComponent('lower-right')
    this.positionsBySiteId = {}
  }

  destroy () {
    this.subscriptions.dispose()
    this.aboveViewportSitePositionsComponent.destroy()
    this.insideViewportSitePositionsComponent.destroy()
    this.outsideViewportSitePositionsComponent.destroy()
  }

  show (containerElement) {
    containerElement.appendChild(this.aboveViewportSitePositionsComponent.element)
    containerElement.appendChild(this.insideViewportSitePositionsComponent.element)
    containerElement.appendChild(this.outsideViewportSitePositionsComponent.element)
    this.visible = true
  }

  hide () {
    this.aboveViewportSitePositionsComponent.element.remove()
    this.insideViewportSitePositionsComponent.element.remove()
    this.outsideViewportSitePositionsComponent.element.remove()
    this.visible = false
  }

  addEditorBinding (editorBinding) {
    this.editorBindingsByEditorProxy.set(editorBinding.editorProxy, editorBinding)

    const didResizeSubscription = editorBinding.onDidResize(() => this.updateActivePositions(this.positionsBySiteId))
    const didScrollSubscription = editorBinding.onDidScroll(() => this.updateActivePositions(this.positionsBySiteId))
    this.subscriptions.add(didResizeSubscription)
    this.subscriptions.add(didScrollSubscription)

    editorBinding.onDidDispose(() => {
      didResizeSubscription.dispose()
      didScrollSubscription.dispose()
      this.editorBindingsByEditorProxy.delete(editorBinding.editorProxy)
    })
  }

  updateActivePositions (positionsBySiteId) {
    const aboveViewportSiteIds = []
    const insideViewportSiteIds = []
    const outsideViewportSiteIds = []

    for (let siteId in positionsBySiteId) {
      siteId = parseInt(siteId)
      if (siteId === this.portal.siteId) continue

      const {editorProxy, position} = positionsBySiteId[siteId]
      const editorBinding = this.editorBindingsByEditorProxy.get(editorProxy)
      if (position && editorBinding && editorBinding.editor === this.workspace.getActivePaneItem()) {
        switch (editorBinding.getDirectionFromViewportToPosition(position)) {
          case 'upward':
            aboveViewportSiteIds.push(siteId)
            break
          case 'inside':
            insideViewportSiteIds.push(siteId)
            break
          case 'downward':
          case 'leftward':
          case 'rightward':
            outsideViewportSiteIds.push(siteId)
            break
        }
      } else {
        outsideViewportSiteIds.push(siteId)
      }
    }

    const followedSiteId = this.portal.getFollowedSiteId()
    this.aboveViewportSitePositionsComponent.update({siteIds: aboveViewportSiteIds, followedSiteId})
    this.insideViewportSitePositionsComponent.update({siteIds: insideViewportSiteIds, followedSiteId})
    this.outsideViewportSitePositionsComponent.update({siteIds: outsideViewportSiteIds, followedSiteId})
    this.positionsBySiteId = positionsBySiteId
  }

  // Private
  buildSitePositionsComponent (position) {
    return new SitePositionsComponent({
      position,
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
