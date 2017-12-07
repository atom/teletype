const {FollowState} = require('@atom/teletype-client')

module.exports =
class FakePortal {
  constructor () {
    this.activeEditorProxyChangeCount = 0
  }

  createBufferProxy () {
    return {
      dispose () {},
      setDelegate () {},
      createCheckpoint () {},
      groupChangesSinceCheckpoint () {},
      applyGroupingInterval () {}
    }
  }

  createEditorProxy () {
    return {
      dispose () {
        this.delegate.dispose()
      },
      setDelegate (delegate) {
        this.delegate = delegate
      },
      updateSelections () {}
    }
  }

  follow (siteId) {
    this.followedSiteId = siteId
    this.setFollowState(FollowState.RETRACTED)
  }

  unfollow () {
    this.followedSiteId = null
    this.setFollowState(FollowState.DISCONNECTED)
  }

  setFollowState (followState) {
    this.followState = followState
  }

  resolveFollowState () {
    return this.followState
  }

  getFollowedSiteId () {
    return this.followedSiteId
  }

  activateEditorProxy (editorProxy) {
    this.activeEditorProxy = editorProxy
    this.activeEditorProxyChangeCount++
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
