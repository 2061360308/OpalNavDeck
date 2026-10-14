<script lang="ts">
  import type { ColorMode, ContrastMode, WallpaperFit, WallpaperMode } from '../../types'
  import { stage } from '../../stage/stageState.svelte'
  import { widgets } from '../../state/widgets.svelte'
  import { settings } from '../../desktop/settings.svelte'
  import { putMedia, removeMedia } from '../../desktop/personalizeMedia'
  import { importCursorPack } from '../../desktop/cursorPack'
  import { spotlight } from '../../desktop/spotlight.svelte'
  import { ChevronDown, Plus, Trash, FolderOpen } from '@lucide/svelte'

  const SPEEDS = [0.25, 0.75, 1, 1.5, 2]

  const MODES: { id: WallpaperMode; label: string }[] = [
    { id: 'solid', label: '纯色' },
    { id: 'image', label: '图片' },
    { id: 'video', label: '视频' },
    { id: 'slideshow', label: '幻灯片' },
    { id: 'focus', label: 'Windows 聚焦' },
  ]
  const hasOptions = (m: WallpaperMode) => m !== 'focus'

  const FITS: { value: WallpaperFit; label: string }[] = [
    { value: 'cover', label: '填充' },
    { value: 'contain', label: '适应' },
    { value: 'tile', label: '平铺' },
    { value: 'center', label: '居中' },
    { value: 'stretch', label: '拉伸' },
  ]

  const INTERVALS: { v: number; label: string }[] = [
    { v: 60, label: '1 分钟' },
    { v: 600, label: '10 分钟' },
    { v: 1800, label: '30 分钟' },
    { v: 3600, label: '1 小时' },
    { v: 21600, label: '6 小时' },
    { v: 86400, label: '1 天' },
  ]

  const SWATCHES = [
    '#000000', '#0c0f16', '#1f2229', '#374151', '#0078d4', '#2f6fed',
    '#6ea8ff', '#8b5cf6', '#e04a4a', '#f1c40f', '#2ecc71', '#1abc9c',
    '#ec407a', '#ffffff',
  ]
  const ACCENTS = ['#0078d4', '#2f6fed', '#6ea8ff', '#8b5cf6', '#e04a4a', '#f1c40f', '#2ecc71', '#1abc9c', '#ec407a']
  const COLOR_MODE: { value: ColorMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ]
  const CONTRAST: { value: ContrastMode; label: string }[] = [
    { value: 'normal', label: '正常' },
    { value: 'high', label: '高对比度' },
  ]

  const wp = $derived(settings.wallpaper)

  const RES_PRESETS = [
    { label: '1080p (1920 × 1080)', w: 1920, h: 1080 },
    { label: '1440p (2560 × 1440)', w: 2560, h: 1440 },
    { label: '4K (3840 × 2160)', w: 3840, h: 2160 },
    { label: '竖屏 1080 (1080 × 1920)', w: 1080, h: 1920 },
    { label: '超宽 21:9 (2560 × 1080)', w: 2560, h: 1080 },
  ]

  const resKey = $derived(
    RES_PRESETS.findIndex((p) => p.w === stage.refW && p.h === stage.refH) >= 0
      ? String(RES_PRESETS.findIndex((p) => p.w === stage.refW && p.h === stage.refH))
      : 'custom'
  )

  let resOpen = $state(false)
  let resW = $state(stage.refW)
  let resH = $state(stage.refH)

  function applyResolution(w: number, h: number) {
    const nw = Math.max(320, Math.round(w) || 1920)
    const nh = Math.max(240, Math.round(h) || 1080)
    if (nw === stage.refW && nh === stage.refH) return
    widgets.scaleAll(nw / stage.refW, nh / stage.refH)
    stage.refW = nw
    stage.refH = nh
  }

  function onResSelect(v: string) {
    if (v === 'custom') {
      resW = stage.refW
      resH = stage.refH
      resOpen = true
    } else {
      const p = RES_PRESETS[Number(v)]
      if (p) applyResolution(p.w, p.h)
    }
  }

  function confirmCustomRes() {
    applyResolution(resW, resH)
    resOpen = false
  }

  let open = $state({ background: true, color: true, display: true, crisp: true, cursor: true, icontheme: true })
  let cursorTheme = $state('')
  let cursorMsg = $state('')
  let iconTheme = $state('')

  let imageInput: HTMLInputElement | undefined = $state()
  let videoInput: HTMLInputElement | undefined = $state()
  let slideInput: HTMLInputElement | undefined = $state()
  let colorInput: HTMLInputElement | undefined = $state()
  let cursorPackInput: HTMLInputElement | undefined = $state()
  let iconPackInput: HTMLInputElement | undefined = $state()

  // keep the panel open only while the selected mode has options
  $effect(() => {
    open.background = hasOptions(wp.mode)
    if (wp.mode === 'focus') void spotlight.load()
    if (wp.mode === 'slideshow' && !INTERVALS.some((i) => i.v === wp.slideshow.intervalSec)) {
      wp.slideshow.intervalSec = 600
    }
  })

  /* ---------- background actions ---------- */
  async function onPickImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    const url = await putMedia('wallpapers', f)
    wp.image = url
    wp.mode = 'image'
    settings.pushRecent(url)
  }

  async function onPickVideo(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    const url = await putMedia('wallpapers', f)
    wp.video.src = url
    wp.mode = 'video'
  }

  async function onAddSlide(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    const url = await putMedia('wallpapers', f)
    wp.slideshow.images = [...wp.slideshow.images, url]
  }

  function removeRecent(url: string) {
    wp.recent = wp.recent.filter((r) => r !== url)
  }
  function removeSlide(url: string) {
    wp.slideshow.images = wp.slideshow.images.filter((r) => r !== url)
    void removeMedia(url)
  }

  /* ---------- cursor theme pack ---------- */
  async function onPickCursorPack(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    cursorMsg = '正在导入…'
    try {
      const res = await importCursorPack(f)
      cursorTheme = res.theme
      cursorMsg = `已应用 ${res.applied} 个指针`
    } catch (err) {
      cursorMsg = '导入失败：' + String((err as Error)?.message ?? err)
    }
  }

  function clearCursor() {
    for (const url of Object.values(settings.cursor.roles)) if (url) void removeMedia(url)
    settings.cursor.roles = {}
    cursorTheme = ''
    cursorMsg = ''
  }

  const cursorCount = $derived(Object.keys(settings.cursor.roles).length)

  /* ---------- icon theme pack (placeholder) ---------- */
  async function onPickIconPack(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    try {
      await putMedia('themes', f, f.name)
      iconTheme = f.name
    } catch {
      iconTheme = f.name
    }
  }
</script>

<div class="pz">
    <!-- 背景 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">个性化设置图片背景</div>
        <div class="sec-actions">
          <select class="sel" bind:value={wp.mode}>
            {#each MODES as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
          </select>
          {#if hasOptions(wp.mode)}
            <button class="chev" class:open={open.background} title="展开" onclick={() => (open.background = !open.background)}>
              <ChevronDown size={16} />
            </button>
          {/if}
        </div>
      </div>

      {#if open.background && wp.mode === 'solid'}
        <div class="panel">
          <div class="line"><span class="lb">选择你的背景色</span></div>
          <div class="swatches">
            {#each SWATCHES as c (c)}
              <button class="swatch" class:on={wp.color.toLowerCase() === c} style="background:{c}" title={c} aria-label={c} onclick={() => (wp.color = c)}></button>
            {/each}
          </div>
          <div class="line">
            <span class="lb">自定义颜色</span>
            <span class="grow"></span>
            <button class="btn" onclick={() => colorInput?.click()}>查看颜色</button>
            <span class="mono">{wp.color}</span>
            <input bind:this={colorInput} class="hidden" type="color" bind:value={wp.color} />
          </div>
        </div>
      {:else if open.background && wp.mode === 'image'}
        <div class="panel">
          <div class="line"><span class="lb">最近使用的图像</span></div>
          {#if wp.recent.length === 0}
            <p class="hint">暂无最近使用的图像</p>
          {:else}
            <div class="thumbs">
              {#each wp.recent as url (url)}
                <div class="thumb" class:on={wp.image === url}>
                  <button class="pick" title={url} onclick={() => (wp.image = url)}><img src={url} alt="" /></button>
                  <button class="del" title="移除" onclick={() => removeRecent(url)}><Trash size={12} /></button>
                </div>
              {/each}
            </div>
          {/if}
          <div class="line">
            <span class="lb">选择一张照片</span>
            <span class="grow"></span>
            <button class="btn" onclick={() => imageInput?.click()}><FolderOpen size={14} /> 浏览照片</button>
            <input bind:this={imageInput} class="hidden" type="file" accept="image/*" onchange={onPickImage} />
          </div>
          <div class="line">
            <span class="lb">为桌面图像选择适应模式</span>
            <span class="grow"></span>
            <select class="sel" bind:value={wp.fit}>
              {#each FITS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
            </select>
          </div>
        </div>
      {:else if open.background && wp.mode === 'video'}
        <div class="panel">
          <div class="line"><span class="lb">当前视频</span><span class="grow"></span><span class="mono">{wp.video.src.split('/').pop() || '未选择'}</span></div>
          <div class="line">
            <span class="lb">选择视频</span>
            <span class="grow"></span>
            <button class="btn" onclick={() => videoInput?.click()}><FolderOpen size={14} /> 浏览视频</button>
            <input bind:this={videoInput} class="hidden" type="file" accept="video/*" onchange={onPickVideo} />
          </div>
          <div class="line">
            <span class="lb">播放倍速</span>
            <span class="grow"></span>
            <select class="sel" bind:value={wp.video.speed}>
              {#each SPEEDS as s (s)}<option value={s}>{s}×</option>{/each}
            </select>
          </div>
          <div class="line">
            <span class="lb">循环播放</span>
            <span class="grow"></span>
            <button class="switch" class:on={wp.video.loop} aria-label="循环播放" role="switch" aria-checked={wp.video.loop} onclick={() => (wp.video.loop = !wp.video.loop)}><span class="knob"></span></button>
          </div>
          <div class="line">
            <span class="lb">静音</span>
            <span class="grow"></span>
            <button class="switch" class:on={wp.video.muted} aria-label="静音" role="switch" aria-checked={wp.video.muted} onclick={() => (wp.video.muted = !wp.video.muted)}><span class="knob"></span></button>
          </div>
          <div class="line">
            <span class="lb">为桌面图像选择适应模式</span>
            <span class="grow"></span>
            <select class="sel" bind:value={wp.fit}>
              {#each FITS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
            </select>
          </div>
        </div>
      {:else if open.background && wp.mode === 'slideshow'}
        <div class="panel">
          <div class="line"><span class="lb">编辑相册</span></div>
          <div class="album">
            {#each wp.slideshow.images as url (url)}
              <div class="thumb sm">
                <div class="pick static"><img src={url} alt="" /></div>
                <button class="del" title="移除" onclick={() => removeSlide(url)}><Trash size={12} /></button>
              </div>
            {/each}
            <button class="add" title="添加图片" onclick={() => slideInput?.click()}><Plus size={18} /></button>
            <input bind:this={slideInput} class="hidden" type="file" accept="image/*" onchange={onAddSlide} />
          </div>
          <div class="line">
            <span class="lb">图片切换频率</span>
            <span class="grow"></span>
            <select class="sel" bind:value={wp.slideshow.intervalSec}>
              {#each INTERVALS as it (it.v)}<option value={it.v}>{it.label}</option>{/each}
            </select>
          </div>
          <div class="line">
            <span class="lb">扰乱图片顺序</span>
            <span class="grow"></span>
            <button class="switch" class:on={wp.slideshow.order === 'random'} aria-label="扰乱图片顺序" role="switch" aria-checked={wp.slideshow.order === 'random'} onclick={() => (wp.slideshow.order = wp.slideshow.order === 'random' ? 'sequential' : 'random')}><span class="knob"></span></button>
          </div>
          <div class="line">
            <span class="lb">为桌面图像选择适应模式</span>
            <span class="grow"></span>
            <select class="sel" bind:value={wp.fit}>
              {#each FITS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
            </select>
          </div>
        </div>
      {/if}
    </section>

    <!-- 颜色 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">颜色</div>
        <div class="sec-actions">
          <button class="chev" class:open={open.color} title="展开" onclick={() => (open.color = !open.color)}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {#if open.color}
        <div class="panel">
          <div class="line">
            <span class="lb">颜色模式</span>
            <span class="grow"></span>
            <select class="sel" bind:value={settings.theme}>
              {#each COLOR_MODE as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
            </select>
          </div>
          <div class="line"><span class="lb">主题色</span><span class="grow"></span><button class="btn" onclick={() => (settings.accent = '')}>默认</button></div>
          <div class="swatches">
            {#each ACCENTS as c (c)}
              <button class="swatch" class:on={settings.accent.toLowerCase() === c} style="background:{c}" title={c} aria-label={c} onclick={() => (settings.accent = c)}></button>
            {/each}
          </div>
          <div class="line">
            <span class="lb">对比度</span>
            <span class="grow"></span>
            <select class="sel" bind:value={settings.contrast}>
              {#each CONTRAST as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
            </select>
          </div>
        </div>
      {/if}
    </section>

    <!-- 显示 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">显示</div>
        <div class="sec-actions">
          <span class="mono">{stage.refW} × {stage.refH}</span>
          <button class="chev" class:open={open.display} title="展开" onclick={() => (open.display = !open.display)}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {#if open.display}
        <div class="panel">
          <div class="line">
            <span class="lb">分辨率</span>
            <span class="grow"></span>
            <select class="sel" value={resKey} onchange={(e) => onResSelect(e.currentTarget.value)}>
              {#each RES_PRESETS as p, i (p.label)}<option value={String(i)}>{p.label}</option>{/each}
              <option value="custom">自定义…</option>
            </select>
          </div>
        </div>
      {/if}
    </section>

    <!-- 文字清晰度 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">文字清晰度</div>
        <div class="sec-actions">
          <button class="chev" class:open={open.crisp} title="展开" onclick={() => (open.crisp = !open.crisp)}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {#if open.crisp}
        <div class="panel">
          <div class="line">
            <span class="lb">清晰度模式</span>
            <span class="grow"></span>
            <select class="sel" bind:value={stage.crispMode}>
              <option value="transform">transform（默认）</option>
              <option value="zoom">zoom（清晰）</option>
              <option value="integer">整数倍（最清晰）</option>
            </select>
          </div>
        </div>
      {/if}
    </section>

    <!-- 鼠标样式 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">鼠标样式</div>
        <div class="sec-actions">
          <span class="mono">{cursorTheme || (cursorCount ? `${cursorCount} 个指针` : '未选择主题包')}</span>
          <button class="btn" onclick={() => cursorPackInput?.click()}><FolderOpen size={14} /> 浏览</button>
          <input bind:this={cursorPackInput} class="hidden" type="file" accept=".zip,.cur,.theme" onchange={onPickCursorPack} />
          <button class="chev" class:open={open.cursor} title="展开" onclick={() => (open.cursor = !open.cursor)}><ChevronDown size={16} /></button>
        </div>
      </div>
      {#if open.cursor}
        <div class="panel">
          <div class="line">
            <span class="lb">启用自定义鼠标样式</span>
            <span class="grow"></span>
            <button class="switch" class:on={settings.cursor.enabled} aria-label="启用自定义鼠标样式" role="switch" aria-checked={settings.cursor.enabled} onclick={() => (settings.cursor.enabled = !settings.cursor.enabled)}><span class="knob"></span></button>
          </div>
          <div class="line"><span class="lb">已应用指针</span><span class="grow"></span><span class="mono">{cursorCount} / 13</span></div>
          {#if cursorMsg}<p class="hint">{cursorMsg}</p>{/if}
          <div class="line"><span class="grow"></span><button class="btn" disabled={!cursorCount} onclick={clearCursor}>清除主题包</button></div>
          <p class="hint">支持导入打包好的鼠标主题包（.zip，内含 .cur / .png / .svg，按文件名自动匹配指针角色）。</p>
        </div>
      {/if}
    </section>

    <!-- 图标主题 -->
    <section class="sec">
      <div class="sec-head">
        <div class="sec-title">图标主题</div>
        <div class="sec-actions">
          <span class="mono">{iconTheme || '未选择主题包'}</span>
          <button class="btn" onclick={() => iconPackInput?.click()}><FolderOpen size={14} /> 浏览</button>
          <input bind:this={iconPackInput} class="hidden" type="file" accept=".zip,.theme" onchange={onPickIconPack} />
          <button class="chev" class:open={open.icontheme} title="展开" onclick={() => (open.icontheme = !open.icontheme)}><ChevronDown size={16} /></button>
        </div>
      </div>
      {#if open.icontheme}
        <div class="panel">
          <p class="hint">图标主题可替换右键菜单等界面所用的图标。此功能尚在开发中，敬请期待。</p>
        </div>
      {/if}
    </section>

  {#if resOpen}
    <div class="modal-mask" role="presentation" onpointerdown={() => (resOpen = false)}>
      <div class="modal" role="dialog" tabindex="-1" aria-label="自定义分辨率" onpointerdown={(e) => e.stopPropagation()}>
        <div class="modal-title">自定义分辨率</div>
        <div class="line">
          <span class="lb">宽度</span>
          <span class="grow"></span>
          <input class="num" type="number" min="320" max="7680" bind:value={resW} />
          <span class="mono">px</span>
        </div>
        <div class="line">
          <span class="lb">高度</span>
          <span class="grow"></span>
          <input class="num" type="number" min="240" max="4320" bind:value={resH} />
          <span class="mono">px</span>
        </div>
        <div class="modal-foot">
          <button class="btn" onclick={() => (resOpen = false)}>取消</button>
          <button class="btn primary" onclick={confirmCustomRes}>确定</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .pz {
    padding: 14px 16px 24px;
  }
  .sec {
    margin-bottom: 12px;
    border: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.22));
    border-radius: 10px;
    overflow: hidden;
  }
  .sec-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 6px 12px;
  }
  .sec-title {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
  }
  .sec-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: default;
    transition: transform 0.15s ease;
  }
  .chev.open {
    transform: rotate(180deg);
  }
  .chev:hover {
    background: rgba(127, 127, 127, 0.16);
  }
  .panel {
    padding: 4px 14px 14px;
    border-top: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.18));
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    flex-wrap: wrap;
  }
  .lb {
    font-size: 13px;
    opacity: 0.9;
  }
  .grow {
    flex: 1;
  }
  .hint {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
    margin: 6px 0;
  }
  .mono {
    font-size: 12px;
    opacity: 0.7;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hidden {
    display: none;
  }
  .sel {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.3));
    background: rgba(127, 127, 127, 0.1);
    color: inherit;
    font-size: 13px;
    min-width: 130px;
  }
  .num {
    width: 90px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.3));
    background: rgba(127, 127, 127, 0.1);
    color: inherit;
    font-size: 13px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.3));
    border-radius: 7px;
    background: var(--dt-accent-soft, rgba(110, 168, 255, 0.16));
    color: inherit;
    font-size: 13px;
    cursor: default;
  }
  .btn:hover:not(:disabled) {
    background: var(--dt-accent-soft2, rgba(110, 168, 255, 0.3));
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.primary {
    background: var(--dt-accent, #6ea8ff);
    color: var(--dt-accent-fg, #fff);
    border-color: transparent;
  }
  .modal-mask {
    position: fixed;
    inset: 0;
    z-index: 5000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }
  .modal {
    width: 320px;
    padding: 16px;
    border-radius: 12px;
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
    border: 1px solid var(--dt-panel-border, rgba(127, 127, 127, 0.3));
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
  }
  .modal-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  .switch {
    position: relative;
    width: 40px;
    height: 22px;
    border: none;
    border-radius: 11px;
    background: rgba(127, 127, 127, 0.4);
    padding: 0;
    cursor: default;
    transition: background 0.15s ease;
  }
  .switch.on {
    background: var(--dt-accent, #6ea8ff);
  }
  .switch .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }
  .switch.on .knob {
    transform: translateX(18px);
  }
  .swatches {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 0;
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 2px solid transparent;
    cursor: default;
  }
  .swatch.on {
    border-color: var(--dt-fg, #fff);
  }
  .thumbs,
  .album {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 0;
  }
  .thumb {
    position: relative;
    width: 96px;
    height: 60px;
  }
  .thumb.sm {
    width: 76px;
    height: 48px;
  }
  .thumb .pick {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(127, 127, 127, 0.15);
    cursor: default;
  }
  .thumb.on .pick {
    border-color: var(--dt-accent, #6ea8ff);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb .del {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: #e04a4a;
    color: #fff;
    cursor: default;
  }
  .add {
    width: 76px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--dt-panel-border, rgba(127, 127, 127, 0.4));
    border-radius: 8px;
    background: transparent;
    color: var(--dt-fg-muted, #9aa4b5);
    cursor: default;
  }
  .add:hover {
    border-color: var(--dt-accent, #6ea8ff);
    color: var(--dt-accent, #6ea8ff);
  }
</style>
