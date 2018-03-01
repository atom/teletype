module.exports = function getEditorURI (portalId, editorProxyId) {
  return 'atom://teletype/portal/' + portalId + '/editor/' + editorProxyId
}
