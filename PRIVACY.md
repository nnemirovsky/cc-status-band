# Privacy policy

status-band runs entirely on your machine. It has no server of its own and collects
no telemetry. Nothing it reads is sent to the author.

## What it runs

* `git` in the session's working directory: `rev-parse` and `diff --shortstat`, for
  the worktree, branch and line counts.
* `gh pr view` and one `gh api graphql` query for the current branch's pull request,
  using your own `gh` login. These go to GitHub, as any `gh` command does, and read
  the PR's number, URL, state, review decision, checks, reviews and review threads.

## What it reads from Claude Code

The session's working directory, project root, model, context-window figures and
the effort level of its requests, through the plugin API. Message content is never
read.

## What it stores

Only the last values it drew, in the session's plugin state, which Claude Code
discards when the session ends. Nothing is written to disk.

## Contact

Questions go to [GitHub issues](https://github.com/nnemirovsky/cc-status-band/issues).
