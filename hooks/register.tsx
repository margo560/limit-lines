import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { clamp, level, rows, split } from './lines'

const PANE = 'limit-lines'
const stamp = atom({ plugin: 'limit-lines', key: 'stamp' } as const, 0)
const isHidden = atom({ plugin: 'limit-lines', key: 'isHidden' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'limits', description: 'Open the limit lines pane (context, rate limits, cost)' })
    return next(e)
  })

  on('command.run', { command: 'limits' }, async $ => {
    await update($, isHidden, () => false)
    await $.ui.open({ id: PANE, title: 'Limits' })
    return { text: 'Limits pane opened.' }
  })

  on('turn.complete', async ($, e, next) => {
    await update($, stamp, n => n + 1)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, stamp)
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = rows(await $.session.usage())
    return (
      <Box>
        {list.map(r => (
          <Text key={r.name} color={level(r.percent)}>
            {r.name} {Math.round(clamp(r.percent))}%{'  '}
          </Text>
        ))}
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, stamp)
    const { Box, Text } = $.ui.resolve(e)
    const u = await $.session.usage()
    const width = Math.max(10, Math.min(40, (e.props.bodyColumns ?? 40) - 24))
    return (
      <Box flexDirection="column">
        {rows(u).map(r => {
          const [on_, off] = split(r.percent, width)
          return (
            <Box key={r.name} flexDirection="column">
              <Text>
                {r.name} <Text color={level(r.percent)}>{Math.round(clamp(r.percent))}%</Text>
              </Text>
              <Text>
                <Text color={level(r.percent)}>{'█'.repeat(on_)}</Text>
                <Text dimColor>{'░'.repeat(off)}</Text> {r.note}
              </Text>
            </Box>
          )
        })}
        {u.rateLimits.length === 0 && <Text dimColor>No rate-limit windows reported (not a subscription).</Text>}
        {u.cost && <Text dimColor>cost ≈ ${u.cost.usd.toFixed(2)} (estimate)</Text>}
      </Box>
    )
  })
}
