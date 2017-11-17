# Allow guests to view multiple remote buffers

## Status

This is a proposal and is not yet implemented.

## Summary

Allow a separate guest editor for each open buffer in the host's workspace.

## Motivation

Currently, guests can only view host buffers through a specialized "portal editor" that automatically switches its contents to track the active editor of the host. This automatic switching can interrupt guests in the middle of typing. It also makes it impossible for guests to edit any buffer other than the one the host is actively editing.

Ideally, guests would be able to edit any file in the host's current project, but that will require replication of the file-system which is beyond the scope of this proposal. We can get much closer to that ideal by giving guests access to any open buffer in the host's workspace. This can be implemented without substantial changes to the current replication architecture.

## Explanation

### Remote buffers

Just as guests can open editors for local buffers corresponding to files on their local file system, they can also open editors for *remote buffers* corresponding to buffers in any remote workspace that they have joined.

### Following

When you first join a portal as a guest, you're automatically *following* the host. This means that you jump to the host's current position and continue to follow them as they move between buffers.

In order to jump to the host's current position, an editor is automatically added to your workspace for their active buffer when you first join their workspace. If you continue to follow the host, any time they switch to a new buffer, a new editor for that remote buffer is automatically added to your workspace and focused. Existing editors for previous remote buffers are not automatically closed when this switch occurs.

If you stop following the host, either manually or automatically due to them navigating away while you are still typing, then when they change their active editor your workspace is unaffected. If you start following the host again then a new editor may be added to your workspace based on their current location so that you can continue to follow them.

You can follow any other guest participating in the host's workspace in the exact same way. If they move between buffers, you will follow them. The host does not enjoy any special privilege with respect to the ability to be followed between different files.

### Navigation

As a guest of a shared workspace, you don't automatically receive access to the host's file system. Tools like the tree view, the file finder, and project search don't have access to their current project. (This capability will be the subject of an upcoming RFC).

For now, however, the file finder *will* be augmented to make it easy for you to navigate any buffer that the host current has open in their workspace. These remote buffers will be decorated with the avatar of the host that owns their workspace.

## Drawbacks

Currently, a portal always corresponds to a single tab. This keeps things really simple. To leave the portal, you just close the tab. Now there could be multiple editors in your workspace that are part of a remote workspace, which increases complexity.

When you follow someone between multiple buffers, editors for remote buffers may start to stack up in your workspace. Some may consider this to be too cluttered. If this becomes problematic, we could adding an option to automatically close an editor upon following a collaborator to a different buffer or just make that the default behavior.

## Rationale and alternatives

## Unresolved questions
