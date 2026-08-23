import { useState } from 'react';
import { Music, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useAudio } from './AudioContext';
import './AudioControl.css';

export function AudioControl() {
  const [open, setOpen] = useState(false);
  const { muted, musicEnabled, volume, unlock, setMuted, setMusicEnabled, setVolume } = useAudio();

  const togglePanel = () => {
    void unlock();
    setOpen((current) => !current);
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < .5 ? Volume1 : Volume2;

  return (
    <div className="audio-control">
      {open && (
        <div className="audio-control__panel" role="dialog" aria-label="Sound settings">
          <div className="audio-control__header">
            <strong>Sound</strong>
            <button type="button" className="audio-control__close" onClick={() => setOpen(false)} aria-label="Close sound settings">
              <X size={15} />
            </button>
          </div>
          <label className="audio-control__row">
            <Volume2 size={16} />
            <span>All sound</span>
            <button
              type="button"
              className={`audio-control__switch ${!muted ? 'is-on' : ''}`}
              onClick={() => setMuted(!muted)}
              aria-pressed={!muted}
              aria-label="Toggle all game sound"
            >
              {!muted ? 'On' : 'Off'}
            </button>
          </label>
          <label className="audio-control__row">
            <Music size={16} />
            <span>Music</span>
            <button
              type="button"
              className={`audio-control__switch ${musicEnabled ? 'is-on' : ''}`}
              onClick={() => setMusicEnabled(!musicEnabled)}
              aria-pressed={musicEnabled}
              aria-label="Toggle background music"
            >
              {musicEnabled ? 'On' : 'Off'}
            </button>
          </label>
          <label className="audio-control__volume">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Game volume"
            />
            <output>{Math.round(volume * 100)}%</output>
          </label>
        </div>
      )}
      <button
        type="button"
        className="audio-control__trigger"
        onClick={togglePanel}
        aria-label={muted ? 'Open sound settings, sound is muted' : 'Open sound settings'}
        aria-expanded={open}
        title="Sound settings"
      >
        <VolumeIcon size={19} />
      </button>
    </div>
  );
}
