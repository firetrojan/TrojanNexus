#!/usr/bin/env bash
# commit.sh - the ONLY way agents commit. It adds just the paths you list, commits them, and pushes.
#   bash tools/commit.sh "T1.3 tags port" app/lib/core/tags.dart app/test/golden/tags_test.dart
# Run it with "bash" (shared phone storage cannot mark scripts as executable).
set -u
cd "$(dirname "$0")/.." || exit 1
if [ "$#" -lt 2 ]; then echo 'usage: bash tools/commit.sh "message" path1 [path2 ...]'; exit 2; fi
msg="$1"; shift
git rev-parse --git-dir >/dev/null 2>&1 || { echo "this folder is not a git repository yet (owner: see START-HERE.md step 4)"; exit 2; }

for p in "$@"; do
  case "$p" in
    .|./|/*|..|../*|*/../*|.git|.git/*) echo "refused path: $p (list exact files or folders inside this project)"; exit 2;;
    *nexus-backup*|*my-*.json|*.jks|*.keystore|*key.properties|*.env) echo "refused path: $p (looks like personal data or a secret)"; exit 2;;
  esac
  [ -e "$p" ] || { echo "no such path: $p"; exit 2; }
done

# secrets: refuse to commit anything that looks like a token or key
if grep -rIqE '(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|nvapi-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' -- "$@" 2>/dev/null; then
  echo "REFUSED: one of these files contains something that looks like a token or private key. Remove it first."; exit 2
fi

# one writer at a time (three agents share this folder)
gitdir=$(git rev-parse --git-dir); lock="$gitdir/nexus-commit.lock"; waited=0
while ! mkdir "$lock" 2>/dev/null; do
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +2 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; continue; fi   # stale lock (older than 2 minutes)
  waited=$((waited + 1)); [ "$waited" -gt 60 ] && { echo "another agent is committing and did not finish in 60s. Try again."; exit 3; }
  sleep 1
done
trap 'rmdir "$lock" 2>/dev/null' EXIT

git config user.name  >/dev/null 2>&1 || git config user.name  "nexus-agent"
git config user.email >/dev/null 2>&1 || git config user.email "nexus-agent@users.noreply.github.com"

git add -- "$@" || exit 1
if git diff --cached --quiet -- "$@"; then
  echo "nothing new to commit for these paths"
else
  git commit -q -m "$msg" -- "$@" || exit 1
  echo "committed $(git rev-parse --short HEAD): $msg"
fi

if git remote get-url origin >/dev/null 2>&1; then
  branch=$(git rev-parse --abbrev-ref HEAD)
  if git push -q -u origin "$branch" 2>/tmp/nexus-push.err; then echo "pushed to origin/$branch"
  else
    cat /tmp/nexus-push.err
    echo "PUSH FAILED. Your commit is saved here. Most likely the remote has new commits (for example from the bootstrap workflow)."
    echo "Ask the Integrator or the owner to run, while no agent is writing:  git pull --rebase --autostash   and then:  bash tools/commit.sh \"retry push\" docs/log"
    exit 4
  fi
else
  echo "no remote 'origin' yet: committed here only (owner: START-HERE.md step 4)"
fi
