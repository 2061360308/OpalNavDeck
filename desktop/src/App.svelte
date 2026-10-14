<script lang="ts">
  import Stage from './lib/stage/Stage.svelte'
  import WidgetHost from './lib/widget/WidgetHost.svelte'
  import Window from './lib/wm/Window.svelte'
  import SettingsCenter from './lib/apps/settings-center/SettingsCenter.svelte'
  import Resources from './lib/apps/Resources.svelte'
  import Personalize from './lib/apps/personalize/Personalize.svelte'
  import RainmeterManager from './lib/apps/rainmeter/RainmeterManager.svelte'
  import RfmFileManager from './lib/apps/files/rfm/RfmFileManager.svelte'
  import FileViewer from './lib/apps/viewer/FileViewer.svelte'
  import WallpaperHost from './lib/desktop/WallpaperHost.svelte'
  import ContextMenu from './lib/desktop/ContextMenu.svelte'
  import TrashZone from './lib/dnd/TrashZone.svelte'
  import Toast from './lib/Toast.svelte'
  import IconEditor from './lib/IconEditor.svelte'
  import IconBoxView from './lib/box/IconBoxView.svelte'
  import ThemeVars from './lib/desktop/ThemeVars.svelte'
  import Guides from './lib/desktop/Guides.svelte'
  import { widgets } from './lib/state/widgets.svelte'
  import { boxes } from './lib/state/boxes.svelte'
  import { settings } from './lib/desktop/settings.svelte'
  import { wm } from './lib/state/windows.svelte'
  import { menus } from './lib/desktop/menuStore.svelte'
  import { skins } from './lib/desktop/skins.svelte'
  import { dragState } from './lib/desktop/dragState.svelte'
  import { modifiers } from './lib/desktop/modifiers.svelte'
  import { scene } from './lib/desktop/scene.svelte'
  import { stage } from './lib/stage/stageState.svelte'
  import { installDefaultMenus } from './lib/desktop/defaultMenus.svelte'
  import { load, init, setupAutosave } from './lib/persist/store.svelte'
  import { plugins } from './lib/plugin/host'
  import { initDnd } from './lib/dnd/dnd.svelte'
  import { registerCoreCapabilities } from './lib/capabilities/core'
  import Account from './lib/apps/account/Account.svelte'
  import Login from './lib/auth/Login.svelte'
  import { auth } from './lib/auth/session.svelte'

  registerCoreCapabilities()
  load()
  setupAutosave()
  installDefaultMenus()
  initDnd()

  let booted = $state(false)
  function boot() {
    if (booted) return
    booted = true
    void init().then(() => {
      void skins.load()
      void plugins.load()
    })
  }

  void auth.init()
  $effect(() => {
    if (!auth.ready) return
    if (!auth.enabled || auth.authenticated) boot()
  })

  function onDesktopContext(e: MouseEvent) {
    e.preventDefault()
    menus.show({ target: 'desktop', x: e.clientX, y: e.clientY })
  }

  // clicking the desktop / widgets / boxes means no window owns the scene
  function onDesktopDown(e: PointerEvent) {
    const t = e.target as HTMLElement | null
    if (t?.closest('.window-layer')) return
    wm.blur()
  }

  // double-click empty desktop hides/restores all boxes
  function onDesktopDblClick(e: MouseEvent) {
    if (!settings.boxBehavior.dblclickHide) return
    const t = e.target as HTMLElement
    if (t.closest('.box, .win, .widget-layer, .trash-zone, .ctxmenu')) return
    boxes.toggleHidden()
  }

  const overlayPad = 8
  const overlayBox = $derived(
    `left:${stage.canvasLeft + overlayPad}px;top:${stage.canvasTop + overlayPad}px;` +
      `width:${stage.canvasW - overlayPad * 2}px;height:${stage.canvasH - overlayPad * 2}px`
  )

  // show a grabbing cursor across the desktop while a skin is being dragged
  $effect(() => {
    if (!dragState.active) return
    document.documentElement.style.cursor = 'grabbing'
    return () => {
      document.documentElement.style.cursor = ''
    }
  })

  // expose the stage scale so body-level drag clones (svelte-dnd-action) can match size
  $effect(() => {
    document.documentElement.style.setProperty('--dt-stage-scale', String(stage.scale))
  })
</script>

<div
  class="desktop"
  role="application"
  oncontextmenu={onDesktopContext}
  ondblclick={onDesktopDblClick}
  onpointerdown={onDesktopDown}
>
  <div class="layer wallpaper">
    <WallpaperHost />
  </div>

  {#if dragState.active || (modifiers.ctrl && scene.desktopActive)}
    <div class="layer acrylic-layer">
      <div class="drag-overlay" style={overlayBox}></div>
    </div>
  {/if}

  <div class="layer widget-layer">
    <Stage>
      {#each widgets.list as w (w.id)}
        <WidgetHost widget={w} />
      {/each}
      {#if !boxes.hidden}
        {#each boxes.topLevel as b (b.id)}
          <IconBoxView box={b} />
        {/each}
      {/if}
      <Guides />
    </Stage>
  </div>

  <div class="layer window-layer">
    {#each wm.list as win (win.id)}
      <Window {win}>
        {#if win.appId === 'settings-center'}
          <SettingsCenter />
        {:else if win.appId === 'resources'}
          <Resources {win} />
        {:else if win.appId === 'personalize'}
          <Personalize />
        {:else if win.appId === 'rainmeter'}
          <RainmeterManager {win} />
        {:else if win.appId === 'account'}
          <Account />
        {:else if win.appId === 'files'}
          <RfmFileManager {win} />
        {:else if win.appId.startsWith('viewer')}
          <FileViewer {win} />
        {:else}
          <div style="padding:16px">未知应用：{win.appId}</div>
        {/if}
      </Window>
    {/each}
  </div>

  <ContextMenu />
  <TrashZone />
  <Toast />
  <IconEditor />
  <ThemeVars />

  {#if auth.ready && auth.enabled && !auth.authenticated}
    <Login />
  {/if}
</div>

<style>
  .desktop {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--dt-bg, #0a0d14);
    color: var(--dt-fg, #e8ecf4);
  }
  .layer {
    position: absolute;
    inset: 0;
  }
  .wallpaper {
    z-index: 0;
  }
  .acrylic-layer {
    z-index: 5;
    pointer-events: none;
  }
  /* acrylic: backdrop capture + gaussian blur + tint (noise on ::after) */
  .drag-overlay {
    position: absolute;
    pointer-events: none;
    box-shadow: 0px 9px 20px #00000057, inset 0 0 0 1px rgba(79, 140, 255, 0.45);
    --acrylic-filter: blur(30px) brightness(120%) saturate(80%);
    -webkit-backdrop-filter: var(--acrylic-filter);
    backdrop-filter: var(--acrylic-filter);
    background-color: #ffffff88;
    border-radius: 16px;
    overflow: hidden;
  }
  /* subtle grain, kept low-opacity + blended so it doesn't veil the backdrop */
  .drag-overlay::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: url(data:image/png;base64,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);
    background-size: 50px;
    opacity: 0.18;
  }
  .widget-layer {
    z-index: 10;
    pointer-events: none;
  }
  .window-layer {
    z-index: 100;
    pointer-events: none;
  }
</style>
