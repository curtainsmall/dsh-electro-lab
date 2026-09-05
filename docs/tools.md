# ElectroLab State Machine Manual

[简体中文](tools.zh-CN.md)

The DeepSeek Harness ElectroLab plugin runs all electrical & electronics calculation inside a deterministic **state machine**. The language model never computes: it operates the state machine through three primitives and three record markers, and the state machine keeps a typed-value table, converts values at calculation boundaries, records every step, and seals each solve into a browsable record.

This manual is the full reference for the state machine surface — typed values, primitives, markers, the solver catalog, storage, and external solvers. Sessions started in **ElectroLab Mode** carry the same rules in the `electro-lab-interface` skill (state machine manual) and `electro-lab-template` skill (record protocol).

## 1. How it works

- **One global state machine per host process.** Any session's markers act on the same state machine; at most one record is open at a time (single-open invariant).
- **The LLM surface is six tools**: `set`, `get`, `call`, `record_question`, `record_analyse`, `record_answer` — plus the declaration managers `external_solver_add` / `external_solver_update` / `external_solver_delete`. The ~40 domain tools, `solve_steps` and the text↔value codecs are gone; the math kernels live in the state machine's solver registry and are invoked by `call`.
- **A record is a process (timeline).** Each state machine operation appends one fully self-describing trace line (input and output both stored); a record can be replayed to rebuild the recorded state at any point without re-computing anything.
- **Input is value.** What the model gives is what the state machine stores; a string stays a string.

## 2. Typed values

A typed value is a JSON object. `kind` is part of a quantity:

```json
{ "type": "number",  "value": 100,  "kind": "resistance" }
{ "type": "number",  "value": 25,   "kind": "temperature", "variant": "degC" }
{ "type": "number",  "value": 1500, "kind": "resistance",  "prefix": "kilo" }
{ "type": "complex", "value": { "re": 100, "im": 0 }, "kind": "voltage" }
{ "type": "complex", "value": { "mag": 220, "ang": 0.5236 }, "kind": "voltage" }
{ "type": "string",  "value": "lowpass" }
{ "type": "boolean", "value": true }
```

- `type` — the shape discriminator: number / complex / string / boolean / array (items recurse) / object (fields recurse).
- `kind` — the quantity class (resistance, voltage, time, frequency, temperature, angle, pressure, energy, length, mass, log, none, …). Kind is part of a quantity: a value exists with a kind; a bare number has kind `none`; a plain ratio has kind `log`.
- `variant` — a representation choice *within* a kind. **Field absent (not null) = the SI base representation**; storage never adds keys. Only the following words are valid, and each only on its own kind:

| kind | variant words | base (no key) |
|---|---|---|
| temperature | degC, degF | K |
| angle | deg | rad |
| pressure | bar, psi, atm | Pa |
| energy | cal, Wh | J |
| power | hp | W |
| length | inch, foot, yard, mile | m |
| mass | lb, oz | kg |

- `prefix` — a magnitude multiplier on number/complex. **Field absent = multiplier 1.** Words are full lowercase English words, never symbols: `pico` `nano` `micro` `milli` `kilo` `mega` `giga` `tera`. A prefix is generally only valid on the SI base representation (variant words reject prefixes).
- Words are short ASCII text everywhere; symbols (Ω, °, µ, …) never enter the value universe.

### Conversion boundary

The table stores values **exactly as given** — `get` returns what `set` wrote, no normalization. Conversion happens only when a value is *referenced by a computation*: at the `call` boundary the state machine converts variants to SI (degC → K, deg → rad, psi → Pa, …) and normalizes complex shapes (`{mag, ang}` → `{re, im}`, angles always radians). The table is untouched; the trace records both the original args and the resolved end values.

## 3. Primitives

```
set  { name, value }     write one slot: value = a typed value; value: null deletes the slot
get  { name }            read one slot (the stored typed value, exactly as written)
call { solver, args, target }  call one registered solver; args values are typed values or "@name" references
```

Semantics:

- `"100 kΩ"` is always a string; a resistance of 100 kΩ must be given as `{ "type": "number", "value": 100, "kind": "resistance", "prefix": "kilo" }`.
- `@name` / `@name.path` is a slot reference (`@` prefix = reference, no `@` = literal). The state machine expands it and kind/shape-checks it against the solver signature. A reference to a missing slot fails with `ENGINE_UNDECLARED`.
- **Every call returns one receipt** — there is no "exception vs normal return" duality:

```
success: set  → { ok: true, name, rev }   (delete: { ok: true, name, deleted })
         get  → { ok: true, name, value }
         call → { ok: true, target, rev }  (void solver: { ok: true, target: null })
failure:      → { ok: false, code, error }
```

  Check `ok` first. Receipts carry no business data (except `get`); read values only through `get`.
- **target matches the solver signature** (the state machine decides from the registry; the model does not need to remember rules): a void solver (declared `returns: null`) takes `target: null` (a named target → `ENGINE_VOID_TARGET`); a value solver requires a named target (missing/null → `ENGINE_TARGET_REQUIRED`).
- **target always overwrites**: writing an existing slot replaces the whole value (kind check passes) and bumps `rev`; nothing is inherited from the old representation.
- **Delete = `set` with `value: null`**: the slot disappears from the table, deleting a missing slot is an idempotent ok, re-creating later restarts at rev 1; the trace line carries `deleted: true`.
- Slot kinds are pinned on first write: overwriting with a different kind fails (`ENGINE_KIND_MISMATCH`) and does not advance the revision.
- Failed operations have **no side effects**: no slot is created, the table does not change, revisions do not move. The failure still lands in the trace.

## 4. Records & markers

```
record_question { text }    open a record (clears the table); a re-open seals the previous record as duplicate-start
record_analyse  { text }    the analysis: knowns and the approach with formulas — no computed numbers
record_answer   { text }    the final answer; seals the record
```

- One open record at most. A second `record_question` seals the open record (duplicate-start) and starts a new one — two open rows can never exist.
- `record_answer` with no open record keeps a duplicate-end error record.
- An interrupted record (index `sealedAt: null` with a body file) is resumed at the next state machine start: the trace continues in the same file and the table is rebuilt from it. An incomplete record never completes itself — it is either sealed later (duplicate-start) or stays incomplete forever.

## 5. Solver catalog

All solvers speak the same value contract: quantity arguments are typed values (see §2); array coefficients of transfer functions are kind-`none` quantities in descending power order. The catalog mirrors the math kernels one-to-one.

### Expression & algebra

| solver | purpose |
|---|---|
| `calculate` | Evaluate a string math expression and return the complex result |
| `rational_coefficients` | Reduce an expression in one variable to a rational function and return numerator/denominator coefficients |

### Series sums

| solver | purpose |
|---|---|
| `series_sum` | Sum of a number sequence: arithmetic, geometric (finite or convergent infinite), or power sum |

### Transfer functions & frequency domain

| solver | purpose |
|---|---|
| `partial_fraction` | Partial-fraction expansion of a ratio-form transfer function |
| `poles_zeros` | Poles and zeros of a ratio-form transfer function |
| `transfer_function_response` | Evaluate a transfer function at frequency points (H(jω) or H(e^(jωT))) |
| `step_response` | Step response of a continuous transfer function at time points |
| `difference_equation_response` | Difference-equation recursion output y[n] (Laurent a/b convention) |
| `bode_response` | Bode plot of a ratio-form transfer function on a logarithmic frequency grid |
| `power_series_expansion` | Power-series expansion of a z-domain transfer function about z⁻¹ (impulse response) |

### Digital signal processing

| solver | purpose |
|---|---|
| `discrete_fourier_transform` | DFT of a complex sample sequence (optionally windowed) |
| `inverse_discrete_fourier_transform` | IDFT of a spectrum: recovers the time-domain sequence (round-trip of the DFT) |
| `fourier_series_coefficients` | Fourier series coefficients (a₀, aₙ, bₙ) of a standard odd-symmetric waveform |
| `signal_analysis` | Signal statistics plus the windowed spectrum in one call (RMS, peak, peak-to-peak, DC) |

### Signal quality

| solver | purpose |
|---|---|
| `thd` | Total harmonic distortion of a sampled signal (fraction plus dB) |
| `jitter_snr` | SNR ceiling set by sampling-clock jitter |
| `adc_budget` | ADC noise budget: quantization, jitter and optional thermal SNR into a total SNR and ENOB |

### Circuits

| solver | purpose |
|---|---|
| `equivalent_impedance` | Total impedance of a set of impedances combined in series (Z = Σ Zi) or in parallel (1/Z = Σ 1/Zi) |
| `circuit_impedance` | Total driving-point impedance of a (possibly nested) series/parallel network at a frequency; network is JSON text of a tree of element leaves (kind resistance\|inductance\|capacitance) and series/parallel groups |
| `resonance` | Series/parallel LC resonance: resonantFrequency, qualityFactor and bandwidth |
| `ac_power` | AC power from RMS values: apparent = V·I, real = apparent·cosφ, reactive = apparent·sinφ, powerFactor = cosφ |
| `transient_response` | First- or second-order charge/discharge transient at a list of time points; returns one point per time with voltage and current |

### Electronics

| solver | purpose |
|---|---|
| `opamp_configurations` | Ideal op-amp gain and output for a configuration: inverting, non-inverting, voltage-follower, difference, integrator, differentiator |
| `time_constant` | Time constant and cutoff frequency: τ = RC (give capacitance) or τ = L/R (give inductance) |
| `voltage_divider` | Resistive divider, loaded or unloaded, plus the Thévenin output resistance |
| `led_resistor` | LED series resistor: R = (Vs − Vf)/I and its dissipated power P = I²·R |

### RF & Smith chart

| solver | purpose |
|---|---|
| `impedance_to_reflection` | Reflection coefficient Γ = (Z − Z0)/(Z + Z0) |
| `reflection_to_vswr` | VSWR from a reflection coefficient: vswr = (1+|Γ|)/(1−|Γ|) |
| `return_loss` | Return loss in dB: −20·log10(|Γ|) |
| `quarter_wave_transformer` | Quarter-wave transformer characteristic impedance: Z1 = √(Z0·ZL) |
| `matched_network` | Matching network between two real resistances (topology l/pi/t); returns low-pass/high-pass conjugate solutions as ordered elements |

### Transmission lines

| solver | purpose |
|---|---|
| `wavelength_frequency` | Wavelength from frequency (velocity factor aware) |
| `coaxial_parameters` | Coaxial-line characterization from geometry (impedance, velocity factor, per-meter C and L) |
| `rise_time_bandwidth` | Convert between rise time and bandwidth (tr ≈ 0.35/BW) |

### Noise

| solver | purpose |
|---|---|
| `thermal_noise` | Thermal (Johnson) noise power in a bandwidth: P = k·T·B (temperature in kelvin) |
| `cascade_noise_figure` | Total noise figure of cascaded stages (Friis) from per-stage noise figures and gains in dB |
| `quantization_noise` | Ideal SNR of a uniform quantizer in dB: SNR = 6.02·N + 1.76 |

### Filters

| solver | purpose |
|---|---|
| `filter_design` | Butterworth low-pass ladder design: order, cutoff frequency and equal source/load resistance give the element list (series inductors, shunt capacitors), with attenuation at the cutoff and query frequencies |

### Solver surface notes

The solver surface is exactly the migrated kernels under the state machine's one-shape-per-solver returns discipline. The notable consequences:

- `reflection_to_vswr` / `return_loss`: the |Γ| = 1 / |Γ| = 0 extremes are unbounded — the value universe holds no infinity, so those calls throw.
- `circuit_impedance.network` is a JSON-text string (a closed spec cannot express a recursive heterogeneous tree).
- `resonance.resistance` is required and the result always carries qualityFactor and bandwidth.
- `filter_design.queryFrequency` is required (pass the cutoff frequency when only the design is wanted); element magnitudes are kind-`none` values whose unit is carried by the element kind string.
- `opamp_configurations` covers the six single-input configurations (a summing amplifier has no single gain).
- `transient_response` returns one fixed point shape ({time, voltage, current}) across rc/rl/rlc; the rlc damping characterization is not returned.
- `voltage_divider` returns a fixed four-field object; unloaded, `unloadedOutputVoltage` equals `outputVoltage` and `loadCurrent` is 0.
- `series_sum` returns one fixed shape (kind/power/sum/lastTerm/converges) across all branches; a diverging infinite input errors.
- Unit-carrying echo fields follow the legacy declarations and use kind `none` (kelvin temperatures, wavelengths, coaxial diameters, echo frequency lists) — typed values for those quantities are SI base numbers.

## 6. Storage

The records home is `~/.dsh-electro-lab` (override with the `DSH_ELECTRO_LAB_HOME` environment variable):

```
~/.dsh-electro-lab/
  record-index.jsonl     ← index (outside records/)
  records/
    <id>.jsonl           ← the trace body (id is a UUID v4)
```

### record-index.jsonl (index only)

```json
{ "id": "…", "openedAt": 1730000000000, "sealedAt": null, "question": "given R = 100ohm…" }
```

Fields: id, openedAt, sealedAt (null = not sealed), question (immutable title). No errors, no stats, no content; line order is append order. Truncation is the UI's job.

### Trace body (per-step, full)

One line per state machine operation or marker; every line carries everything needed to restore that step — input and output both:

```json
{ "seq": 1, "tool": "marker", "kind": "question", "ok": true, "text": "…", "at": … }
{ "seq": 2, "tool": "set", "ok": true, "name": "R", "value": { …typed value as given… }, "rev": 1, "at": … }
{ "seq": 3, "tool": "call", "ok": true, "solver": "resonance",
  "args": { …original… }, "resolved": { …expanded + SI/rect end values… },
  "result": { …typed output… }, "target": "res", "rev": 1, "at": … }
{ "seq": 4, "tool": "call", "ok": false, "code": "ENGINE_UNDECLARED", "error": "…", "at": … }
{ "seq": 5, "tool": "set", "ok": true, "name": "tmp", "value": null, "deleted": true, "at": … }
{ "seq": 6, "tool": "marker", "kind": "answer", "ok": true, "text": "…", "at": … }
```

- `call` lines store the result: any call's output enters the line as fact — restoring state uses the stored result directly and **never recomputes** (external solver output comes from the network/files and cannot be recomputed).
- `resolved` is the argument set that actually entered the run: references expanded and all conversions done (SI, rect). `args` keeps the originals; the two line up per key.
- No kernel-internal intermediate steps and no model reasoning text are recorded; the granularity is one state machine operation. The reader of a trace is a human — every step shows original input, converted values and result in place, and can be re-verified independently.

### Restore = replay

Rebuilding state replays the lines in order: `set` lines set the slot to the stored value, `call` lines set the target slot to the stored result (non-void), set-null lines delete, marker lines are skipped. Pure state machine — no recompute, no network, no randomness.

### Consistency

- Orphan index rows (sealedAt null without a body file) are cleared at state machine start — the index is a projection and can be safely rebuilt.
- The new system does not read the old-format `records.jsonl`; the old file is left untouched.

## 7. Host endpoints

- `GET /api/dsh-electro-lab/records-index` — the index rows for the Records panel list (`{ rows: [{ id, openedAt, sealedAt, question }] }`). The list polls every 5 s; it never reads trace bodies.
- `GET /api/dsh-electro-lab/external-solvers` — the declaration archive + dirty bit (`{ solvers: […], restartRequired }`).
- `PUT /api/dsh-electro-lab/external-solvers?config=<base64url JSON>` — validate and upsert one declaration (sets the dirty bit).
- `DELETE /api/dsh-electro-lab/external-solvers?name=<name>` — delete one declaration.

## 8. External solvers

External solvers are user-owned calculation solvers living on a remote endpoint; the state machine reaches them over an **http** or **file** transport. Declarations live in `external-solvers.jsonl` under the records home; at state machine start every enabled declaration is registered **verbatim** into the solver registry as an external solver (no compile layer — the transport is wrapped by the state machine itself). Changes apply after a host restart; the UI shows a pending-restart notice while the dirty bit is set.

### Declaration

```json
{
  "name": "echo_http",
  "description": "Echo peer over http: returns every parameter it receives, verbatim",
  "enabled": true,
  "parameters": {
    "message": { "type": "string", "description": "a text echoed back verbatim", "required": true },
    "values":  { "type": "array", "items": { "type": "quantity", "kind": "none" }, "description": "values echoed back verbatim" },
    "flag":    { "type": "boolean", "description": "a boolean echoed back verbatim" }
  },
  "returns": {
    "type": "object",
    "fields": {
      "message": { "type": "string" },
      "values":  { "type": "array", "items": { "type": "quantity", "kind": "none" } },
      "flag":    { "type": "boolean" }
    }
  },
  "transport": "http",
  "transportOptions": { "url": "http://127.0.0.1:8787/echo" },
  "timeoutMs": 10000
}
```

- Parameter specs: `{ "type": "quantity", "kind": <lowercase kind name> }` (a quantity accepts a bare number, `{re, im}` or `{mag, ang}` payloads), `{ "type": "string", "enum"?: [...] }`, `{ "type": "boolean" }`, `{ "type": "array", "items": <spec> }` (homogeneous, items may nest).
- `returns` is **required for registration**: the same spec leaves (or explicit `null` = void). A declaration without a returns, or with the unmappable `"any"` leaf, is kept in the archive but skipped at start with a warning.
- http `transportOptions`: `url`, optional `headers`. The archive dialect still accepts a `method` field for compatibility, but the host always sends **POST** — typed args travel as the JSON request body.
- file `transportOptions`: `directory` (the host writes `in.<id>.json` there and polls for `out.<id>.json`), optional `inPrefix` / `outPrefix` / `pollMs`.
- Name rules: lowercase start, `a-z0-9_`, max 64, unique among external and built-in solvers.

### Wire protocol (typed envelope)

```
request:  { "requestId": "<uuid>", "args": { "<parameter>": <typed value> } }
success:  { "requestId": "<uuid>", "result": <typed value> }    // non-void
success:  { "requestId": "<uuid>", "result": null }             // void: still a result message, just valueless
failure:  { "requestId": "<uuid>", "error": "<string message>" }
```

- Typed values are self-describing across the wire: `type` discriminates the shape, `value` carries the content, complex is always rect, `kind` carries the dimension. Variants/prefixes never appear — the state machine has already converted to the SI base. A third-party implementation only implements the five type branches.
- **The `result` field is always present** (void = null) — it reserves the slot for future message kinds, so `result` and any sibling message can never be confused.
- The host validates the response against the solver signature: a non-void solver receiving `result: null` (or no result) is a protocol error; a void solver receiving a result is one too.
- `requestId` echo is verified; timeouts and protocol violations are raised by the host. Failures share one structured error path with local solvers — whatever the source, the call surfaces as the same error receipt and is recorded in the trace with its code.

| code | meaning |
|---|---|
| `EXTERNAL_ERROR` | the endpoint itself reported failure (envelope `error` field) |
| `EXTERNAL_HTTP` | http transport failure (non-2xx status) |
| `EXTERNAL_TIMEOUT` | the external call timed out |
| `EXTERNAL_RESPONSE` | protocol violation in the response envelope |

### Manager tools

| tool | purpose |
|---|---|
| `external_solver_add` | Register a new external solver declaration (fails when the name already exists) |
| `external_solver_update` | Replace an existing declaration (fails when it does not exist) |
| `external_solver_delete` | Remove a declaration by name |

Writes persist immediately and set the dirty bit; results report `restartRequired: true`. The Records panel's **External solvers** tab offers the same actions with form editing. [`external-solvers-example/`](../external-solvers-example/README.md) is an independent npm project with manual test counterparts for the envelope protocol — `node src/echo.ts http` / `file` echoes it end to end.
