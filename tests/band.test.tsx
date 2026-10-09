import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SNAP = {
  git: { worktree: 'symbols-filter', branch: 'feat/symbols-filter', ins: 0, del: 0 },
  model: 'Opus 5.5',
  effort: 'high',
  ctxTokens: 578000,
  ctxPercent: 58,
  cwd: '/home/me/dev/takeprofittech/Hub/.claude/worktrees/feat/symbols-filter-no-makers-and-a-long-tail',
  root: '/home/me/dev/takeprofittech/Hub',
  home: '/home/me',
}
const PR = {
  number: 2895, url: 'https://github.com/o/r/pull/2895', state: 'OPEN', reviewDecision: 'REVIEW_REQUIRED',
  ci: 'pass', ciFailed: 0, unresolved: 0, approvals: 1, isDraft: false, mergeState: 'BLOCKED',
}

// Stands for the host's state: what the band last stored.
function stored(on: On) {
  on('state.get', ($, e) => {
    const key = (e as { key: string }).key
    const value = key === 'snap' ? SNAP : key === 'pr' ? PR : null
    return { value: { value, version: 1 } }
  })
}

async function draw($: Engine, maxRows: number) {
  const ui = await $.ui.mount({
    plugin: 'status-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 120, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
    viewport: { columns: 125, rows: 40 },
  })
  const root = await ui.find({ type: 'Box' })
  const texts = ((root?.children ?? []) as unknown[]).length
  return { ui, root, texts }
}

test('the band keeps its frame when the slot has room and sheds rows when it does not', async ($, on) => {
  stored(on)
  // 3 lines (git+model, path, PR) + the frame's 2.
  const roomy = await draw($, 10)
  expect(roomy.root?.props.borderStyle).toBe('round')
  // No frame, the three lines on their own.
  const tight = await draw($, 3)
  expect(tight.root?.props.borderStyle).toBe(undefined)
  expect(tight.texts).toBe(3)
  // Two lines: the path joins the first.
  const two = await draw($, 2)
  expect(two.texts).toBe(2)
  // One line: everything on it.
  const one = await draw($, 1)
  expect(one.texts).toBe(1)
  expect(one.root?.text).toContain('#2895')
})
