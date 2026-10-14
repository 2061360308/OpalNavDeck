import type { MenuContext, MenuItem, MenuTarget } from './types'

type Provider = MenuItem[] | ((ctx: MenuContext) => MenuItem[])

class ContextMenuManager {
  open = $state(false)
  x = $state(0)
  y = $state(0)
  items = $state<MenuItem[]>([])
  ctx = $state<MenuContext | null>(null)

  private providers = new Map<MenuTarget, Provider[]>()

  register(target: MenuTarget, provider: Provider) {
    const arr = this.providers.get(target) ?? []
    arr.push(provider)
    this.providers.set(target, arr)
    return () => {
      const cur = this.providers.get(target)
      if (cur) this.providers.set(target, cur.filter((p) => p !== provider))
    }
  }

  show(ctx: MenuContext) {
    const providers = this.providers.get(ctx.target) ?? []
    const collected: MenuItem[] = []
    for (const p of providers) {
      const items = typeof p === 'function' ? p(ctx) : p
      collected.push(...items)
    }
    const visible = collected.filter((it) => !it.hidden)
    if (visible.length === 0) {
      this.close()
      return
    }
    this.ctx = ctx
    this.x = ctx.x
    this.y = ctx.y
    this.items = visible
    this.open = true
  }

  run(item: MenuItem, ctx: MenuContext | null = this.ctx) {
    if (item.disabled || item.separator || item.submenu || !ctx) return
    item.action?.(ctx)
    this.close()
  }

  close() {
    this.open = false
    this.items = []
    this.ctx = null
  }
}

export const menus = new ContextMenuManager()
