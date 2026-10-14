import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

/** chrome styled entirely from the app's theme tokens so it follows light/dark/contrast */
const chrome = EditorView.theme({
  '&': {
    backgroundColor: 'var(--dt-surface-sunken, #14161d)',
    color: 'var(--dt-fg, #dbe2ee)',
  },
  '.cm-content': { caretColor: 'var(--dt-fg, #dbe2ee)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dt-fg, #dbe2ee)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--dt-accent-soft2, rgba(110, 168, 255, 0.3))',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--dt-surface-sunken, #14161d)',
    color: 'var(--dt-fg-muted, #7f8a9c)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--dt-hover, rgba(255, 255, 255, 0.06))' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--dt-hover, rgba(255, 255, 255, 0.06))' },
  '.cm-panels': {
    backgroundColor: 'var(--dt-surface-sunken, #14161d)',
    color: 'var(--dt-fg, #dbe2ee)',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
})

function ext(name: string): Extension[] {
  const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  switch (e) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: true, typescript: e.startsWith('ts') })]
    case 'json':
      return [json()]
    case 'md':
    case 'markdown':
      return [markdown()]
    case 'html':
    case 'htm':
    case 'svg':
      return [html()]
    case 'css':
    case 'scss':
    case 'less':
      return [css()]
    case 'py':
      return [python()]
    default:
      return []
  }
}

function highlightFor(dark: boolean): Extension {
  return syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle)
}

export interface EditorHandle {
  view: EditorView
  getValue: () => string
  setDark: (dark: boolean) => void
  destroy: () => void
}

export function createEditor(
  parent: HTMLElement,
  value: string,
  name: string,
  dark: boolean,
  onChange?: (value: string) => void,
  onSave?: () => void
): EditorHandle {
  const hi = new Compartment()
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          ...(onSave ? [{ key: 'Mod-s', preventDefault: true, run: () => (onSave(), true) }] : []),
        ]),
        ext(name),
        chrome,
        hi.of(highlightFor(dark)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChange) onChange(u.state.doc.toString())
        }),
      ],
    }),
  })
  return {
    view,
    getValue: () => view.state.doc.toString(),
    setDark: (d: boolean) => view.dispatch({ effects: hi.reconfigure(highlightFor(d)) }),
    destroy: () => view.destroy(),
  }
}
