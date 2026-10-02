/** Sade çizgi simgeleri. Her zaman bir kelimeyle birlikte kullanılır; tek başına anlam taşımaz. */

export type IconName =
  | 'yes'
  | 'no'
  | 'back'
  | 'repeat'
  | 'unknown'
  | 'speak'
  | 'undo'
  | 'clear'
  | 'show'
  | 'prev'
  | 'next'
  | 'settings'
  | 'person'
  | 'learn'
  | 'chat'
  | 'flip'
  | 'mic'
  | 'stop'
  | 'play'
  | 'camera'
  | 'plus'
  | 'trash'
  | 'phone'
  | 'download'
  | 'upload'
  | 'letters'
  | 'template'
  | 'body'
  | 'quick'
  | 'hint'
  | 'check'
  | 'star'
  | 'pause'
  | 'up'
  | 'down'

const paths: Record<IconName, string> = {
  yes: 'M5 12.5l4.5 4.5L19 7.5',
  no: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  unknown: 'M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V15M12 18.5v.5',
  speak: 'M4 9.5v5h3.5L12 19V5L7.5 9.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  undo: 'M9 7L4 12l5 5M4.5 12H15a5 5 0 0 1 0 10h-2',
  clear: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  show: 'M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4.9a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-.9c.5.4 1.1.7 1.7 1L11 21h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4.9 2-3.4-2-1.6z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  learn: 'M4 19.5V6a2 2 0 0 1 2-2h13v13H6a2 2 0 0 0-2 2zM4 19.5A2 2 0 0 0 6 21.5h13V17',
  chat: 'M4 5h16v11H9l-5 4V5z',
  flip: 'M7 4v13M7 4L4 7M7 4l3 3M17 20V7M17 20l-3-3M17 20l3-3',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5v14l11-7L8 5z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5',
  phone: 'M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5.5a2 2 0 0 1 2-2z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 15V4M7 9l5-5 5 5M5 20h14',
  letters: 'M4 18L8.5 6 13 18M5.7 14h5.6M15 12.5h3.5a2.5 2.5 0 0 1 0 5H15v-10h3a2.5 2.5 0 0 1 0 5',
  template: 'M4 7h4M4 12h16M4 17h10M11 7h9',
  body: 'M12 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 9h12M12 9v6M9 21l3-6 3 6',
  quick: 'M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8L12 3.5z',
  pause: 'M8 5v14M16 5v14',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
}

export function Icon({ name, size = 32, strokeWidth = 2.4 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}
