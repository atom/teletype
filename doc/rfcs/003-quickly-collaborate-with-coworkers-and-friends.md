# Quickly collaborate with coworkers and friends

## Status

Proposed

## Summary

A host can share a URL for the portal, and guests can follow the URL to instantly join the portal. (Users will typically share these URLs via a third-party chat service like Slack, IRC, or similar.) Then, once you've collaborated with someone for the first time, you can establish future collaboration sessions with them again directly within Atom.

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
5. Guest clicks portal URL, and the operating systems hands control to Atom, and Atom joins the portal

With the ability to invite past collaborators to your portal from within Atom, we reduce the host's set-up process from 4 steps to 3 steps:

1. Host shares a portal
2. Host selects person in their list of past collaborators
3. Host invites person to join the portal
4. Guest accepts invitation to join portal, and Atom joins the portal

And perhaps we can reduce the host's set-up process even further:

1. Host selects a person in their list of past collaborators
2. Host invites the selected person to a portal, and Atom automatically shares a portal for the host and invites the selected person
3. Guest accepts invitation to join portal, and Atom joins the portal

## Explanation

### Portal URLs

*TODO* Define URL format

### Share a portal via URL

Once a host creates a portal (e.g., by clicking the "share" toggle in Teletype's status bar popover), Teletype presents the host with the portal's URL. The host copies that URL to their clipboard (in the same way that they previously copied the portal ID).

#### Early mockup

<img width="314" src="https://user-images.githubusercontent.com/2988/37489877-6d0b0cfe-286f-11e8-87a3-a04da42994a3.png">

Also consider [Slack's approach](https://github.com/atom/teletype/issues/109#issuecomment-337223084) for potential inspiration.

### Join a portal via URL

When a guest follows the URL (e.g., by clicking on the URL in Slack, IRC, etc.), Atom opens, and Teletype asks the user if they want to join the portal. If the user chooses to join the portal, they become a guest in the portal (just as the previously did by entering the portal ID and clicking "Join"). If they choose not to join the portal, nothing happens.

To honor the [UX guidelines in for Atom URI handlers](https://flight-manual.atom.io/hacking-atom/sections/handling-uris/), Teletype avoids automatically joining the portal. When asking the user whether they want to join the portal, Teletype offers an option to automatically join future portals. This option is disabled by default. When the user enables this option, any time they follow a portal URLs, Teletype will automatically join the portal without the user having to perform an additional confirmation of their desire to join the portal. Users can disable this option at any time via the Teletype settings in Atom's Settings UI.

### Invite a past collaborator to your portal

Teletype provides a list of your past collaborators (i.e., a "buddy list" of sorts). Each time someone joins your portal, Teletype adds them to your list of past collaborators. Each time you join a portal, Teletype adds the host (and any other guests) to your list of past collaborators.

Teletype presents your list of past collaborators sorted alphabetically by username.

When your past collaborators have Atom open and they're signed into Teletype, they appear as "online" in your list of past collaborators. You can select a past collaborator (an "invitee" in this context) and invite them to join your portal. If you're not already hosting a portal, Teletype automatically creates a portal for your workspace. (Note: We probably need to draft a proposal for implementing "presence." Maybe that belongs in this RFC, or maybe it belongs in a separate one.)

Inside the invitee's Atom instance, Teletype informs the invitee that you have invited them to join your portal, and Teletype asks them if they want to join it. If the invitee chooses to join the portal, they see a notification confirming that they've joined the portal. If the invitee declines to join the portal, Teletype notifies the host that the guest declined the invitation.

### Prevent invitations from a past collaborator

You can remove anyone from your list of past collaborators. Once you've removed someone from your list of past collaborators, you will appear as "offline" in their list of past collaborators, and they can no longer invite you to their portal from directly within Atom.

If you later decide that you want to collaborate with them again, you can send them a URL (via Slack, IRC, etc.) to join your portal, or you can ask them to send you a URL (via Slack, IRC, etc.) so that you can join their portal. Once you collaborate in a portal together again, Teletype adds them back to your list of past collaborators, and they can once again see your online/offline status in their list of past collaborators.

### Streamline collaboration while avoiding harassment

With the approach described above, we believe Teletype can provide a streamlined set-up process while also preventing harassment. In order for Teletype to prompt you to join someone's portal, you must first have collaborated with that person in the past (by sending your portal URL to them via a third-party service or by joining their portal via a URL they sent you via a third-party service) *and* that person must still exist in your list of past collaborators (i.e., you haven't removed them from your list of past collaborators). In other words, people that you've never collaborated with cannot cause portal invitations to appear in your editor. And people that you've collaborated with in the past, but don't want to receive invitations from in the future, cannot cause portal invitations to appear in your editor either.

## Out of scope

- Changing the sort order for your list of past collaborators (e.g., sort by how recently you've collaborated, sort or group by online/offline status).
- Limiting the size of your list of past collaborators. In the meantime, you can remove past collaborators to reduce the size of the list.
- Filtering your list of past collaborators
- *TODO*: What else?

## Drawbacks

Why should we *not* do this?

*TODO*

## Rationale and alternatives

- Why is this approach the best in the space of possible approaches?
    - *TODO*
- What other approaches have been considered and what is the rationale for not choosing them?
    - *TODO*
- What is the impact of not doing this?
    - *TODO*

## Unresolved questions

- What unresolved questions do you expect to resolve through the RFC process before this gets merged?
    - If I invite a past collaborator to join my portal, and that person has multiple Atom windows open, can we show the invitation only in the frontmost window?
    - If I invite a past collaborator to join my portal, and that person has Atom windows open on multiple computers, are we OK with showing the invitation on each computer?
    - *TODO*: What else?
- What unresolved questions do you expect to resolve through the implementation of this feature before it is released in a new version of the package?
    - *TODO*
- What related issues do you consider out of scope for this RFC that could be addressed in the future independently of the solution that comes out of this RFC?
    - *TODO*

## Even more TODOs 😇

- Explicitly state that past collaborators have two possible states: online or offline. Setting your status to "away" or "busy" is out of scope for now. Making yourself invisible is out of scope for now. In the meantime, you sign out of Teletype or disable Teletype in Atom's package settings when you want to use Atom while not accepting invitations from your past collaborators.
- What happens if I'm currently a guest and I click to invite someone to a portal?
- Consider discussing implementation for determining presence.
