<script lang="ts">
  import type { WindowState } from '../../types'
  import { wm } from '../../state/windows.svelte'
  import { widgets } from '../../state/widgets.svelte'
  import { skins } from '../../desktop/skins.svelte'
  import { stage } from '../../stage/stageState.svelte'
  import { toast } from '../../state/toast.svelte'
  import { installSampleMonitor, SAMPLE_MONITOR_ID } from './sampleSkins'
  import {
    rm,
    POSITIONS,
    MONITORS,
    TRANSPARENCY,
    HOVER_LABEL,
    hoverModeFromLabel,
  } from './rainmeter.svelte'
  import { FolderPlus, ChevronDown, ChevronRight } from '@lucide/svelte'

  let { win }: { win: WindowState } = $props()

  let tab = $state<'skins' | 'themes'>('skins')

  let saveEmpty = $state(false)
  let saveExcludeUnused = $state(false)
  let saveWallpaper = $state(false)
  let newThemeName = $state('illustro default')

  const selected = $derived(
    widgets.list.find((w) => w.id === rm.selectedWidgetId) ?? widgets.list[0] ?? null
  )

  const availableSkins = $derived(
    skins.list.filter((s) => !widgets.list.some((w) => w.skin === s.id))
  )

  let installing = $state(false)
  let installInput: HTMLInputElement | undefined = $state()

  function addSkin(skinId: string) {
    const existing = widgets.list.find((x) => x.skin === skinId)
    if (existing) {
      rm.selectWidget(existing.id)
      toast.show('该皮肤已在桌面')
      return
    }
    const man = skins.get(skinId)
    const w = man?.size?.w ?? 380
    const h = man?.size?.h ?? 270
    const step = widgets.list.length % 6
    const x = Math.max(0, Math.min(stage.refW - w, Math.round((stage.refW - w) / 2) + step * 24))
    const y = Math.max(0, Math.min(stage.refH - h, Math.round((stage.refH - h) / 2) + step * 24))
    const widget = widgets.add(skinId, x, y)
    rm.selectWidget(widget.id)
    toast.show(`已添加皮肤：${man?.name ?? skinId}`)
  }

  async function installFromFolder(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0) return
    installing = true
    try {
      const entries = files.map((f) => {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        return { rel, file: f }
      })
      const root = entries[0]?.rel.includes('/') ? entries[0].rel.split('/')[0] : ''
      const files2 = entries
        .map((en) => ({
          path: root ? en.rel.split('/').slice(1).join('/') : en.rel,
          file: en.file,
        }))
        .filter((f) => f.path)
      const manifestFile = files2.find((f) => f.path === 'widget.json')
      if (!manifestFile) {
        toast.show('皮肤包缺少 widget.json')
        return
      }
      const man = JSON.parse(await manifestFile.file.text())
      const id = String(man?.id ?? '').trim()
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.show('widget.json 的 id 无效')
        return
      }
      const ok = await skins.install(id, files2)
      toast.show(ok ? `已安装皮肤：${man?.name ?? id}` : '安装失败')
      if (ok) addSkin(id)
    } catch (e) {
      toast.show(`安装失败：${String(e)}`)
    } finally {
      installing = false
    }
  }

  async function installSample() {
    if (installing) return
    installing = true
    try {
      const ok = await installSampleMonitor()
      if (!ok) {
        toast.show('安装示例皮肤失败')
        return
      }
      toast.show('示例监控皮肤已安装')
      addSkin(SAMPLE_MONITOR_ID)
    } catch (e) {
      toast.show(`安装示例皮肤失败：${String(e)}`)
    } finally {
      installing = false
    }
  }

  async function removePackage(id: string, label: string) {
    if (!window.confirm(`删除皮肤包「${label}」？桌面上的组件也会被移除。`)) return
    const ok = await skins.removePackage(id)
    if (!ok) {
      toast.show('删除皮肤包失败')
      return
    }
    for (const w of widgets.list.filter((x) => x.skin === id)) widgets.remove(w.id)
    toast.show(`已删除皮肤包：${label}`)
  }

  $effect(() => {
    if (!widgets.list.some((w) => w.id === rm.selectedWidgetId)) {
      rm.selectedWidgetId = widgets.list[0]?.id ?? ''
    }
  })

  function manifestOf(skinId: string) {
    return skins.get(skinId)
  }

  function nodeName(skinId: string) {
    return manifestOf(skinId)?.name ?? skinId
  }

  function leaves(skinId: string): string[] {
    const m = manifestOf(skinId)
    if (m?.styles?.length) return m.styles.map((s) => s.name ?? `${s.id}.ini`)
    return [`${m?.name ?? skinId}.ini`]
  }

  function transparencyOf(opacity: number): number {
    return Math.round((1 - opacity) * 100)
  }

  function setTransparency(id: string, pct: number) {
    widgets.setBehavior(id, { opacity: 1 - pct / 100 })
  }

  function cfgStr(w: { config: Record<string, unknown> }, key: string, fallback: string): string {
    const v = w.config[key]
    return typeof v === 'string' ? v : fallback
  }

  function cfgNum(w: { config: Record<string, unknown> }, key: string, fallback: number): number {
    const v = w.config[key]
    return typeof v === 'number' ? v : fallback
  }

  function openSettings() {
    wm.open({ title: '个性化', icon: '🎨', appId: 'personalize', w: 860, h: 600 })
  }

  function saveTheme() {
    rm.saveTheme(newThemeName, {
      empty: saveEmpty,
      excludeUnused: saveExcludeUnused,
      wallpaper: saveWallpaper,
    })
  }
</script>

<div class="rm">
  <div class="tabs" role="tablist">
    <button class="tab" class:active={tab === 'skins'} onclick={() => (tab = 'skins')} role="tab"
      >皮肤</button
    >
    <button class="tab" class:active={tab === 'themes'} onclick={() => (tab = 'themes')} role="tab"
      >主题</button
    >
  </div>

  {#if tab === 'skins'}
    <div class="skins">
      <aside class="left">
        <div class="active-row">
          <select class="active-select" bind:value={rm.activeThemeId} title="已激活的皮肤">
            {#each rm.themes as t (t.id)}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
          <button class="folder-add" title="新建主题文件夹" onclick={() => rm.addTheme()}
            ><FolderPlus size={16} /></button
          >
        </div>

        <div class="tree">
          <div class="tree-root">{rm.activeTheme.name}</div>
          {#each widgets.list as w (w.id)}
            <div class="node">
              <button class="node-row" onclick={() => rm.toggle(w.id)}>
                <span class="caret">
                  {#if rm.isExpanded(w.id)}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
                </span>
                <span class="node-name">{nodeName(w.skin)}</span>
              </button>
              {#if rm.isExpanded(w.id)}
                <div class="leaves">
                  {#each leaves(w.skin) as leaf (leaf)}
                    <button
                      class="leaf"
                      class:selected={selected?.id === w.id}
                      onclick={() => rm.selectWidget(w.id)}
                    >
                      {leaf}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
          {#if widgets.list.length === 0}
            <div class="empty-tree">当前没有已加载的皮肤</div>
          {/if}
        </div>

        <div class="library">
          <div class="library-head">皮肤库</div>
          {#if availableSkins.length === 0}
            <div class="empty-tree">已全部添加到桌面</div>
          {/if}
          {#each availableSkins as s (s.id)}
            <div class="lib-row">
              <button class="lib-add" onclick={() => addSkin(s.id)} title="添加到桌面">
                {s.name}
              </button>
              <button
                class="lib-del"
                onclick={() => removePackage(s.id, s.name)}
                title="删除皮肤包"
              >
                ×
              </button>
            </div>
          {/each}
          <div class="lib-acts">
            <button onclick={() => installInput?.click()} disabled={installing}>从文件夹安装</button>
            <button onclick={installSample} disabled={installing}>安装示例监控</button>
          </div>
          <input
            bind:this={installInput}
            class="hidden-input"
            type="file"
            webkitdirectory
            multiple
            onchange={installFromFolder}
          />
        </div>

        <button class="rmskin">创建 .rmskin 皮肤包 ...</button>
      </aside>

      <section class="right">
        {#if selected}
          {@const man = manifestOf(selected.skin)}
          <div class="detail-head">
            <div>
              <div class="detail-title">{man?.name ?? selected.skin}.ini</div>
              <div class="detail-path">{rm.activeTheme.name}\{man?.name ?? selected.skin}</div>
            </div>
            <div class="head-btns">
              <button onclick={() => widgets.remove(selected.id)}>卸载</button>
              <button onclick={() => skins.load()}>刷新</button>
              <button onclick={() => removePackage(selected.skin, man?.name ?? selected.skin)}
                >删除皮肤包</button
              >
              <button>编辑</button>
            </div>
          </div>

          <div class="meta">
            <div class="meta-row"><span>作者</span><b>{man?.author ?? '—'}</b></div>
            <div class="meta-row"><span>版本</span><b>{man?.version ?? '—'}</b></div>
            <div class="meta-row"><span>许可</span><b>{man?.license ?? '—'}</b></div>
            <div class="meta-row"><span>简介</span><b>{man?.description ?? '—'}</b></div>
          </div>

          <div class="config">
            <div class="cfg-row">
              <span class="cap">坐标</span>
              <div class="coord">
                <input type="number" bind:value={selected.x} />
                <input type="number" bind:value={selected.y} />
              </div>
            </div>
            <div class="cfg-row">
              <span class="cap">位置</span>
              <select
                value={cfgStr(selected, 'position', '正常')}
                onchange={(e) => (selected.config.position = e.currentTarget.value)}
              >
                {#each POSITIONS as p (p)}<option value={p}>{p}</option>{/each}
              </select>
            </div>
            <div class="cfg-row">
              <span class="cap">加载顺序</span>
              <input
                type="number"
                value={cfgNum(selected, 'loadOrder', 0)}
                oninput={(e) => (selected.config.loadOrder = Number(e.currentTarget.value))}
              />
            </div>
            <div class="cfg-row">
              <span class="cap">透明</span>
              <select
                value={transparencyOf(selected.behavior.opacity)}
                onchange={(e) => setTransparency(selected.id, Number(e.currentTarget.value))}
              >
                {#each TRANSPARENCY as t (t)}<option value={t}>{t}%</option>{/each}
              </select>
            </div>
            <div class="cfg-row">
              <span class="cap">悬停</span>
              <select
                value={HOVER_LABEL[selected.behavior.hover]}
                onchange={(e) =>
                  widgets.setBehavior(selected.id, {
                    hover: hoverModeFromLabel(e.currentTarget.value),
                  })}
              >
                {#each Object.values(HOVER_LABEL) as h (h)}<option value={h}>{h}</option>{/each}
              </select>
            </div>
            <div class="cfg-row">
              <span class="cap">显示器</span>
              <select
                value={cfgStr(selected, 'monitor', '主显示器')}
                onchange={(e) => (selected.config.monitor = e.currentTarget.value)}
              >
                {#each MONITORS as m (m)}<option value={m}>{m}</option>{/each}
              </select>
            </div>

            <div class="checks">
              <label
                ><input type="checkbox" bind:checked={selected.behavior.clickThrough} /> 点击穿透</label
              >
              <label
                ><input type="checkbox" bind:checked={selected.behavior.draggable} /> 允许拖动</label
              >
              <label
                ><input
                  type="checkbox"
                  bind:checked={selected.behavior.stayInBounds}
                /> 屏幕以内</label
              >
              <label><input type="checkbox" bind:checked={selected.behavior.snap} /> 边缘吸附</label>
            </div>
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="themes">
      <section class="save">
        <p class="hint">
          您可以将当前的 Rainmeter 皮肤布局保存为一个主题并在需要的时候恢复它。恢复 Rainmeter
          主题时只会恢复皮肤的布局，不会修改或更新您的皮肤。
        </p>
        <label class="chk"><input type="checkbox" bind:checked={saveEmpty} /> 保存为空主题</label>
        <label class="chk"
          ><input type="checkbox" bind:checked={saveExcludeUnused} /> 排除未使用的皮肤</label
        >
        <label class="chk"
          ><input type="checkbox" bind:checked={saveWallpaper} /> 包含当前壁纸</label
        >
        <div class="name-row">
          <span class="cap">名称</span>
          <input type="text" bind:value={newThemeName} />
          <button class="primary" onclick={saveTheme}>保存</button>
        </div>
      </section>

      <section class="saved">
        <ul class="theme-list">
          {#each rm.savedThemes as t (t.id)}
            <li>
              <button
                class="theme-item"
                class:selected={rm.selectedSavedId === t.id}
                onclick={() => (rm.selectedSavedId = t.id)}>{t.name}</button
              >
            </li>
          {/each}
        </ul>
        <div class="vbtns">
          <button>加载</button>
          <button>编辑</button>
          <button onclick={() => rm.deleteSaved(rm.selectedSavedId)}>删除</button>
        </div>
      </section>
    </div>
  {/if}

  <footer class="footer">
    <button>刷新全部</button>
    <button onclick={openSettings}>编辑设置</button>
    <button onclick={() => console.log('[rainmeter] 日志')}>查看日志</button>
    <button>帮助</button>
    <button class="primary" onclick={() => wm.close(win.id)}>关闭</button>
  </footer>
</div>

<style>
  .rm {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-window-bg, #ffffff);
    color: var(--dt-fg, #23303f);
    font-size: 13px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 6px 8px 0;
    background: var(--dt-surface-sunken, #eef1f5);
    border-bottom: 1px solid var(--dt-border, #d6dbe3);
  }
  .tab {
    padding: 7px 18px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--dt-fg-muted, #4a5566);
    font: inherit;
    cursor: pointer;
  }
  .tab.active {
    background: var(--dt-surface, #fff);
    border-color: var(--dt-border, #d6dbe3);
    color: var(--dt-accent, #1b6fd6);
    font-weight: 600;
  }

  .skins {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .left {
    display: flex;
    flex-direction: column;
    width: 260px;
    flex: 0 0 260px;
    padding: 10px;
    border-right: 1px solid var(--dt-border, #e2e6ec);
    background: var(--dt-surface-sunken, #f7f9fb);
    min-height: 0;
  }
  .active-row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .active-select {
    flex: 1;
  }
  .folder-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--dt-accent, #d9a400);
    font-size: 16px;
    line-height: 1;
  }
  .tree {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--dt-border, #e2e6ec);
    border-radius: 6px;
    background: var(--dt-surface, #fff);
    padding: 6px;
    min-height: 0;
  }
  .tree-root {
    font-weight: 600;
    padding: 4px 6px;
    color: var(--dt-fg, #2b3a4d);
  }
  .node-row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 6px 3px 16px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--dt-fg, #33475e);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .node-row:hover {
    background: var(--dt-hover, #eef3fa);
  }
  .caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    color: var(--dt-fg-muted, #7b8798);
  }
  .leaves {
    display: flex;
    flex-direction: column;
  }
  .leaf {
    padding: 3px 6px 3px 40px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--dt-fg, #33475e);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .leaf:hover {
    background: var(--dt-hover, #eef3fa);
  }
  .leaf.selected {
    background: var(--dt-accent-soft2, #cfe3ff);
    color: var(--dt-accent-fg, #124a99);
  }
  .empty-tree {
    color: var(--dt-fg-muted, #8a95a6);
    padding: 8px 6px;
    font-size: 12px;
  }
  .rmskin {
    margin-top: 8px;
  }
  .library {
    margin-top: 8px;
    max-height: 38%;
    overflow: auto;
    border: 1px solid var(--dt-border, #e2e6ec);
    border-radius: 6px;
    background: var(--dt-surface, #fff);
    padding: 6px;
  }
  .library-head {
    padding: 2px 4px 6px;
    font-weight: 600;
    color: var(--dt-fg, #2b3a4d);
  }
  .lib-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }
  .lib-add {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  .lib-add:hover {
    background: var(--dt-hover, #eef3fa);
  }
  .lib-del {
    flex: 0 0 auto;
    width: 24px;
    padding: 2px 0;
    color: var(--dt-fg-muted, #8a95a6);
    border-color: transparent;
    background: transparent;
  }
  .lib-del:hover {
    color: #e04a4a;
    background: var(--dt-hover, #eef3fa);
  }
  .lib-acts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .lib-acts button {
    width: 100%;
  }
  .lib-acts button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .hidden-input {
    display: none;
  }

  .right {
    flex: 1;
    padding: 14px 18px;
    overflow: auto;
    min-width: 0;
  }
  .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .detail-title {
    font-size: 16px;
    font-weight: 600;
  }
  .detail-path {
    color: var(--dt-fg-muted, #8a95a6);
    font-size: 12px;
    margin-top: 2px;
  }
  .head-btns {
    display: flex;
    gap: 6px;
  }
  .meta {
    margin: 14px 0;
    border-top: 1px solid var(--dt-border, #eef1f5);
  }
  .meta-row {
    display: flex;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--dt-border, #f2f4f7);
  }
  .meta-row span {
    width: 48px;
    color: var(--dt-fg-muted, #8a95a6);
    flex: 0 0 auto;
  }
  .meta-row b {
    font-weight: 500;
    color: var(--dt-fg, #2b3a4d);
  }
  .config {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    align-items: center;
  }
  .cfg-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cfg-row .cap {
    width: 64px;
    color: var(--dt-fg-muted, #5b6577);
    flex: 0 0 auto;
  }
  .cfg-row input[type='number'],
  .cfg-row select {
    width: 110px;
  }
  .coord {
    display: flex;
    gap: 6px;
  }
  .coord input {
    width: 66px !important;
  }
  .checks {
    grid-column: 1 / -1;
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .checks label {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .themes {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .save {
    flex: 1;
    padding: 16px 18px;
    border-right: 1px solid var(--dt-border, #e2e6ec);
    min-width: 0;
  }
  .save .hint {
    color: var(--dt-fg-muted, #4a5566);
    line-height: 1.6;
    margin: 0 0 16px;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  .name-row input {
    flex: 1;
    max-width: 280px;
  }
  .name-row .cap {
    color: var(--dt-fg-muted, #5b6577);
  }
  .saved {
    display: flex;
    width: 280px;
    flex: 0 0 280px;
    padding: 16px;
    gap: 8px;
    min-height: 0;
  }
  .theme-list {
    flex: 1;
    list-style: none;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--dt-border, #e2e6ec);
    border-radius: 6px;
    overflow: auto;
    min-height: 0;
  }
  .theme-item {
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--dt-fg, #33475e);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .theme-item.selected {
    background: var(--dt-accent-soft2, #cfe3ff);
    color: var(--dt-accent-fg, #124a99);
  }
  .vbtns {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .footer {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-top: 1px solid var(--dt-border, #e2e6ec);
    background: var(--dt-surface-sunken, #f7f9fb);
  }

  button {
    padding: 5px 12px;
    border: 1px solid var(--dt-border, #cdd5df);
    border-radius: 5px;
    background: var(--dt-surface, #fff);
    color: var(--dt-fg, #2b3a4d);
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    background: var(--dt-hover, #eef3fa);
  }
  button.primary {
    background: var(--dt-accent, #1b6fd6);
    border-color: var(--dt-accent, #1b6fd6);
    color: var(--dt-accent-fg, #fff);
  }
  button.primary:hover {
    background: color-mix(in srgb, var(--dt-accent, #1b6fd6) 85%, black);
  }
  input[type='text'],
  input[type='number'],
  select {
    padding: 5px 8px;
    border: 1px solid var(--dt-border, #cdd5df);
    border-radius: 5px;
    background: var(--dt-input-bg, #fff);
    color: var(--dt-fg, #23303f);
    font: inherit;
  }
</style>
