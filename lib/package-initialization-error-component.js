const etch = require('etch')
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
      $.p(null, 'Make sure your internet connection is working and reload Atom.'),
      $.div(null,
        $.button(
          {
            ref: 'reloadButton',
            type: 'button',
            className: 'btn btn-primary inline-block-tight',
            onClick: this.reloadAtom
          },
          'Reload Atom'
        )
      ),
      $.p(null,
        'If the problem persists, visit ',
        $.a({href: 'https://github.com/atom/teletype/issues/new', className: 'text-info'}, 'atom/teletype'),
        ' and open an issue.'
      )
    )
  }

  reloadAtom () {
    location.reload() // eslint-disable-line no-undef
  }
}
