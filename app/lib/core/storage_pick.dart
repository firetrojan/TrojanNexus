// storage_pick.dart - picks the storage backend once, with a conditional export.
//   mobile / desktop -> FileStorage (storage_pick_io.dart)
//   web              -> PrefsStorage (storage_pick_web.dart)
//   anything else    -> MemoryStorage (storage_pick_stub.dart)
//
// An export (not an import) so callers see `createDefaultStorage` from whichever
// branch matched. All three branch files declare the same function with the same
// signature: `Storage createDefaultStorage(String path)`.
export 'storage_pick_stub.dart'
    if (dart.library.io) 'storage_pick_io.dart'
    if (dart.library.js_interop) 'storage_pick_web.dart';

export 'storage.dart';
