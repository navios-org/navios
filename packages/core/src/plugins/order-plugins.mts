import type { PluginInstance } from './plugin.mjs'

/**
 * Orders plugins so that each comes after the plugins it depends on. A plugin
 * registered twice is applied once; registering it again with other options
 * is an error, since only one of the two could take effect.
 * @internal
 */
export function orderPlugins(plugins: PluginInstance[]): PluginInstance[] {
  const byName = new Map<string, PluginInstance>()
  for (const plugin of plugins) {
    const existing = byName.get(plugin.definition.name)
    if (existing === undefined) {
      byName.set(plugin.definition.name, plugin)
    } else if (existing.options !== plugin.options) {
      throw new Error(
        `[Navios] Plugin "${plugin.definition.name}" is registered twice with different ` +
          `options. Register it once.`,
      )
    }
  }
  const ordered: PluginInstance[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (name: string, requiredBy: string | null): void => {
    const plugin = byName.get(name)
    if (!plugin) {
      throw new Error(
        `[Navios] Plugin "${requiredBy}" depends on "${name}", which is not registered.`,
      )
    }
    const current = state.get(name)
    if (current === 'done') {
      return
    }
    if (current === 'visiting') {
      throw new Error(`[Navios] Plugins depend on each other in a cycle through "${name}".`)
    }
    state.set(name, 'visiting')
    for (const dependency of plugin.definition.dependsOn ?? []) {
      visit(dependency, name)
    }
    state.set(name, 'done')
    ordered.push(plugin)
  }
  for (const name of byName.keys()) {
    visit(name, null)
  }
  return ordered
}
