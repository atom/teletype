module.exports =
class FakePortal {
  createBufferProxy () {
    return {
      dispose () {},
      setDelegate () {}
    }
  }

  createEditorProxy () {
    return {
      dispose () {},
      setDelegate () {},
      updateSelections () {}
    }
  }

  follow (siteId) {
    this.followedSiteId = siteId
  }

  unfollow () {
    this.followedSiteId = null
  }

  getFollowedSiteId () {
    return this.followedSiteId
  }

  activateEditorProxy (editorProxy) {
    this.activeEditorProxy = editorProxy
  }

  removeEditorProxy () {}

  getActiveEditorProxy () {
    return this.activeEditorProxy
  }

  setDelegate (delegate) {
    this.delegate = delegate
  }

  getSiteIdentity (siteId) {
    return {login: 'site-' + siteId}
  }
}
