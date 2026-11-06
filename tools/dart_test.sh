#!/usr/bin/env bash
# dart_test.sh - run the pure-Dart golden tests with the strict flutter_test stand-in.
# Not Flutter, not the real app. Compiles with the local Dart 3 VM.
#   DART_BIN=/path/to/dart bash tools/dart_test.sh
#   DART_BIN=/path/to/dart bash tools/dart_test.sh --self-test
set -u
cd "$(dirname "$0")/.." || exit 1
export TZ="${TZ:-UTC}"

DART_BIN="${DART_BIN:-$(command -v dart 2>/dev/null || true)}"
if [ -z "$DART_BIN" ] || [ ! -x "$DART_BIN" ]; then
  echo "dart not found. Set DART_BIN=/path/to/dart or put dart in PATH." >&2
  exit 2
fi

self=0
modules=()
for arg in "$@"; do
  case "$arg" in
    --self-test) self=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) modules+=("$arg") ;;
  esac
done

tmp="$(mktemp -d "${TMPDIR:-/tmp}/nexus-dart-test.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

mkdir -p "$tmp/lib" "$tmp/test/golden" "$tmp/fixtures"
cp -r app/lib/core "$tmp/lib/core"
cp -r app/test/golden/. "$tmp/test/golden/"
cp -r fixtures/golden "$tmp/fixtures/golden"
cp -r tools/flutter_test_stub "$tmp/flutter_test_stub"

cat > "$tmp/pubspec.yaml" <<'EOF'
name: nexus
description: temporary pure-Dart test package
publish_to: none
environment:
  sdk: '>=3.3.0 <4.0.0'
dependencies:
  flutter_test:
    path: flutter_test_stub
EOF

if ! (cd "$tmp" && "$DART_BIN" pub get --offline >/dev/null); then
  echo "dart pub get failed in $tmp" >&2
  exit 2
fi

files=()
if [ "$self" = "1" ]; then
  cp tools/selftest/failing_test.dart "$tmp/test/golden/selftest_failing_test.dart"
  files=(test/golden/selftest_failing_test.dart)
elif [ "${#modules[@]}" -gt 0 ]; then
  for m in "${modules[@]}"; do
    if [ ! -f "app/test/golden/${m}_test.dart" ]; then
      echo "missing test: app/test/golden/${m}_test.dart" >&2
      exit 2
    fi
    files+=("test/golden/${m}_test.dart")
  done
else
  for f in app/test/golden/*_test.dart; do
    [ -f "$f" ] || continue
    files+=("test/golden/$(basename "$f")")
  done
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "no golden tests found under app/test/golden" >&2
  exit 2
fi

fail=0
for f in "${files[@]}"; do
  echo
  echo "== $f"
  if (cd "$tmp" && "$DART_BIN" run "$f"); then
    :
  else
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "DART TESTS PASSED"
else
  echo "DART TESTS FAILED"
fi
exit "$fail"
