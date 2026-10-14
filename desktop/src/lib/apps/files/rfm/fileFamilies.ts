export interface FileFamily {
  accent: string
  label: string
}

export const FILE_FAMILIES: Record<string, FileFamily> = {
  pdf: { accent: '#EC1C24', label: 'PDF' },
  doc: { accent: '#185ABD', label: 'DOC' },
  docx: { accent: '#185ABD', label: 'DOCX' },
  docm: { accent: '#185ABD', label: 'DOC' },
  odt: { accent: '#185ABD', label: 'ODT' },
  rtf: { accent: '#4B5563', label: 'RTF' },
  txt: { accent: '#6B7280', label: 'TXT' },
  md: { accent: '#087EA4', label: 'MD' },
  markdown: { accent: '#087EA4', label: 'MD' },
  pages: { accent: '#2396F3', label: 'PAGE' },
  xls: { accent: '#107C41', label: 'XLS' },
  xlsx: { accent: '#107C41', label: 'XLSX' },
  xlsm: { accent: '#107C41', label: 'XLS' },
  ods: { accent: '#107C41', label: 'ODS' },
  csv: { accent: '#059669', label: 'CSV' },
  numbers: { accent: '#21A15C', label: 'NUM' },
  ppt: { accent: '#C43E1C', label: 'PPT' },
  pptx: { accent: '#C43E1C', label: 'PPTX' },
  odp: { accent: '#C43E1C', label: 'ODP' },
  key: { accent: '#0A84FF', label: 'KEY' },
  psd: { accent: '#31A8FF', label: 'PSD' },
  ai: { accent: '#FF9A00', label: 'AI' },
  xd: { accent: '#FF61F6', label: 'XD' },
  fig: { accent: '#F24E1E', label: 'FIG' },
  sketch: { accent: '#FDB300', label: 'SKET' },
  jpg: { accent: '#9333EA', label: 'JPG' },
  jpeg: { accent: '#9333EA', label: 'JPG' },
  jfif: { accent: '#9333EA', label: 'JPG' },
  png: { accent: '#9333EA', label: 'PNG' },
  apng: { accent: '#9333EA', label: 'PNG' },
  gif: { accent: '#9333EA', label: 'GIF' },
  webp: { accent: '#9333EA', label: 'WEBP' },
  bmp: { accent: '#9333EA', label: 'BMP' },
  svg: { accent: '#FF7B00', label: 'SVG' },
  svgz: { accent: '#FF7B00', label: 'SVG' },
  tif: { accent: '#9333EA', label: 'TIFF' },
  tiff: { accent: '#9333EA', label: 'TIFF' },
  ico: { accent: '#9333EA', label: 'ICO' },
  avif: { accent: '#9333EA', label: 'AVIF' },
  heic: { accent: '#9333EA', label: 'HEIC' },
  heif: { accent: '#9333EA', label: 'HEIF' },
  jp2: { accent: '#9333EA', label: 'JP2' },
  js: { accent: '#F7DF1E', label: 'JS' },
  jsx: { accent: '#61DAFB', label: 'JSX' },
  ts: { accent: '#3178C6', label: 'TS' },
  tsx: { accent: '#61DAFB', label: 'TSX' },
  html: { accent: '#E34F26', label: 'HTML' },
  css: { accent: '#1572B6', label: 'CSS' },
  scss: { accent: '#CC6699', label: 'SCSS' },
  json: { accent: '#292929', label: 'JSON' },
  xml: { accent: '#E05D44', label: 'XML' },
  py: { accent: '#3776AB', label: 'PY' },
  php: { accent: '#777BB4', label: 'PHP' },
  sql: { accent: '#00758F', label: 'SQL' },
  zip: { accent: '#D97706', label: 'ZIP' },
  rar: { accent: '#7B1FA2', label: 'RAR' },
  '7z': { accent: '#4E73DF', label: '7Z' },
  tar: { accent: '#D97706', label: 'TAR' },
  gz: { accent: '#D97706', label: 'GZ' },
  mp3: { accent: '#1DB954', label: 'MP3' },
  wav: { accent: '#1DB954', label: 'WAV' },
  aac: { accent: '#1DB954', label: 'AAC' },
  flac: { accent: '#1DB954', label: 'FLAC' },
  ogg: { accent: '#1DB954', label: 'OGG' },
  m4a: { accent: '#1DB954', label: 'M4A' },
  opus: { accent: '#1DB954', label: 'OPUS' },
  mp4: { accent: '#E11D48', label: 'MP4' },
  mov: { accent: '#000000', label: 'MOV' },
  avi: { accent: '#E11D48', label: 'AVI' },
  mkv: { accent: '#E11D48', label: 'MKV' },
  webm: { accent: '#E11D48', label: 'WEBM' },
  mpeg: { accent: '#E11D48', label: 'MPEG' },
  mpg: { accent: '#E11D48', label: 'MPG' },
  m4v: { accent: '#E11D48', label: 'M4V' },
  flv: { accent: '#E11D48', label: 'FLV' },
  wmv: { accent: '#E11D48', label: 'WMV' },
  m2ts: { accent: '#E11D48', label: 'M2TS' },
  exe: { accent: '#0078D4', label: 'EXE' },
  dmg: { accent: '#999999', label: 'DMG' },
  iso: { accent: '#4B5563', label: 'ISO' },
  apk: { accent: '#3DDC84', label: 'APK' },
  sh: { accent: '#4E5D6C', label: 'SH' },
}

export function familyFor(extension: string | undefined): FileFamily {
  const e = (extension || '').replace(/^\./, '').toLowerCase()
  return FILE_FAMILIES[e] || { accent: '#155EEF', label: (extension || 'FILE').slice(0, 4).toUpperCase() }
}

export function chipLabelColor(accent: string): string {
  const hex = accent.replace('#', '')
  if (hex.length !== 6) return '#fff'
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#111827' : '#fff'
}
