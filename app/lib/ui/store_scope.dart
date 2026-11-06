// store_scope.dart - gives the widgets the store, and rebuilds them when it changes.
// InheritedNotifier, so a store change notifies every listener exactly once.
import 'package:flutter/widgets.dart';

import '../core/nexus_store.dart';

class StoreScope extends InheritedNotifier<NexusStore> {
  const StoreScope({
    super.key,
    required NexusStore store,
    required super.child,
  }) : super(notifier: store);

  /// Read the store and rebuild this widget whenever it changes.
  static NexusStore of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<StoreScope>();
    if (scope == null || scope.notifier == null) {
      throw FlutterError('No StoreScope above this widget');
    }
    return scope.notifier!;
  }
}
