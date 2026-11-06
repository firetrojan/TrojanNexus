#!/usr/bin/env bash
# ci_log.sh - waits for the GitHub CI run of the current commit, then writes the result to docs/CI_LAST.txt and prints it.
#   bash tools/ci_log.sh            wait up to 20 minutes
#   bash tools/ci_log.sh 600        wait up to 600 seconds
# Needs the GitHub CLI: in Termux  pkg install gh   then  gh auth login   (owner does this once, START-HERE.md step 3).
# A commit that only touches docs/ or *.md does NOT start CI.
set -u
cd "$(dirname "$0")/.." || exit 1
command -v gh >/dev/null 2>&1 || { echo "gh is not installed. In Termux:  pkg install gh   then   gh auth login"; exit 2; }
wait_s="${1:-1200}"
sha=$(git rev-parse HEAD); short=$(git rev-parse --short HEAD)
OUT=docs/CI_LAST.txt; FULL=docs/CI_FULL.txt
echo "waiting for the CI run of $short (up to ${wait_s}s) ..."
start=$(date +%s); id=""
while :; do
  id=$(gh run list --workflow ci.yml --limit 15 --json databaseId,headSha --jq "[.[] | select(.headSha==\"$sha\")][0].databaseId" 2>/dev/null)
  if [ -n "$id" ] && [ "$id" != "null" ]; then break; fi
  if [ $(( $(date +%s) - start )) -gt 150 ]; then
    echo "no CI run found for $short after 150s. Check: did the push work (git status -sb)? Did the commit touch only docs/*.md (CI skips those)? Is gh logged in (gh auth status)?"
    exit 3
  fi
  sleep 10
done
while :; do
  st=$(gh run view "$id" --json status,conclusion --jq '.status + " " + (.conclusion // "")' 2>/dev/null)
  case "$st" in completed*) break;; esac
  if [ $(( $(date +%s) - start )) -gt "$wait_s" ]; then echo "CI run $id is still running after ${wait_s}s. Run this again later."; exit 4; fi
  sleep 20
done
concl=$(echo "$st" | awk '{print $2}')
KEY='error •|warning •|info •|\[E\]|expected:|actual:|Expected:|Actual:|Exception|Error:|FAILED|Some tests failed|version solving|Because |Could not|Gradle|^e: |lint_dart|ERROR|::error'
if [ "$concl" = "success" ]; then
  gh run view "$id" --log > "$FULL" 2>/dev/null
  {
    echo "CI run $id, commit $short: SUCCESS  ($(date -u +%Y-%m-%dT%H:%MZ))"
    echo "Flutter/Dart used:"; grep -m2 -E "Flutter [0-9]|Dart SDK version|Tools • Dart" "$FULL" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //'
    echo "Tests:"; grep -E "All tests passed|tests passed|[0-9]+: All" "$FULL" | tail -n 3 | sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //'
    echo "Analyzer notes (infos and warnings do not fail CI):"; grep -E "(warning|info) •" "$FULL" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' | head -n 40
    echo "Jobs that were skipped or optional can show as failed-with-continue (the Pages deploy does this until the owner enables Pages)."
  } > "$OUT"
else
  gh run view "$id" --log-failed > "$FULL" 2>/dev/null
  {
    echo "CI run $id, commit $short: ${concl:-UNKNOWN}  ($(date -u +%Y-%m-%dT%H:%MZ))"
    echo "Read the lines below. Full log: docs/CI_FULL.txt (read it only if these lines are not enough)."
    echo "-----"
    sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' "$FULL" | grep -E -B1 -A3 "$KEY" | grep -vE '^--$' | head -n 160
    echo "-----"
    echo "last 25 lines:"; sed -E 's/^[^\t]*\t[^\t]*\t[0-9TZ:.-]+ //' "$FULL" | grep -vE '^\s*$' | tail -n 25
  } > "$OUT"
fi
cat "$OUT"
[ "$concl" = "success" ]
