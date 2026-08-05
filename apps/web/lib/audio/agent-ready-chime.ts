/**
 * Distinctive Stack32 "first agent ready" chime.
 * Only call when the builder marks playReadySound on the first Ready version.
 */
export function playAgentReadyChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Motif: C5 → E5 → G5 (major triad rise) then soft octave echo.
    const notes = [
      { freq: 523.25, start: 0, dur: 0.18, gain: 0.12 },
      { freq: 659.25, start: 0.14, dur: 0.2, gain: 0.11 },
      { freq: 783.99, start: 0.3, dur: 0.28, gain: 0.13 },
      { freq: 1046.5, start: 0.52, dur: 0.45, gain: 0.08 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.value = note.freq;
      filter.type = "lowpass";
      filter.frequency.value = 2400;
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.05);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // Audio may be blocked — silent failure is fine.
  }
}
