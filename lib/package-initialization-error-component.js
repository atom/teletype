const etch = require('etch')
const {URL} = require('url')
const $ = etch.dom

module.exports =
class PackageInitializationErrorComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  render () {
    return $.div({className: 'PackageInitializationErrorComponent'},
      $.h3(null, 'Teletype initialization failed'),
      $.p(null, 'Make sure your internet connection is working and restart the package.'),
      $.div(null,
        $.button(
          {
            ref: 'reloadButton',
            type: 'button',
            className: 'btn btn-primary inline-block-tight',
            onClick: this.restartTeletype
          },
          'Restart Teletype'
        )
      ),
      $.p(null,
        'If the problem persists, visit ',
        $.a({href: this.getIssueURL(), className: 'text-info'}, 'atom/teletype'),
        ' and open an issue.'
      )
    )
  }

  getIssueURL () {
    const {initializationError} = this.props

    const url = new URL('https://github.com/atom/teletype/issues/new')
    url.searchParams.append('title', 'Package Initialization Error')
    url.searchParams.append('body',
      '### Diagnostics\n\n' +
      '```\n' +
      initializationError.diagnosticMessage + '\n\n' +
      '```\n' +
      '### Versions\n\n' +
      `**Teletype version**: v${getTeletypeVersion()}\n` +
      `**Atom version**: ${this.props.getAtomVersion()}\n` +
      `**Platform**: ${process.platform}\n`
    )

    return url.href
  }

  async restartTeletype () {
    const {packageManager} = this.props
    await packageManager.deactivatePackage('teletype')
    await packageManager.activatePackage('teletype')
  }
}

function getTeletypeVersion () {
  return require('../package.json').version
}
