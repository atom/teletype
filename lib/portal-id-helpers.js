function findPortalId (string) {
  const CONTAINS_UUID_REGEXP = /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/
  const match = string.match(CONTAINS_UUID_REGEXP)
  return match ? match[0] : null
}

function isPortalId (string) {
  const IS_UUID_REGEXP = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/
  return IS_UUID_REGEXP.test(string)
}

module.exports = {findPortalId, isPortalId}
