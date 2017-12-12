const etch = require('etch')
const $ = etch.dom

module.exports =
class PackageOutdatedComponent {
  constructor (props) {
    this.props = props
    etch.initialize(this)
  }

  update (props) {
    Object.assign(this.props, props)
    return etch.update(this)
  }

  render () {
    return $.div({className: 'PackageOutdatedComponent'},
      $.h3(null, 'Teletype is out of date'),
      $.p(null, 'You will need to update the package to resume collaborating.'),
      $.button(
        {
          ref: 'viewPackageSettingsButton',
          className: 'btn btn-primary btn-sm',
          onClick: this.viewPackageSettings
        },
        'Check Package Updates'
      )
    )
  }

  viewPackageSettings () {
    return this.props.workspace.open('atom://config/updates')
  }
}
