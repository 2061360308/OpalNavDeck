/**
 * Dynamic capability registry.
 *
 * Everything a widget (sandboxed iframe) or plugin (worker) can do is a named
 * capability `namespace.method`. Core capabilities live under plain namespaces
 * (drive/net/nav/ui/settings/storage/log); plugin-provided capabilities are
 * namespaced as `plugin.<id>.<ns>`. The registry is the single dispatch point
 * shared by the widget bridge and the plugin worker host.
 */

export type CallerKind = 'widget' | 'plugin' | 'core'

export interface CapabilityContext {
  kind: CallerKind
  /** widget instance id or plugin id */
  id: string
  permissions: string[]
}

export type CapabilityHandler = (
  params: any,
  ctx: CapabilityContext
) => unknown | Promise<unknown>

export interface CapabilitySchemaItem {
  namespace: string
  provider: string
  methods: string[]
}

interface Entry {
  provider: string
  namespace: string
  method: string
  permission?: string
  handler: CapabilityHandler
}

class CapabilityRegistry {
  private entries = new Map<string, Entry>()
  private listeners = new Set<(schema: CapabilitySchemaItem[]) => void>()

  /**
   * Register a batch of methods under `namespace`.
   * `provider` is `core` or a plugin id; a later registration under the same
   * key wins only if it is `core` (core takes priority over plugins).
   */
  register(
    provider: string,
    namespace: string,
    methods: Record<string, CapabilityHandler>,
    permission?: string
  ): void {
    for (const [method, handler] of Object.entries(methods)) {
      const key = `${namespace}.${method}`
      const existing = this.entries.get(key)
      if (existing && existing.provider === 'core' && provider !== 'core') continue
      this.entries.set(key, { provider, namespace, method, permission, handler })
    }
    this.emit()
  }

  /** remove every capability contributed by a plugin */
  unregisterProvider(provider: string): void {
    let changed = false
    for (const [key, e] of this.entries) {
      if (e.provider === provider) {
        this.entries.delete(key)
        changed = true
      }
    }
    if (changed) this.emit()
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  async dispatch(key: string, params: any, ctx: CapabilityContext): Promise<unknown> {
    const e = this.entries.get(key)
    if (!e) throw new Error(`capability not found: ${key}`)
    if (e.permission && !ctx.permissions.includes(e.permission)) {
      throw new Error(`permission denied: ${e.permission}`)
    }
    return await e.handler(params, ctx)
  }

  schema(): CapabilitySchemaItem[] {
    const byNs = new Map<string, CapabilitySchemaItem>()
    for (const e of this.entries.values()) {
      let item = byNs.get(e.namespace)
      if (!item) {
        item = { namespace: e.namespace, provider: e.provider, methods: [] }
        byNs.set(e.namespace, item)
      }
      item.methods.push(e.method)
    }
    return [...byNs.values()]
  }

  onChange(fn: (schema: CapabilitySchemaItem[]) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    const schema = this.schema()
    for (const fn of this.listeners) {
      try {
        fn(schema)
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

export const capabilities = new CapabilityRegistry()
