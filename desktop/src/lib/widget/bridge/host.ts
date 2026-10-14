import {
  capabilities,
  type CapabilityContext,
  type CapabilitySchemaItem,
} from '../../capabilities/registry'
import {
  BRIDGE_ATTR,
  BRIDGE_EVENT,
  BRIDGE_GESTURE,
  BRIDGE_KIND,
  BRIDGE_TAG,
  isBridgeMessage,
  type BridgeMessage,
} from '@desktop/shared/bridge'

export interface BridgeHandlers {
  onReady: () => void
  onPointerDown?: () => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  onDragStart: () => void
  onDragMove: (dx: number, dy: number) => void
  onDragEnd: () => void
  onContextMenu: (clientX: number, clientY: number) => void
}

export class SkinBridge {
  private iframe: HTMLIFrameElement
  private widgetId: string
  private permissions: string[]
  private handlers: BridgeHandlers
  private unsubscribe?: () => void

  private onMessage = (e: MessageEvent) => {
    if (e.source !== this.iframe.contentWindow) return
    this.handle(e.data)
  }

  constructor(
    iframe: HTMLIFrameElement,
    widgetId: string,
    permissions: string[],
    handlers: BridgeHandlers
  ) {
    this.iframe = iframe
    this.widgetId = widgetId
    this.permissions = permissions
    this.handlers = handlers
  }

  attach() {
    window.addEventListener('message', this.onMessage)
    this.unsubscribe = capabilities.onChange((schema) =>
      this.postEvent(BRIDGE_EVENT.capabilitiesChanged, { capabilities: schema })
    )
  }

  detach() {
    window.removeEventListener('message', this.onMessage)
    this.unsubscribe?.()
  }

  postInit(theme: string, behavior: unknown, schema: CapabilitySchemaItem[]) {
    this.iframe.contentWindow?.postMessage(
      {
        [BRIDGE_ATTR]: BRIDGE_TAG,
        kind: BRIDGE_KIND.host,
        event: BRIDGE_EVENT.init,
        data: { theme, behavior, capabilities: schema },
      },
      '*'
    )
  }

  postEvent(event: string, data: unknown) {
    this.iframe.contentWindow?.postMessage(
      { [BRIDGE_ATTR]: BRIDGE_TAG, kind: BRIDGE_KIND.host, event, data },
      '*'
    )
  }

  private get ctx(): CapabilityContext {
    return { kind: 'widget', id: this.widgetId, permissions: this.permissions }
  }

  private handle(data: unknown) {
    if (!isBridgeMessage(data)) return
    const d = data as BridgeMessage
    if (d.kind === BRIDGE_KIND.ready) {
      this.handlers.onReady()
      return
    }
    if (d.kind !== BRIDGE_KIND.rpc || !d.method) return

    const m = d.method
    const p = d.params ?? {}

    // gestures + notifications stay in the bridge (bound to the live iframe)
    if (m === BRIDGE_GESTURE.down) return void this.handlers.onPointerDown?.()
    if (m === BRIDGE_GESTURE.hoverEnter) return void this.handlers.onHoverEnter?.()
    if (m === BRIDGE_GESTURE.hoverLeave) return void this.handlers.onHoverLeave?.()
    if (m === BRIDGE_GESTURE.dragStart) return this.handlers.onDragStart()
    if (m === BRIDGE_GESTURE.dragMove) return this.handlers.onDragMove(p.dx, p.dy)
    if (m === BRIDGE_GESTURE.dragEnd) return this.handlers.onDragEnd()
    if (m === BRIDGE_GESTURE.contextMenu) return this.handlers.onContextMenu(p.x, p.y)
    if (m === BRIDGE_GESTURE.key) return

    const result = capabilities.dispatch(m, p, this.ctx).catch((e) => {
      console.warn('[skin] capability failed:', m, e)
      return { __error: String(e) }
    })
    if (d.id) {
      Promise.resolve(result).then((r) => this.reply(d.id!, r))
    }
  }

  private reply(id: number, result: unknown) {
    this.iframe.contentWindow?.postMessage(
      { [BRIDGE_ATTR]: BRIDGE_TAG, kind: BRIDGE_KIND.host, replyTo: id, result },
      '*'
    )
  }
}
