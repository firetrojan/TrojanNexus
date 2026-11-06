#!/usr/bin/env bash
# sync.sh - for the OWNER or the Integrator only: commit and push EVERYTHING that changed (for example files an agent without
# shell access wrote). Agents use tools/commit.sh instead.
#   bash tools/sync.sh "what changed"
set -u
cd "$(dirname "$0")/.." || exit 1
msg="${1:-sync}"
git rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repository yet (START-HERE.md step 4)"; exit 2; }
git config user.name  >/dev/null 2>&1 || git config user.name  "nexus-agent"
git config user.email >/dev/null 2>&1 || git config user.email "nexus-agent@users.noreply.github.com"
git add -A
names=$(git diff --cached --name-only | grep -E 'nexus-backup|(^|/)my-[^/]*\.json$|\.jks$|\.keystore$|key\.properties$|(^|/)\.env' || true)
leak=$(git diff --cached -U0 | grep -E '^\+' | grep -E 'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|nvapi-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' || true)
if [ -n "$names" ] || [ -n "$leak" ]; then
  git reset -q
  echo "REFUSED. Staged files looked like personal data or secrets:"; [ -n "$names" ] && echo "$names"; [ -n "$leak" ] && echo "(a line looks like a token or key)"
  exit 2
fi
big=$(git diff --cached --numstat | awk '$1 > 5000 {print $3}')
[ -n "$big" ] && echo "note: very large changes in: $big"
if git diff --cached --quiet; then echo "nothing to commit"; else git commit -q -m "$msg" && echo "committed $(git rev-parse --short HEAD): $msg"; fi
if git remote get-url origin >/dev/null 2>&1; then
  branch=$(git rev-parse --abbrev-ref HEAD)
  git push -q -u origin "$branch" && echo "pushed to origin/$branch" || { echo "PUSH FAILED. If the remote has new commits, run: git pull --rebase --autostash   then run this again."; exit 4; }
else echo "no remote 'origin' yet"; fi
