// storage_prefs.dart - the web backend: one JSON string in shared_preferences.
// The mobile file backend lives in storage_file.dart; storage_pick.dart picks between them.
import 'package:shared_preferences/shared_preferences.dart';

import 'storage.dart';

class PrefsStorage implements Storage {
  PrefsStorage(this.key);

  final String key;

  @override
  Future<String?> read() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(key);
  }

  @override
  Future<void> write(String json) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, json);
  }
}
