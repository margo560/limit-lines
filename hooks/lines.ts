export type Level = 'success' | 'warning' | 'error'

/** Colour by how full the line is: green below 70, yellow 70-89, red 90+. */
export const level = (percent: number): Level =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'

export const clamp = (percent: number): number =>
  Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0

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
