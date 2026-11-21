export function createGameAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = AudioContextClass ? new AudioContextClass() : null;
  let muted = false;

  function setMuted(nextMuted) {
    muted = nextMuted;
  }

  function unlock() {
    if (context?.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(frequency, start, duration, volume, type = 'sine', endFrequency = frequency) {
    if (!context || muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function play(kind) {
    if (!context || muted) return;
    unlock();
    const start = context.currentTime;
    if (kind === 'hit') {
      tone(520, start, 0.13, 0.045, 'sine', 780);
      tone(780, start + 0.07, 0.18, 0.035, 'sine', 1040);
    } else if (kind === 'miss') {
      tone(210, start, 0.2, 0.04, 'triangle', 125);
    } else if (kind === 'pulse') {
      tone(330, start, 0.11, 0.025, 'sine', 185);
    } else if (kind === 'activate') {
      tone(460, start, 0.12, 0.018, 'sine', 650);
    } else if (kind === 'capture') {
      tone(880, start, 0.07, 0.02, 'sine', 1040);
      tone(660, start + 0.065, 0.11, 0.016, 'sine', 820);
    }
  }

  function close() {
    context?.close().catch(() => {});
    context = null;
  }

  return { setMuted, unlock, play, close };
}
