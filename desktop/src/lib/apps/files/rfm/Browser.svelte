<script lang="ts">
  import Breadcrumbs from './Breadcrumbs.svelte'
  import Item from './Item.svelte'
  import Icon from './Icon.svelte'
  import type { RfmController } from './controller.svelte'

  let { ctrl }: { ctrl: RfmController } = $props()
</script>

<section class="rfm-browser">
  <div class="rfm-toolbar">
    <button
      type="button"
      class="rfm-icon-button"
      title={ctrl.labels.toggleSidebar}
      aria-label={ctrl.labels.toggleSidebar}
      aria-pressed={ctrl.sidebarDocked}
      onclick={() => ctrl.toggleSidebar()}><Icon name="panel-left" size={16} /></button
    >
    <Breadcrumbs {ctrl} />
    <div class="rfm-toolbar-actions">
      <label class="rfm-search">
        <span class="rfm-search-icon"><Icon name="search" size={14} /></span>
        <input
          type="search"
          class="rfm-search-field"
          placeholder={ctrl.labels.search}
          aria-label={ctrl.labels.searchAria}
          value={ctrl.search}
          oninput={(e) => (ctrl.search = e.currentTarget.value)}
        />
      </label>
      <div class="rfm-view-toggles">
        <button
          type="button"
          class="rfm-view-toggle"
          aria-label={ctrl.labels.listView}
          aria-pressed={ctrl.view === 'list'}
          onclick={() => (ctrl.view = 'list')}><Icon name="list" size={16} /></button
        >
        <button
          type="button"
          class="rfm-view-toggle"
          aria-label={ctrl.labels.cardView}
          aria-pressed={ctrl.view === 'cards'}
          onclick={() => (ctrl.view = 'cards')}><Icon name="cards" size={16} /></button
        >
      </div>
      <button
        type="button"
        class="rfm-icon-button"
        title={ctrl.labels.toggleHidden}
        aria-label={ctrl.labels.toggleHidden}
        aria-pressed={ctrl.showHidden}
        class:on={ctrl.showHidden}
        onclick={() => ctrl.toggleHidden()}><Icon name="eye" size={16} /></button
      >
      <button
        type="button"
        class="rfm-icon-button"
        title={ctrl.theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onclick={() => (ctrl.theme = ctrl.theme === 'dark' ? 'light' : 'dark')}
        ><Icon name={ctrl.theme === 'dark' ? 'sun' : 'moon'} size={16} /></button
      >
      <button
        type="button"
        class="rfm-icon-button"
        title={ctrl.labels.toggleDetails}
        aria-label={ctrl.labels.toggleDetails}
        aria-pressed={ctrl.detailsDocked}
        onclick={() => ctrl.toggleDetails()}><Icon name="panel-right" size={16} /></button
      >
    </div>
  </div>

  <div class="rfm-browser-body">
    <div class="rfm-item-scroll">
      {#if ctrl.loading}<div class="rfm-busy" aria-busy="true"></div>{/if}
      {#if ctrl.items.length === 0}
        <div class="rfm-empty">
          <p>{ctrl.search.trim() ? ctrl.labels.noMatchingFiles : ctrl.labels.emptyFolder}</p>
        </div>
      {:else}
        <div
          class={ctrl.view === 'cards' ? 'rfm-item-grid' : 'rfm-item-list'}
          role="listbox"
          aria-label={ctrl.labels.folderContents}
        >
          {#each ctrl.items as item (item.id)}
            <Item {item} {ctrl} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>
