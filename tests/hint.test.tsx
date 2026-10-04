import { expect, test } from 'claude-code/testing'

const CASES = [
  ['(shift+tab to cycle) · PR #2899 · ← for agents', '← for agents'],
  ['(shift+tab to cycle) · install gh for PR status · ← for agents', '← for agents'],
  ['(shift+tab to cycle)', '   '], // the blanks over the engine's " · "
  ['? for shortcuts', '? for shortcuts'],
] as const

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
