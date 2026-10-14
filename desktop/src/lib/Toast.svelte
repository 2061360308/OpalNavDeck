<script lang="ts">
  import { toast } from './state/toast.svelte'
</script>

{#if toast.items.length}
  <div class="toaster" role="status" aria-live="polite">
    {#each toast.items as t (t.id)}
      <div class="toast">{t.text}</div>
    {/each}
  </div>
{/if}

<style>
  .toaster {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 100001;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    max-width: 70vw;
    padding: 9px 16px;
    border-radius: 10px;
    background: var(--dt-menu-bg, rgba(28, 32, 44, 0.95));
    color: var(--dt-fg, #e8ecf4);
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.16));
    box-shadow: var(--dt-shadow, 0 12px 32px rgba(0, 0, 0, 0.5));
    font-size: 13px;
    text-align: center;
    animation: toast-in 0.16s ease;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
