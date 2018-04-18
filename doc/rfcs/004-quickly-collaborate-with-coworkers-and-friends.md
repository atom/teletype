# Quickly collaborate with coworkers and friends

## Status

Proposed

## Summary

A user can add any of their recent collaborators to a list of "trusted collaborators." Once two people have added each other to their list of trusted collaborators, they can establish future collaboration sessions with each other from directly within Atom.

## Motivation

We hope to encourage more collaboration by reducing the barriers to entry. Specifically, we want to reduce the number of steps that exist between A) deciding that you *want* to collaborate and B) *actually* collaborating.

Today, the transition from A to B involves the following steps:

1. Host shares a portal
2. Host copies portal URL to their clipboard
3. Host switches from Atom to third-party communication tool (e.g., Slack, IRC)
4. Host pastes portal URL into third-party communication tool
5. Guest clicks portal URL, and the operating system hands control to Atom, and Atom joins the portal

With the ability to invite trusted collaborators to your portal from within Atom, we reduce the set-up process from 5 steps to just 3 steps:

1. Host selects a person in their list of trusted collaborators
2. Host invites the selected person to a portal, and Atom automatically shares a portal for the host and invites the selected person
3. Guest accepts invitation to join portal, and Atom joins the portal

## Explanation

### Accept portal invitations from a trusted collaborator

Teletype provides a list of your recent collaborators. Each time a guest joins your portal, Teletype adds them to your list of recent collaborators. Each time you join a portal, Teletype adds the host to your list of recent collaborators.

You can select a past collaborator and inform Teletype that you're willing to allow them to see when you're online [A], and that you're willing to receive portal invitations from them directly within Atom, thus identifying them as a "trusted collaborator."

![](https://user-images.githubusercontent.com/378023/38798126-a2ccb7f8-419b-11e8-92d2-df0b57f311ec.png)

You can also choose to remove a person from your list of recent collaborators. [[motivation](https://github.com/atom/teletype/pull/344#discussion_r182509071)]

## Invite a trusted collaborator to your portal

Teletype presents your list of trusted collaborators sorted alphabetically by username.

If you have designated a person as a trusted collaborator, and they have also designated you as a trusted collaborator, then you can see whether they're online [A], and they can see whether you're online.

You can select a trusted collaborator that is currently online (an "invitee" in this context) and invite them to join your portal. If you're not already hosting a portal, Teletype automatically creates a portal for your workspace.

![](https://user-images.githubusercontent.com/378023/38798163-c1dc4226-419b-11e8-9b96-5db9a9c90221.png)

If the invitee chooses to join the portal, the portal opens in the invitee's workspace (just as it does when joining a portal via a URL).

If the invitee declines to join the portal, Teletype notifies you that the guest declined your invitation. You cannot re-invite that invitee to the same portal. (There's probably a reason why they didn't join, so there's no need to bug them even more. If you think they declined by accident, reach out to them via a third-party chat service and send them the URL to join your portal.)

![](https://user-images.githubusercontent.com/378023/38798235-f85f6e86-419b-11e8-9508-8d6a97b541f1.png)

## Stop accepting invitations from a trusted collaborator

To stop receiving invitations from a trusted collaborator, you can remove them from your list of trusted collaborators. Once you've removed someone from your list of trusted collaborators, you will appear as "offline" to them, and they can no longer invite you to their portal from directly within Atom.

There are two ways to remove someone from your list of trusted collaborators:

- When you decline an invitation to join a portal, Teletype presents the to option to block future invitations from that person (i.e., to remove them from your trusted collaborators).

    ![](https://user-images.githubusercontent.com/378023/38803217-79518b02-41a9-11e8-9f07-0f0085fc994f.png)

- At any time, you can right-click a person in your list of trusted collaborators and remove them:

    ![](https://user-images.githubusercontent.com/378023/38803345-e0087c3e-41a9-11e8-8c59-23c5a9a38bb9.png)

If you decide that you want to collaborate with them again, you can send them a URL (via Slack, IRC, etc.) to join your portal, or you can ask them to send you a URL (via Slack, IRC, etc.) so that you can join their portal, or you can add them back to your list of trusted collaborators.

## Additional privacy and safety considerations

1. **Opt-in to receiving invitations (or don't)** - Choosing to accept in-Atom portal invitations is entirely opt-in. You'll only receive portal invitations from trusted collaborators. You control this "whitelist" and can change it at any time. Teletype won't show you any kind of invitation or request from people outside your list of trusted collaborators. [[motivation](https://github.com/atom/teletype/pull/344#pullrequestreview-105405268)]
2. **Opt-out safely at any time** - At any time, you can remove a person from your list of trusted collaborators.   
    1. You'll no longer receive invitations from them within Atom.
    2. They observe no indication that you have removed them. You simply appear offline to them, just as you appeared when you were actually offline, and just as you appeared to them before you first added them as a trusted collaborator. [[motivation](https://github.com/atom/teletype/pull/344#discussion_r175911322)]
    3. Because they observe no indication that you have removed them, they may still have you in their list of trusted collaborators (i.e., their list of people that _they_ are willing to accept in-Atom portal invitations from). But because you appear offline to them, they cannot invite you to join their portal.

### Mockups

#### Viewing collaborator states

You can see the collaborators that are currently in your portal, the state of the other invitations that you've sent, and the online/offline state of all your trusted collaborators:

![](https://user-images.githubusercontent.com/378023/38805994-dc3438ba-41b2-11e8-83b4-10c97a039e4e.png)

#### Max height

The list of trusted and rencent collaborators has a `max-height`. If both lists combined exceeds the `max-height`, you can scroll.

![](https://user-images.githubusercontent.com/378023/38806124-32fb5412-41b3-11e8-9a11-4e921cb0a160.png)

#### Simultaneously participating in multiple portals

While probably not very common, it's possible to host a portal while also participating as a guest in other portals.

![](https://user-images.githubusercontent.com/378023/38806255-a5380bec-41b3-11e8-9c73-b1f598158120.png)

## Out of scope

In the interest of getting the highest impact functionality in users' hands as quickly as possible and then iterating based on real-world feedback, the following functionality is out of scope for this RFC, but may be addressed in follow-up releases.

1. Changing your online/offline status [A]
    - Setting your status to offline. (In the meantime, you can sign out of Teletype or disable Teletype in Atom's package settings when you want to use Atom while not accepting invitations from your trusted collaborators.)
    - Setting your status to "away" or "busy"
2. UX enhancements to the list of recent collaborators and trusted collaborators
    - Changing the sort order for your list of collaborators (e.g., sort by how recently you've collaborated)
    - Limiting the size of your list of trusted collaborators. (In the meantime, you can remove trusted collaborators to reduce the size of the list.)
    - Filtering your list of trusted collaborators
    - Marking certain trusted collaborators as "favorites"
3. Selecting a trusted collaborator and asking to join their portal
4. Selecting multiple trusted collaborators and inviting them to your portal simultaneously. (In the meantime, you can select a collaborator and invite them, then select another collaborator and invite them, and so on.)
5. Providing option to join portal in a new window [[discussion](https://github.com/atom/teletype/pull/344#discussion_r175569812)]
6. Automatically preventing portal invitations from trusted collaborators that have been flagged as suspended/spammy on github.com

## Drawbacks

1. Once Teletype allows you to designate a list of trusted collaborators, people may want to be able to chat with those collaborators from within Teletype. While we may eventually want to support chat, any chat-related functionality must exist in service of Teletype's primary vision of "making it as easy to code together as it is to code alone." We'll need to be diligent to avoid scope creep.
2. Today, when a host shares a portal, the host sends their peer information to Teletype so that guests can query Teletype to determine how to connect to the host. Teletype has no peering information for other users (e.g., users that a host might want to invite to their portal). In order for Teletype to communicate a portal invitation to a user, Teletype will need some way of sending a message to the user. Depending on the technical solution we choose, we may incur increased server-side resource consumption and/or we may take on additional operational complexity.

## Rationale and alternatives

##### Why is this approach the best in the space of possible approaches?

With the approach described above, we believe Teletype can provide a more streamlined set-up process while also preventing harassment. To establish a collaboration session with a coworker or friend directly within Atom, we each add each other as trusted collaborators, and then we can start collaborating at any time with just a couple clicks. With this mutual consent model, you're in complete control of which users can communicate with you.

##### What other approaches have been considered and what is the rationale for not choosing them?

1. **Invite anyone to collaborate by username**: Teletype could allow you to enter a person's GitHub username (or their email address) to invite them to your portal. This would remove the need for sharing a URL via a third-party service in order to collaborate, and it would reduce the need to maintain a list of trusted collaborators (i.e., you could just enter a username each time you want to collaborate). However, it would make it possible for any GitHub user to cause invitations to appear inside your Atom instance. This introduces a vector for harassment, so we're avoiding this approach.
2. **Invite anyone to collaborate by username, and ignore invitations from blocked users**: To reduce the harassment concerns described in the previous bullet, Teletype could require that you grant it additional permissions so that it can read your [blocked user settings](https://developer.github.com/v3/users/blocking/) to determine whether to show you an invitation from a particular user. With this approach, if a user blocks a person on github.com, Teletype could automatically prevent invitations from the blocked person. However, this approach introduces tradeoffs that we'd prefer to avoid:
    - Users would need to grant Teletype substantially greater permissions in order for Teletype to check users' block lists. Due to coarse-grained OAuth scopes, users would need to [grant Teletype permission to read/write their private email addresses, update their github.com profile, etc.][user-scope-request] Teletype would no longer be able to simply require [read-only permission to each user's public info][scopeless-request].
    - Some users would still likely receive unwanted portal invitations from users they haven't formally blocked. A popular developer might receive a ton of unwanted invitations, and/or a harasser might send invitations to people that haven't yet blocked them. Because of this, Teletype would likely still need to provide some additional safety/spam prevention on top of integrating with the user's github.com block list.
3. **Ask for permission to send in-Atom portal invitations to a user**: To avoid seeing in-Atom portal invitations from the general public, Teletype could require that you first request a person's permission to send them portal invitations [[discussion](https://github.com/atom/teletype/pull/344#issuecomment-375663822)]. (This approach is similar to a "friend request" on Facebook.) To avoid receiving friend requests from users that you've blocked on github.com, Teletype would need permission to read your block list. This approach therefore suffers from the same issues described in the previous bullet.
4. **Invite any fellow org member to collaborate**: Teletype could allow you to invite other users that you're already associated with in some way (e.g., fellow collaborators on a GitHub repository, fellow members of a GitHub organization or team). This would remove the need for sharing a URL via a third-party service in order to collaborate, and it would reduce the need to maintain a list of trusted collaborators, and it would reduce the harassment vector described in the previous bullets. However, it would introduce tradeoffs that we'd prefer to avoid:
    - Teletype would need additional permissions (i.e., [OAuth scopes](https://developer.github.com/apps/building-oauth-apps/scopes-for-oauth-apps/#available-scopes)) to fetch the list of users you're associated with. (Today, Teletype  uses a scopeless token and therefore has no access to your private information.)
    - Some users belong to organizations with thousands of members. Just because you're a member of the same organization as someone else doesn't mean that you're comfortable seeing portal invitations from them.
5. **Ask for public data permission first, and only ask for more permissions if you want to receive in-Atom portal invitations.** Several of the alternatives above require Teletype to request additional permissions. Because those permissions are only needed to control which users can send you in-Atom portal invitations, Teletype could initially request the existing permissions (i.e., [read-only permission to your public info][scopeless-request]), and Teletype could defer asking for [additional permissions][user-scope-request] until you opt in to receiving in-Atom portal invitations. Users that are turned off by the request for greater permissions could continue using Teletype with URLs to establish collaboration sessions. This approach would allow Teletype to prevent invitations from users that you've blocked on github.com. However, just because you haven't blocked a user doesn't mean that you're comfortable with that user seeing your online/offline status; we'd still need some other mechanism for controlling who can see your online/offline status.
6. **Add support for audio before adding in-Atom portal invitations**: Teletype could add support for audio before adding support for establishing collaboration sessions directly within Atom. When collaborating with people in different physical locations, you'll likely need audio support in order to collaborate. Since Teletype doesn't currently provide audio support, these collaborators will still need a third-party solution for audio. If you're already relying on a third-party solution for audio, you can often use that same solution to send your collaborators your portal URL, which reduces the need for Teletype to maintain a list of trusted collaborators. However, there are still many [scenarios where it's helpful to quickly invite a trusted collaborator even if Teletype doesn't yet support audio](https://github.com/atom/teletype/pull/344#discussion_r175319913).

##### What is the impact of not doing this?

People will collaborate less often. Given the additional steps needed to start collaborating, there will be more instances where people decide that it's not worth the effort (i.e., people will enjoy rich collaboration less often).

## Unresolved questions

##### What unresolved questions do you expect to resolve through the RFC process before this gets merged?

- If I invite a trusted collaborator to join my portal, and that person has multiple Atom windows open, can we show the invitation only in the frontmost window? Similarly, if that person has Atom windows open on multiple computers, are we OK with showing the invitation on each computer? _Answer_: The invitation will appear in all open Atom windows where the user is signed into Teletype. Once the user accepts or declines the invitation on in one Atom window, Teletype will dismiss the invitation in the other Atom windows. [[discussion](https://github.com/atom/teletype/pull/344#pullrequestreview-105123633)]

##### What unresolved questions do you expect to resolve through the implementation of this feature before it is released in a new version of the package?

- What architecture/services/libraries will we use to communicate portal invitations?
- In order to provide the functionality described above, does teletype-server need to persist your list of trusted collaborators, or can we meet these needs while only storing this data locally?
- If the host invites a trusted collaborator to their portal and then closes the portal before the invitee joins the portal, what should an invitee see/experience to inform them that the portal no longer exists?

##### What related issues do you consider out of scope for this RFC that could be addressed in the future independently of the solution that comes out of this RFC?

See [out of scope](#out-of-scope) section above.

---

[A] A user is **online** if they have Atom open, and Teletype is installed, and they are signed into Teletype, and their network allows them to successfully communicate with `api.teletype.atom.io`. In all other situations, the user is considered to be **offline**.

[scopeless-request]: https://user-images.githubusercontent.com/2988/38115271-65e65928-3379-11e8-9945-4a15ceb857fe.png

[user-scope-request]: https://user-images.githubusercontent.com/2988/38115272-65f69784-3379-11e8-8753-4da6547c7edb.png
