module.exports =
class FakePortal {
  follow (siteId) {
    this.followedSiteId = siteId
  }

  unfollow () {
    this.followedSiteId = null
  }

  getFollowedSiteId () {
    return this.followedSiteId
  }

  activateEditorProxy () {}

  setDelegate (delegate) {
    this.delegate = delegate
  }

  getSiteIdentity (siteId) {
    return {login: 'site-' + siteId}
  }
}
