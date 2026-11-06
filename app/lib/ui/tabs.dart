// tabs.dart - the five tabs and the plain count each one will own.
// The real screens come later (docs/PLAN.md); here each tab shows only the counts,
// exactly like the web app's dock (legacy/web-src/js/ui/hud.js TABS, minus Galaxy).
import 'package:flutter/material.dart';

import '../core/nexus_store.dart';
import 'store_scope.dart';

class NexusTab {
  const NexusTab(this.id, this.label, this.icon);

  final String id;
  final String label;
  final IconData icon;
}

const List<NexusTab> tabs = <NexusTab>[
  NexusTab('home', 'Home', Icons.home_outlined),
  NexusTab('sectors', 'Sectors', Icons.hub_outlined),
  NexusTab('vault', 'Vault', Icons.folder_outlined),
  NexusTab('missions', 'Missions', Icons.flag_outlined),
  NexusTab('alerts', 'Alerts', Icons.notifications_outlined),
];

/// The count a tab owns. Home shows everything; the others show their own count.
String _countFor(String id, NexusStore store) {
  switch (id) {
    case 'home':
      return '${store.resources.length} resources, '
          '${store.jobs.length} sectors, '
          '${store.threads.length} missions, '
          '${store.resources.where((r) => r.draft).length} to review';
    case 'sectors':
      return '${store.jobs.length} sectors';
    case 'vault':
      return '${store.resources.length} resources';
    case 'missions':
      return '${store.threads.length} missions';
    case 'alerts':
      return '${store.resources.where((r) => r.draft).length} to review';
    default:
      return '';
  }
}

class TabBody extends StatelessWidget {
  const TabBody({super.key, required this.tab});

  final NexusTab tab;

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            Text(tab.label, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            Text(_countFor(tab.id, store), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
