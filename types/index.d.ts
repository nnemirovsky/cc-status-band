export type BandGit = { worktree: string; branch: string; ins: number; del: number }

export type BandCi = 'pass' | 'fail' | 'pending' | 'none'

export type BandPr = {
  number: number
  url: string
  state: string
  reviewDecision: string
  ci: BandCi
  ciFailed: number
  unresolved: number
  approvals: number
  isDraft: boolean
  mergeState: string
}

export type BandSnap = {
  git: BandGit | null
  model: string
  effort: string
  ctxTokens: number | null
  ctxPercent: number | null
  cwd: string
  root: string
  home: string
}

declare module 'claude-code' {
  interface PluginState {
    'status-band': { snap: BandSnap | null; pr: BandPr | null; effort: string | null }
  }
}
