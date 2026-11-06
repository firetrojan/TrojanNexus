import 'package:nexus/core/buckets.dart';
import 'package:nexus/core/constants.dart';
import 'package:nexus/core/model/resource.dart';

import 'golden.dart';

void main() {
  runGolden('store', {
    'dueBucket': (a) => dueBucket(
          normalizeResource(a[0]),
          a.length > 1 ? a[1] as String : null,
        ),
    'staleInfo': (a) => staleInfo(
          normalizeResource(a[0]),
          a.length > 1 ? a[1] as String : null,
        )?.toJson(),
    'trialBucket': (a) => trialBucket(
          normalizeResource(a[0]),
          a.length > 1 ? a[1] as String : null,
        ),
    'resetBucket': (a) => resetBucket(
          normalizeResource(a[0]),
          a.length > 1 ? a[1] as String : null,
        ),
    'watchChanged': (a) => watchChanged(normalizeResource(a[0])),
    'TYPES': (a) => TYPES,
    'STATUSES': (a) => STATUSES,
    'CADENCES': (a) => CADENCES,
    'CADENCE_DAYS': (a) => CADENCE_DAYS,
    'STALE_CANDIDATE_DAYS': (a) => STALE_CANDIDATE_DAYS,
    'STALE_UNCHECKED_DAYS': (a) => STALE_UNCHECKED_DAYS,
    'STALE_TESTING_DAYS': (a) => STALE_TESTING_DAYS,
    'SCHEMA': (a) => SCHEMA,
    'JOB_COLORS': (a) => JOB_COLORS,
    'STAR_COLORS': (a) => STAR_COLORS,
    'PLANET_COLORS': (a) => PLANET_COLORS,
    'DEFAULT_SETTINGS': (a) => DEFAULT_SETTINGS,
  });
}
