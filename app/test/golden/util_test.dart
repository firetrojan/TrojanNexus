import 'package:nexus/core/dupes.dart';
import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/util.dart';

import 'golden.dart';

void main() {
  runGolden('util', {
    'normUrl': (a) => normUrl(a[0] as String?),
    'domainOf': (a) => domainOf(a[0] as String?),
    'shortUrl': (a) => shortUrl(a[0] as String?, (a[1] as num).toInt()),
    'daysBetween': (a) => daysBetween(a[0] as String?, a[1] as String?),
    'addDays': (a) => addDays(a[0] as String?, (a[1] as num).toInt()),
    'plural': (a) => plural(
          a[0] as num,
          a[1] as String,
          a.length > 2 ? a[2] as String? : null,
        ),
    'isHttpUrl': (a) => isHttpUrl(a[0] as String?),
    'clamp': (a) => clamp(a[0] as num, a[1] as num, a[2] as num),
    'lerp': (a) => lerp(a[0] as num, a[1] as num, a[2] as num),
    'damp': (a) => damp(
          a[0] as num,
          a[1] as num,
          a[2] as num,
          a[3] as num,
        ),
    'hash32': (a) => hash32(a[0] as String?),
    'uniq': (a) => uniq(a[0] as List<dynamic>),
    'esc': (a) => esc(a[0]),
    'relDays': (a) => relDays((a[0] as num).toInt()),
    'fmtDate': (a) => fmtDate(a[0] as String?),
    'parseISO': (a) {
      final d = parseISO(a[0] as String?);
      return d == null ? null : <String, Object?>{'y': d.year, 'm': d.month, 'd': d.day};
    },
    'iso': (a) => iso(DateTime(
          (a[0] as num).toInt(),
          (a[1] as num).toInt(),
          (a[2] as num).toInt(),
        )),
  });

  // siteKey lives in util.dart for T1.1; its golden module is dupes.
  runGolden('dupes', {
    'siteKey': (a) => siteKey(a[0] as String?),
    'siteIndex': (a) {
      final resources = (a[0] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      return siteIndex(resources).map(
        (k, v) => MapEntry(k, v.map((r) => r.id).toList()),
      );
    },
    'sameSite': (a) {
      final me = normalizeResource(a[0]);
      final resources = (a[1] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      return sameSite(me, siteIndex(resources))
          .map((x) => <String, Object?>{'id': x.r.id, 'same': x.same})
          .toList();
    },
    'flagEntries': (a) {
      final entries = (a[0] as List<dynamic>)
          .map((x) => ImportEntry(
                url: (x as Map)['url']?.toString() ?? '',
                title: x['title']?.toString() ?? '',
                src: x['src']?.toString() ?? '',
              ))
          .toList();
      final resources = (a[1] as List<dynamic>)
          .map((x) => normalizeResource(x))
          .toList();
      return flagEntries(entries, resources).map((x) {
        return <String, Object?>{
          'entry': x.entry.url,
          'others': x.others.map((o) => o.toJson()).toList(),
        };
      }).toList();
    },
  });
}
