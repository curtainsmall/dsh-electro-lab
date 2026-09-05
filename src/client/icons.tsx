/**
 * UI icons — Font Awesome free tier (SVG/JS core, no font files shipped).
 * Per-icon deep imports keep the bundle tiny: the set root exports are not
 * side-effect-free, so importing from it would pull in every icon.
 * Icons by Font Awesome — https://fontawesome.com (CC BY 4.0).
 *
 * Sizing note: react-fontawesome v3 ignores width/height props, so the size
 * is forced through inline style (CSS beats the default 1em sizing).
 */
import { FontAwesomeIcon, type CSSVariables } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft'

interface IconProps {
  size?: number
}

/** Shared inline sizing: react-fontawesome v3 does not honor width/height props. */
function sized(size: number): React.CSSProperties & CSSVariables {
  return { width: size, height: size, display: 'block', flex: 'none' }
}

/** ‹ back / collapse. */
export function IconChevronLeft({ size = 16 }: IconProps): React.JSX.Element {
  return <FontAwesomeIcon icon={faChevronLeft} style={sized(size)} />
}
