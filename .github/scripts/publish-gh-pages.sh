#!/usr/bin/env bash
# Publishes to (or removes from) the gh-pages branch with a retried push.
# Adapted from theraccoonbear/exprforge.
#
# Several workflows write to gh-pages (production deploy at the branch
# root, one pr-<N>/ directory per PR preview, preview cleanup). Each
# attempt starts from a fresh clone of the branch tip, re-applies the
# change and pushes; a rejected push is retried against the new tip.
#
#   publish-gh-pages.sh root <src-dir> <message>
#       Replaces everything at the branch root with <src-dir>, except
#       pr-*/ preview directories, which are preserved.
#   publish-gh-pages.sh preview <src-dir> <pr-number> <message>
#       Replaces pr-<number>/ with <src-dir>. Nothing else is touched.
#   publish-gh-pages.sh remove <pr-number> <message>
#       Deletes pr-<number>/ if present.
#
# Every mode keeps a .nojekyll file at the branch root.
#
# Environment:
#   GITHUB_TOKEN / GITHUB_REPOSITORY  used to build the push URL
#   REMOTE_URL                        overrides the push URL (tests)
#   GH_PAGES_BRANCH                   defaults to gh-pages
#   MAX_ATTEMPTS                      defaults to 6
#   RETRY_DELAY_MAX                   max random retry delay, default 5
set -euo pipefail

usage() {
  echo "usage: $0 root <src-dir> <message>" >&2
  echo "       $0 preview <src-dir> <pr-number> <message>" >&2
  echo "       $0 remove <pr-number> <message>" >&2
  exit 2
}

mode="${1:-}"
branch="${GH_PAGES_BRANCH:-gh-pages}"
max_attempts="${MAX_ATTEMPTS:-6}"
retry_delay_max="${RETRY_DELAY_MAX:-5}"
remote="${REMOTE_URL:-https://x-access-token:${GITHUB_TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"

src=""
dest=""
case "$mode" in
  root)
    [ "$#" -eq 3 ] || usage
    src="$(cd "$2" && pwd)"
    message="$3"
    ;;
  preview)
    [ "$#" -eq 4 ] || usage
    src="$(cd "$2" && pwd)"
    dest="pr-$3"
    message="$4"
    ;;
  remove)
    [ "$#" -eq 3 ] || usage
    dest="pr-$2"
    message="$3"
    ;;
  *)
    usage
    ;;
esac

if [ -n "$dest" ] && ! [[ "$dest" =~ ^pr-[0-9]+$ ]]; then
  echo "refusing unsafe preview directory: $dest" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

attempt=1
while true; do
  rm -rf "$work/repo"
  if git clone --quiet --depth 1 --branch "$branch" "$remote" "$work/repo" 2>/dev/null; then
    :
  else
    echo "Branch $branch not found; creating it."
    git init --quiet "$work/repo"
    git -C "$work/repo" checkout --quiet --orphan "$branch"
    git -C "$work/repo" remote add origin "$remote"
  fi
  cd "$work/repo"
  git config user.name "github-actions[bot]"
  git config user.email "github-actions[bot]@users.noreply.github.com"

  case "$mode" in
    root)
      find . -mindepth 1 -maxdepth 1 ! -name .git ! \( -type d -name 'pr-*' \) -exec rm -rf {} +
      cp -a "$src"/. .
      touch .nojekyll
      ;;
    preview)
      rm -rf "./$dest"
      mkdir -p "./$dest"
      cp -a "$src"/. "./$dest"/
      touch .nojekyll
      ;;
    remove)
      if [ ! -d "./$dest" ]; then
        echo "Nothing to remove at $dest."
        exit 0
      fi
      rm -rf "./$dest"
      ;;
  esac

  git add -A
  if git diff --cached --quiet; then
    echo "No changes to publish."
    exit 0
  fi
  git commit --quiet -m "$message"

  if git push --quiet origin "HEAD:refs/heads/$branch"; then
    echo "Pushed to $branch (attempt $attempt)."
    exit 0
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Push to $branch failed after $attempt attempts." >&2
    exit 1
  fi
  delay=$(( (RANDOM % retry_delay_max) + attempt ))
  echo "Push rejected (attempt $attempt); retrying in ${delay}s against the new tip."
  sleep "$delay"
  attempt=$(( attempt + 1 ))
  cd "$work"
done
