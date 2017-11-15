# Teletype for Atom

An Atom package that lets developers share their workspace with team members and collaborate on code in real time.

Learn more at [teletype.atom.io](https://teletype.atom.io).

![demo](https://user-images.githubusercontent.com/2988/32753167-d781baf0-c899-11e7-8b64-683ab84d3a8c.gif)

## Installation

### Command Line

1. Install [Atom 1.22](https://atom.io) or newer
2. In the terminal, install the package via apm:

    ```sh
    apm install teletype
    ```

### GUI

1. Install [Atom 1.22](https://atom.io) or newer
1. Launch Atom
1. Open Settings View using <kbd>Cmd+,</kbd> on macOS or <kbd>Ctrl+,</kbd> on other platforms
1. Click the Install tab on the left side
1. Enter `teletype` in the search box and press <kbd>Enter</kbd>
1. Click the "Install" button that appears

## Hacking

This package is powered by three main components:

- [teletype-crdt](https://github.com/atom/teletype-crdt): The string-wise sequence CRDT that enables peer-to-peer collaborative editing.
- [teletype-server](https://github.com/atom/teletype-server): The server-side application that facilitates peer discovery.
- [teletype-client](https://github.com/atom/teletype-client): The editor-agnostic library that manages the interaction with other clients.

### Dependencies

To run teletype tests locally, you'll first need to have:

- Atom 1.22 or later
- Node 7+
- PostgreSQL 9.x

### Running locally

1. Clone and bootstrap

    ```
    git clone https://github.com/atom/teletype.git
    cd teletype
    createdb teletype-test
    apm install
    ```

2. Run the tests

    ```
    atom --test test
    ```
