<script lang="ts">
  import { untrack } from 'svelte'
  import { editor } from './state/editor.svelte'
  import { services } from './state/services.svelte'
  import { requestPick } from './apps/files/rfm/pick'
  import { fs } from './api/fs'
  import { ImagePlus, Upload, X } from '@lucide/svelte'

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

  let name = $state('')
  let url = $state('')
  let group = $state('')
  let tags = $state('')
  let desc = $state('')
  let iconFile = $state('')
  let pendingBlob = $state<Blob | null>(null)
  let blobUrl = $state('')
  let error = $state('')

  let fileInput: HTMLInputElement | undefined = $state()

  const groups = $derived.by(() => {
    const seen = new Set<string>()
    for (const s of services.list) {
      const g = s.group?.trim()
      if (g) seen.add(g)
    }
    return [...seen]
  })

  const title = $derived(editor.id ? '编辑项目' : '新建项目')
  const previewSrc = $derived(blobUrl || (iconFile ? `/icons/assets/${iconFile}` : ''))

  function releaseBlob() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = ''
    }
  }

  function setBlob(b: Blob) {
    releaseBlob()
    pendingBlob = b
    blobUrl = URL.createObjectURL(b)
  }

  function typedBlob(blob: Blob, path: string): Blob {
    if (blob.type) return blob
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    return new Blob([blob], { type: IMAGE_MIME[ext] ?? 'image/png' })
  }

  async function pickFromStorage() {
    const path = await requestPick((n) => IMAGE_RE.test(n), '选择图标')
    if (!path) return
    const r = await fs.readBlob(path)
    if (!r) return
    setBlob(typedBlob(r.blob, path))
  }

  function onUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (f) setBlob(f)
  }

  function clearIcon() {
    releaseBlob()
    pendingBlob = null
    iconFile = ''
  }

  async function save() {
    const n = name.trim()
    if (!n) {
      error = '请输入名称'
      return
    }
    let icon = iconFile
    if (pendingBlob) {
      try {
        icon = await services.putAsset(pendingBlob)
      } catch (e) {
        error = '图标保存失败：' + String((e as Error)?.message ?? e)
        return
      }
    }
    const payload = {
      name: n,
      url: url.trim(),
      group: group.trim(),
      tags: tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      desc: desc.trim(),
      icon,
    }
    try {
      if (editor.id) await services.update(editor.id, payload)
      else await services.add(payload)
      close()
    } catch (e) {
      error = '保存失败：' + String((e as Error)?.message ?? e)
    }
  }

  function close() {
    releaseBlob()
    editor.close()
  }

  // (re)initialise the form whenever the editor is (re)opened (not on later service changes)
  const formKey = $derived(editor.open ? (editor.id ?? '\u0000new') : '')
  $effect(() => {
    if (!formKey) return
    untrack(() => {
      const s = editor.id ? services.byId(editor.id) : undefined
      name = s?.name ?? ''
      url = s?.url ?? ''
      group = s?.group ?? ''
      tags = (s?.tags ?? []).join(', ')
      desc = s?.desc ?? ''
      iconFile = s?.icon ?? ''
      pendingBlob = null
      releaseBlob()
      error = ''
    })
  })

  function onMask(e: MouseEvent) {
    if (e.target === e.currentTarget) close()
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (editor.open && e.key === 'Escape') close()
  }}
/>

{#if editor.open}
  <div class="mask" role="presentation" onclick={onMask}>
    <div class="dlg" role="dialog" tabindex="-1" aria-label={title}>
      <div class="dlg-head">
        <span class="dlg-title">{title}</span>
        <button class="icon-x" title="关闭" onclick={close}><X size={16} /></button>
      </div>

      <div class="dlg-body">
        <div class="icon-col">
          <div class="icon-prev">
            {#if previewSrc}<img src={previewSrc} alt="" />{:else}<ImagePlus size={26} />{/if}
          </div>
          <button class="btn" onclick={pickFromStorage}>选择图标</button>
          <button class="btn" onclick={() => fileInput?.click()}><Upload size={13} /> 上传图片</button>
          <button class="btn" disabled={!previewSrc} onclick={clearIcon}>清除</button>
          <input
            bind:this={fileInput}
            class="hidden"
            type="file"
            accept="image/*"
            onchange={onUpload}
          />
        </div>

        <div class="fields">
          <label class="f"><span>名称</span><input class="inp" bind:value={name} placeholder="必填" /></label>
          <label class="f"><span>地址 URL</span><input class="inp" bind:value={url} placeholder="https://" /></label>
          <label class="f"
            ><span>分类</span><input class="inp" bind:value={group} list="editor-groups" placeholder="未分类"
            /><datalist id="editor-groups"
              >{#each groups as g (g)}<option value={g}></option>{/each}</datalist
            ></label
          >
          <label class="f"><span>标签</span><input class="inp" bind:value={tags} placeholder="逗号分隔" /></label>
          <label class="f"><span>描述</span><textarea class="inp ta" bind:value={desc} rows="3"></textarea></label>
          {#if error}<div class="err">{error}</div>{/if}
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn ghost" onclick={close}>取消</button>
        <button class="btn primary" onclick={save}>保存</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mask {
    position: fixed;
    inset: 0;
    z-index: 100002;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }
  .dlg {
    width: 560px;
    max-width: 92vw;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
    border: 1px solid var(--dt-border, rgba(127, 127, 127, 0.3));
    box-shadow: var(--dt-shadow, 0 18px 60px rgba(0, 0, 0, 0.5));
  }
  .dlg-head {
    display: flex;
    align-items: center;
    height: 42px;
    padding: 0 8px 0 16px;
    border-bottom: 1px solid var(--dt-border, rgba(127, 127, 127, 0.2));
  }
  .dlg-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
  }
  .icon-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .icon-x:hover {
    background: var(--dt-danger, #e04a4a);
    color: #fff;
  }
  .dlg-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    gap: 16px;
    padding: 16px;
  }
  .icon-col {
    flex: 0 0 120px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .icon-prev {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    border-radius: 10px;
    background: var(--dt-input-bg, rgba(127, 127, 127, 0.1));
    border: 1px solid var(--dt-border, rgba(127, 127, 127, 0.25));
    color: var(--dt-fg-muted, #9aa4b5);
    overflow: hidden;
  }
  .icon-prev img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--dt-fg-muted, #9aa4b5);
  }
  .inp {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--dt-border, rgba(127, 127, 127, 0.3));
    border-radius: 6px;
    background: var(--dt-input-bg, rgba(127, 127, 127, 0.1));
    color: var(--dt-fg, #fff);
    font-size: 13px;
    font-family: inherit;
  }
  .inp:focus {
    outline: 1px solid var(--dt-accent, #6ea8ff);
  }
  .ta {
    height: auto;
    padding: 8px 10px;
    resize: vertical;
  }
  .err {
    color: var(--dt-danger, #ff9c9c);
    font-size: 12px;
  }
  .dlg-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--dt-border, rgba(127, 127, 127, 0.2));
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--dt-border, rgba(127, 127, 127, 0.3));
    border-radius: 7px;
    background: var(--dt-input-bg, rgba(127, 127, 127, 0.12));
    color: var(--dt-fg, #fff);
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--dt-hover, rgba(127, 127, 127, 0.2));
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.ghost {
    background: transparent;
  }
  .btn.primary {
    background: var(--dt-accent, #6ea8ff);
    color: var(--dt-accent-fg, #fff);
    border-color: transparent;
  }
  .hidden {
    display: none;
  }
</style>
