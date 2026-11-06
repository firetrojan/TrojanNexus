import 'package:flutter/material.dart';

/// The root of the app. Integrator-only file. Real screens come from Phase 2 of docs/PLAN.md.
class NexusApp extends StatelessWidget {
  const NexusApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF007AFF);
    return MaterialApp(
      title: 'Nexus',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.light),
      darkTheme: ThemeData(colorSchemeSeed: seed, useMaterial3: true, brightness: Brightness.dark),
      themeMode: ThemeMode.system,
      home: const Scaffold(body: Center(child: Text('Nexus'))),
    );
  }
}
