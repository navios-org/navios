import type { PluginInstance } from './plugin.mjs'

/**
 * Orders plugins so that each comes after the plugins it depends on, and
 * removes duplicates by name.
 * @internal
 */
export function orderPlugins(plugins: PluginInstance[]): PluginInstance[] {
  const byName = new Map<string, PluginInstance>()
  for (const plugin of plugins) {
    if (!byName.has(plugin.definition.name)) {
      byName.set(plugin.definition.name, plugin)
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
