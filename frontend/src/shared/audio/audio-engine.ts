export type SoundEffect =
  | 'uiClick'
  | 'playerJoin'
  | 'ready'
  | 'gameStart'
  | 'turn'
  | 'diceRoll'
  | 'diceLand'
  | 'tokenStep'
  | 'passGo'
  | 'money'
  | 'property'
  | 'card'
  | 'challenge'
  | 'correct'
  | 'incorrect'
  | 'duel'
  | 'jail'
  | 'jailEscape'
  | 'house'
  | 'bankrupt'
  | 'gameOver';

export type MusicScene = 'none' | 'lobby' | 'game';

type BrowserAudioContext = AudioContext;

/**
 * A small procedural audio engine for Mathopoly.
 *
 * Keeping the sounds in Web Audio makes them instant, original, and immune to
 * missing asset/network errors. Every effect is built from short envelopes,
 * filtered noise, and simple musical intervals rather than novelty samples.
 */
export class AudioEngine {
  private context: BrowserAudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private musicEnabled = true;
  private volume = 0.7;
  private desiredScene: MusicScene = 'none';
  private activeScene: MusicScene = 'none';
  private musicTimer: number | null = null;
  private musicStep = 0;

  get isUnlocked() {
    return this.context?.state === 'running';
  }

  async unlock() {
    try {
      this.ensureContext();
      if (this.context?.state === 'suspended') await this.context.resume();
      if (this.isUnlocked) this.syncMusic();
    } catch {
      // Some browsers reject resume outside a direct gesture. The next user
      // click (including the sound control) safely tries again.
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevels();
    this.syncMusic();
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.applyLevels();
    this.syncMusic();
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyLevels();
  }

  setScene(scene: MusicScene) {
    this.desiredScene = scene;
    this.syncMusic();
  }

  pause() {
    this.stopMusic();
    void this.context?.suspend();
  }

  play(effect: SoundEffect) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.context || this.context.state !== 'running') return;

    const now = this.context.currentTime + 0.006;
    switch (effect) {
      case 'uiClick':
        this.tone(480, now, .035, .026, 'triangle', 360);
        break;
      case 'playerJoin':
        this.tone(392, now, .12, .055, 'sine');
        this.tone(523.25, now + .075, .16, .05, 'sine');
        break;
      case 'ready':
        this.tone(659.25, now, .1, .05, 'triangle');
        this.tone(783.99, now + .07, .15, .045, 'triangle');
        break;
      case 'gameStart':
        [261.63, 329.63, 392, 523.25].forEach((frequency, index) =>
          this.tone(frequency, now + index * .095, .28, .055, 'triangle'));
        break;
      case 'turn':
        this.tone(698.46, now, .18, .04, 'sine');
        this.tone(880, now + .09, .24, .035, 'sine');
        break;
      case 'diceRoll':
        [0, .075, .14, .205, .285, .37, .47, .59, .73].forEach((offset, index) => {
          this.noise(now + offset, .035 + (index % 3) * .008, .075, 900 + (index % 4) * 260, 'bandpass');
          this.tone(125 + (index % 3) * 24, now + offset, .035, .025, 'square', 85);
        });
        break;
      case 'diceLand':
        this.noise(now, .07, .13, 650, 'lowpass');
        this.tone(105, now, .11, .07, 'sine', 62);
        this.noise(now + .085, .035, .055, 1200, 'bandpass');
        break;
      case 'tokenStep': {
        const pitch = 205 + Math.random() * 32;
        this.tone(pitch, now, .045, .035, 'triangle', pitch * .72);
        this.noise(now, .025, .025, 1450, 'bandpass');
        break;
      }
      case 'passGo':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
          this.tone(frequency, now + index * .075, .24, .055, 'triangle'));
        this.noise(now + .27, .09, .035, 3100, 'highpass');
        break;
      case 'money':
        this.tone(1318.51, now, .1, .04, 'sine');
        this.tone(1760, now + .06, .24, .045, 'sine');
        this.noise(now + .015, .04, .018, 4200, 'highpass');
        break;
      case 'property':
        this.noise(now, .035, .07, 1050, 'bandpass');
        this.tone(392, now + .05, .16, .04, 'triangle');
        this.tone(523.25, now + .12, .24, .045, 'triangle');
        break;
      case 'card':
        this.noise(now, .22, .045, 2400, 'highpass', 550);
        this.tone(659.25, now + .11, .18, .03, 'sine');
        break;
      case 'challenge':
        this.tone(440, now, .11, .035, 'triangle');
        this.tone(554.37, now + .065, .13, .035, 'triangle');
        this.tone(659.25, now + .13, .18, .038, 'triangle');
        break;
      case 'correct':
        [523.25, 659.25, 783.99].forEach((frequency, index) =>
          this.tone(frequency, now + index * .075, .25, .055, 'sine'));
        break;
      case 'incorrect':
        this.tone(311.13, now, .16, .042, 'triangle', 277.18);
        this.tone(246.94, now + .12, .25, .038, 'triangle', 220);
        break;
      case 'duel':
        this.tone(146.83, now, .25, .065, 'sawtooth', 220);
        this.tone(440, now + .11, .18, .04, 'triangle');
        this.tone(587.33, now + .2, .24, .045, 'triangle');
        break;
      case 'jail':
        this.tone(1760, now, .16, .035, 'square', 520);
        this.tone(1174.66, now + .12, .22, .03, 'square', 390);
        this.noise(now, .18, .04, 1900, 'bandpass');
        break;
      case 'jailEscape':
        [392, 523.25, 659.25, 783.99].forEach((frequency, index) =>
          this.tone(frequency, now + index * .065, .2, .04, 'triangle'));
        break;
      case 'house':
        this.woodKnock(now, .1);
        this.woodKnock(now + .1, .085);
        this.tone(523.25, now + .19, .19, .038, 'triangle');
        this.tone(659.25, now + .25, .24, .04, 'triangle');
        break;
      case 'bankrupt':
        [392, 329.63, 261.63, 196].forEach((frequency, index) =>
          this.tone(frequency, now + index * .105, .23, .042, 'triangle'));
        break;
      case 'gameOver':
        [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((frequency, index) =>
          this.tone(frequency, now + index * .11, .4, .055, index < 3 ? 'triangle' : 'sine'));
        break;
    }
  }

  private ensureContext() {
    if (this.context) return;
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.sfxBus = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.context.destination);
    this.applyLevels();
  }

  private applyLevels() {
    if (!this.context || !this.master || !this.sfxBus || !this.musicBus) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, .025);
    this.sfxBus.gain.setTargetAtTime(.82, now, .025);
    this.musicBus.gain.setTargetAtTime(this.musicEnabled ? .2 : 0, now, .08);
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    level: number,
    wave: OscillatorType = 'sine',
    endFrequency?: number,
    destination: GainNode | null = this.sfxBus,
  ) {
    if (!this.context || !destination) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, level), start + Math.min(.018, duration * .22));
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  private noise(
    start: number,
    duration: number,
    level: number,
    frequency: number,
    filterType: BiquadFilterType,
    endFrequency?: number,
    destination: GainNode | null = this.sfxBus,
  ) {
    if (!this.context || !destination) return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    filter.Q.value = filterType === 'bandpass' ? 1.4 : .72;
    if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + Math.min(.012, duration * .2));
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(start);
    source.stop(start + duration + .02);
  }

  private woodKnock(start: number, level: number) {
    this.tone(185, start, .075, level, 'sine', 92);
    this.noise(start, .045, level * .55, 780, 'bandpass');
  }

  private syncMusic() {
    if (!this.isUnlocked || this.muted || !this.musicEnabled || this.desiredScene === 'none') {
      this.stopMusic();
      return;
    }
    if (this.activeScene === this.desiredScene && this.musicTimer !== null) return;
    this.stopMusic();
    this.activeScene = this.desiredScene;
    this.musicStep = 0;
    this.scheduleMusicBar();
    this.musicTimer = window.setInterval(() => this.scheduleMusicBar(), 3200);
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.activeScene = 'none';
  }

  /** A restrained, light board-game waltz; deliberately leaves space for SFX. */
  private scheduleMusicBar() {
    if (!this.context || !this.musicBus || this.activeScene === 'none') return;
    const start = this.context.currentTime + .06;
    const gameProgressions = [
      [261.63, 329.63, 392], // C
      [220, 261.63, 329.63], // Am
      [174.61, 220, 261.63], // F
      [196, 246.94, 392], // G
    ];
    const lobbyProgressions = [gameProgressions[0], gameProgressions[2], gameProgressions[1], gameProgressions[3]];
    const progression = this.activeScene === 'lobby' ? lobbyProgressions : gameProgressions;
    const chord = progression[this.musicStep % progression.length];
    const beat = .4;

    this.tone(chord[0] / 2, start, .72, .085, 'sine', undefined, this.musicBus);
    [0, 1, 2, 1, 2, 1, 0, 2].forEach((noteIndex, index) => {
      const octave = index >= 6 ? 2 : 1;
      this.tone(chord[noteIndex] * octave, start + index * beat, .3, .04, 'triangle', undefined, this.musicBus);
    });
    if (this.musicStep % 2 === 1) {
      this.tone(chord[2] * 2, start + beat * 5, .5, .022, 'sine', undefined, this.musicBus);
    }
    this.musicStep += 1;
  }
}
