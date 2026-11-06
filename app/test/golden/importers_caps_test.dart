// importers_caps_test.dart - hand tests for the MAX_ENTRIES caps in the importers.
//
// The golden files cannot show these branches: they need more than 6000 entries, which is too big
// for an answer key. legacy/web-src/js/importers.js stops at MAX_ENTRIES = 6000
// (parseCSVRows keeps 6001 rows: the header plus 6000 body rows).
//
// Lines covered here, in the legacy JS:
//   L142  parseBookmarksHTML  out.length >= MAX_ENTRIES -> break
//   L152  parseBookmarksJSON  out.length >= MAX_ENTRIES -> return
//   L182  parseOPML           out.length >= MAX_ENTRIES -> break
//   L198  parseCSVRows        rows.length > MAX_ENTRIES + 1 -> break
//   L231  parseCSV            out.length >= MAX_ENTRIES -> break
//   L249  parseLinksHTML      out.length >= MAX_ENTRIES -> break
//   L277  parseUrlList        out.length >= MAX_ENTRIES -> break
//   parseJSONArray           .slice(0, MAX_ENTRIES)
import 'package:flutter_test/flutter_test.dart';
import 'package:nexus/core/importers.dart';

const int cap = 6000;

String _many(int n, String part) => List.filled(n, part).join();

Map<String, Object?> _url(int i) =>
    <String, Object?>{'type': 'url', 'title': 'n$i', 'url': 'https://n$i.example.org/'};

void main() {
  test('parseBookmarksHTML stops at 6000 entries (importers.js L142)', () {
    final html = '<DL><p>' + _many(6001, '<DT><A HREF="https://n.example.org/">n</A>\n') + '</DL>';
    final out = parseBookmarksHTML(html);
    expect(out.length, cap);
    expect(out.first['url'], 'https://n.example.org/');
    expect(out.last['url'], 'https://n.example.org/');
  });

  test('parseBookmarksJSON stops at 6000 entries (importers.js L152)', () {
    final data = <String, Object?>{
      'roots': <String, Object?>{
        'bookmark_bar': <String, Object?>{'children': List.generate(6001, _url)},
      },
    };
    expect(parseBookmarksJSON(data).length, cap);
  });

  test('parseOPML stops at 6000 entries (importers.js L182)', () {
    final opml = '<opml><body>' + _many(6001, '<outline text="Feed" xmlUrl="https://f.example.org/rss"/>\n') + '</body></opml>';
    final out = parseOPML(opml);
    expect(out.length, cap);
    expect(out.first['type'], 'feed');
  });

  test('parseCSVRows keeps 6001 rows and parseCSV keeps 6000 entries (importers.js L198, L231)', () {
    final csv = 'title,url\n' + _many(6002, 'n,https://n.example.org/\n');
    expect(parseCSVRows(csv).length, cap + 2);
    final out = parseCSV(csv);
    expect(out.length, cap);
    expect(out.first['url'], 'https://n.example.org/');
  });

  test('parseLinksHTML stops at 6000 entries (importers.js L249)', () {
    final html = _many(6001, '<a href="https://n.example.org/">n</a>');
    expect(parseLinksHTML(html).length, cap);
  });

  test('parseUrlList stops at 6000 entries (importers.js L277)', () {
    final text = _many(6001, 'https://n.example.org/\n');
    expect(parseUrlList(text).length, cap);
  });

  test('parseJSONArray keeps the first 6000 entries', () {
    final json = '[' + _many(6001, '{"url":"https://n.example.org/"},') + '{"url":"https://last.example.org/"}]';
    final out = parseJSONArray(json);
    expect(out.length, cap);
    expect(out.last['url'], 'https://n.example.org/');
  });
}
