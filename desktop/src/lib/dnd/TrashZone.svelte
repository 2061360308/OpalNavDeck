<script lang="ts">
  import { Trash2 } from '@lucide/svelte'
  import { dnd, dropTrash } from './dnd.svelte'
</script>

{#if dnd.active}
  <div class="trash-zone" class:hot={dnd.overTrash} role="presentation" use:dropTrash>
    <Trash2 size={26} />
    <span class="tlabel">松开删除</span>
  </div>
{/if}

<style>
  .trash-zone {
    position: fixed;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99990;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 140px;
    height: 84px;
    border-radius: 14px;
    color: var(--dt-fg, #e8ecf4);
    background: var(--dt-menu-bg, rgba(28, 32, 44, 0.9));
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.16));
    box-shadow: var(--dt-shadow, 0 12px 32px rgba(0, 0, 0, 0.5));
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }
  .trash-zone.hot {
    background: color-mix(in srgb, var(--dt-danger, #e04a4a) 92%, transparent);
    border-color: color-mix(in srgb, var(--dt-danger, #e04a4a) 60%, white);
    transform: translateX(-50%) scale(1.06);
  }
  .tlabel {
    font-size: 12px;
    opacity: 0.85;
  }
</style>
