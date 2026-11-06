// storage.dart - the small persistence interface the store writes through.
// Backends live in storage_file.dart (io) and the app/web wiring (future).
abstract class Storage {
  Future<String?> read();
  Future<void> write(String json);
}

/// In-memory backend for tests and for a first run before a real backend is
/// ready. It keeps the last value and counts writes.
class MemoryStorage implements Storage {
  MemoryStorage([this.value]);

  String? value;
  int writes = 0;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String json) async {
    value = json;
    writes++;
  }
}
