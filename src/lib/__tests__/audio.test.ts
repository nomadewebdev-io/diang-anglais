import { beforeEach, describe, expect, it, vi } from 'vitest';
import raguiManifest from '../../../public/audio/ragui/manifest.json';
import fatouSarreManifest from '../../../public/audio/fatou-sarre/manifest.json';
import omareManifest from '../../../public/audio/omare/manifest.json';
import boubacarManifest from '../../../public/audio/boubacar/manifest.json';
import {
  computeTextHash,
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_VOICE_ID,
  extractClipBlob,
  getAudioClipUrl,
  getSelectedPlaybackRate,
  getSelectedVoiceId,
  loadVoiceManifest,
  migrateVoiceId,
  playAudio,
  preloadAudioClip,
  resetAudioCachesForTest,
  setSelectedPlaybackRate,
  setSelectedVoiceId,
  stopSpeaking,
  VOICE_SAMPLE_TEXT,
  VOICES,
} from '../audio';
import {
  createInitialAppState,
  loadAppState,
  loadMultiProfileStore,
  MULTI_PROFILE_STORAGE_KEY,
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

  it('expose les 4 voix en parité (2 femmes, 2 hommes, accents US/GB) avec Ragui par défaut', () => {
    expect(DEFAULT_VOICE_ID).toBe('ragui');
    expect(VOICES).toHaveLength(4);

    const femaleVoices = VOICES.filter((v) => v.gender === 'female');
    const maleVoices = VOICES.filter((v) => v.gender === 'male');
    expect(femaleVoices.map((v) => v.prenom)).toEqual(['Ragui', 'Fatou Sarre']);
    expect(maleVoices.map((v) => v.prenom)).toEqual(['Omare', 'Boubacar']);
    expect(VOICES.map((v) => v.id)).toEqual(['ragui', 'fatou-sarre', 'omare', 'boubacar']);

    const accents = new Set(VOICES.map((v) => v.accent));
    expect(accents.has('US')).toBe(true);
    expect(accents.has('GB')).toBe(true);
  });

  it('calcule un hash SHA-1 (12 caractères) exact et construit le chemin /audio/<voiceId>/<hash>.mp3', () => {
    const expectedHash = '44b653eb7af8';

    expect(computeTextHash(VOICE_SAMPLE_TEXT)).toBe(expectedHash);
    expect(computeTextHash(`  ${VOICE_SAMPLE_TEXT}  `)).toBe(expectedHash);
    expect(getAudioClipUrl(VOICE_SAMPLE_TEXT, 'fatou-sarre')).toBe(`/audio/fatou-sarre/${expectedHash}.mp3`);
  });

  it('mémorise et relit le choix de la voix et la vitesse de lecture dans le storage', () => {
    expect(getSelectedVoiceId()).toBe('ragui');
    expect(getSelectedPlaybackRate()).toBe(1);

    setSelectedVoiceId('omare');
    setSelectedPlaybackRate(1.2);

    expect(getSelectedVoiceId()).toBe('omare');
    expect(getSelectedPlaybackRate()).toBe(1.2);

    // Persistance via AppState complet (loadAppState / saveAppState)
    const state = createInitialAppState();
    state.voiceId = 'boubacar';
    state.playbackRate = 0.8;
    saveAppState(state);

    const reloaded = loadAppState();
    expect(reloaded.voiceId).toBe('boubacar');
    expect(reloaded.playbackRate).toBe(0.8);
    expect(getSelectedVoiceId()).toBe('boubacar');
    expect(getSelectedPlaybackRate()).toBe(0.8);
  });

  it('joue le clip de la voix choisie via HTMLAudioElement et précharge le paquet suivant', async () => {
    resetAudioCachesForTest();
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

    const hash1 = computeTextHash('Good morning!');
    const hash2 = computeTextHash('See you tomorrow.');
    const fakePackBlob = new Blob([new Uint8Array(20)], { type: 'application/octet-stream' });
    const fetchedUrls: string[] = [];

    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        if (url.endsWith('/omare/manifest.json')) {
          return {
            ok: true,
            json: async () => ({
              version: 2,
              voiceId: 'omare',
              packs: { 'adult-a1': { size: 20, count: 2 } },
              clips: {
                [hash1]: ['adult-a1', 0, 10],
                [hash2]: ['adult-a1', 10, 10],
              },
            }),
          };
        }
        if (url.endsWith('/omare/adult-a1.bin')) {
          return { ok: true, blob: async () => fakePackBlob };
        }
        return { ok: false };
      }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'URL', {
      value: {
        createObjectURL: vi.fn(() => 'blob:omare-1'),
        revokeObjectURL: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    setSelectedVoiceId('omare');
    setSelectedPlaybackRate(1.2);

    const res = await playAudio('Good morning!', {
      preloadNextText: 'See you tomorrow.',
    });

    expect(res.mode).toBe('neural');
    expect(res.voiceId).toBe('omare');
    expect(res.playbackRate).toBe(1.2);
    expect(res.url).toBe(`/audio/omare/${hash1}.mp3`);
    expect(createdAudioInstances[0].src).toBe('blob:omare-1');
    expect(fetchedUrls).toContain('/audio/omare/manifest.json');
    expect(fetchedUrls).toContain('/audio/omare/adult-a1.bin');
    expect(preloadAudioClip('Thank you very much.', 'boubacar')).toBeNull();
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

    setSelectedVoiceId('fatou-sarre'); // Voix britannique (en-GB)
    setSelectedPlaybackRate(0.8);

    const fallbackResult = await playAudio('Where is the train station?');

    expect(fallbackResult.mode).toBe('webspeech');
    expect(fallbackResult.voiceId).toBe('fatou-sarre');
    expect(fallbackResult.playbackRate).toBe(0.8);
    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0]).toEqual({
      text: 'Where is the train station?',
      lang: 'en-GB',
      rate: 0.8,
    });
  });

  it('extrait un clip depuis un paquet .bin via Blob.slice et révoque l’URL d’objet après lecture', async () => {
    resetAudioCachesForTest();
    const text = 'Good morning!';
    const hash = computeTextHash(text);
    const fakePackBytes = new Uint8Array([1, 2, 3, 10, 20, 30, 40, 50, 9, 9]);
    const fakePackBlob = new Blob([fakePackBytes], { type: 'application/octet-stream' });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/ragui/manifest.json')) {
        return {
          ok: true,
          json: async () => ({
            version: 2,
            voiceId: 'ragui',
            packs: { 'adult-a1': { size: 10, count: 1 } },
            clips: { [hash]: ['adult-a1', 3, 5] },
          }),
        };
      }
      if (url.endsWith('/ragui/adult-a1.bin')) {
        return {
          ok: true,
          blob: async () => fakePackBlob,
        };
      }
      return { ok: false };
    });

    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const extracted = await extractClipBlob(text, 'ragui');
    expect(extracted).not.toBeNull();
    expect(extracted!.size).toBe(5);
    expect(extracted!.type).toBe('audio/mpeg');
    const buf = new Uint8Array(await extracted!.arrayBuffer());
    expect(Array.from(buf)).toEqual([10, 20, 30, 40, 50]);

    const createObjectURLSpy = vi.fn(() => 'blob:clip-1');
    const revokeObjectURLSpy = vi.fn();
    Object.defineProperty(globalThis, 'URL', {
      value: {
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      },
      writable: true,
      configurable: true,
    });

    let endedHandler: (() => void) | null = null;
    class PackAudio {
      src: string;
      preload = 'auto';
      playbackRate = 1;
      currentTime = 0;
      constructor(src = '') {
        this.src = src;
      }
      addEventListener(evt: string, cb: () => void) {
        if (evt === 'ended') endedHandler = cb;
      }
      removeEventListener() {}
      pause() {}
      play() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, 'Audio', {
      value: PackAudio,
      writable: true,
      configurable: true,
    });

    const playRes = await playAudio(text, { voiceId: 'ragui' });
    expect(playRes.mode).toBe('neural');
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(endedHandler).not.toBeNull();
    endedHandler!();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:clip-1');
  });

  it('bascule sur Web Speech API si le manifest est manquant (404)', async () => {
    resetAudioCachesForTest();
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async () => ({ ok: false, status: 404 })),
      writable: true,
      configurable: true,
    });
    const speakSpy = vi.fn();
    Object.defineProperty(globalThis.window, 'SpeechSynthesisUtterance', {
      value: class {
        text: string;
        lang = 'en-US';
        rate = 1;
        pitch = 1;
        voice = null;
        constructor(t: string) {
          this.text = t;
        }
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.window, 'speechSynthesis', {
      value: { cancel: vi.fn(), getVoices: () => [], speak: speakSpy },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Audio', {
      value: class {
        addEventListener() {}
        removeEventListener() {}
        pause() {}
        play() {
          return Promise.resolve();
        }
      },
      writable: true,
      configurable: true,
    });

    const res = await playAudio('Missing manifest clip', { voiceId: 'fatou-sarre' });
    expect(res.mode).toBe('webspeech');
    expect(speakSpy).toHaveBeenCalledTimes(1);
    stopSpeaking();
  });

  it('migre proprement les anciens identifiants de voix (adulte et enfant) vers les 4 voix actuelles', () => {
    expect(migrateVoiceId('aminata')).toBe('ragui');
    expect(migrateVoiceId('fatou')).toBe('fatou-sarre');
    expect(migrateVoiceId('khady')).toBe('fatou-sarre');
    expect(migrateVoiceId('moussa')).toBe('omare');
    expect(migrateVoiceId('ibrahima')).toBe('omare');
    expect(migrateVoiceId('cheikh')).toBe('boubacar');
    expect(migrateVoiceId('inconnue')).toBe('ragui');
    expect(migrateVoiceId(undefined)).toBe('ragui');

    const adultState = createInitialAppState();
    const childState = createInitialAppState();
    const legacyStore = {
      version: 2,
      activeProfileId: 'child-1',
      profiles: [
        {
          id: 'adult-1',
          name: 'Awa',
          mode: 'adult',
          createdAt: '2026-01-01T00:00:00Z',
          state: { ...adultState, voiceId: 'ibrahima' },
        },
        {
          id: 'child-1',
          name: 'Moussa',
          mode: 'child',
          createdAt: '2026-01-01T00:00:00Z',
          state: { ...childState, voiceId: 'khady' },
        },
      ],
    };
    window.localStorage.setItem(MULTI_PROFILE_STORAGE_KEY, JSON.stringify(legacyStore));

    const migratedStore = loadMultiProfileStore();
    expect(migratedStore.profiles.find((p) => p.id === 'adult-1')?.state.voiceId).toBe('omare');
    expect(migratedStore.profiles.find((p) => p.id === 'child-1')?.state.voiceId).toBe('fatou-sarre');

    window.localStorage.setItem(
      'diang-anglais:v1',
      JSON.stringify({ ...adultState, voiceId: 'khady' })
    );
    expect(loadAppState().voiceId).toBe('fatou-sarre');
  });

  it('charge le manifest réel de chacune des 4 voix générées', async () => {
    resetAudioCachesForTest();
    const manifestsByVoice: Record<string, unknown> = {
      ragui: raguiManifest,
      'fatou-sarre': fatouSarreManifest,
      omare: omareManifest,
      boubacar: boubacarManifest,
    };
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(async (url: string) => {
        const match = url.match(/^\/audio\/([^/]+)\/manifest\.json$/);
        if (!match || !manifestsByVoice[match[1]]) return { ok: false, status: 404 };
        return {
          ok: true,
          json: async () => manifestsByVoice[match[1]],
        };
      }),
      writable: true,
      configurable: true,
    });

    for (const voice of VOICES) {
      const manifest = await loadVoiceManifest(voice.id);
      expect(manifest).not.toBeNull();
      expect(manifest!.voiceId).toBe(voice.id);
      expect(Object.keys(manifest!.packs).length).toBeGreaterThan(0);
      expect(Object.keys(manifest!.clips).length).toBeGreaterThan(0);
    }
  });
});
