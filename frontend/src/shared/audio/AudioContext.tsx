import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AudioEngine, MusicScene, SoundEffect } from './audio-engine';

interface SavedAudioSettings {
  muted: boolean;
  musicEnabled: boolean;
  volume: number;
}

interface AudioContextValue extends SavedAudioSettings {
  play: (effect: SoundEffect) => void;
  unlock: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setScene: (scene: MusicScene) => void;
}

const STORAGE_KEY = 'mathopoly.audio.v1';
const DEFAULTS: SavedAudioSettings = { muted: false, musicEnabled: true, volume: .7 };
const GameAudioContext = createContext<AudioContextValue | null>(null);

function loadSettings(): SavedAudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SavedAudioSettings> | null;
    return {
      muted: typeof saved?.muted === 'boolean' ? saved.muted : DEFAULTS.muted,
      musicEnabled: typeof saved?.musicEnabled === 'boolean' ? saved.musicEnabled : DEFAULTS.musicEnabled,
      volume: typeof saved?.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    engine.setMuted(settings.muted);
    engine.setMusicEnabled(settings.musicEnabled);
    engine.setVolume(settings.volume);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Audio still works when storage is unavailable (private/locked-down mode).
    }
  }, [engine, settings]);

  useEffect(() => {
    const unlock = () => void engine.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true, once: true });
    document.addEventListener('keydown', unlock, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      engine.pause();
    };
  }, [engine]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) engine.pause();
      else void engine.unlock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [engine]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('button');
      if (button && !button.hasAttribute('disabled')) engine.play('uiClick');
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [engine]);

  const play = useCallback((effect: SoundEffect) => engine.play(effect), [engine]);
  const unlock = useCallback(() => engine.unlock(), [engine]);
  const setMuted = useCallback((muted: boolean) => setSettings((current) => ({ ...current, muted })), []);
  const setMusicEnabled = useCallback((musicEnabled: boolean) => setSettings((current) => ({ ...current, musicEnabled })), []);
  const setVolume = useCallback((volume: number) => setSettings((current) => ({ ...current, volume })), []);
  const setScene = useCallback((scene: MusicScene) => engine.setScene(scene), [engine]);

  return (
    <GameAudioContext.Provider value={{ ...settings, play, unlock, setMuted, setMusicEnabled, setVolume, setScene }}>
      {children}
    </GameAudioContext.Provider>
  );
}

export function useAudio() {
  const value = useContext(GameAudioContext);
  if (!value) throw new Error('useAudio must be used inside AudioProvider');
  return value;
}

export function useAudioScene(scene: MusicScene) {
  const { setScene } = useAudio();
  useEffect(() => {
    setScene(scene);
    return () => setScene('none');
  }, [scene, setScene]);
}
