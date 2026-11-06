import 'package:nexus/core/model/resource.dart';
import 'package:nexus/core/tags.dart';

import 'golden.dart';

void main() {
  runGolden('tags', {
    'cleanTag': (a) => cleanTag(a[0] as String?),
    'tagCounts': (a) {
      final raw = a[0] as List<dynamic>;
      final resources = raw.map((x) => normalizeResource(x)).toList();
      return tagCounts(resources).map((x) => x.toJson()).toList();
    },
    'retag': (a) {
      final raw = a[0] as List<dynamic>;
      final resources = raw.map((x) => normalizeResource(x)).toList();
      return retag(resources, a[1], a[2]);
    },
    'similarTags': (a) {
      final raw = a[0] as List<dynamic>;
      final counts = raw.map(TagCount.fromJson).toList();
      return similarTags(counts).map((x) => x.toJson()).toList();
    },
  });
}
