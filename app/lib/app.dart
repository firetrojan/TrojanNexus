// app.dart - the root widget. Loads the store, then builds the themed app.
// Integrator-only file.
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'core/storage.dart';
import 'core/storage_pick.dart';
import 'core/nexus_store.dart';
import 'core/store_core.dart';
import 'theme_from_settings.dart';
import 'ui/shell.dart';
import 'ui/store_scope.dart';

/// [storage], [clock] and [seed] exist for tests; the app uses the real backend.
class NexusApp extends StatefulWidget {
  const NexusApp({
    super.key,
    this.storage,
    this.clock,
    this.seed,
  });

  final Storage? storage;
  final Clock? clock;
  final Object? seed;

  @override
  State<NexusApp> createState() => _NexusAppState();
}

class _NexusAppState extends State<NexusApp> {
  NexusStore? _store;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// The backend for this platform. A test can inject its own; otherwise the backup goes to the
  /// app's documents directory, never to a relative path (which on Android points at "/" and
  /// cannot be written).
  Future<Storage> _storage() async {
    final own = widget.storage;
    if (own != null) return own;
    final dir = await getApplicationDocumentsDirectory();
    return createDefaultStorage('${dir.path}/nexus-backup.json');
  }

  Future<void> _load() async {
    final store = NexusStore(
      StoreCore(
        clock: widget.clock ?? Clock(),
        idGen: (p) => '${p}_new',
        storage: await _storage(),
      ),
    );
    await store.load(widget.seed);
    if (!mounted) return;
    setState(() => _store = store);
  }

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF007AFF);
    final light = ThemeData(
        colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.light);
    final store = _store;
    if (store == null) {
      return MaterialApp(
        title: 'Nexus',
        debugShowCheckedModeBanner: false,
        theme: light,
        home: const Scaffold(body: Center(child: CircularProgressIndicator())),
      );
    }
    // StoreScope wraps MaterialApp, so a page pushed on the Navigator (Profile) also reads the
    // store. ListenableBuilder above that rebuilds MaterialApp when a setting changes, because
    // MaterialApp sits above StoreScope.
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) => StoreScope(
        store: store,
        child: MaterialApp(
          title: 'Nexus',
          debugShowCheckedModeBanner: false,
          theme: light,
          darkTheme: ThemeData(
              colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.dark),
          themeMode: themeModeFor(store.settings.theme),
          // The builder runs inside Flutter's own MediaQuery and wraps the Navigator, so the text
          // scale reaches the tabs AND every page pushed on top of them (Profile). Putting it in
          // `home:` would only scale the tabs.
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScaleFor(store.settings.textSize)),
            ),
            child: child!,
          ),
          home: Shell(store: store),
        ),
      ),
    );
  }
}
