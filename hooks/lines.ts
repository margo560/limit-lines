export type Level = 'success' | 'warning' | 'error'

export const clamp = (percent: number): number =>
  Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0

export type Thresholds = { warn: number; error: number }

export const DEFAULT_THRESHOLDS: Thresholds = { warn: 70, error: 90 }

/** Thresholds from the plugin's options (`warnAt`, `errorAt`). A bad value falls back to its default; red never starts below yellow. */
export const thresholds = (options: Readonly<Record<string, unknown>> = {}): Thresholds => {
  const pick = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : fallback)
  const warn = pick(options.warnAt, DEFAULT_THRESHOLDS.warn)
  return { warn, error: Math.max(warn, pick(options.errorAt, DEFAULT_THRESHOLDS.error)) }
}

/** Colour by how full the line is: green below `warn`, yellow from `warn`, red from `error` (default 70 and 90). */
export const level = (percent: number, t: Thresholds = DEFAULT_THRESHOLDS): Level =>
  percent >= t.error ? 'error' : percent >= t.warn ? 'warning' : 'success'

/** A bar of `width` cells: filled part and empty part. */
export const split = (percent: number, width: number): [number, number] => {
  const filled = Math.floor((clamp(percent) / 100) * width)
  return [filled, width - filled]
}

export const label = (kind: string): string =>
  kind === 'five_hour' ? '5h limit' : kind === 'seven_day' ? '7d limit' : kind === 'spend_limit' ? 'spend' : kind

export const tokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)

export type Row = { name: string; percent: number; note: string }

export const rows = (u: {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
}): Row[] => {
  const used = u.context.tokens ?? 0
  const out: Row[] = [
    {
      name: 'context',
      percent: u.context.percent ?? (u.context.window ? (used / u.context.window) * 100 : 0),
      note: `${tokens(used)}/${tokens(u.context.window)} · ${tokens(Math.max(0, u.context.window - used))} left`,
    },
  ]
  for (const r of u.rateLimits) {
    out.push({ name: label(r.kind), percent: r.percentUsed, note: `${Math.round(100 - clamp(r.percentUsed))}% left` })
  }
  return out
}

export type McpCounts = Record<string, number>

export const SNAPSHOT_FILE = 'limit-lines-usage.json'

export type Snapshot = {
  version: 1
  updatedAt: string
  rows: (Row & { level: Level })[]
  cost?: number
  mcp: McpCounts
}

/** What the mod writes for other programs (the desktop widget and others) to read. */
export const snapshot = (
  u: Parameters<typeof rows>[0] & { cost?: { usd: number } },
  counts: McpCounts,
  now: Date,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Snapshot => ({
  version: 1,
  updatedAt: now.toISOString(),
  rows: rows(u).map(r => ({ ...r, percent: clamp(r.percent), level: level(r.percent, t) })),
  ...(u.cost ? { cost: u.cost.usd } : {}),
  mcp: counts,
})

/** The server of an `mcp__<server>__<tool>` name, or undefined for any other tool. */
export const mcpServer = (tool: string): string | undefined => {
  const m = /^mcp__(.+?)__.+$/.exec(tool)
  return m ? m[1] : undefined
}

/** Counts one call to `tool`; a non-MCP tool leaves the counts as they were. */
export const bump = (counts: McpCounts, tool: string): McpCounts => {
  const s = mcpServer(tool)
  return s ? { ...counts, [s]: (counts[s] ?? 0) + 1 } : counts
}

export const mcpTotal = (counts: McpCounts): number => Object.values(counts).reduce((a, b) => a + b, 0)

/** Servers by call count, busiest first. */
export const mcpRows = (counts: McpCounts): [string, number][] =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
