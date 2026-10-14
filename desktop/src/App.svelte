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
  import DesktopOverlay from './lib/desktop/DesktopOverlay.svelte'
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
  import Sources from './lib/apps/sources/Sources.svelte'
  import Login from './lib/auth/Login.svelte'
  import { auth } from './lib/auth/session.svelte'
  import { sources } from './lib/sources/sources.svelte'

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
      void sources.load()
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

{#if auth.ready && auth.enabled && !auth.authenticated}
  <Login />
{:else}
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
      <DesktopOverlay />
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
        {:else if win.appId === 'sources'}
          <Sources />
        {:else if win.appId === 'files'}
          <RfmFileManager {win} />
        {:else if win.appId.startsWith('viewer')}
          <FileViewer {win} />
        {:else}
          <div style="padding:16px">鏈煡搴旂敤锛歿win.appId}</div>
        {/if}
      </Window>
    {/each}
  </div>

  <ContextMenu />
  <TrashZone />
  <Toast />
  <IconEditor />
  <ThemeVars />
  </div>
{/if}

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
  .widget-layer {
    z-index: 10;
    pointer-events: none;
  }
  .window-layer {
    z-index: 100;
    pointer-events: none;
  }
</style>

