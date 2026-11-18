import { expect, test } from 'claude-code/testing'
import { clamp, level, rows, split } from './lines'

test('thresholds', async () => {
  expect(level(10)).toBe('success')
  expect(level(70)).toBe('warning')
  expect(level(95)).toBe('error')
  expect(split(50, 10)).toEqual([5, 5])
  expect(split(150, 10)).toEqual([10, 0])
  const r = rows({ context: { tokens: 50000, window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }] })
  expect(r[0]?.percent).toBe(25)
  expect(r[1]?.name).toBe('5h limit')
})

test('boundaries', async () => {
  expect(level(69)).toBe('success')
  expect(level(89)).toBe('warning')
  expect(level(90)).toBe('error')
  expect(clamp(NaN)).toBe(0)
  expect(split(99.6, 10)).toEqual([9, 1])
  const r = rows({ context: { tokens: 0, window: 100 }, rateLimits: [{ kind: 'seven_day', percentUsed: 120 }] })
  expect(r[1]?.note).toBe('0% left')
})

test('pane draws the lines', async ($, on) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 180000, window: 200000, percent: 90 }, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }], cost: { usd: 1.5 } },
  }))
  const ui = await $.ui.mount({
    plugin: 'limit-lines', component: 'Pane', requestId: 'limit-lines', surface: 'terminal',
    props: { title: 'Limits', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /context/ }))?.text).toContain('90%')
  await ui.unmount()
})

const usage = {
  startedAt: 0,
  context: { tokens: 50000, window: 200000, percent: 25 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 75 }, { kind: 'seven_day', percentUsed: 95 }],
}
const band = (hasSurvey = false) => ({
  plugin: 'limit-lines', component: 'AbovePrompt' as const, requestId: 'band', surface: 'terminal' as const,
  props: { hasSurvey, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
})

test('prompt row shows each line as a percentage', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  const ui = await $.ui.mount(band())
  expect((await ui.find({ type: 'Text', text: /context/ }))?.text).toContain('25%')
  expect((await ui.find({ type: 'Text', text: /5h limit/ }))?.text).toContain('75%')
  expect((await ui.find({ type: 'Text', text: /7d limit/ }))?.text).toContain('95%')
  expect(await ui.find({ type: 'Button', key: 'hide' })).toBeDefined()
  await ui.unmount()
})

test('hide button removes the row', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
  expect(await ui.find({ key: 'hide' })).toBeUndefined()
  await ui.unmount()
})

test('row yields to a survey', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  const ui = await $.ui.mount(band(true))
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
  await ui.unmount()
})

test('/limits brings a hidden row back', async ($, on) => {
  on('session.usage', () => ({ value: usage }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const ui = await $.ui.mount(band())
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()
  await $.command.run({ command: 'limits' })
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeDefined()
  expect(await ui.find({ key: 'hide' })).toBeDefined()
  await ui.unmount()
})
