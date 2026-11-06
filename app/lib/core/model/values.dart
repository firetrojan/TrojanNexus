// values.dart - the small value objects stored inside a Resource.

class Scan {
  Scan({
    this.at = '',
    this.via = '',
    this.topic = '',
    this.topic2 = '',
    this.conf = 'none',
    this.basis = '',
    this.desc = '',
    this.site = '',
  });

  String at;
  String via;
  String topic;
  String topic2;
  String conf;
  String basis;
  String desc;
  String site;

  factory Scan.fromJson(Map<String, dynamic> json) => Scan(
        at: json['at']?.toString() ?? '',
        via: json['via']?.toString() ?? '',
        topic: json['topic']?.toString() ?? '',
        topic2: json['topic2']?.toString() ?? '',
        conf: json['conf']?.toString() ?? 'none',
        basis: json['basis']?.toString() ?? '',
        desc: json['desc']?.toString() ?? '',
        site: json['site']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'at': at,
        'via': via,
        'topic': topic,
        'topic2': topic2,
        'conf': conf,
        'basis': basis,
        'desc': desc,
        'site': site,
      };
}

class Verdict {
  Verdict({this.at = '', this.result = '', this.note = ''});

  String at;
  String result;
  String note;

  factory Verdict.fromJson(Map<String, dynamic> json) => Verdict(
        at: json['at']?.toString() ?? '',
        result: json['result']?.toString() ?? '',
        note: json['note']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() =>
      <String, dynamic>{'at': at, 'result': result, 'note': note};
}

class LogEvent {
  LogEvent({this.at = '', this.k = '', this.t = ''});

  String at;
  String k;
  String t;

  factory LogEvent.fromJson(Map<String, dynamic> json) => LogEvent(
        at: json['at']?.toString() ?? '',
        k: json['k']?.toString() ?? '',
        t: json['t']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() =>
      <String, dynamic>{'at': at, 'k': k, 't': t};
}
