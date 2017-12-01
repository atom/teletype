const path = require('path')

// Load package style sheets for the given environment so that the package's
// UI elements are styled correctly.
exports.loadPackageStyleSheets = function (environment) {
  const packageStyleSheetPath = path.join(__dirname, '..', '..', 'styles', 'teletype.less')
  const compiledStyleSheet = environment.themes.loadStylesheet(packageStyleSheetPath)
  environment.styles.addStyleSheet(compiledStyleSheet)
}
