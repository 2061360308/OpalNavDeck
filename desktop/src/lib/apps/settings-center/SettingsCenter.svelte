<script lang="ts">
  import type { BoxTabPos, BoxTheme, BoxTitlePos } from '../../types'
  import { boxes, DEFAULT_BOX_THEME } from '../../state/boxes.svelte'
  import { fs } from '../../api/fs'
  import { requestPick } from '../files/rfm/pick'

  const COLORS = [
    '#1f2229',
    '#e74c3c',
    '#e67e22',
    '#f1c40f',
    '#2ecc71',
    '#1abc9c',
    '#3498db',
    '#9b59b6',
    '#ec407a',
    '#95a5a6',
    '#34495e',
    '#ffffff',
  ]

  const POS_OPTS: { value: BoxTitlePos; label: string }[] = [
    { value: 'top', label: '顶部' },
    { value: 'bottom', label: '底部' },
    { value: 'left', label: '左侧' },
    { value: 'right', label: '右侧' },
  ]

  const OTHER: { key: keyof BoxTheme; label: string }[] = [
    { key: 'border', label: '显示盒子边框' },
    { key: 'radius', label: '盒子圆角显示' },
    { key: 'showTitle', label: '显示盒子标题' },
    { key: 'bigFont', label: '大字体显示' },
    { key: 'iconOnly', label: '仅显示图标' },
  ]

  let themeBox = $state('all')

  const targets = $derived(
    themeBox === 'all' ? boxes.topLevel : boxes.list.filter((b) => b.id === themeBox)
  )
  const preview = $derived(targets[0]?.theme ?? DEFAULT_BOX_THEME)
  const hasTarget = $derived(targets.length > 0)

  function applyTheme(patch: Partial<BoxTheme>) {
    for (const b of targets) boxes.setTheme(b.id, patch)
  }

  function resetTheme() {
    for (const b of targets) boxes.resetTheme(b.id)
  }

  const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i
  const IMAGE_MIME: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  }

  async function pickImage() {
    const path = await requestPick((name) => IMAGE_RE.test(name), '选择图片')
    if (!path) return
    const r = await fs.readBlob(path)
    if (!r) return
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    const blob = r.blob.type
      ? r.blob
      : new Blob([await r.blob.arrayBuffer()], { type: IMAGE_MIME[ext] ?? 'image/png' })
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
    applyTheme({ bgImage: dataUrl, bgImagePath: path })
  }
</script>

<div class="sc">
  <div class="field">
    <span class="label">选择盒子</span>
    <span class="selwrap">
      <select class="sel" bind:value={themeBox}>
        <option value="all">所有盒子</option>
        {#each boxes.topLevel as b (b.id)}
          <option value={b.id}>{boxes.activeOf(b)?.title ?? b.title}</option>
        {/each}
      </select>
    </span>
    <button class="btn" onclick={resetTheme}>恢复默认</button>
  </div>

  <div class="label">颜色</div>
  <div class="swatches">
    {#each COLORS as c (c)}
      <button
        class="swatch"
        class:on={preview.color === c}
        style="background:{c}"
        title={c}
        aria-label={c}
        onclick={() => applyTheme({ color: c })}
      ></button>
    {/each}
  </div>

  <div class="label">透明度</div>
  <input
    class="sld"
    type="range"
    min="0"
    max="100"
    value={preview.opacity}
    oninput={(e) => applyTheme({ opacity: Number(e.currentTarget.value) })}
  />
  <div class="sldval">{preview.opacity}%</div>

  <div class="label">背景图片</div>
  <div class="row">
    <input
      class="txt grow"
      type="text"
      value={preview.bgImagePath || (preview.bgImage.startsWith('data:') ? '' : preview.bgImage)}
      placeholder="输入图片路径或 URL"
      oninput={(e) => applyTheme({ bgImagePath: e.currentTarget.value, bgImage: e.currentTarget.value })}
    />
    <button class="btn" onclick={pickImage}>选择图片</button>
    <button
      class="btn"
      disabled={!preview.bgImage}
      onclick={() => applyTheme({ bgImage: '', bgImagePath: '' })}>清除</button
    >
  </div>

  <div class="row">
    <span class="selwrap grow">
      <select
        class="sel"
        value={preview.titlePos}
        onchange={(e) => applyTheme({ titlePos: e.currentTarget.value as BoxTitlePos })}
      >
        {#each POS_OPTS as p (p.value)}
          <option value={p.value}>标题位置：{p.label}</option>
        {/each}
      </select>
    </span>
    <span class="selwrap grow">
      <select
        class="sel"
        value={preview.tabPos}
        onchange={(e) => applyTheme({ tabPos: e.currentTarget.value as BoxTabPos })}
      >
        {#each POS_OPTS as p (p.value)}
          <option value={p.value}>标签位置：{p.label}</option>
        {/each}
      </select>
    </span>
  </div>

  <div class="subtitle">其它</div>
  <div class="stack" class:disabled={!hasTarget}>
    {#each OTHER as o (o.key)}
      <label class="ck">
        <input
          type="checkbox"
          checked={preview[o.key] as boolean}
          onchange={(e) => applyTheme({ [o.key]: e.currentTarget.checked } as Partial<BoxTheme>)}
        />
        <span>{o.label}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .sc {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100%;
    padding: 18px 22px;
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
    font-size: 13px;
    user-select: none;
  }
  /* ---------- controls ---------- */
  .label {
    color: var(--dt-fg, #cfd5e2);
    font-size: 13px;
  }
  .subtitle {
    margin-top: 4px;
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
    letter-spacing: 0.5px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .stack.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }

  /* checkbox */
  .ck {
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
  }
  .ck input {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    width: 16px;
    height: 16px;
    margin: 0;
    border: 1px solid var(--dt-border, #4a5060);
    border-radius: 3px;
    background: var(--dt-input-bg, #2b2f38);
    cursor: pointer;
  }
  .ck input:checked {
    background: var(--dt-accent, #3b82f6);
    border-color: var(--dt-accent, #3b82f6);
  }
  .ck input:checked::after {
    content: '✓';
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--dt-accent-fg, #fff);
    font-size: 11px;
    line-height: 1;
  }

  /* select */
  .selwrap {
    position: relative;
    display: inline-flex;
    min-width: 200px;
  }
  .selwrap::after {
    content: '▾';
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--dt-fg-muted, #9aa4b5);
    pointer-events: none;
    font-size: 11px;
  }
  .sel {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 32px;
    padding: 0 28px 0 10px;
    border: 1px solid var(--dt-border, #4a5060);
    border-radius: 6px;
    background: var(--dt-input-bg, #2b2f38);
    color: var(--dt-fg, #e6e9f0);
    font-size: 13px;
    cursor: pointer;
  }
  .sel:focus {
    outline: 1px solid var(--dt-accent, #3b82f6);
  }
  .sel option {
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
  }

  /* text input */
  .txt {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--dt-border, #4a5060);
    border-radius: 6px;
    background: var(--dt-input-bg, #2b2f38);
    color: var(--dt-fg, #fff);
    font-size: 13px;
  }
  .txt:focus {
    outline: 1px solid var(--dt-accent, #3b82f6);
  }

  /* buttons */
  .btn {
    height: 32px;
    padding: 0 14px;
    border: 1px solid var(--dt-border, transparent);
    border-radius: 6px;
    background: var(--dt-accent-soft, #3a3f4a);
    color: var(--dt-fg, #fff);
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--dt-accent-soft2, #474d5a);
  }

  /* slider */
  .sld {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--dt-border, #d5dae4);
    cursor: pointer;
  }
  .sld::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--dt-accent, #3b82f6);
    border: 2px solid var(--dt-window-bg, #fff);
  }
  .sld::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--dt-accent, #3b82f6);
    border: 2px solid var(--dt-window-bg, #fff);
  }
  .sldval {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }

  /* color swatches */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .swatch {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.15));
    border-radius: 5px;
    cursor: pointer;
  }
  .swatch.on {
    outline: 2px solid var(--dt-accent, #3b82f6);
    outline-offset: 2px;
  }
</style>
