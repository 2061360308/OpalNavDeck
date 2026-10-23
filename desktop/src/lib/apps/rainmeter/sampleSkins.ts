import { skins, type PackageFile } from '../../desktop/skins.svelte'

export const SAMPLE_MONITOR_ID = 'monitor'

const SAMPLE_ROOT = '/sample-skins/monitor'
const SAMPLE_FILES = ['widget.json', 'index.html']

export async function installSampleMonitor(): Promise<boolean> {
  const files: PackageFile[] = []
  for (const path of SAMPLE_FILES) {
    const res = await fetch(`${SAMPLE_ROOT}/${path}`)
    if (!res.ok) throw new Error(`sample skin file not found: ${path}`)
    const blob = await res.blob()
    files.push({ path, file: new File([blob], path) })
  }
  return skins.install(SAMPLE_MONITOR_ID, files)
}
