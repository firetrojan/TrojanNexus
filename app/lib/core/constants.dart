// constants.dart - the saved-data constants from legacy/web-src/js/store.js.
// Values are plain Dart constants so they can also cross the web bridge.
const List<String> TYPES = <String>[
  'web-tool',
  'article-site',
  'youtube-channel',
  'ai-source',
  'social',
  'community',
  'feed',
  'catalogue',
  'docs',
  'other',
];

const List<String> STATUSES = <String>[
  'candidate',
  'testing',
  'active',
  'archived',
];

const List<String> CADENCES = <String>[
  'daily',
  'weekly',
  'monthly',
  'none',
];

const Map<String, int> CADENCE_DAYS = <String, int>{
  'daily': 1,
  'weekly': 7,
  'monthly': 30,
  'none': 0,
};

const int STALE_CANDIDATE_DAYS = 30;
const int STALE_UNCHECKED_DAYS = 30;
const int STALE_TESTING_DAYS = 60;
const int SCHEMA = 1;

const List<String> JOB_COLORS = <String>[
  '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#FFCC00',
  '#32ADE6', '#FF3B30', '#00C7BE', '#5856D6', '#A2845E', '#8E8E93',
];

const List<String> STAR_COLORS = <String>[
  '#7FA2FF', '#A9C2FF', '#E3EBFF', '#FFF6E8', '#FFE066', '#FFB347',
  '#FF6B4A', '#FF7AC8', '#B58CFF', '#4DD9E8', '#5BE39A', '#FFC93C',
];

const List<String> PLANET_COLORS = <String>[
  '#4F8CFF', '#34C759', '#FF9500', '#C8A27A', '#E5573F', '#B07CFF',
  '#6FD6E8', '#F4E3B5', '#FF6FB0', '#8E8E93', '#2FA39A', '#F2F2F7',
];

const Map<String, Object?> DEFAULT_SETTINGS = <String, Object?>{
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
  'deletedKeys': <Object?>[],
  'startOn': 'home',
  'home': null,
  'activeMission': '',
  'textSize': 'm',
  'seenVersion': '',
  'opensSince': '',
  'weekly': null,
  'dupeIgnore': <Object?>[],
  'recentJobs': <Object?>[],
  'recent': <Object?>[],
  'shelves': <Object?>[],
  'siteIcons': false,
  'badge': true,
};
