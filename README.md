# teletype

Welcome to the **TOP SECRET** teletype package!

⚠️❗🔐 This package is super duper top secret for now. Please don't mention it to any non-Hubbers. 🔐❗⚠️

## Installation

### Command Line

1. Install [Atom 1.21](https://atom.io) or newer
2. In the terminal, install the package via apm:

    ```sh
    apm install atom/teletype
    ```

### GUI

1. Install [Atom 1.21](https://atom.io) or newer
1. Launch Atom
1. Open Settings View using <kbd>Cmd+,</kbd> on macOS or <kbd>Ctrl+,</kbd> on other platforms
1. Click the Install tab on the left side
1. Enter `https://github.com/atom/teletype` in the search box and press <kbd>Enter</kbd>
1. Click the "Install" button that appears

## Usage

Once you've installed the package, you're ready to start collaborating in teletype.

- To share your workspace, open the command palette and run the _Teletype: Share Portal_ command. Then, use Slack to send the portal ID to the GitHubbers that you want to collaborate with.
- To join a portal,  open the command palette, run the _Teletype: Join Portal_ command, and enter the portal ID.

## Demo

[![Real-time Collaboration in Atom](https://github-talks.s3.amazonaws.com/uploads/138/1089/e52cacb3-2d21-4974-b24e-545a33a684ef.embed_cover.jpg)](https://githubber.tv/jasonrudolph/teletype-collaboration-in-atom)

## Known issues

It's super early days for the teletype package, so there are a few things you'll want to keep in mind:

- Portals use security-by-obscurity for now. Anyone with your portal ID can join your portal. (We'll address this in [Milestone 2](https://github.com/github/atom-log/blob/1f94a5b7ce6f90d9232d51663c9a6adf728831d6/teletype-collaboration/portals-roadmap.md#milestone-2-authentication-and-presence).)
- If you're wondering what's coming next, check out the [roadmap](https://github.com/github/atom-log/blob/master/teletype-collaboration/portals-roadmap.md).
- If you notice any issues or have any feedback, please [open an issue](https://github.com/atom/teletype/issues/new) or ping us (@as-cii, @jasonrudolph, @nathansobo) in the [#atom-teletype][#atom-teletype] channel.

## Development

**Prerequisites**: For now, you must be a member of the [@atom/hubbers team in npm](https://www.npmjs.com/org/atom/team/hubbers#members). If you aren't, please drop a note in [#atom-teletype][#atom-teletype] and we'll add you.

```sh
git clone https://github.com/atom/teletype
cd teletype
apm install
apm link
```

[#atom-teletype]: https://github.slack.com/messages/C65B6TS0K/details/
