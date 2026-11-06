// profile_page.dart - Profile: appearance (theme, text size) and backup.
// Wording follows legacy/web-src/js/ui/core.js where that file has it.
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'store_scope.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  String _message = '';

  void _say(String text) => setState(() => _message = text);

  Future<void> _pickTheme(String value) async {
    final store = StoreScope.of(context);
    store.setSetting('theme', value);
    await store.save();
  }

  Future<void> _pickTextSize(String value) async {
    final store = StoreScope.of(context);
    store.setSetting('textSize', value);
    await store.save();
  }

  Future<void> _loadBackup() async {
    final store = StoreScope.of(context);
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.any,
      withData: true,
    );
    final file = picked?.files.isEmpty == true ? null : picked?.files.first;
    if (file == null) return;
    Object? data;
    try {
      data = jsonDecode(String.fromCharCodes(file.bytes ?? const <int>[]));
    } catch (_) {
      _say('Could not read that file.');
      return;
    }
    final mode = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Import backup'),
        content: const Text('Merge adds what is missing. Replace clears what is here now.'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop('merge'),
            child: const Text('Merge'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('replace'),
            child: const Text('Replace'),
          ),
        ],
      ),
    );
    if (mode == null) return;
    try {
      store.importBackup(data, mode);
      await store.save();
    } on Exception catch (e) {
      _say('Could not read that file. $e');
      return;
    }
    _say('${store.resources.length} resources, ${store.jobs.length} sectors, '
        '${store.threads.length} missions');
  }

  Future<void> _saveBackup() async {
    final store = StoreScope.of(context);
    final json = const JsonEncoder.withIndent('  ').convert(store.exportData());
    final bytes = utf8.encode(json);
    await Share.shareXFiles(
      <XFile>[XFile.fromData(bytes, name: 'nexus-backup.json', mimeType: 'application/json')],
      subject: 'Nexus backup',
    );
    _say('${store.resources.length} resources, ${store.jobs.length} sectors, '
        '${store.threads.length} missions');
  }

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final theme = store.settings.theme;
    final textSize = store.settings.textSize;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text('Appearance', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text('Theme'),
          SegmentedButton<String>(
            segments: const <ButtonSegment<String>>[
              ButtonSegment<String>(value: 'auto', label: Text('Auto')),
              ButtonSegment<String>(value: 'light', label: Text('Light')),
              ButtonSegment<String>(value: 'dark', label: Text('Dark')),
            ],
            selected: <String>{theme},
            onSelectionChanged: (s) => _pickTheme(s.first),
          ),
          const Text('Auto follows your phone setting.'),
          const SizedBox(height: 16),
          Text('Text size'),
          SegmentedButton<String>(
            segments: const <ButtonSegment<String>>[
              ButtonSegment<String>(value: 'm', label: Text('Normal')),
              ButtonSegment<String>(value: 'l', label: Text('Large')),
              ButtonSegment<String>(value: 'xl', label: Text('Larger')),
            ],
            selected: <String>{textSize},
            onSelectionChanged: (s) => _pickTextSize(s.first),
          ),
          const Text('Makes the writing bigger everywhere.'),
          const SizedBox(height: 24),
          Text('Your data', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ListTile(
            leading: const Icon(Icons.upload_file),
            title: const Text('Load a backup file'),
            subtitle: const Text('Bookmarks, Instagram following list, CSV, OPML'),
            onTap: _loadBackup,
          ),
          ListTile(
            leading: const Icon(Icons.share),
            title: const Text('Save a backup'),
            subtitle: const Text('Best: keeps a copy off this phone'),
            onTap: _saveBackup,
          ),
          if (_message.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            Text(_message),
          ],
        ],
      ),
    );
  }
}
