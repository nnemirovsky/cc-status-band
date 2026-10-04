import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SETTINGS = '/home/me/.claude/settings.json'
const RUN = {
  command: 'status-band-setup',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

// Stands for the person and the disk: answers each question by its header,
// serves one settings file, and keeps what the plugin writes back.
function world(on: On, answers: Record<string, string>, file: object) {
  const seen = { asked: [] as string[], written: undefined as string | undefined, nerdFont: undefined as unknown }
  mock.env(on, { HOME: '/home/me', TERM_PROGRAM: 'agterm' })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = e.questions[0]!
    seen.asked.push(q.header)
    return { result: { questions: e.questions, answers: { [q.question]: answers[q.header] ?? '' } } }
  })
  on('fs.read', ($, e) => (e.path === SETTINGS ? { value: JSON.stringify(file) } : { deny: 'no such file' }))
  on('fs.write', ($, e) => {
    seen.written = e.text
    return { value: undefined }
  })
  on('config.list', () => ({
    value: [
      {
        key: 'status-band.nerdFont',
        label: 'Nerd Font glyphs',
        kind: 'boolean',
        value: false,
        provider: { plugin: 'status-band', tier: 'user' },
        isLocked: false,
      },
    ],
  }))
  on('config.set', ($, e) => {
    seen.nerdFont = e.value
    return { value: e.value }
  })
  return seen
}

test('setup turns everything on when asked to', async ($, on) => {
  const seen = world(
    on,
    { 'Nerd Font': 'Yes, an icon', Links: 'Turn it on', 'Status line': 'Turn it off' },
    { env: { A: '1' }, statusLine: { type: 'command', command: 'x' } },
  )
  const { text } = await $.command.run(RUN)

  expect(seen.asked).toEqual(['Nerd Font', 'Links', 'Status line'])
  expect(seen.nerdFont).toBe(true)
  expect(JSON.parse(seen.written ?? '{}')).toEqual({
    env: { A: '1', FORCE_HYPERLINK: '1' },
    statusLineDisabled: { type: 'command', command: 'x' },
  })
  expect(text ?? '').toContain('FORCE_HYPERLINK=1')
})

test('setup skips what is already done and writes nothing', async ($, on) => {
  const seen = world(on, { 'Nerd Font': 'No, a box or nothing' }, { env: { FORCE_HYPERLINK: '1' } })
  const { text } = await $.command.run(RUN)

  expect(seen.asked).toEqual(['Nerd Font'])
  expect(seen.nerdFont).toBe(undefined)
  expect(seen.written).toBe(undefined)
  expect(text).toBe('Nothing to change.')
})
