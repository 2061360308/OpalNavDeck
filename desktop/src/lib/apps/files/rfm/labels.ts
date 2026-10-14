export interface FileManagerLabels {
  fileManager: string
  search: string
  searchAria: string
  listView: string
  cardView: string
  emptyFolder: string
  noMatchingFiles: string
  folderContents: string
  collapseAll: string
  expandAll: string
  expandFolder: string
  collapseFolder: string
  detailsEmpty: string
  type: string
  folder: string
  file: string
  items: string
  size: string
  loadingPreview: string
  view: string
  download: string
  open: string
  pin: string
  unpin: string
  pinned: string
  toggleSidebar: string
  toggleDetails: string
  toggleHidden: string
  itemsCount: (count: number) => string
}

export const DEFAULT_LABELS: FileManagerLabels = {
  fileManager: 'File manager',
  search: 'Search',
  searchAria: 'Search files',
  listView: 'List view',
  cardView: 'Card view',
  emptyFolder: 'This folder is empty',
  noMatchingFiles: 'No matching files',
  folderContents: 'Folder contents',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  expandFolder: 'Expand folder',
  collapseFolder: 'Collapse folder',
  detailsEmpty: 'Select a file or folder to view details',
  type: 'Type',
  folder: 'Folder',
  file: 'file',
  items: 'Items',
  size: 'Size',
  loadingPreview: 'Loading preview…',
  view: 'View',
  download: 'Download',
  open: 'Open',
  pin: 'Pin',
  unpin: 'Unpin',
  pinned: 'Pinned',
  toggleSidebar: 'Toggle sidebar',
  toggleDetails: 'Toggle details',
  toggleHidden: 'Toggle hidden files',
  itemsCount: (count) => `${count} item${count === 1 ? '' : 's'}`,
}

export function resolveLabels(partial?: Partial<FileManagerLabels>): FileManagerLabels {
  if (!partial) return DEFAULT_LABELS
  return { ...DEFAULT_LABELS, ...partial }
}
