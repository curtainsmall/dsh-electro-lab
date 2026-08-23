/**
 * ElectroLab panel: the interactive Smith chart with impedance input and
 * live readouts. Mounted as a floating overlay (shell.overlay), toggled from
 * a header action button.
 */
import { useState, useSyncExternalStore } from 'react'
import { Complex } from 'complex.js'
import { zToGamma, gammaReadouts, SmithChart } from './smith-chart.tsx'

/** Tiny shared store: open state + subscription for the header button and the overlay. */
const panelStore = {
  open: false,
  listeners: new Set<() => void>(),
  toggle(): void {
    this.open = !this.open
    for (const listener of this.listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
}

/** The header action button that toggles the panel. */
export function PanelToggleButton(_props: Record<string, unknown>): React.JSX.Element {
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  return (
    <button
      type="button"
      onClick={() => panelStore.toggle()}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: open ? '1px solid #e8b34b' : '1px solid #3d4554',
        background: open ? '#2a2518' : '#1a1d24',
        color: open ? '#e8b34b' : '#c8ccd4',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      ElectroLab
    </button>
  )
}

function numberInput(value: string, onChange: (next: string) => void, label: string): React.JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c8ccd4' }}>
      <span style={{ minWidth: 90 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: 90,
          padding: '3px 6px',
          borderRadius: 4,
          border: '1px solid #3d4554',
          background: '#111318',
          color: '#e6e8ec',
          font: '12px ui-monospace, monospace',
        }}
      />
    </label>
  )
}

/** The floating panel body. */
export function ElectroLabPanel(_props: Record<string, unknown>): React.JSX.Element | null {
  const open = useSyncExternalStore(panelStore.subscribe, () => panelStore.open)
  const [realText, setRealText] = useState('50')
  const [imagText, setImagText] = useState('50')
  const [referenceText, setReferenceText] = useState('50')

  const real = Number(realText)
  const imaginary = Number(imagText)
  const reference = Number(referenceText)
  const impedanceValid = Number.isFinite(real) && Number.isFinite(imaginary) && Number.isFinite(reference) && reference > 0
  const gamma = impedanceValid ? zToGamma(new Complex(real, imaginary), reference) : null
  const readouts = gammaReadouts(gamma)

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        background: 'rgba(8, 10, 14, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
      onClick={() => panelStore.toggle()}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: '#171a21',
          border: '1px solid #3d4554',
          borderRadius: 10,
          padding: 16,
          maxWidth: 760,
          width: '92%',
          maxHeight: '90vh',
          overflow: 'auto',
          color: '#e6e8ec',
          font: '13px/1.5 ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>ElectroLab — Smith Chart</h2>
          <button
            type="button"
            onClick={() => panelStore.toggle()}
            style={{ background: 'none', border: 'none', color: '#8b93a5', cursor: 'pointer', fontSize: 16 }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 280 }}>
            <SmithChart gamma={gamma} onChange={() => undefined} />
            <div style={{ fontSize: 11, color: '#8b93a5', marginTop: 6 }}>
              Click inside the circle to pick a reflection coefficient. Impedance input below plots the matching point.
            </div>
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {numberInput(realText, setRealText, 'real (Ω)')}
            {numberInput(imagText, setImagText, 'imag (Ω)')}
            {numberInput(referenceText, setReferenceText, 'reference (Ω)')}
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                background: '#111318',
                borderRadius: 6,
                border: '1px solid #2a2f3a',
                font: '12px/1.7 ui-monospace, monospace',
              }}
            >
              <div>Z = {Number.isFinite(real) ? real : '?'}{' '}
                {Number.isFinite(imaginary) && imaginary >= 0 ? '+' : '-'}{' '}
                {Number.isFinite(imaginary) ? Math.abs(imaginary) : '?'}j Ω</div>
              <div>{readouts.gamma}</div>
              <div>{readouts.vswr}</div>
              <div>{readouts.returnLoss}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
