// storage_pick_web.dart - web: one JSON string in shared_preferences.
// `path` is ignored there; a browser has no file path to save to.
import 'storage.dart';
import 'storage_prefs.dart';

Storage createDefaultStorage(String path) => PrefsStorage('nexus.v1');
