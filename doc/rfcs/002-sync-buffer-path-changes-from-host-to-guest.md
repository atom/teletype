# Sync buffer path changes from host to guest

### Status

Implemented. See [#352](https://github.com/atom/teletype/issues/352).

### Summary

We want to add the functionality to have title changes of text-buffers from the host using Teletype to be reflected in the guests' buffers.

### Motivation

As described in [#147](https://github.com/atom/teletype/issues/147), when the host renames a file, the guest should see those changes reflected in their workspace as well.

### Explanation

There is a new file in _Teletype_, called _buffer-file.js_. This File acts as a filler for the `File` object. It implements:

1. `constructor({bufferProxy})`
2. `getPath()` returns the path using the `bufferProxy`'s uri.
3. `createWriteStream()` currently returns `null`, since there is no need to implement it (yet)
4. `pathChanged()` emits a `did-rename` message when called
5. `onDidRename(callback)` allows _atom/Text-Buffer_ to listen to then emit `path-did-change` messages.

This will add an additional workflow to the _Teletype_ process:

1. When the guest initializes their workspace, _teletype-client/Buffer-Proxy_'s `setDelegate` function calls a new function in _teletype/BufferBinding_ called `addFile`, which calls `buffer.setFile()` on a new _teletype/Buffer-File_ object.
2. A subscription is added to _teletype/Buffer-Binding_ to capture when the _Text-Buffer_'s path changes. This will then get what the new URI of the host's _teletype-client/Buffer-Proxy_ should be, and call a function in _Buffer-Proxy_.
3. The Host's _Buffer-Proxy_ will call router to notify all of the guests the new URI of the buffer. After this notification, it will update its URI.
4. The Guest's _Buffer-Proxy_, will add a subscription (upon initialization) to listen for path change notifications from router.
5. Upon router's notification and it will update its URI and call _Buffer-File_'s `pathChanged()` function.
5. _Buffer-File_ emits a `did-rename` message, which causes _atom/Text-Buffer_ to send a `did-change-path` message.
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

Will the addition of `buffer-file.js` be able to assist in some way the efforts of saving a file locally?
