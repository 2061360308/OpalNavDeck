import { wm } from '../state/windows.svelte'

/** open (or focus) the resource navigation window */
export function openResources() {
  return wm.open({
    title: '资源导航',
    icon: '🧭',
    appId: 'resources',
    w: 1040,
    h: 700,
  })
}

/** open (or focus) the account & security window */
export function openAccount() {
  return wm.open({
    title: '账号与安全',
    icon: '🔐',
    appId: 'account',
    w: 540,
    h: 480,
  })
}

/** open (or focus) the monitoring sources window */
export function openSources() {
  return wm.open({
    title: '监控源',
    icon: '🛰️',
    appId: 'sources',
    w: 660,
    h: 520,
  })
}
