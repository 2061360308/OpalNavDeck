import type { Env } from './config.ts'
import type { AuthStore } from './store.ts'

export interface AuthContext {
  env: Env
  store: AuthStore
}
