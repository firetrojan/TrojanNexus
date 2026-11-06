// storage_pick.dart - picks the storage backend once, with a conditional import.
//   mobile / desktop -> FileStorage (storage_file.dart)
//   web              -> PrefsStorage (storage_prefs.dart)
//   anything else    -> MemoryStorage (storage_pick_stub.dart)
//
// The store's Storage interface (storage.dart) never changes.
import 'storage_pick_stub.dart'
    if (dart.library.io) 'storage_pick_io.dart'
    if (dart.library.html) 'storage_pick_web.dart';

export 'storage.dart';
