# Quickly collaborate with coworkers and friends

## Status

Proposed

## Summary

Once you've collaborated with someone for the first time, you can establish future collaboration sessions with them again directly within Atom.

## Motivation

We hope to encourage more collaboration by reducing the barriers to entry. Specifically, we want to reduce the number of steps that exist between A) deciding that you *want* to collaborate and B) *actually* collaborating.

Today, the transition from A to B involves the following steps:

1. Host shares a portal
2. Host copies portal URL to their clipboard
3. Host switches from Atom to third-party communication tool (e.g., Slack, IRC)
4. Host pastes portal URL into third-party communication tool
5. Guest clicks portal URL, and the operating system hands control to Atom, and Atom joins the portal

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

### Invite a past collaborator to your portal

Teletype provides a list of your past collaborators (i.e., a "buddy list" of sorts). Each time someone joins your portal, Teletype adds them to your list of past collaborators. Each time you join a portal, Teletype adds the host (and any other guests) to your list of past collaborators.

Teletype presents your list of past collaborators sorted alphabetically by username.

When your past collaborators have Atom open and they're signed into Teletype, they appear as "online" in your list of past collaborators.

You can select a past collaborator (an "invitee" in this context) and invite them to join your portal. If you're not already hosting a portal, Teletype automatically creates a portal for your workspace.

Inside the invitee's Atom instance, Teletype informs the invitee that you have invited them to join your portal, and Teletype asks them if they want to join it. If the invitee is offline when you invite them to join your portal, they'll see your invitation the next time they open Atom.

If the invitee chooses to join the portal, they see a notification confirming that they've joined the portal. If the invitee declines to join the portal, Teletype notifies the host that the guest declined the invitation.

If the invitee declines your invitation, you cannot re-invite to the same portal. There's probably a reason why they didn't join, so there's no need to bug them even more. If you think they declined by accident, reach out to them via a third-party chat service and send them the URL to join your portal.

### Prevent invitations from a past collaborator

You can remove anyone from your list of past collaborators. To do so, right-click on them and remove them:

![Mockup: Remove Past Collaborator](https://user-images.githubusercontent.com/378023/37639861-67778f8e-2c56-11e8-994f-428802fa9191.png)

Once you've removed someone from your list of past collaborators, you will appear as "offline" in their list of past collaborators, and they can no longer invite you to their portal from directly within Atom.

If you later decide that you want to collaborate with them again, you can send them a URL (via Slack, IRC, etc.) to join your portal, or you can ask them to send you a URL (via Slack, IRC, etc.) so that you can join their portal. Once you collaborate in a portal together again, Teletype adds them back to your list of past collaborators, and they can once again see your online/offline status in their list of past collaborators.

### Mockups

#### Inviting a past collaborator

![](https://user-images.githubusercontent.com/378023/37643605-6947af84-2c64-11e8-94b6-849e81fd8cd0.png)

### Collaborator states

You can see the collaborators that are currently in your portal, the state of the other invitations that you've sent, and the online/offline state of all past and current collaborators:

![](https://user-images.githubusercontent.com/378023/37642043-1d66797e-2c5f-11e8-8def-01f063888979.png)

The list of past collaborators has a `max-height`. If the list exceeds the `max-height`, you can scroll. The scrolling area includes sent and rejected invitations.

#### Simultaneously participating in multiple portals

While probably not very common, it's possible to host a portal while also participating as a guest in other portals.

![](https://user-images.githubusercontent.com/378023/37640529-6a5ddaac-2c59-11e8-82f5-9ee4c2ed42a5.png)

## Out of scope

In the interest of getting the highest impact functionality in users' hands as quickly as possible and then iterating based on real-world feedback, the following functionality is out of scope for this RFC, but may be addressed in follow-up releases.

- Changing your online/offline status
    - Setting your status to offline. (In the meantime, you can sign out of Teletype or disable Teletype in Atom's package settings when you want to use Atom while not accepting invitations from your past collaborators.)
    - Setting your status to "away" or "busy"
- UX enhancements to the list of past collaborators
    - Changing the sort order for your list of past collaborators (e.g., sort by how recently you've collaborated, sort or group by online/offline status)
    - Limiting the size of your list of past collaborators. (In the meantime, you can remove past collaborators to reduce the size of the list.)
    - Filtering your list of past collaborators
    - Marking certain collaborators as "favorites"
- Selecting a past collaborator and asking to join their portal
- Selecting multiple past collaborators and inviting them to your portal simultaneously. (In the meantime, you can select a collaborator and invite them, then select another collaborator and invite them, and so on.)
- Providing option to join portal in a new window [[discussion](https://github.com/atom/teletype/pull/344#discussion_r175569812)]

## Drawbacks

- Some people might feel uneasy knowing that past collaborators can see if they are "online" (i.e., if they have Atom open and they're signed into Teletype).
- Once Teletype provides a list of past collaborators, people may want to be able to chat with those collaborators from within Teletype. While we may eventually want to support chat, any chat-related functionality must exist in service of Teletype's primary vision of "making it as easy to code together as it is to code alone." We'll need to be diligent to avoid scope creep.
- Depending on the technical solution we choose for implementing presence, we may incur increased server-side resource consumption and/or we may take on additional operational complexity.

## Rationale and alternatives

##### Why is this approach the best in the space of possible approaches?

With the approach described above, we believe Teletype can provide a streamlined set-up process while also preventing harassment. In order for Teletype to prompt you to join someone's portal, you must first have collaborated with that person in the past (by sending your portal URL to them via a third-party service or by joining their portal via a URL they sent you via a third-party service) *and* that person must still exist in your list of past collaborators (i.e., you haven't removed them from your list of past collaborators). In other words, people that you've never collaborated with cannot cause portal invitations to appear in your editor. And people that you've collaborated with in the past, but don't want to receive invitations from in the future, cannot cause portal invitations to appear in your editor either.

##### What other approaches have been considered and what is the rationale for not choosing them?

- Teletype could allow you to enter a person's GitHub username (or their email address) to invite them to your portal. This would remove the need for sharing a URL via a third-party service in order to collaborate, and it would reduce the need to provide a list of past collaborators (i.e., you could just enter a username each time you want to collaborate). However, it would make it possible for any GitHub user to cause invitations to appear inside your Atom instance. This introduces a vector for harassment, so we're avoiding this approach.
- Teletype could allow you to invite other users that you're already associated with in some way (e.g., fellow collaborators on a GitHub repository, fellow members of a GitHub organization or team). This would remove the need for sharing a URL via a third-party service in order to collaborate, and it would reduce the need to provide a list of past collaborators, and it would reduce the harassment vector described in the previous bullet. However, it would introduce tradeoffs that we'd prefer to avoid:
    - Teletype would need additional permissions (i.e., [OAuth scopes](https://developer.github.com/apps/building-oauth-apps/scopes-for-oauth-apps/#available-scopes)) to fetch the list of users you're associated with. (Today, Teletype  uses a scopeless token and has no access to your private information.)
    - Some users belong to organizations with thousands of members. Just because you're a member of the same organization as someone else doesn't mean that you're comfortable seeing portal invitations from them.
- Teletype could add support for audio before adding support for inviting past collaborators to your portal. When collaborating with people in different physical locations, you'll likely need audio support in order to collaborate. Since Teletype doesn't currently provide audio support, these collaborators will still need a third-party solution for audio. If you're already relying on a third-party solution for audio, you can often use that same solution to send your collaborators your portal ID, which reduces the need for Teletype providing a list of past collaborators. However, there are still many [scenarios where it's helpful to quickly invite a past collaborator even if Teletype doesn't yet support audio](https://github.com/atom/teletype/pull/344#discussion_r175319913).

##### What is the impact of not doing this?

People will collaborate less often. Given the additional steps needed to start collaborating, there will be more instances where people decide that it's not worth the effort (i.e., people will enjoy rich collaboration less often).

## Unresolved questions

##### What unresolved questions do you expect to resolve through the RFC process before this gets merged?

- If I invite a past collaborator to join my portal, and that person has multiple Atom windows open, can we show the invitation only in the frontmost window?
- If I invite a past collaborator to join my portal, and that person has Atom windows open on multiple computers, are we OK with showing the invitation on each computer?
- Where will the list of past collaborators appear in the UI? How do I show/hide this list?

##### What unresolved questions do you expect to resolve through the implementation of this feature before it is released in a new version of the package?

- What architecture/services/libraries will we use to implement presence?
- In order to provide the functionality described above, does teletype-server need to persist your list of past collaborators, or can we meet these needs while only storing this data locally?
- If the host invites a past collaborator to their portal and then closes the portal before the invitee joins the portal, what should an invitee see/experience to inform them that the portal no longer exists?

##### What related issues do you consider out of scope for this RFC that could be addressed in the future independently of the solution that comes out of this RFC?

See [out of scope](#out-of-scope) section above.
