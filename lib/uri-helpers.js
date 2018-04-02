function getPortalURI (portalId) {
  return 'atom://teletype/portal/' + portalId
}

function getEditorURI (portalId, editorProxyId) {
  return getPortalURI(portalId) + '/editor/' + editorProxyId
}

module.exports = {getEditorURI, getPortalURI}
