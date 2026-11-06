// settings.dart - all saved settings, with the web app's defaults and unknown keys kept.
const Map<String, Object?> defaultSettings = <String, Object?>{
  'theme': 'auto',
  'sound': false,
  'quality': 'auto',
  'intro': true,
  'notify': false,
  'tethers': true,
  'space': true,
  'calm': false,
  'haptics': true,
  'web': true,
  'webMode': 'auto',
  'webReader': '',
  'webSkip': <String>['filen.io'],
  'customFields': <Object?>[],
  'deletedKeys': <String>[],
  'startOn': 'home',
  'home': null,
  'activeMission': '',
  'textSize': 'm',
  'seenVersion': '',
  'opensSince': '',
  'weekly': null,
  'dupeIgnore': <String>[],
  'recentJobs': <String>[],
  'recent': <Object?>[],
  'shelves': <String>[],
  'siteIcons': false,
  'badge': true,
};

class Settings {
  Settings(Map<String, Object?> values)
      : values = Map<String, Object?>.from(values);

  factory Settings.defaults() => Settings(defaultSettings);

  factory Settings.fromJson(Map<String, dynamic> json) => Settings(
        <String, Object?>{...defaultSettings, ...json},
      );

  final Map<String, Object?> values;

  Map<String, dynamic> toJson() => Map<String, dynamic>.from(values);

  Object? operator [](String key) => values[key];

  void operator []=(String key, Object? value) => values[key] = value;

  String _string(String key, String fallback) {
    final v = values[key];
    return v is String ? v : fallback;
  }

  bool _bool(String key, bool fallback) {
    final v = values[key];
    return v is bool ? v : fallback;
  }

  List<String> _strings(String key) {
    final v = values[key];
    if (v is! List) return <String>[];
    return v.map((x) => x.toString()).toList();
  }

  List<Object?> _list(String key) {
    final v = values[key];
    if (v is! List) return <Object?>[];
    return List<Object?>.from(v);
  }

  String get theme => _string('theme', 'auto');
  bool get sound => _bool('sound', false);
  String get quality => _string('quality', 'auto');
  bool get intro => _bool('intro', true);
  bool get notify => _bool('notify', false);
  bool get tethers => _bool('tethers', true);
  bool get space => _bool('space', true);
  bool get calm => _bool('calm', false);
  bool get haptics => _bool('haptics', true);
  bool get web => _bool('web', true);
  String get webMode => _string('webMode', 'auto');
  String get webReader => _string('webReader', '');
  List<String> get webSkip => _strings('webSkip');
  List<Object?> get customFields => _list('customFields');
  List<String> get deletedKeys => _strings('deletedKeys');
  String get startOn => _string('startOn', 'home');
  Map<String, Object?>? get home {
    final v = values['home'];
    return v is Map ? v.cast<String, Object?>() : null;
  }

  String get activeMission => _string('activeMission', '');
  String get textSize => _string('textSize', 'm');
  String get seenVersion => _string('seenVersion', '');
  String get opensSince => _string('opensSince', '');
  Map<String, Object?>? get weekly {
    final v = values['weekly'];
    return v is Map ? v.cast<String, Object?>() : null;
  }

  List<String> get dupeIgnore => _strings('dupeIgnore');
  List<String> get recentJobs => _strings('recentJobs');
  List<Object?> get recent => _list('recent');
  List<String> get shelves => _strings('shelves');
  bool get siteIcons => _bool('siteIcons', false);
  bool get badge => _bool('badge', true);
}
