// rule.dart - the data shape of a smart sector rule. Cleaning and matching live in core/rules.dart.

class Cond {
  Cond({this.f = '', this.op = '', this.v = ''});

  String f;
  String op;
  String v;

  factory Cond.fromJson(Map<String, dynamic> json) => Cond(
        f: json['f']?.toString() ?? '',
        op: json['op']?.toString() ?? '',
        v: json['v']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => <String, dynamic>{'f': f, 'op': op, 'v': v};
}

class Rule {
  Rule({this.match = 'all', List<Cond>? conds}) : conds = conds ?? <Cond>[];

  String match;
  List<Cond> conds;

  factory Rule.fromJson(Map<String, dynamic> json) {
    final out = <Cond>[];
    final raw = json['conds'];
    if (raw is List) {
      for (final item in raw) {
        if (item is Map) out.add(Cond.fromJson(item.cast<String, dynamic>()));
      }
    }
    return Rule(
      match: json['match'] == 'any' ? 'any' : 'all',
      conds: out,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'match': match,
        'conds': conds.map((c) => c.toJson()).toList(),
      };
}
