// The dungeon's sardonic narrator, voiced by the browser's speech synthesis.
export class Mentor {
  enabled = true;
  volume = 0.8;
  private voice: SpeechSynthesisVoice | null = null;
  private lastAt = 0;

  constructor() {
    if (!('speechSynthesis' in window)) {
      this.enabled = false;
      return;
    }
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const prefs = ['Daniel', 'Google UK English Male', 'Microsoft George', 'Microsoft Ryan', 'Arthur', 'Oliver', 'Fred'];
      for (const p of prefs) {
        const v = voices.find((x) => x.name.includes(p));
        if (v) {
          this.voice = v;
          return;
        }
      }
      this.voice = voices.find((v) => v.lang.startsWith('en-GB')) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  say(text: string, urgent = false) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const now = performance.now();
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        if (!urgent || now - this.lastAt < 2500) return;
        speechSynthesis.cancel();
      }
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.pitch = 0.3;
      u.rate = 0.86;
      u.volume = this.volume;
      speechSynthesis.speak(u);
      this.lastAt = now;
    } catch {
      /* speech unavailable */
    }
  }

  stop() {
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
