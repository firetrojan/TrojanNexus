// store_core.dart - the data store. Behaviour lives in StoreBase and its mixins.
import 'store_backup.dart';
import 'store_base.dart';
import 'store_life.dart';
import 'store_resources.dart';
import 'store_sectors.dart';
import 'store_stats.dart';

export 'store_types.dart' show Clock, IdGen, StoreError;

class StoreCore extends StoreBase
    with StoreSectors, StoreResources, StoreLife, StoreStats, StoreBackup {
  StoreCore({
    required super.clock,
    required super.idGen,
    required super.storage,
  });
}
