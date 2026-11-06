// storage_pick_io.dart - Android / iOS / desktop: the JSON file on disk.
import 'storage.dart';
import 'storage_file.dart';

Storage createDefaultStorage(String path) => FileStorage(path);
