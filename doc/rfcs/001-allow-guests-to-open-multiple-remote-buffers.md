# Allow guests to view multiple remote buffers

## Status

Implemented. See [#268](https://github.com/atom/teletype/issues/268).

## Summary

Allow a separate guest editor for each open buffer in the host's workspace.

## Motivation

Currently, guests can only view host buffers through a specialized "portal editor" that automatically switches its contents to track the active editor of the host. This automatic switching can interrupt guests in the middle of typing. It also makes it impossible for guests to edit any buffer other than the one the host is actively editing.

Ideally, guests would be able to edit any file in the host's current project, but that will require replication of the file-system which is beyond the scope of this proposal. We can get much closer to that ideal by giving guests access to any open buffer in the host's workspace. This can be implemented without substantial changes to the current replication architecture.

## Explanation

### Remote buffers

Just as guests can open editors for local buffers corresponding to files on their local file system, they can also open editors for *remote buffers* corresponding to buffers in any remote workspace that they have joined.

When the host closes the portal, all the remote buffers in the guest's workspace are preserved, but will become untitled and unsaved (just as they did prior to this RFC).

### Following

When you first join a portal as a guest, you're automatically *following* the host. This means that you jump to the host's current position and continue to follow them as they move between buffers.

In order to jump to the host's current position, an editor is automatically added to your workspace for their active buffer when you first join their workspace. If you continue to follow the host, any time they switch to a new buffer, a new editor for that remote buffer is automatically added to your workspace and focused. Existing editors for previous remote buffers are not automatically closed when this switch occurs.

When a host closes a buffer, it will be removed from all guest portals.

You can follow any other guest participating in the host's workspace in the exact same way. If they move between buffers, you will follow them. The host does not enjoy any special privilege with respect to the ability to be followed between different files.

When viewing an editor associated with a portal, each participant sees the avatars for the other portal participants (just as they did prior to this RFC). As a host, when your active pane item is a local editor (i.e., an editor that you're sharing in your portal), the editor shows the avatars for the other portal participants. As a guest, when your active pane item is a remote editor (i.e., an editor that you're viewing from the host's portal), the editor shows the avatars for the other portal participants. All avatars appear in the bottom right of the editor. If the participant's active pane item is an editor associated with the portal, you can click on the participant's avatar to follow them. If the participant is working in a pane item not associated with the portal, you can't follow that participant to their current location.

Editors for remote buffers are *only* automatically opened when you are following another collaborator. If you are not following someone, no editors are automatically opened. When you start following another collaborator again, an editor will be automatically opened based on their location. You can also open any buffer in the host's workspace directly by navigating to it...

### Navigation

As a guest of a shared workspace, you don't automatically receive access to the host's file system. Tools like the tree view, the file finder, and project search don't have access to their current project. (This capability will be the subject of an upcoming RFC).

For now, however, the file finder *will* be augmented to make it easy for you to navigate any buffer that the host currently has open in their workspace. These remote buffers will be decorated with the avatar of the host that owns their workspace.

## Drawbacks

Currently, a portal always corresponds to a single tab. This keeps things really simple. To leave the portal, you just close the tab. Now there could be multiple editors in your workspace that are part of a remote workspace, which increases complexity.

When you follow someone between multiple buffers, editors for remote buffers may start to stack up in your workspace. Some may consider this to be too cluttered. If this becomes problematic, we could add an option to automatically close an editor upon following a collaborator to a different buffer or just make that the default behavior.

## Rationale and alternatives

The workspace and the project are *both* pieces of state worth sharing. The workspace is more transient, representing a "working set" of resources that a developer is looking at *right now*. Ideally, any resource in this working set should be able to be accessed by collaborators. This includes the set of open buffers, but it could also include other state such as a terminal session, a debugger, console output, etc.

We want to *also* give access to a host's entire project, which represents a set of file system directories they're currently working on, a much larger set of resources than their current working set. However, even when we do add this feature, there's a role for being able to access any buffer a host has open in their workspace, because not every buffer corresponds to a file in a project. The host could open any file on their file system without adding its parent folder to their project, and we still want to be able to collaborate on it.

Sharing a workspace is a complement to sharing a project, and since it is technically simpler than sharing a project and we already have the infrastructure in place to add this, it's worth doing soon.

## Unresolved questions

Should we retain the vocabulary of "portals", or is it simpler to just refer to this state as a "shared workspace."" The original concept of a portal seems to have been subsumed by the concept of "following" a collaborator in a shared workspace.
