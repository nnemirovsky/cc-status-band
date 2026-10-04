import { expect, test } from 'claude-code/testing'

const CASES = [
  ['(shift+tab to cycle) · PR #2899 · ← for agents', '← for agents'],
  ['(shift+tab to cycle) · install gh for PR status · ← for agents', '← for agents'],
  ['(shift+tab to cycle)', '   '], // the blanks over the engine's " · "
  ['? for shortcuts', '? for shortcuts'],
] as const

// Lines the engine keeps drawing itself, live pills and all.
const UNTOUCHED = ['1 shell · ctrl+t to show tasks · Enter to view tasks', '← 1 agent · 1 shell · ↓ to manage']

test('the hint line loses the cycle hint and the PR badge', async ($, on) => {
  // Stands for the engine: draws whatever hint reaches it.
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [hint, shown] of CASES) {
      const ui = await $.ui.mount({
        plugin: 'status-band',
        surface,
        component: 'PromptHint',
        props: { isDraft: false, isWorking: false, hint },
      })
      expect((await ui.find({ type: 'Text' }))?.text ?? '').toBe(shown)
      await ui.unmount()
    }
  }
})

test('a footer selection and a line with nothing to take out reach the engine untouched', async ($, on) => {
  let seen = ''
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    seen = e.props.hint
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  for (const hint of [...UNTOUCHED, '(shift+tab to cycle) · PR #2895 · 1 shell · Enter to view tasks']) {
    const ui = await $.ui.mount({
      plugin: 'status-band',
      surface: 'terminal',
      component: 'PromptHint',
      props: { isDraft: false, isWorking: false, hint },
    })
    expect(seen).toBe(hint)
    await ui.unmount()
  }
})
