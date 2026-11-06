import 'package:nexus/core/exporters.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/model/thread.dart';

import 'golden.dart';

Map<String, Object?> _opts(Object? value) => (value as Map).cast<String, Object?>();

List<Resource> _resources(Object? value) => (value as List).map((raw) {
      final x = raw as Map;
      final r = normalizeResource(x.cast<String, Object?>());
      r.src = x['src'] is String ? x['src'] as String : '';
      r.type = x['type'] is String ? x['type'] as String : '';
      r.nextCheck = x['nextCheck'] is String ? x['nextCheck'] as String : '';
      return r;
    }).toList();

void main() {
  runGolden('exporters', <String, GoldenFn>{
    'typeName': (a) => typeName(a[0]),
    'stageName': (a) => stageName(a[0]),
    'pick': (a) => pick(ExportState.fromJson(a[0]), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}).map((r) => r.id).toList(),
    'taskText': (a) => taskText(a[0] is List ? _resources(a[0]) : normalizeResource((a[0] as Map).cast<String, Object?>()), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}),
    'missionTask': (a) {
      final byId = <String, Resource>{};
      for (final e in (a[1] as Map).entries) {
        byId[e.key.toString()] = normalizeResource((e.value as Map).cast<String, dynamic>());
      }
      return missionTask(normalizeThread((a[0] as Map).cast<String, dynamic>()), byId);
    },
    'markdownAll': (a) => markdownAll(ExportState.fromJson(a[0]), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}, '2026-10-31'),
    'csvAll': (a) => csvAll(ExportState.fromJson(a[0]), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}),
    'estimateTokens': (a) => estimateTokens(a[0].toString()),
    'aiBrief': (a) => aiBrief(ExportState.fromJson(a[0]), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}),
    'upcomingEvents': (a) => upcomingEvents(_resources(a[0]), a.length > 1 ? _opts(a[1]) : const <String, Object?>{}),
    'icsFor': (a) {
      final o = a.length > 1 ? _opts(a[1]) : <String, Object?>{};
      if (o['now'] is String) o['now'] = DateTime.parse(o['now'] as String);
      return icsFor((a[0] as List).map((x) => (x as Map).cast<String, Object?>()).toList(), o);
    },
    'gcalLink': (a) => gcalLink((a[0] as Map).cast<String, Object?>()),
    'whatsappLink': (a) => whatsappLink(a[0].toString()),
    'mailtoLink': (a) => mailtoLink(a[0].toString(), a[1].toString(), a.length > 2 ? a[2] as int : 1800),
  });
}
