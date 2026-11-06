// lint_dart.mjs - a tiny Dart checker that needs only Node. It is NOT a compiler. It catches the mistakes weak models make most:
// unbalanced brackets, unterminated strings, imports that point nowhere, packages missing from pubspec, banned patterns,
// missing dart:/flutter imports for common names, and "...rest unchanged" placeholders.
//   node tools/lint_dart.mjs                 check every .dart file in app/lib and app/test
//   node tools/lint_dart.mjs path/a.dart ... check only these files
// Exit code 1 when there is at least one ERROR. WARN lines are advice. CI (flutter analyze) is still the real judge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.dart')) out.push(p);
  }
  return out;
}

// ---- pubspec: which packages exist -------------------------------------------------------------------------------------
function readPubspec() {
  const file = path.join(APP, 'pubspec.yaml');
  const res = { deps: new Set(), dev: new Set(), name: 'nexus', ok: false };
  if (!fs.existsSync(file)) return res;
  res.ok = true;
  let section = '';
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*#/.test(raw) || !raw.trim()) continue;
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(raw);
    if (top) { section = top[1]; if (section === 'name') res.name = top[2].trim(); continue; }
    const k = /^  ([A-Za-z0-9_]+):/.exec(raw);
    if (k && section === 'dependencies') res.deps.add(k[1]);
    if (k && section === 'dev_dependencies') res.dev.add(k[1]);
  }
  return res;
}
const PUB = readPubspec();
const FORBIDDEN_PKGS = ['build_runner', 'freezed', 'freezed_annotation', 'json_serializable', 'json_annotation', 'riverpod', 'flutter_riverpod',
  'riverpod_generator', 'provider', 'flutter_bloc', 'bloc', 'get', 'get_it', 'go_router', 'drift', 'hive', 'isar', 'sqflite', 'mobx', 'injectable'];

// ---- lexer: walks the text, skips comments and strings, counts brackets ---------------------------------------------------
function lex(src) {
  const problems = []; const stack = []; const pairs = { ')': '(', ']': '[', '}': '{' };
  const comments = []; // { line, text }
  let i = 0, line = 1; const n = src.length;
  const err = (l, m) => problems.push({ line: l, msg: m });
  // modes: code, or inside a string. Strings can contain ${ ... } which nests code again; "interp" frames remember that.
  const frames = []; // { kind: 'interp', depth: stack.length }
  function readString(quoteChar, triple, raw, startLine) {
    // returns after the closing quote; handles escapes and interpolation
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; if (!triple) { err(startLine, 'string is not closed on the same line (single-line strings cannot continue on the next line)'); i++; return; } i++; continue; }
      if (!raw && c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (!raw && c === '$') {
        if (src[i + 1] === '{') { i += 2; lexCode(true); continue; }   // ${ expression }
        i++; continue;                                               // $name
      }
      if (c === quoteChar) {
        if (triple) { if (src[i + 1] === quoteChar && src[i + 2] === quoteChar) { i += 3; return; } i++; continue; }
        i++; return;
      }
      i++;
    }
    err(startLine, 'string is never closed (end of file)');
  }
  function lexCode(inInterp) {
    const base = stack.length; let open = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && d === '/') { const s = i; while (i < n && src[i] !== '\n') i++; comments.push({ line, text: src.slice(s, i) }); continue; }
      if (c === '/' && d === '*') {
        const s = i, startLine = line; let depth = 1; i += 2;
        while (i < n && depth > 0) { if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; } else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; } else { if (src[i] === '\n') line++; i++; } }
        if (depth > 0) err(startLine, 'comment /* is never closed'); comments.push({ line: startLine, text: src.slice(s, i) }); continue;
      }
      // raw strings r'...' r"..."
      if ((c === 'r') && (d === '\'' || d === '"') && !/[A-Za-z0-9_$]/.test(src[i - 1] || ' ')) {
        const q = d, sl = line; if (src[i + 2] === q && src[i + 3] === q) { i += 4; readString(q, true, true, sl); } else { i += 2; readString(q, false, true, sl); } continue;
      }
      if (c === '\'' || c === '"') {
        const sl = line; if (src[i + 1] === c && src[i + 2] === c) { i += 3; readString(c, true, false, sl); } else { i += 1; readString(c, false, false, sl); } continue;
      }
      if (c === '(' || c === '[' || c === '{') { stack.push({ ch: c, line }); i++; if (c === '{') open++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (inInterp && c === '}' && stack.length === base) { i++; return; }   // closes the ${ of a string
        const top = stack.pop();
        if (!top) err(line, `extra closing "${c}" with nothing open`);
        else if (top.ch !== pairs[c]) err(line, `"${c}" does not match "${top.ch}" opened on line ${top.line}`);
        i++; continue;
      }
      i++;
    }
    if (inInterp) err(line, 'string interpolation ${ is never closed');
  }
  lexCode(false);
  for (const t of stack) err(t.line, `"${t.ch}" opened here is never closed`);
  return { problems, comments };
}

// ---- checks ----------------------------------------------------------------------------------------------------------------
const HEURISTICS = [   // [name regex, must-have-import regex, message]
  [/(?<![.\w$])(File|Directory)\(/, /dart:io/, 'uses File/Directory but does not import dart:io (not available on web: keep it inside a storage file)'],
  [/(?<![.\w$])(jsonDecode|jsonEncode)\(|\bJsonEncoder\b|(?<![.\w$])utf8\./, /dart:convert/, 'uses jsonDecode/jsonEncode/utf8 but does not import dart:convert'],
  [/\b(StatelessWidget|StatefulWidget|BuildContext|Widget build)\b/, /package:flutter\/(material|widgets|cupertino)\.dart/, 'uses widgets but does not import package:flutter/material.dart'],
  [/\bChangeNotifier\b|\bValueNotifier\b|\bListenableBuilder\b/, /package:flutter\/(foundation|material|widgets|cupertino)\.dart/, 'uses ChangeNotifier/ListenableBuilder but does not import package:flutter/foundation.dart or material.dart'],
  [/\b(testWidgets|WidgetTester)\b|(?<![.\w$])(expect|group|test|setUp|fail)\(/, /package:flutter_test\/flutter_test\.dart|golden\.dart|package:test\//, 'uses test functions but does not import package:flutter_test/flutter_test.dart'],
  [/(?<![.\w$])(pow|sqrt|min|max|log|exp|sin|cos|atan2)\(/, /dart:math/, 'uses pow/sqrt/min/max but does not import dart:math (if you wrote your own function with that name, ignore this)'],
];
const BANNED = [   // [regex, message, level]
  [/^\s*part\s+(of\s+)?['"]/m, '"part" files are not allowed (AGENTS.md: no part files)', 'ERROR'],
  [/@JsonSerializable|@freezed|@Freezed|@JsonKey|\.g\.dart|\.freezed\.dart/, 'code generation is not allowed (AGENTS.md: no codegen)', 'ERROR'],
  [/\bbuild_runner\b/, 'build_runner is not allowed', 'ERROR'],
  [/\.\.\.\s*(rest|remaining|existing|unchanged|same as|omitted)|\b(rest of (the )?(file|code|function|class)|code (is )?unchanged|existing code|implementation here|your code here)\b/i, 'looks like a placeholder that replaced real code ("rest unchanged"). Write the full code.', 'ERROR'],
  [/\bTODO\b|\bFIXME\b/, 'TODO/FIXME left in the file: finish it or write it in docs/IDEAS.md', 'WARN'],
  [/(?<![.\w$])print\(/, 'print() left in the file: remove it (tests may print a summary line)', 'WARN'],
  [/\bdart:html\b|\bdart:js\b|\bpackage:web\//, 'dart:html / dart:js / package:web only inside the web storage file (task T1.8)', 'WARN'],
];
const DYNAMIC_OK = /(^|\/)(core\/model\/|core\/storage|test\/golden\/)|\/golden_/;   // JSON edge files may use "dynamic"

function lintFile(file) {
  const out = []; const R = rel(file);
  const add = (level, line, msg) => out.push({ level, line, msg });
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return [{ level: 'ERROR', line: 0, msg: 'cannot read file: ' + e.message }]; }
  if (!src.trim()) return [{ level: 'ERROR', line: 1, msg: 'file is empty' }];
  if (src.includes('\r\n')) add('WARN', 1, 'Windows line endings (CRLF): use plain \\n');
  if (/\t/.test(src)) add('WARN', 1, 'tab characters: Dart style uses two spaces');
  if (/^```|^```dart$/m.test(src)) add('ERROR', 1, 'markdown code fence (```) inside a .dart file: the model pasted chat text into the file');
  const lines = src.split('\n').length;
  if (lines > 400) add('WARN', 1, `file has ${lines} lines (limit ~400): split it`);

  const { problems, comments } = lex(src);
  for (const p of problems) add('ERROR', p.line, p.msg);
  // ... placeholders also count inside comments, so run BANNED on the raw text but skip pure "..." in strings (rare)
  for (const [re, msg, level] of BANNED) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
    while ((m = g.exec(src))) { const ln = src.slice(0, m.index).split('\n').length; add(level, ln, msg); if (level === 'WARN') break; }
  }
  // imports
  const importRe = /^\s*(import|export)\s+(['"])([^'"]+)\2([^;]*);/gm; let m; const imports = [];
  while ((m = importRe.exec(src))) {
    const ln = src.slice(0, m.index).split('\n').length; const uri = m[3]; imports.push(uri);
    if (uri.startsWith('dart:')) continue;
    if (uri.startsWith('package:')) {
      const pkg = uri.slice(8).split('/')[0], sub = uri.slice(8 + pkg.length + 1);
      if (pkg === PUB.name) { if (!fs.existsSync(path.join(APP, 'lib', sub))) add('ERROR', ln, `import "${uri}" points to a file that does not exist (app/lib/${sub})`); }
      else if (pkg === 'flutter' || pkg === 'flutter_test') { /* from the sdk */ }
      else if (FORBIDDEN_PKGS.includes(pkg)) add('ERROR', ln, `package "${pkg}" is banned by AGENTS.md`);
      else if (pkg === 'test') add('ERROR', ln, 'package:test is not in pubspec: use package:flutter_test/flutter_test.dart');
      else if (!PUB.deps.has(pkg) && !PUB.dev.has(pkg)) add('ERROR', ln, `package "${pkg}" is not in app/pubspec.yaml. Ask the Integrator (docs/requests/), do not add it yourself`);
      continue;
    }
    // relative import
    const target = path.resolve(path.dirname(file), uri);
    if (!fs.existsSync(target)) add('ERROR', ln, `import "${uri}" points to a file that does not exist`);
  }
  const body = src;   // heuristics on text without comments would be better, but the cost of a false alarm is only a WARN
  for (const [re, must, msg] of HEURISTICS) { if (re.test(body) && !imports.some(u => must.test(u))) { const isTestOnly = must.source.includes('flutter_test'); if (isTestOnly && !/^app\/test\//.test(R)) continue; add('WARN', 1, msg); } }
  // "dynamic" outside the JSON edge
  if (!DYNAMIC_OK.test(R) && /\bdynamic\b/.test(src.replace(/\/\/.*$/gm, ''))) add('WARN', 1, '"dynamic" is only for the JSON edge (core/model, storage, golden). Use real types here');
  // library name hygiene
  if (R.startsWith('app/lib/') && /^\s*library\s+\w+/m.test(src)) add('WARN', 1, 'a "library x;" line is not needed');
  // tests: a test file should have main()
  if (R.startsWith('app/test/') && R.endsWith('_test.dart') && !/\bvoid\s+main\s*\(/.test(src)) add('ERROR', 1, 'a test file must define "void main()"');
  if (R.startsWith('app/lib/') && R.endsWith('_test.dart')) add('ERROR', 1, 'test files belong in app/test/, not app/lib/');
  return out;
}

// ---- main -------------------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
let files = args.length ? args.map(a => path.resolve(process.cwd(), a)) : [...walk(path.join(APP, 'lib')), ...walk(path.join(APP, 'test'))];
files = files.filter(f => !/[\\/](android|ios|web|build|\.dart_tool)[\\/]/.test(f));
if (!PUB.ok) console.log('ERROR app/pubspec.yaml is missing');
let errors = PUB.ok ? 0 : 1, warns = 0;
for (const p of PUB.deps) if (FORBIDDEN_PKGS.includes(p)) { console.log(`ERROR app/pubspec.yaml: package "${p}" is banned by AGENTS.md`); errors++; }
for (const f of files) {
  for (const x of lintFile(f).sort((a, b) => a.line - b.line)) {
    console.log(`${x.level} ${rel(f)}:${x.line}  ${x.msg}`); if (x.level === 'ERROR') errors++; else warns++;
  }
}
console.log(`\nlint_dart: ${files.length} file(s), ${errors} error(s), ${warns} warning(s). ${errors ? 'FIX THE ERRORS FIRST.' : 'No errors found by this tool (that is not the same as compiling: CI decides).'}`);
process.exit(errors ? 1 : 0);
