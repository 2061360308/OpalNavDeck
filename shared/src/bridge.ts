/**
 * Widget skin bridge protocol, shared by the host class
 * (desktop/src/lib/widget/bridge/host.ts) and the injected client runtime
 * (desktop/src/lib/widget/bridge/client.js). client.js ships into the sandbox
 * as raw JS, so it cannot import this module — its literals MUST match these
 * constants (see the note at the top of client.js).
 */

export const BRIDGE_TAG = 1
export const BRIDGE_ATTR = '__desk'

export const BRIDGE_KIND = {
  rpc: 'rpc',
  host: 'host',
  ready: 'ready',
} as const

/** client → host gestures / notifications (no reply) */
export const BRIDGE_GESTURE = {
  down: 'gesture.down',
  hoverEnter: 'gesture.hoverenter',
  hoverLeave: 'gesture.hoverleave',
  dragStart: 'gesture.dragstart',
  dragMove: 'gesture.dragmove',
  dragEnd: 'gesture.dragend',
  contextMenu: 'contextmenu',
  key: 'key',
} as const

/** host → client events */
export const BRIDGE_EVENT = {
  init: 'init',
  themeChanged: 'theme.changed',
  behaviorChanged: 'behavior.changed',
  capabilitiesChanged: 'capabilities.changed',
  monitorData: 'monitor.data',
} as const

export interface BridgeMessage {
  __desk?: 1
  kind: string
  id?: number
  method?: string
  params?: any
  replyTo?: number
  event?: string
  data?: any
}

export function isBridgeMessage(d: unknown): d is BridgeMessage {
  return !!d && (d as Record<string, unknown>)[BRIDGE_ATTR] === BRIDGE_TAG
}
