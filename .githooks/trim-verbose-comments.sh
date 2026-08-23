#!/usr/bin/env bash
# Core logic for the pre-push comment-trim hook. Invoked by .githooks/pre-push
# with the standard pre-push stdin: lines of
#   <local ref> <local sha1> <remote ref> <remote sha1>
#
# For each ref being pushed: diff the files it adds against what's already on
# the remote, hand the changed code files to a coding-agent CLI with a prompt
# to trim comments that are too long, rambling, restate the obvious, or add no
# real information — and keep the ones documenting a genuinely non-obvious WHY.
# If the agent edits anything, commit it and abort this push (see pre-push for
# why a retry is required) so the trimmed version is what actually ships.
#
# Agent selection (first match wins):
#   COMMENT_TRIM_AGENT_CMD  - full custom command, reads the prompt on stdin,
#                             edits files itself. Use this for any harness not
#                             listed below (works with anything scriptable).
#   COMMENT_TRIM_AGENT      - force one of: claude | codex | gemini | cursor-agent
#   (unset)                 - auto-detect, first found in that same order
#
# No agent found -> warns and lets the push through unchecked, it does not block.
set -euo pipefail

ZERO="0000000000000000000000000000000000000000"
DEFAULT_BASE_BRANCH="master"

CODE_GLOBS=(
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.vue'
  '*.py' '*.go' '*.rs' '*.java' '*.c' '*.h' '*.cpp' '*.hpp'
)

# Vendor/generated code the project's own eslint config already excludes from
# comment-quality review (app/components/ui is shadcn-vue CLI output).
EXCLUDE_RE='^(node_modules/|\.nuxt/|\.output/|dist/|coverage/|app/components/ui/)'

resolve_range_base() {
  local local_sha="$1" remote_sha="$2"
  if [ "$remote_sha" != "$ZERO" ]; then
    echo "$remote_sha"
    return
  fi
  # New branch: diff against where it forked from the default branch, so only
  # this branch's own commits are reviewed, not the whole file history.
  local remote_base="origin/${DEFAULT_BASE_BRANCH}"
  if git rev-parse --verify --quiet "$remote_base" >/dev/null; then
    git merge-base "$remote_base" "$local_sha" 2>/dev/null || echo "$remote_base"
  else
    echo "${local_sha}^" # best-effort fallback: just the tip commit's own diff
  fi
}

run_trim_agent() {
  local prompt_file="$1"

  if [ -n "${COMMENT_TRIM_AGENT_CMD:-}" ]; then
    bash -c "$COMMENT_TRIM_AGENT_CMD" < "$prompt_file"
    return $?
  fi

  local agent="${COMMENT_TRIM_AGENT:-}"
  if [ -z "$agent" ]; then
    for candidate in claude codex gemini cursor-agent; do
      if command -v "$candidate" >/dev/null 2>&1; then
        agent="$candidate"
        break
      fi
    done
  fi

  case "$agent" in
    claude)
      claude -p --dangerously-skip-permissions < "$prompt_file" ;;
    codex)
      codex exec --full-auto < "$prompt_file" ;;
    gemini)
      gemini -y -p < "$prompt_file" ;;
    cursor-agent)
      cursor-agent -p --force < "$prompt_file" ;;
    "")
      echo "pre-push: no coding-agent CLI found (claude/codex/gemini/cursor-agent)." >&2
      echo "pre-push: set COMMENT_TRIM_AGENT_CMD, or install one of those. Skipping comment-trim check." >&2
      return 2 ;;
    *)
      echo "pre-push: unknown COMMENT_TRIM_AGENT='$agent'" >&2
      return 2 ;;
  esac
}

build_prompt() {
  local files="$1"
  cat <<EOF
This repo's comment policy: default to no comments. Only keep one when it
explains a non-obvious WHY — a hidden constraint, a subtle invariant, a
workaround for a specific bug, behavior that would surprise a reader. Never
keep a comment that restates WHAT the code does (names already say that),
references the current task/issue/caller, or rambles across multiple
sentences/paragraphs when one clause would do.

Review the comments in the files listed below (about to be pushed) against
that bar. Trim or delete every comment that is too long, repetitive, restates
the obvious, or carries no real information. Leave comments that genuinely
meet the bar untouched. Do not change any code logic, only comments. Edit the
files directly.

Files:
$files
EOF
}

while read -r local_ref local_sha remote_ref remote_sha; do
  [ "$local_sha" = "$ZERO" ] && continue # deleting a ref, nothing to check

  range_base="$(resolve_range_base "$local_sha" "$remote_sha")"

  changed_files="$(git diff --name-only --diff-filter=ACMR "$range_base" "$local_sha" -- "${CODE_GLOBS[@]}" \
    | grep -Ev "$EXCLUDE_RE" || true)"

  [ -z "$changed_files" ] && continue

  prompt_file="$(mktemp)"
  trap 'rm -f "$prompt_file"' RETURN
  build_prompt "$changed_files" > "$prompt_file"

  if ! run_trim_agent "$prompt_file"; then
    status=$?
    rm -f "$prompt_file"
    if [ "$status" -eq 2 ]; then
      continue # no agent available; already warned above
    fi
    echo "pre-push: comment-trim agent exited with an error; continuing without trimming." >&2
    continue
  fi
  rm -f "$prompt_file"

  if ! git diff --quiet -- $changed_files; then
    git add -- $changed_files
    git commit -m "style: trim verbose comments (pre-push hook)"
    echo "pre-push: trimmed verbose comments, committed as $(git rev-parse --short HEAD)."
    echo "pre-push: run 'git push' again to push the updated branch."
    exit 1
  fi
done

exit 0
