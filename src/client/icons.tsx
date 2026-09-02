/**
 * UI icons — Font Awesome free tier (SVG/JS core, no font files shipped).
 * Per-icon deep imports keep the bundle tiny: the set root exports are not
 * side-effect-free, so importing from it would pull in every icon.
 * Icons by Font Awesome — https://fontawesome.com (CC BY 4.0).
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft'
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { faFolder } from '@fortawesome/free-solid-svg-icons/faFolder'
import { faFile } from '@fortawesome/free-solid-svg-icons/faFile'
import { faMinus } from '@fortawesome/free-solid-svg-icons/faMinus'
import { faSquareRootVariable } from '@fortawesome/free-solid-svg-icons/faSquareRootVariable'
import { faMarkdown } from '@fortawesome/free-brands-svg-icons/faMarkdown'
import { faTex } from '@fortawesome/free-brands-svg-icons/faTex'

interface IconProps {
  size?: number
}

/** ‹ back / collapse. */
export function IconChevronLeft({ size = 16 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faChevronLeft} width={size} height={size} />
}

/** ↓ export / download. */
export function IconDownload({ size = 16 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faDownload} width={size} height={size} />
}

/** ↑ up one level. */
export function IconArrowUp({ size = 14 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faArrowUp} width={size} height={size} />
}

/** 📁 folder. */
export function IconFolder({ size = 14 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faFolder} width={size} height={size} />
}

/** 📄 file. */
export function IconFile({ size = 14 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faFile} width={size} height={size} />
}

/** — minimize / collapse. */
export function IconMinus({ size = 14 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faMinus} width={size} height={size} />
}

/** Official Markdown brand logo (Font Awesome brands). */
export function IconMarkdown({ size = 16 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faMarkdown} width={size} height={size} />
}

/** Official TeX brand logo (Font Awesome brands, free tier). */
export function IconLatex({ size = 16 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faTex} width={size} height={size} />
}
