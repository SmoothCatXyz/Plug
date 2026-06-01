export type UiSoundId =
  | "approval-required"
  | "approval-accepted"
  | "approval-rejected"
  | "mode-switch"
  | "mission-control"
  | "tool-success"
  | "tool-failure";

type PlaySoundOptions = {
  muted: boolean;
  volume: number;
};

const SOUND_DEBOUNCE_MS = 100;
const lastPlayed = new Map<UiSoundId, number>();

export function playUiSound(soundId: UiSoundId, options: PlaySoundOptions): void {
  if (options.muted || options.volume <= 0) {
    return;
  }

  const now = performance.now();
  const previous = lastPlayed.get(soundId) ?? 0;

  if (now - previous < SOUND_DEBOUNCE_MS) {
    return;
  }

  lastPlayed.set(soundId, now);

  try {
    const context = getAudioContext();
    const sequence = getSoundSequence(soundId);
    const masterGain = context.createGain();
    masterGain.gain.value = Math.min(Math.max(options.volume, 0), 1) * 0.3;
    masterGain.connect(context.destination);

    for (const [index, tone] of sequence.entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + tone.delayMs / 1000;
      const duration = tone.durationMs / 1000;

      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(tone.gain, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);

      if (index === sequence.length - 1) {
        setTimeout(() => {
          masterGain.disconnect();
        }, tone.delayMs + tone.durationMs + 60);
      }
    }
  } catch {
    // Browser audio can be unavailable before user interaction; UI must remain functional.
  }
}

function getAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  const existing = (window as Window & { __plugAudioContext?: AudioContext }).__plugAudioContext;

  if (existing) {
    void existing.resume();
    return existing;
  }

  const context = new AudioContextCtor();
  (window as Window & { __plugAudioContext?: AudioContext }).__plugAudioContext = context;
  void context.resume();
  return context;
}

function getSoundSequence(soundId: UiSoundId): Array<{
  delayMs: number;
  durationMs: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
}> {
  if (soundId === "approval-required") {
    return [
      { delayMs: 0, durationMs: 90, frequency: 660, gain: 0.75, type: "square" },
      { delayMs: 140, durationMs: 120, frequency: 880, gain: 0.65, type: "square" }
    ];
  }

  if (soundId === "approval-accepted") {
    return [
      { delayMs: 0, durationMs: 70, frequency: 880, gain: 0.55, type: "sine" },
      { delayMs: 85, durationMs: 90, frequency: 1320, gain: 0.45, type: "sine" }
    ];
  }

  if (soundId === "approval-rejected" || soundId === "tool-failure") {
    return [
      { delayMs: 0, durationMs: 180, frequency: 180, gain: 0.7, type: "sawtooth" },
      { delayMs: 120, durationMs: 160, frequency: 120, gain: 0.55, type: "sawtooth" }
    ];
  }

  if (soundId === "mode-switch" || soundId === "mission-control") {
    return [
      { delayMs: 0, durationMs: 45, frequency: 240, gain: 0.5, type: "triangle" },
      { delayMs: 40, durationMs: 70, frequency: 520, gain: 0.42, type: "triangle" }
    ];
  }

  return [{ delayMs: 0, durationMs: 80, frequency: 1240, gain: 0.45, type: "sine" }];
}
