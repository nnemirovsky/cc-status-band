# Security policy

## Reporting a vulnerability

Report privately through GitHub, not in a public issue:

**[Open a private security advisory](https://github.com/nnemirovsky/cc-status-band/security/advisories/new)**

The report is visible only to the maintainer ([@nnemirovsky](https://github.com/nnemirovsky)) until an advisory is published, so nothing sensitive is exposed while a fix is prepared. Expect an acknowledgement within a week.

If the form is unavailable, open a normal issue that says only "I would like a private channel for a security report", with no details, and a private advisory will be opened for you.

Never attach real credentials, tokens, personal data or private files to a report. Describe the shape of the problem instead.

## Supported versions

Only the latest release gets security fixes.

## Scope

status-band runs `git` and `gh`, draws what they return, and can edit your settings during setup. In scope:

- Running any command other than the `git` and `gh` calls listed in PRIVACY.md, or passing them arguments from repository or GitHub data in a way that changes what they do.
- Terminal escape sequences from a branch name, worktree name, path, PR URL or other repository or GitHub data reaching the terminal as anything other than text.
- `/status-band-setup` changing `~/.claude/settings.json` without your yes, changing keys other than the ones it names, or dropping other settings when it rewrites the file.
- Sending data anywhere other than GitHub through your own `gh` login.

Out of scope:

- Commands a repository's own git config runs, such as `core.fsmonitor`, which any `git` call in that directory would run.
- Anything that needs an attacker who can already run code as you or edit your settings.

