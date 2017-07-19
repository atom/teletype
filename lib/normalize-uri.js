const path = require('path')

const WINDOWS_PATH_SEP_SEARCH_PATTERN = /\\/g
const POSIX_PATH_SEP_SEARCH_PATTERN = /\//g

module.exports =
function normalizeURI (uri, targetPathSeparator = path.sep) {
  const PATH_SEP_SEARCH_PATTERN = (targetPathSeparator === '/') ? WINDOWS_PATH_SEP_SEARCH_PATTERN : POSIX_PATH_SEP_SEARCH_PATTERN
  return uri.replace(PATH_SEP_SEARCH_PATTERN, targetPathSeparator)
}
