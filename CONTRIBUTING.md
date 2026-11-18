# Contributing

Thanks for looking at `cc-status-band`. This covers the dev loop, the tests and how changes land.

## Dev loop

Load the plugin from a working tree instead of through the marketplace:

```
claude --plugin-dir /path/to/cc-status-band
```

Every Claude Code restart re-reads the plugin from disk, with no `/plugin install` and no marketplace cache to flush. The plugin is a function-hook mod in `hooks/`. Claude Code watches a `--plugin-dir` folder and reloads the mod when a file in it changes.

## Tests

```
claude plugin validate .
claude plugin test .
```

The tests in `tests/` run on Claude Code's mod test runner (`claude-code/testing`). `band.test.tsx` covers the layout and how it sheds rows when space is short, `hint.test.tsx` the hint line under the prompt, and `setup.test.ts` what `/status-band-setup` asks and writes.

CI runs them on every PR.

## Pull requests

- Open a PR against `main`. Direct pushes are blocked.
- CI must be green and every review thread resolved before a PR can merge.
- PRs are squash-merged, and the PR title becomes the commit subject, so write it as a commit message.
- Bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` in the PR that should ship as a release.

## Commits

Scoped conventional commits with a lowercase description:

```
feat(scope): add the thing
fix(scope): stop doing the wrong thing
```
