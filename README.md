# Status Band

Opinionated framed status band for Claude Code with git, model, context, and the
branch's PR review state. It takes the place of a command status line and tidies
the hint line under the prompt.

![Status Band above the Claude Code prompt](assets/screenshot.png)

## It is opinionated, not configurable

This is not ccstatusline or any of the other status line builders. There are no
widgets to pick, no themes and no layout options. It draws one fixed layout in one
fixed palette, the way its author wanted it. The only setting is whether the PR and
CI marks use Nerd Font glyphs. If you want a different look, fork it: the whole
thing is one file, `hooks/register.tsx`.

## What it shows

**First row**, the same fields a typical status line has:

* the worktree (`main` for the main checkout), the branch, and staged plus unstaged
  line counts from `git diff --shortstat HEAD`
* the model and the effort level its requests actually use
* tokens in the context window and the share used: grey, yellow from 60%, red from 85%
* the working directory, with `(from …)` when the session started somewhere else.
  When the row does not fit, the path moves to its own line.

**Second row**, only when the branch has a pull request, and only what needs
attention:

| Shown when | Text |
|---|---|
| GitHub reports it mergeable and no changes are requested | `ready to merge` (review and CI are left out) |
| Review required | `review required` |
| Changes requested | `changes requested` |
| CI passed, running, failed | `CI ✓`, `CI ●`, `CI ✗ 2 failed` |
| Merge conflicts, branch behind its base | `conflicts`, `behind` |
| Unresolved review threads, when there are any | `3 unresolved` |
| Approvals, when there are any | `2 approvals` |
| Draft, merged, closed | `draft`, `merged`, `closed` |

`PR #2899` is a link to the pull request.

**Hint line under the prompt**: the band replaces Claude Code's own PR badge, so that
badge is removed from the hint line, together with `(shift+tab to cycle)`.

Git and context refresh every 10 seconds, after each turn and after Bash or file
edits. The PR row refreshes every minute, on a change of directory or branch, and
right after a `gh pr`, `gh api`, `git push`, `git checkout` or `git switch` command.

## What it cannot change

Mods reach only some of Claude Code's interface. These stay as Claude Code draws
them:

* the permission mode pill (`⏵⏵ auto mode on`)
* the `/rc` indicator
* the notification row above the prompt (the usage-limit warning, `Image in
  clipboard`), which keeps its line even when empty

## Requirements

* Claude Code 2.1.289 or later, with function-hook mods available to your account
* `git`, and `gh` logged in for the PR row
* For `nerdFont`: a Nerd Font in your terminal (the glyphs are GitHub octicons)

## Install

```
/plugin marketplace add nnemirovsky/cc-status-band
/plugin install status-band@status-band
```

Then run the setup command once:

```
/status-band-setup
```

It asks three things and changes only what you agree to, skipping what is
already done:

* whether you see a Nerd Font icon, to set `nerdFont`
* whether to set `FORCE_HYPERLINK=1`, when it is not set (see
  [Links that print the URL](#links-that-print-the-url)); it applies after a restart
* whether to turn off your status line, if you have one, since it would draw under
  the band; it is kept as `statusLineDisabled`, so renaming it back restores it

It writes only `~/.claude/settings.json`, and the `nerdFont` option through
Claude Code's own config.

## Settings

| Option | Default | |
|---|---|---|
| `nerdFont` | `false` | PR and CI marks as octicons (`` `` `` ``) instead of `PR` `✓` `●` `✗` |

Set it from `/config`, or in `~/.claude/settings.json`:

```json
"pluginConfigs": { "status-band@status-band": { "options": { "nerdFont": true } } }
```

## Links that print the URL

The PR number is an OSC 8 hyperlink. Claude Code decides whether your terminal
supports those from its environment, and does not recognise every terminal
(agterm, for one). If you see the URL printed after `PR #2899`, set
`FORCE_HYPERLINK=1` in the `env` block of `~/.claude/settings.json`, or let
`/status-band-setup` do it.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Claude Code watches a `--plugin-dir` folder and reloads the mod on each save.

## License

MIT
