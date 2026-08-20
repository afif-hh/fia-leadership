# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `afif-hh/fia-leadership`.
Use the `gh` CLI for all operations.

**No git remote is configured in this local checkout yet.** Pass `--repo afif-hh/fia-leadership`
explicitly on every `gh` call below rather than relying on remote auto-detection, until this repo
is pushed and a remote is set.

## Conventions

- **Create an issue**: `gh issue create --repo afif-hh/fia-leadership --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo afif-hh/fia-leadership --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --repo afif-hh/fia-leadership --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo afif-hh/fia-leadership --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo afif-hh/fia-leadership --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo afif-hh/fia-leadership --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents (all with `--repo afif-hh/fia-leadership`):

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo afif-hh/fia-leadership --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/afif-hh/fia-leadership/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric database id (`gh api repos/afif-hh/fia-leadership/issues/<n> --jq .id`, not the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children, drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
