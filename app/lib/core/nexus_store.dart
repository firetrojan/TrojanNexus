// nexus_store.dart - the small Flutter-facing wrapper around StoreCore.
// StoreCore has no Flutter imports; this file only adds change notifications.
import 'package:flutter/foundation.dart';

import 'model/job.dart';
import 'model/resource.dart';
import 'model/settings.dart';
import 'model/thread.dart';
import 'store_core.dart';

class NexusStore extends ChangeNotifier {
  NexusStore(this.core) {
    core.onChange = (_, __) => notifyListeners();
    core.onSettings = (_) => notifyListeners();
  }

  final StoreCore core;

  List<Resource> get resources => core.resources;
  List<Job> get jobs => core.jobs;
  List<Thread> get threads => core.threads;
  Settings get settings => core.settings;

  Future<void> load([Object? seed]) async {
    await core.loadFromStorage(seed);
    notifyListeners();
  }

  Future<void> save() => core.save();
  Future<void> flush() => core.flush();

  Map<String, Object?> exportData() => <String, Object?>{
        ...core.exportData(),
        'resources': resources.map((x) => x.toJson()).toList(),
        'jobs': jobs.map((x) => x.toJson()).toList(),
        'threads': threads.map((x) => x.toJson()).toList(),
      };

  Map<String, Object?> importBackup(Object? data, [String mode = 'merge']) =>
      core.importBackup(data, mode);
  Map<String, Object?> previewBackup(Object? data) => core.previewBackup(data);

  Resource addResource(Map<String, Object?> partial, [List<String> jobIds = const []]) =>
      core.addResource(partial, jobIds);
  Resource? updateResource(String id, Map<String, Object?> patch, [bool silent = false]) =>
      core.updateResource(id, patch, silent);
  Map<String, Object?> bulkUpdate(List<String> ids, Map<String, Object?> patch,
          [Map<String, Object?> o = const <String, Object?>{}]) =>
      core.bulkUpdate(ids, patch, o);
  bool deleteResource(String id) => core.deleteResource(id);
  Map<String, Object?>? mergeResources(String keep, String drop,
          [Map<String, Object?> o = const <String, Object?>{}]) =>
      core.mergeResources(keep, drop, o);
  Job addJob([Map<String, Object?> data = const <String, Object?>{}]) =>
      core.addJob(data);
  Job createSector(String name, List<String> ids, [Object? color]) =>
      core.createSector(name, ids, color);
  Thread addThread(String name, [List<Object?> steps = const []]) =>
      core.addThread(name, steps);
  void setSetting(String key, Object? value) => core.setSetting(key, value);
  Object? getSetting(String key) => core.getSetting(key);
}
