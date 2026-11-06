// storage_pick_stub.dart - the fallback when neither backend is available
// (for example a Flutter test running on the VM without a backend). Keeps the
// app usable instead of failing to compile.
import 'storage.dart';

Storage createDefaultStorage(String path) => MemoryStorage();
