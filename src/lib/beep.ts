let ctx: AudioContext | null = null

/** Short register beep: high for a successful scan, low for "not found". */
export function beep(kind: 'ok' | 'error' = 'ok') {
  try {
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = kind === 'ok' ? 1400 : 300
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (kind === 'ok' ? 0.08 : 0.25))
  } catch {
    // Audio is optional.
  }
}
