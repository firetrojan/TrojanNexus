#!/usr/bin/env bash
# check.sh - everything that can be checked WITHOUT Flutter. Run it before you push. Needs only bash and node.
#   bash tools/check.sh
set -u
cd "$(dirname "$0")/.." || exit 1
fail=0
step() { printf '\n== %s\n' "$1"; }

step "1. dart lint (tools/lint_dart.mjs)"
node tools/lint_dart.mjs || fail=1

step "2. syntax of the tools"
for f in tools/*.sh; do bash -n "$f" && echo "ok $f" || { echo "BAD $f"; fail=1; }; done
for f in tools/*.mjs; do node --check "$f" && echo "ok $f" || { echo "BAD $f"; fail=1; }; done

step "3. json files are valid"
for f in fixtures/*.json fixtures/golden/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" 2>/dev/null || { echo "BAD json: $f"; fail=1; }
done
echo "checked $(ls fixtures/*.json fixtures/golden/*.json | wc -l) json files"

step "4. golden files still match the web code (fixtures must not change)"
if [ -d legacy/web-src/js ]; then
  tmp=$(mktemp -d); cp -r fixtures "$tmp/fixtures"
  TZ=UTC node tools/gen_golden.mjs >/dev/null 2>&1 || { echo "gen_golden.mjs failed"; fail=1; }
  TZ=UTC node tools/gen_golden_r4.mjs >/dev/null 2>&1 || { echo "gen_golden_r4.mjs failed"; fail=1; }
  TZ=UTC node tools/gen_golden_tz.mjs >/dev/null 2>&1 || { echo "gen_golden_tz.mjs failed"; fail=1; }
  if diff -rq "$tmp/fixtures" fixtures >/dev/null; then echo "unchanged"; else
    echo "CHANGED: fixtures differ after regenerating. Restoring the old files. Someone edited fixtures/ or legacy/ - tell the Integrator."
    diff -rq "$tmp/fixtures" fixtures; rm -rf fixtures; cp -r "$tmp/fixtures" fixtures; fail=1
  fi
  rm -rf "$tmp"
else echo "legacy/web-src/js not found: skipped"; fi

step "5. secrets and personal files"
if grep -rIlE '(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|nvapi-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.dart_tool . ; then
  echo "FOUND something that looks like a token or key in the files above. Remove it."; fail=1
else echo "none found"; fi
bad=$(find . -path ./.git -prune -o \( -name 'nexus-backup*' -o -name 'my-*.json' -o -name '*.jks' -o -name '*.keystore' -o -name 'key.properties' -o -name '.env' \) -print)
if [ -n "$bad" ]; then echo "personal or secret files present:"; echo "$bad"; fail=1; fi

step "6. workflow files have no tab characters"
if grep -nP '\t' .github/workflows/*.yml >/dev/null 2>&1; then grep -nP '\t' .github/workflows/*.yml; fail=1; else echo "ok"; fi

echo
if [ "$fail" -eq 0 ]; then echo "CHECK PASSED (this does not replace CI: only GitHub Actions can compile Dart)"; else echo "CHECK FAILED"; fi
exit "$fail"
