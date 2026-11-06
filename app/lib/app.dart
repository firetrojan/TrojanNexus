// app.dart - the root widget. Loads the store, then builds the themed app.
// Integrator-only file.
import 'package:flutter/material.dart';

import 'core/storage.dart';
import 'core/storage_pick.dart';
import 'core/nexus_store.dart';
import 'core/store_core.dart';
import 'theme_from_settings.dart';
import 'ui/shell.dart';

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

  Future<void> _load() async {
    final store = NexusStore(
      StoreCore(
        clock: widget.clock ?? Clock(),
        idGen: (p) => '${p}_new',
        storage: widget.storage ?? createDefaultStorage('nexus-backup.json'),
      ),
    );
    await store.load(widget.seed);
    if (!mounted) return;
    setState(() => _store = store);
  }

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF007AFF);
    final store = _store;
    return MaterialApp(
      title: 'Nexus',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.light),
      darkTheme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.dark),
      themeMode: store == null ? ThemeMode.system : themeModeFor(store.settings.theme),
      home: store == null
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : Builder(
              builder: (context) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(textScaleFor(store.settings.textSize)),
                ),
                child: Shell(store: store),
              ),
            ),
    );
  }
}
