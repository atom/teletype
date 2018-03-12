# Update Buffer Titles in Guest's Workspace

### Status

Proposed

### Summary

We want to add the functionality to have title changes of text-buffers from the host using Teletype to be reflected in the guests' buffers.

### Motivation

As described in [#147](https://github.com/atom/teletype/issues/147), when the host renames a file, the guest should see those changes reflected in their workspace as well.

### Explanation

This will add an additional workflow to the _Teletype_ process:

1. A subscription is added to _teletype/Buffer-Binding_ to capture when the _Text-Buffer_'s path changes. This will then get what the new URI of the host's _teletype-client/Buffer-Proxy_ should be, and call a function in _Buffer-Proxy_.
2. The Host's _Buffer-Proxy_ will call router to notify all of the guests the new URI of the buffer. After this notification, it will update its URI.
3. The Guest's _Buffer-Proxy_, will add a subscription (upon initialization) to listen for path change notifications from router.
4. Upon router's notification and it will update its URI. It will then notify the _Text-Buffer_ to send an emitter that its path has changed.
5. This emitter is called by an added helper function in _atom/Text-Buffer_.
6. The Guest's _teletype/Editor-Binding_'s monkey bindings are updated such that the URI constant is removed, and is updated when `getTitle()` is invoked.

### Drawbacks

We have not yet seen any drawbacks to this.

### Rationale and alternatives

> Why is this approach the best in the space of possible approaches?

We believe that this is the best approach to this issue, since it is the most direct way to notify the guests of this change using the current structure of Atom and Teletype.

>What other approaches have been considered and what is the rationale for not choosing them?

We used the process in place in the Teletype package.

>What is the impact of not doing this?

When the host saves a new file, the host will see the the buffer's title and path updated to reflect the new filename, but guests will continue to see the buffer identified as "untitled" in their workspaces.

Similarly, when the host renames a file (e.g., from `foo.txt` to `foo.md`), the host will see the new filename reflected in the UI, and the host will see the new grammar applied to the editor, but guests will continue to see the old filename and its old grammar.

### Unresolved questions

At the step of calling the _Text-Buffer_'s helper function to emit a `path-did-change`, should this message be called from the _Buffer-Binding_ or the _Buffer-Proxy_. 
