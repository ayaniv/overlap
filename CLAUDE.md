# Repo rules for Claude

## Branch protection

`main` requires changes via pull request. Even when explicitly asked to
"push and merge" or similar, never `git push` directly to `main` — always
open a PR (`gh pr create`) and leave the merge/bypass decision to the repo
owner in GitHub's own UI. If a push ever reports bypassing a rule violation
(e.g. "Changes must be made through a pull request"), treat that as a stop
signal, not something to just note afterward — the owner's push credentials
having bypass permission is not the same as being asked to use it.
