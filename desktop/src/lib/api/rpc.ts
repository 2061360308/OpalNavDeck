import { hc } from 'hono/client'
import type { AppType } from '@desktop/server/app'
import { authHeaders } from '../persist/api'

/** end-to-end typed Hono RPC client (same-origin) */
export const rpc = hc<AppType>('', { headers: () => authHeaders() })
