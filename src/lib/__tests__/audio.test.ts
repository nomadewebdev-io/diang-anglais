import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeTextHash,
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_VOICE_ID,
  getAudioClipUrl,
  getSelectedPlaybackRate,
  getSelectedVoiceId,
  playAudio,
  preloadAudioClip,
  setSelectedPlaybackRate,
  setSelectedVoiceId,
  VOICE_SAMPLE_TEXT,
  VOICES,
} from '../audio';
import {
  createInitialAppState,
  loadAppState,
  saveAppState,
} from '../storage';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('audio — voix neuronales pré-générées, persistance et repli Web Speech API', () => {
  beforeEach(() => {
    const mockStorage = createMemoryStorage();
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: mockStorage,
      },
      writable: true,
      configurable: true,
    });
    setSelectedVoiceId(DEFAULT_VOICE_ID);
    setSelectedPlaybackRate(DEFAULT_PLAYBACK_RATE);
  });

  it('expose les 6 voix sénégalaises (3 femmes, 3 hommes, accents US/GB) avec Aminata par défaut', () => {
    expect(DEFAULT_VOICE_ID).toBe('aminata');
    expect(VOICES).toHaveLength(6);

    const femaleVoices = VOICES.filter((v) => v.gender === 'female');
    const maleVoices = VOICES.filter((v) => v.gender === 'male');
    expect(femaleVoices.map((v) => v.prenom)).toEqual(['Aminata', 'Fatou', 'Khady']);
    expect(maleVoices.map((v) => v.prenom)).toEqual(['Moussa', 'Cheikh', 'Ibrahima']);

    const accents = new Set(VOICES.map((v) => v.accent));
    expect(accents.has('US')).toBe(true);
    expect(accents.has('GB')).toBe(true);
  });

  it('calcule un hash SHA-1 (12 caractères) exact et construit le chemin /audio/<voiceId>/<hash>.mp3', () => {
    const expectedHash = '44b653eb7af8';

    expect(computeTextHash(VOICE_SAMPLE_TEXT)).toBe(expectedHash);
    expect(computeTextHash(`  ${VOICE_SAMPLE_TEXT}  `)).toBe(expectedHash);
    expect(getAudioClipUrl(VOICE_SAMPLE_TEXT, 'fatou')).toBe(`/audio/fatou/${expectedHash}.mp3`);
  });

  it('mémorise et relit le choix de la voix et la vitesse de lecture dans le storage', () => {
    expect(getSelectedVoiceId()).toBe('aminata');
    expect(getSelectedPlaybackRate()).toBe(1);

    setSelectedVoiceId('cheikh');
    setSelectedPlaybackRate(1.2);

    expect(getSelectedVoiceId()).toBe('cheikh');
    expect(getSelectedPlaybackRate()).toBe(1.2);

    // Persistance via AppState complet (loadAppState / saveAppState)
    const state = createInitialAppState();
    state.voiceId = 'khady';
    state.playbackRate = 0.8;
    saveAppState(state);

    const reloaded = loadAppState();
    expect(reloaded.voiceId).toBe('khady');
    expect(reloaded.playbackRate).toBe(0.8);
    expect(getSelectedVoiceId()).toBe('khady');
    expect(getSelectedPlaybackRate()).toBe(0.8);
  });

  it('joue le clip de la voix choisie via HTMLAudioElement et précharge le prochain clip', async () => {
    const createdAudioInstances: Array<{
      src: string;
      playbackRate: number;
      preload: string;
      played: boolean;
    }> = [];

    class FakeAudio {
      src: string;
      playbackRate = 1;
      preload = 'none';
      currentTime = 0;
      played = false;

      constructor(src = '') {
        this.src = src;
        createdAudioInstances.push(this);
      }
      addEventListener() {}
      removeEventListener() {}
      load() {}
      pause() {}
      play() {
        this.played = true;
        return Promise.resolve();
      }
    }

    Object.defineProperty(globalThis, 'Audio', {
      value: FakeAudio,
      writable: true,
      configurable: true,
    });

    setSelectedVoiceId('moussa');
    setSelectedPlaybackRate(1.2);

    const res = await playAudio('Good morning!', {
      preloadNextText: 'See you tomorrow.',
    });

    expect(res.mode).toBe('neural');
    expect(res.voiceId).toBe('moussa');
    expect(res.playbackRate).toBe(1.2);
    expect(res.url).toBe(`/audio/moussa/${computeTextHash('Good morning!')}.mp3`);

    // Vérifie que le clip suivant a bien été préchargé
    const nextUrl = `/audio/moussa/${computeTextHash('See you tomorrow.')}.mp3`;
    expect(createdAudioInstances.some((a) => a.src === nextUrl)).toBe(true);

    const explicitPreload = preloadAudioClip('Thank you very much.', 'ibrahima');
    expect(explicitPreload?.src).toBe(
      `/audio/ibrahima/${computeTextHash('Thank you very much.')}.mp3`
    );
  });

  it('bascule automatiquement sur la Web Speech API si le clip MP3 est absent ou ne charge pas', async () => {
    class FailingAudio {
      src: string;
      playbackRate = 1;
      preload = 'none';
      currentTime = 0;

      constructor(src = '') {
        this.src = src;
      }
      addEventListener() {}
      removeEventListener() {}
      load() {}
      pause() {}
      play() {
        return Promise.reject(new Error('404 Not Found'));
      }
    }

    Object.defineProperty(globalThis, 'Audio', {
      value: FailingAudio,
      writable: true,
      configurable: true,
    });

    const spokenUtterances: Array<{ text: string; lang: string; rate: number }> = [];

    class FakeUtterance {
      text: string;
      lang = 'en-US';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const speakSpy = vi.fn((u: FakeUtterance) => {
      spokenUtterances.push({ text: u.text, lang: u.lang, rate: u.rate });
    });

    Object.defineProperty(globalThis.window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.window, 'speechSynthesis', {
      value: {
        cancel: vi.fn(),
        getVoices: () => [],
        speak: speakSpy,
      },
      writable: true,
      configurable: true,
    });

    setSelectedVoiceId('fatou'); // Voix britannique (en-GB)
    setSelectedPlaybackRate(0.8);

    const fallbackResult = await playAudio('Where is the train station?');

    expect(fallbackResult.mode).toBe('webspeech');
    expect(fallbackResult.voiceId).toBe('fatou');
    expect(fallbackResult.playbackRate).toBe(0.8);
    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0]).toEqual({
      text: 'Where is the train station?',
      lang: 'en-GB',
      rate: 0.8,
    });
  });
});
