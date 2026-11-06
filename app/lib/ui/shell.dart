// shell.dart - the app frame: the five tabs, the app bar with the Profile button.
// The store is already loaded by NexusApp; this file only builds the chrome.
import 'package:flutter/material.dart';

import '../core/nexus_store.dart';
import 'profile_page.dart';
import 'store_scope.dart';
import 'tabs.dart';

class Shell extends StatefulWidget {
  const Shell({super.key, required this.store});

  final NexusStore store;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  String _tabId = 'home';

  void _openProfile() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const ProfilePage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return StoreScope(
      store: widget.store,
      child: Builder(
        builder: (context) => Scaffold(
          appBar: AppBar(
            title: const Text('Nexus'),
            actions: <Widget>[
              IconButton(
                tooltip: 'Profile',
                icon: const Icon(Icons.account_circle_outlined),
                onPressed: _openProfile,
              ),
            ],
          ),
          body: IndexedStack(
            index: tabs.indexWhere((t) => t.id == _tabId),
            children: tabs.map((t) => TabBody(tab: t)).toList(),
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: tabs.indexWhere((t) => t.id == _tabId),
            onDestinationSelected: (i) => setState(() => _tabId = tabs[i].id),
            destinations: tabs
                .map((t) => NavigationDestination(
                      icon: Icon(t.icon),
                      label: t.label,
                    ))
                .toList(),
          ),
        ),
      ),
    );
  }
}
