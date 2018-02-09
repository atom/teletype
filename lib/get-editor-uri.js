module.exports = function getEditorURI (portalId, editorProxyId) {
  return 'teletype://' + portalId + '/editor/' + editorProxyId
}
