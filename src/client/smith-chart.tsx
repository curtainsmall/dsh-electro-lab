/**
 * SmithChart: an interactive canvas Smith chart.
 *
 * Click anywhere inside the unit circle to set the reflection coefficient;
 * the point, its circles/arcs, and the readouts update live. All math runs
 * client-side on the shared math layer.
 */
import { useEffect, useRef } from 'react'
import { Complex } from 'complex.js'
import { convertImpedanceToReflection, convertReflectionToVswr, calcReturnLossDb } from '../math/smith.ts'

/** Physical canvas size (CSS scales it). */
const SIZE = 480

/** Grid values for the constant-resistance circles. */
const R_CIRCLES = [0, 0.2, 0.5, 1, 2]

/** Grid values for the constant-reactance arcs (both signs). */
const X_ARCS = [0.2, 0.5, 1, 2]

interface Props {
  gamma: Complex | null
  onChange: (gamma: Complex | null) => void
}

function toCanvas(gamma: Complex): { x: number; y: number } {
  return { x: SIZE / 2 + gamma.re * (SIZE / 2), y: SIZE / 2 - gamma.im * (SIZE / 2) }
}

function fromCanvas(x: number, y: number): Complex {
  const re = (x - SIZE / 2) / (SIZE / 2)
  const im = -(y - SIZE / 2) / (SIZE / 2)
  return new Complex(re, im)
}

export function SmithChart({ gamma, onChange }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    // background
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = '#111318'
    ctx.fillRect(0, 0, SIZE, SIZE)

    const center = SIZE / 2
    const radius = SIZE / 2

    // unit circle (the chart boundary) + real axis
    ctx.strokeStyle = '#c8ccd4'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(center, center, radius - 0.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#5a6070'
    ctx.beginPath()
    ctx.moveTo(0, center)
    ctx.lineTo(SIZE, center)
    ctx.stroke()

    // constant-resistance circles: center (r/(r+1), 0), radius 1/(r+1)
    ctx.strokeStyle = '#3d6b9e'
    ctx.lineWidth = 1
    for (const r of R_CIRCLES) {
      const c = r / (r + 1)
      const rad = 1 / (r + 1)
      ctx.beginPath()
      ctx.arc(center + c * radius, center, rad * radius, 0, Math.PI * 2)
      ctx.stroke()
      // label on the real axis
      ctx.fillStyle = '#6d93bf'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(String(r), center + c * radius + 4, center - 4)
    }

    // constant-reactance arcs: center (1, 1/x), radius 1/|x| (upper half)
    ctx.strokeStyle = '#8a4b6e'
    for (const x of X_ARCS) {
      const cx = 1
      const cy = 1 / x
      const rad = 1 / x
      ctx.beginPath()
      ctx.arc(center + cx * radius, center - cy * radius, rad * radius, 0, Math.PI * 2)
      ctx.stroke()
      // mirror for negative reactance
      ctx.beginPath()
      ctx.arc(center + cx * radius, center + cy * radius, rad * radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    // the reflection point
    if (gamma !== null && gamma.abs() <= 1) {
      const { x, y } = toCanvas(gamma)
      ctx.fillStyle = '#e8b34b'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }, [gamma])

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * SIZE
    const y = ((event.clientY - rect.top) / rect.height) * SIZE
    const gamma = fromCanvas(x, y)
    onChange(gamma.abs() <= 1 ? gamma : null)
  }

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      onClick={handleClick}
      style={{ width: '100%', maxWidth: SIZE, aspectRatio: '1', cursor: 'crosshair', borderRadius: 6, display: 'block' }}
    />
  )
}

/** Readouts for a reflection coefficient (null when nothing is set). */
export function gammaReadouts(gamma: Complex | null, referenceOhm = 50): { gamma: string; vswr: string; returnLoss: string } {
  if (gamma === null) return { gamma: '—', vswr: '—', returnLoss: '—' }
  const magnitude = gamma.abs()
  const angleDeg = ((gamma.arg() * 180) / Math.PI).toFixed(2)
  const vswr = convertReflectionToVswr(gamma)
  const loss = calcReturnLossDb(gamma)
  return {
    gamma: `Γ = ${magnitude.toFixed(4)} ∠ ${angleDeg}°`,
    vswr: vswr === Number.POSITIVE_INFINITY ? 'VSWR = ∞' : `VSWR = ${vswr.toFixed(3)}`,
    returnLoss: loss === Number.POSITIVE_INFINITY ? 'return loss = ∞ dB' : `return loss = ${loss.toFixed(2)} dB`,
  }
}

export { convertImpedanceToReflection }
