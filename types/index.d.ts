declare module 'claude-code' {
  interface PluginState {
    'limit-lines': { stamp: number; isHidden: boolean | null; mcp: Record<string, number> }
  }
}
