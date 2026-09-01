/**
 * Minimal inline SVG icon set, drawn in the shell's line-icon style:
 * 16×16 viewBox, 1.5px stroke, currentColor — no emoji, no system-font
 * glyphs, so rendering is identical across platforms and themes.
 */

interface IconProps {
  size?: number
}

function svgProps(size: number): Record<string, unknown> {
  return {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    style: { width: size, height: size, display: 'block', flex: 'none' },
  }
}

/** ‹ back / collapse. */
export function IconChevronLeft({ size = 16 }: IconProps): React.JSX.Element {
  return <svg {...svgProps(size)}><path d="M10 3 5 8l5 5" /></svg>
}

/** ↓ export / download. */
export function IconDownload({ size = 14 }: IconProps): React.JSX.Element {
  return <svg {...svgProps(size)}><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10" /></svg>
}

/** ▶ generate / run. */
export function IconPlay({ size = 14 }: IconProps): React.JSX.Element {
  return <svg {...svgProps(size)}><path d="M5 3.5v9l7-4.5z" /></svg>
}

/** ↑ up one level. */
export function IconArrowUp({ size = 13 }: IconProps): React.JSX.Element {
  return <svg {...svgProps(size)}><path d="M8 13V3m0 0L4 7m4-4 4 4" /></svg>
}

/** 📁 folder. */
export function IconFolder({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2H12.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
    </svg>
  )
}

/** 📄 file. */
export function IconFile({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  )
}

/** — minimize / collapse. */
export function IconMinus({ size = 13 }: IconProps): React.JSX.Element {
  return <svg {...svgProps(size)}><path d="M3.5 8h9" /></svg>
}
