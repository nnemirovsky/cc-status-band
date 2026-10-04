import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { BandCi, BandGit, BandPr, BandSnap } from '../types'

// A framed band above the prompt, in place of a command status line:
//
//   ╭──────────────────────────────────────────────────────────────────────────╮
//   │ 𖠰 main ⎇ fix/thing (+12,-3)  ✳ Opus 5.5 high 296k/30%  ⌘ ~/dev/app       │
//   │ PR #2899  review required  CI ✓  1 approval                               │
//   ╰──────────────────────────────────────────────────────────────────────────╯
//
// It also trims the hint line under the prompt: "(shift+tab to cycle)" goes,
// the engine's mode pill in front of it stays (no hook reaches that pill).

const snap = atom({ plugin: 'status-band', key: 'snap' } as const, null)
const pr = atom({ plugin: 'status-band', key: 'pr' } as const, null)
const effort = atom({ plugin: 'status-band', key: 'effort' } as const, null)

// ccstatusline's 256-color palette, as hex: blue 26, brightMagenta 140,
// yellow 178, cyan 30, magenta 96, green 70, grey 245, red 160.
const C = {
  worktree: '#005fd7',
  branch: '#af87d7',
  changes: '#d7af00',
  model: '#008787',
  effort: '#875f87',
  path: '#5faf00',
  grey: '#8a8a8a',
  warn: '#d7af00',
  bad: '#d70000',
  good: '#5faf00',
}

// What the engine puts in the hint line that the band shows instead: the
// cycle hint beside the mode pill, and the PR badge (or its gh-missing note).
// The PR and CI glyphs: plain Unicode, or GitHub octicons from a Nerd Font
// (one cell each) with the nerdFont option on.
const PLAIN = { pr: 'PR', ciPass: '✓', ciPending: '●', ciFail: '✗' }
const NERD = { pr: '\uf407', ciPass: '\uf42e', ciPending: '\uf43a', ciFail: '\uf467' }

const HINT_DROP = /\(shift\+tab to cycle\)|\bPR #\d+\b|install gh for PR status/g

function trimHint(hint: string): string {
  return hint
    .replace(HINT_DROP, '')
    .split('·')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join(' · ')
}

function worktreeName(gitDir: string): string {
  const linked = gitDir.match(/\.git\/worktrees\/(.+)$/) ?? gitDir.match(/\/worktrees\/(.+)$/)
  return linked?.[1] ?? 'main'
}

function shortstat(text: string): { ins: number; del: number } {
  const ins = text.match(/(\d+) insertions?\(\+\)/)
  const del = text.match(/(\d+) deletions?\(-\)/)
  return { ins: Number(ins?.[1] ?? 0), del: Number(del?.[1] ?? 0) }
}

function modelName(id: string): string {
  const m = id.match(/claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/)
  if (m?.[1] && m[2]) {
    const family = m[1].charAt(0).toUpperCase() + m[1].slice(1)
    return `${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
  }
  return id.replace(/\s*\([^)]*context\)$/i, '')
}

function tilde(path: string, home: string): string {
  if (home && path === home) return '~'
  if (home && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`
  return path
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

async function readGit($: EngineInterface, cwd: string): Promise<BandGit | null> {
  const env = { GIT_OPTIONAL_LOCKS: '0' }
  const head = await $.process.run(
    ['git', '-C', cwd, 'rev-parse', '--is-inside-work-tree', '--git-dir', '--abbrev-ref', 'HEAD'],
    { env, timeoutMs: 5000 },
  )
  const [inTree, gitDir = '', ref = ''] = head.stdout.trim().split('\n')
  if (head.exitCode !== 0 || inTree !== 'true') return null
  let branch = ref
  if (branch === 'HEAD') {
    const sha = await $.process.run(['git', '-C', cwd, 'rev-parse', '--short', 'HEAD'], { env, timeoutMs: 5000 })
    branch = sha.stdout.trim()
  }
  const diff = await $.process.run(['git', '-C', cwd, 'diff', '--shortstat', 'HEAD'], { env, timeoutMs: 5000 })
  return { worktree: worktreeName(gitDir), branch, ...shortstat(diff.stdout) }
}

async function effortFallback($: EngineInterface, model: string): Promise<string> {
  const settings = await $.settings.read()
  const perModel = (settings.modelSettings ?? {}) as Record<string, { effortLevel?: string }>
  // Keys are canonical names ("claude-opus-5-5"); the session's id may carry
  // "[1m]" or a date, so take the longest key the id starts with.
  const id = model.replace(/\[[^\]]*\]$/, '')
  const key = Object.keys(perModel)
    .filter(k => id === k || id.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0]
  const level = (key ? perModel[key]?.effortLevel : undefined) ?? (settings.effortLevel as string | undefined)
  return level ?? 'default'
}

// The directory and branch the PR row was last looked up for: a change (a
// `cd`, a checkout, a worktree) looks the PR up again at once instead of
// waiting for the minute timer.
let prKey = ''
let prRecheck: Timer | undefined

async function refresh($: EngineInterface): Promise<void> {
  const [cwd, root, model, usage, home] = await Promise.all([
    $.session.cwd(),
    $.session.root(),
    $.session.model(),
    $.session.usage(),
    $.env.get('HOME'),
  ])
  const git = await readGit($, cwd)
  const seen = await read($, effort)
  const next: BandSnap = {
    git,
    model: modelName(model),
    effort: seen ?? (await effortFallback($, model)),
    ctxTokens: usage.context.tokens ?? null,
    ctxPercent: usage.context.percent ?? null,
    cwd,
    root,
    home: home ?? '',
  }
  await update($, snap, () => next)
  const key = `${cwd}\n${git?.branch ?? ''}`
  if (key !== prKey) {
    prKey = key
    await refreshPr($)
  }
}

type Check = { __typename?: string; status?: string; conclusion?: string; state?: string }

function ciOf(checks: Check[]): { ci: BandCi; failed: number } {
  if (checks.length === 0) return { ci: 'none', failed: 0 }
  const bad = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
  let failed = 0
  let pending = 0
  for (const c of checks) {
    if (c.__typename === 'StatusContext') {
      if (bad.has(c.state ?? '')) failed++
      else if (c.state === 'PENDING' || c.state === 'EXPECTED') pending++
    } else if (c.status !== 'COMPLETED') pending++
    else if (bad.has(c.conclusion ?? '')) failed++
  }
  return { ci: failed > 0 ? 'fail' : pending > 0 ? 'pending' : 'pass', failed }
}

const THREADS_QUERY =
  'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}'

async function refreshPr($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const view = await $.process.run(
    ['gh', 'pr', 'view', '--json', 'number,url,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,latestReviews'],
    { cwd, timeoutMs: 20000 },
  )
  if (view.exitCode !== 0) {
    await update($, pr, () => null)
    return
  }
  const data = JSON.parse(view.stdout) as {
    number: number
    url: string
    state: string
    isDraft?: boolean
    mergeStateStatus?: string
    reviewDecision: string
    statusCheckRollup?: Check[]
    latestReviews?: { state: string }[]
  }
  const { ci, failed } = ciOf(data.statusCheckRollup ?? [])
  const approvals = (data.latestReviews ?? []).filter(r => r.state === 'APPROVED').length

  let unresolved = 0
  const repo = data.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//)
  if (repo?.[1] && repo[2]) {
    const threads = await $.process.run(
      [
        'gh', 'api', 'graphql',
        '-f', `query=${THREADS_QUERY}`,
        '-F', `owner=${repo[1]}`, '-F', `name=${repo[2]}`, '-F', `number=${data.number}`,
        '--jq', '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length',
      ],
      { cwd, timeoutMs: 20000 },
    )
    if (threads.exitCode === 0) unresolved = Number(threads.stdout.trim()) || 0
  }

  const next: BandPr = {
    number: data.number,
    url: data.url,
    state: data.state,
    reviewDecision: data.reviewDecision ?? '',
    ci,
    ciFailed: failed,
    unresolved,
    approvals,
    isDraft: data.isDraft ?? false,
    mergeState: data.mergeStateStatus ?? '',
  }
  await update($, pr, () => next)
  // Right after a push GitHub has no checks yet and reports the merge state as
  // UNKNOWN; look again soon rather than waiting out the minute timer.
  prRecheck?.cancel()
  prRecheck = undefined
  if (next.state === 'OPEN' && (next.mergeState === 'UNKNOWN' || next.ci === 'pending')) {
    prRecheck = $.clock.after(15_000, () => void safely(refreshPr($)))
  }
}

async function safely(work: Promise<void>): Promise<void> {
  try {
    await work
  } catch {
    // A failed git or gh call keeps the last values on screen.
  }
}

// /status-band-setup: the three things a fresh install usually needs, each
// asked first and skipped when already done.
const SETUP_COMMAND = 'status-band-setup'

type Settings = Record<string, unknown> & { env?: Record<string, string>; statusLine?: unknown }

async function readUserSettings($: EngineInterface, path: string): Promise<Settings> {
  try {
    return JSON.parse(await $.fs.read(path)) as Settings
  } catch {
    return {}
  }
}

async function setup($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  const path = `${home}/.claude/settings.json`
  const settings = await readUserSettings($, path)
  const done: string[] = []
  let isChanged = false

  const glyphs = await $.ui.ask(`Do you see a pull-request icon here:  ?`, {
    header: 'Nerd Font',
    options: ['Yes, an icon', 'No, a box or nothing'],
  })
  const nerdFont = glyphs.startsWith('Yes')
  const row = (await $.config.list()).find(r => r.key.endsWith('.nerdFont') && r.key.includes('status-band'))
  if (row && row.value !== nerdFont) {
    const set = await $.config.set({ key: row.key, value: nerdFont })
    if (set.deny === undefined) done.push(`nerdFont ${nerdFont ? 'on' : 'off'}`)
  }

  const forced = settings.env?.FORCE_HYPERLINK ?? (await $.env.get('FORCE_HYPERLINK'))
  if (forced === undefined) {
    const terminal = (await $.env.get('TERM_PROGRAM')) ?? 'unknown'
    const links = await $.ui.ask(
      `Claude Code makes links clickable only in terminals it recognises (yours: ${terminal}). Turn on FORCE_HYPERLINK? Yes if your terminal supports OSC 8 links but PR numbers print their URL.`,
      { header: 'Links', options: ['Turn it on', 'Leave it off'] },
    )
    if (links.startsWith('Turn')) {
      settings.env = { ...settings.env, FORCE_HYPERLINK: '1' }
      isChanged = true
      done.push('FORCE_HYPERLINK=1 (applies after a restart)')
    }
  }

  if (settings.statusLine !== undefined) {
    const line = await $.ui.ask(
      'Turn off your status line? It draws below the band. It is kept as statusLineDisabled, so you can rename it back.',
      { header: 'Status line', options: ['Turn it off', 'Keep it'] },
    )
    if (line.startsWith('Turn')) {
      settings.statusLineDisabled = settings.statusLine
      delete settings.statusLine
      isChanged = true
      done.push('status line off (kept as statusLineDisabled)')
    }
  }

  if (isChanged) await $.fs.write(path, `${JSON.stringify(settings, null, 2)}\n`)
  return done.length > 0 ? `${done.join('; ')}.` : 'Nothing to change.'
}

export const register: Register = (on, options) => {
  const G = options.nerdFont === true ? NERD : PLAIN

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: SETUP_COMMAND,
      description: 'Set up status-band: Nerd Font glyphs, terminal links, your old status line',
    })
    void safely(refresh($))
    void safely(refreshPr($))
    $.clock.every(10_000, () => void safely(refresh($)))
    $.clock.every(60_000, () => void safely(refreshPr($)))
    return next(e)
  })

  // The effort the main loop actually asks for, as the script's `effort.level`.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const level = String(e.effort)
      if ((await read($, effort)) !== level) await update($, effort, () => level)
    }
    return yield* next(e)
  })

  on('command.run', { command: SETUP_COMMAND }, async $ => {
    try {
      return { text: await setup($) }
    } catch {
      return { text: 'Setup cancelled, nothing changed.' }
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) void safely(refresh($))
    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran
    if (e.tool === 'Bash') {
      void safely(refresh($))
      if (/\bgh\s+(pr|api)\b|\bgit\s+(push|checkout|switch)\b/.test(e.command)) void safely(refreshPr($))
    } else if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'EnterWorktree' || e.tool === 'ExitWorktree') {
      void safely(refresh($))
    }
    return ran
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const hint = trimHint(e.props.hint)
    if (hint.length > 0) return next({ ...e, props: { ...e.props, hint } })
    // Nothing left: the engine still joins its mode pill to a drawn hint with
    // " · ", so paint blanks over that separator instead of leaving it dangling.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Box position="absolute" left={-3}>
          <Text>{'   '}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, snap)
    if (s === null) return next(e)
    const p = await read($, pr)
    const { Box, Text, Link } = $.ui.resolve(e)

    const ctxColor = s.ctxPercent === null ? C.grey : s.ctxPercent >= 85 ? C.bad : s.ctxPercent >= 60 ? C.warn : C.grey
    const cwd = tilde(s.cwd, s.home)
    const fromRoot = s.cwd !== s.root ? ` (from ${tilde(s.root, s.home)})` : ''

    const gitText = s.git ? `𖠰 ${s.git.worktree} ⎇ ${s.git.branch} (+${s.git.ins},-${s.git.del})` : '𖠰 no git'
    const ctxText = s.ctxTokens !== null && s.ctxPercent !== null ? ` ${tokens(s.ctxTokens)}/${s.ctxPercent}%` : ''
    const modelText = `✳ ${s.model} ${s.effort}${ctxText}`
    const pathLong = `⌘ ${cwd}${fromRoot}`
    const width = e.props.bodyColumns - 4 // the border and its padding
    const oneLine = `${gitText}  ${modelText}  ${pathLong}`.length <= width
    const path = oneLine || pathLong.length <= width ? pathLong : `⌘ ${cwd}`

    const gitRow = s.git ? (
      <Text>
        <Text color={C.worktree}>𖠰 {s.git.worktree}</Text> <Text color={C.branch}>⎇ {s.git.branch}</Text>{' '}
        <Text color={C.changes}>(+{s.git.ins},-{s.git.del})</Text>
      </Text>
    ) : (
      <Text color={C.worktree}>𖠰 no git</Text>
    )
    const modelRow = (
      <Text>
        <Text color={C.model}>✳ {s.model}</Text> <Text color={C.effort}>{s.effort}</Text>
        {ctxText && <Text color={ctxColor}>{ctxText}</Text>}
      </Text>
    )
    const pathRow = <Text color={C.path}>{path}</Text>

    // The PR row: only what needs attention.
    const parts: { text: string; color: string }[] = []
    if (p !== null) {
      const ready = p.state === 'OPEN' && !p.isDraft && p.mergeState === 'CLEAN' && p.reviewDecision !== 'CHANGES_REQUESTED'
      if (p.state !== 'OPEN') parts.push({ text: p.state.toLowerCase(), color: C.grey })
      else if (p.isDraft) parts.push({ text: 'draft', color: C.grey })
      if (!ready && p.state === 'OPEN') {
        if (p.reviewDecision === 'REVIEW_REQUIRED') parts.push({ text: 'review required', color: C.warn })
        if (p.reviewDecision === 'CHANGES_REQUESTED') parts.push({ text: 'changes requested', color: C.bad })
        if (p.mergeState === 'DIRTY') parts.push({ text: 'conflicts', color: C.bad })
        if (p.mergeState === 'BEHIND') parts.push({ text: 'behind', color: C.warn })
      }
      // CI shows on every open PR, ready or not, so a passing run stays visible.
      if (p.state === 'OPEN') {
        if (p.ci === 'fail') parts.push({ text: `CI ${G.ciFail} ${p.ciFailed} failed`, color: C.bad })
        if (p.ci === 'pending') parts.push({ text: `CI ${G.ciPending}`, color: C.warn })
        if (p.ci === 'pass') parts.push({ text: `CI ${G.ciPass}`, color: C.good })
      }
      if (p.unresolved > 0) parts.push({ text: `${p.unresolved} unresolved`, color: C.warn })
      if (p.approvals > 0) parts.push({ text: `${p.approvals} approval${p.approvals === 1 ? '' : 's'}`, color: C.good })
      if (parts.length === 0 && p.state === 'OPEN' && p.mergeState === 'UNKNOWN') parts.push({ text: 'checking', color: C.grey })
      // Last, so the row reads as its verdict.
      if (ready) parts.push({ text: 'ready to merge', color: C.good })
    }

    const prRow =
      p === null ? null : (
        <Text wrap="truncate">
          <Link href={p.url}>
            <Text underline>{`${G.pr} #${p.number}`}</Text>
          </Link>
          {parts.map(part => (
            <Text color={part.color}>{`  ${part.text}`}</Text>
          ))}
        </Text>
      )

    // Framed like the engine's own panels: a round, dim border with a cell
    // of padding each side.
    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        {oneLine ? (
          <Text wrap="truncate">
            {gitRow}  {modelRow}  {pathRow}
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text wrap="truncate">
              {gitRow}  {modelRow}
            </Text>
            <Text wrap="truncate">{pathRow}</Text>
          </Box>
        )}
        {prRow}
      </Box>
    )
  })
}
