import type { Component } from 'svelte'

export type ViewerKind = 'text' | 'json' | 'markdown' | 'image' | 'media' | 'pdf'

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i
const MEDIA = /\.(mp4|webm|mkv|mov|ogv|m4v|mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i
const PDF = /\.pdf$/i
const MARKDOWN = /\.(md|markdown|mdx)$/i
const JSONF = /\.(json|jsonc|json5)$/i
const TEXT =
  /\.(txt|log|ini|conf|cfg|env|yml|yaml|toml|xml|csv|tsv|sh|bash|zsh|bat|cmd|ps1|js|mjs|cjs|ts|tsx|jsx|mts|cts|css|scss|less|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sql|lua|vue|svelte|dockerfile|gitignore|editorconfig|properties|gradle|makefile)$/i

export function pickKind(name: string): ViewerKind | null {
  if (IMAGE.test(name)) return 'image'
  if (MEDIA.test(name)) return 'media'
  if (PDF.test(name)) return 'pdf'
  if (MARKDOWN.test(name)) return 'markdown'
  if (JSONF.test(name)) return 'json'
  if (TEXT.test(name)) return 'text'
  return null
}

export function isViewable(name: string): boolean {
  return pickKind(name) !== null
}

const loaders: Record<ViewerKind, () => Promise<{ default: Component<any> }>> = {
  text: () => import('./TextViewer.svelte'),
  json: () => import('./JsonViewer.svelte'),
  markdown: () => import('./MarkdownViewer.svelte'),
  image: () => import('./ImageViewer.svelte'),
  media: () => import('./MediaViewer.svelte'),
  pdf: () => import('./PdfViewer.svelte'),
}

export function loadViewer(kind: ViewerKind) {
  return loaders[kind]()
}
