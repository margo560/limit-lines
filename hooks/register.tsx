import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bump, clamp, level, mcpRows, mcpTotal, rows, split, thresholds } from './lines'
import type { McpCounts } from './lines'

const PANE = 'limit-lines'
const stamp = atom({ plugin: 'limit-lines', key: 'stamp' } as const, 0)
const mcp = atom({ plugin: 'limit-lines', key: 'mcp' } as const, {} as McpCounts)
// null = not decided yet this session: fall back to what the plugin store remembers.
const isHidden = atom({ plugin: 'limit-lines', key: 'isHidden' } as const, null as boolean | null)
const STORE_KEY = 'isHidden'

const hiddenNow = async ($: EngineInterface): Promise<boolean> => {
  const v = await read($, isHidden)
  return v ?? (await $.store.get(STORE_KEY)) === true
}

const setHidden = async ($: EngineInterface, value: boolean) => {
  await update($, isHidden, () => value)
  await $.store.set(STORE_KEY, value)
}

export const register: Register = (on, options) => {
  const t = thresholds(options)
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limits', description: 'Open the limit lines pane (context, rate limits, cost)' })
    await $.command.register({ name: 'limits-hide', description: 'Close the limit lines pane and hide the prompt row' })
    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    await setHidden($, false)
    await $.ui.open({ id: PANE, title: 'Limits' })
    return { text: 'Limits pane opened.' }
  })

  on('command.run', { command: 'limits-hide' }, async $ => {
    await $.ui.close({ id: PANE })
    await setHidden($, true)
    return { text: 'Limits pane closed and row hidden. /limits brings them back.' }
  })

  on('tool.call', async ($, e, next) => {
    const counts = await read($, mcp)
    const after = bump(counts, e.tool)
    if (after !== counts) await update($, mcp, () => after)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, stamp, n => n + 1)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, stamp)
    if (e.props.hasSurvey || (await hiddenNow($))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = rows(await $.session.usage())
    const calls = mcpTotal(await read($, mcp))
    return (
      <Box>
        {list.map(r => (
          <Text key={r.name} color={level(r.percent, t)}>
            {r.name} {Math.round(clamp(r.percent))}%{'  '}
          </Text>
        ))}
        {calls > 0 && <Text key="mcp" dimColor>mcp {calls} calls{'  '}</Text>}
        <Button key="hide" label="Hide" onPress={() => setHidden($, true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, stamp)
    const { Box, Text } = $.ui.resolve(e)
    const u = await $.session.usage()
    const servers = await read($, mcp)
    const width = Math.max(10, Math.min(40, (e.props.bodyColumns ?? 40) - 24))
    return (
      <Box flexDirection="column">
        {rows(u).map(r => {
          const [on_, off] = split(r.percent, width)
          return (
            <Box key={r.name} flexDirection="column">
              <Text>
                {r.name} <Text color={level(r.percent, t)}>{Math.round(clamp(r.percent))}%</Text>
              </Text>
              <Text>
                <Text color={level(r.percent, t)}>{'█'.repeat(on_)}</Text>
                <Text dimColor>{'░'.repeat(off)}</Text> {r.note}
              </Text>
            </Box>
          )
        })}
        {mcpRows(servers).map(([name, n]) => (
          <Text key={`mcp-${name}`} dimColor>mcp {name}: {n} {n === 1 ? 'call' : 'calls'}</Text>
        ))}
        {u.rateLimits.length === 0 && <Text dimColor>No rate-limit windows reported (not a subscription).</Text>}
        {u.cost && <Text dimColor>cost ≈ ${u.cost.usd.toFixed(2)} (estimate)</Text>}
      </Box>
    )
  })
}
