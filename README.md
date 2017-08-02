# real-time

Welcome to the **TOP SECRET** real-time package!

⚠️❗🔐 This package is super duper top secret for now. Please don't mention it to any non-Hubbers. 🔐❗⚠️

## Installation

### Command Line

1. Install [Atom 1.19 Beta](https://atom.io/beta) or newer
2. In the terminal, install the package via apm:

    ```sh
    apm install atom/real-time
    ```

### GUI

1. Install [Atom 1.19 Beta](https://atom.io/beta) or newer
1. Launch Atom
1. Open Settings View using <kbd>Cmd+,</kbd> on macOS or <kbd>Ctrl+,</kbd> on other platforms
1. Click the Install tab on the left side
1. Enter `https://github.com/atom/real-time` in the search box
1. Click the "Install" button

## Usage

Once you've installed the package, you're ready to start collaborating in real-time.

- To share your workspace, open the command palette and run the _Real Time: Share Portal_ command. Then, use Slack to send the portal ID to the GitHubbers that you want to collaborate with.
- To join a portal,  open the command palette, run the _Real Time: Join Portal_ command, and enter the portal ID.

## Demo

[![Real-time Collaboration in Atom](https://github-talks.s3.amazonaws.com/uploads/138/1089/e52cacb3-2d21-4974-b24e-545a33a684ef.embed_cover.jpg)](https://githubber.tv/jasonrudolph/real-time-collaboration-in-atom)

## Known issues

It's super early days for the real-time package, so there are a few things you'll want to keep in mind:

- Portals use security-by-obscurity for now. Anyone with your portal ID can join your portal. (We'll address this in [Milestone 2](https://github.com/github/atom-log/blob/1f94a5b7ce6f90d9232d51663c9a6adf728831d6/real-time-collaboration/portals-roadmap.md#milestone-2-authentication-and-presence).)
- If you're wondering what's coming next, check out the [roadmap](https://github.com/github/atom-log/blob/master/real-time-collaboration/portals-roadmap.md).
- If you notice any issues or have any feedback, please [open an issue](https://github.com/atom/real-time/issues/new) or ping us (@as-cii, @jasonrudolph, @nathansobo) in the [#atom-real-time][#atom-real-time] channel.

## Development

**Prerequisites**: For now, you must be a member of the [@atom/hubbers team in npm](https://www.npmjs.com/org/atom/team/hubbers#members). If you aren't, please drop a note in [#atom-real-time][#atom-real-time] and we'll add you.

```sh
git clone https://github.com/atom/real-time
cd real-time
apm install
apm link
```

[#atom-real-time]: https://github.slack.com/messages/C65B6TS0K/details/
