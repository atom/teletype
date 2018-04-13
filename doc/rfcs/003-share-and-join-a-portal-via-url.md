# Share and join a portal via URL

## Status

Implemented. See [#109](https://github.com/atom/teletype/issues/109).

## Summary

A host can share a URL for the portal, and guests can follow the URL to instantly join the portal. Users will typically share these URLs via a third-party chat service like Slack, IRC, or similar.

## Motivation

We hope to encourage more collaboration by reducing the barriers to entry. Specifically, we want to reduce the number of steps that exist between A) deciding that you *want* to collaborate and B) *actually* collaborating.

Today, the transition from A to B involves the following steps:

1. Host shares a portal
2. Host copies portal ID to their clipboard
3. Host switches from Atom to third-party communication tool (e.g., Slack, IRC)
4. Host pastes portal ID into third-party communication tool
5. Guest selects portal ID and copies it to their clipboard
6. Guest switches from third-party communication tool to Atom
7. Guest clicks "Join a portal" link or invokes "Join portal" command, and Atom automatically fetches the portal ID from the clipboard
8. Guest clicks "Join"

With the ability to join a portal via a URL, we can reduce the guest's set-up process from 4 steps to just 1 step:

1. Host shares a portal
2. Host copies portal URL to their clipboard
3. Host switches from Atom to third-party communication tool (e.g., Slack, IRC)
4. Host pastes portal URL into third-party communication tool
5. Guest clicks portal URL, and the operating system hands control to Atom, and Atom joins the portal

## Explanation

### Share a portal via URL

Once a host creates a portal (e.g., by clicking the "share" toggle in Teletype's status bar popover), Teletype presents the host with the portal's URL. The host copies that URL to their clipboard (in the same way that they previously copied the portal ID).

#### Portal URL format

Prior Teletype releases established a URI structure for identifying editors in Atom's workspace: `atom://teletype/portal/<portal-id>/editor/<editor-id>`

Portal URLs use that same pattern, but exclude the editor ID: `atom://teletype/portal/<portal-id>`

The `<portal-id>` is the same ID used in prior releases for sharing and joining a portal.

Example: `atom://teletype/portal/63b120f3-b646-4c46-8962-656518249186`

### Join a portal via URL

When a guest follows the URL (e.g., by clicking on the URL in Slack, IRC, etc.), Atom opens, and Teletype asks the user if they want to join the portal. If the user chooses to join the portal, they become a guest in the portal (just as they previously did by entering the portal ID and clicking "Join"). If they choose not to join the portal, nothing happens.

To honor the [UX guidelines for Atom URI handlers](https://flight-manual.atom.io/hacking-atom/sections/handling-uris/), Teletype avoids automatically joining the portal. When asking the user whether they want to join the portal, Teletype offers an option to automatically join future portals. This option is disabled by default. When the user enables this option, any time they follow a portal URL, Teletype will automatically join the portal without the user having to perform an additional confirmation of their desire to join the portal. Users can disable this option at any time via the Teletype settings in Atom's Settings UI.

## Drawbacks

If the host has upgraded to the new version of the package and the guest still has the old version, nothing will happen when the guest follows the portal URL (since the old version doesn't have support for handling URLs). To avoid this potential cause for confusion, we'll bump the protocol version so that everybody is prompted to upgrade to the latest teletype version before they're able to continue using Teletype.

## Rationale and alternatives

##### Why is this approach the best in the space of possible approaches?

N/A: The featured shipped before we completed the RFC. 😇

##### What other approaches have been considered and what is the rationale for not choosing them?

N/A: The featured shipped before we completed the RFC. 😇

##### What is the impact of not doing this?

People will collaborate less often. Given the additional steps needed to start collaborating, there will be more instances where people decide that it's not worth the effort (i.e., people will enjoy rich collaboration less often).

## Unresolved questions

##### What unresolved questions do you expect to resolve through the RFC process before this gets merged?

None.

##### What unresolved questions do you expect to resolve through the implementation of this feature before it is released in a new version of the package?

None.

##### What related issues do you consider out of scope for this RFC that could be addressed in the future independently of the solution that comes out of this RFC?

- Offering to install Teletype if you click on a portal URL and don't yet have Teletype installed ([#220](https://github.com/atom/teletype/issues/220)) (e.g., potentially using https://atom.io for the portal URLs)
- Providing option to join portal in a new window [[discussion](https://github.com/atom/teletype/pull/344#discussion_r175569812)]
