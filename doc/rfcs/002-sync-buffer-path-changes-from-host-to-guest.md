# Sync buffer path changes from host to guest

### Status

Implemented. See [#352](https://github.com/atom/teletype/issues/352).

### Summary

We want to add the functionality to have title changes of text-buffers from the host using Teletype to be reflected in the guests' buffers.

### Motivation

As described in [#147](https://github.com/atom/teletype/issues/147), when the host renames a file, the guest should see those changes reflected in their workspace as well.

### Explanation

There is a new class in _Teletype/buffer-binding.js_, called _RemoteFile_. This File acts as a filler for the `File` object. It implements:

1. `constructor({uri})`
2. `dispose()`
3. `getPath()` returns the path using the uri configured by `getPathWithNativeSeparators`.
4. `setURI(uri)` sets the new uri and emits `did-rename`.
5. `onDidRename(callback)` allows _atom/TextBuffer_ to listen to then emit `path-did-change` messages.
6. `existsSync()` required function for filler file objects; returns `False`.

This will add an additional workflow to the _Teletype_ process:

1. When the guest initializes their workspace, _teletype/BufferBinding_'s `setBufferProxy` function makes a new `RemoteFile` with _BufferProxy_'s `uri`. It then calls `buffer.setFile()` on this new object.
2. A subscription is added to _teletype/BufferBinding_ to capture when the _TextBuffer_'s path changes. This subscription, when triggered will call `relayURIChange()`,  which will update the host's _BufferProxy_'s URI. `relayURIChange` sets the new URI by calling `setURI` in _BufferProxy_ using the results of `getBufferProxyURI`.
3. The Host's _BufferProxy_ will use the `BufferProxyUpdate` schema to relay changes to all of the Guest's _BufferProxy_s to change their `URI`s. Then it will update its own `URI`.
4. The Guest's _BufferProxy_, upon getting the update message will invoke the _teletype/BufferBinding_'s `didChangeURI` function.
5. This calls `setURI` in `RemoteFile` to update its `URI` and emits a `did-rename` message, which causes _atom/TextBuffer_ to send a `did-change-path` message.
6. The Guest's _teletype/EditorBinding_'s monkey bindings are updated such that the URI constant is removed, and is updated when `getTitle()` is invoked.

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
