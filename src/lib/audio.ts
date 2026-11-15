import { PlaybackSpeed, VoiceId, VoiceProfile } from './types';

export const DEFAULT_VOICE_ID: VoiceId = 'aminata';
export const DEFAULT_PLAYBACK_RATE: PlaybackSpeed = 1;
export const VOICE_SAMPLE_TEXT = "Good morning! Let's practice English together today.";

export const VOICES: VoiceProfile[] = [
  {
    id: 'aminata',
    name: 'Aminata',
    prenom: 'Aminata',
    gender: 'female',
    genre: 'femme',
    accent: 'US',
    locale: 'en-US',
    accentLabel: 'Anglais américain (US)',
    model: 'en_US-kristin-medium',
    license: 'Public Domain',
  },
  {
    id: 'fatou',
    name: 'Fatou',
    prenom: 'Fatou',
    gender: 'female',
    genre: 'femme',
    accent: 'GB',
    locale: 'en-GB',
    accentLabel: 'Anglais britannique (GB)',
    model: 'en_GB-cori-medium',
    license: 'CC BY 4.0',
  },
  {
    id: 'khady',
    name: 'Khady',
    prenom: 'Khady',
    gender: 'female',
    genre: 'femme',
    accent: 'GB',
    locale: 'en-GB',
    accentLabel: 'Anglais britannique (GB)',
    model: 'en_GB-alba-medium',
    license: 'CC BY 4.0',
  },
  {
    id: 'moussa',
    name: 'Moussa',
    prenom: 'Moussa',
    gender: 'male',
    genre: 'homme',
    accent: 'US',
    locale: 'en-US',
    accentLabel: 'Anglais américain (US)',
    model: 'en_US-joe-medium',
    license: 'CC0 1.0',
  },
  {
    id: 'cheikh',
    name: 'Cheikh',
    prenom: 'Cheikh',
    gender: 'male',
    genre: 'homme',
    accent: 'GB',
    locale: 'en-GB',
    accentLabel: 'Anglais britannique (GB)',
    model: 'en_GB-northern_english_male-medium',
    license: 'CC BY-SA 4.0',
  },
  {
    id: 'ibrahima',
    name: 'Ibrahima',
    prenom: 'Ibrahima',
    gender: 'male',
    genre: 'homme',
    accent: 'US',
    locale: 'en-US',
    accentLabel: 'Anglais américain (US)',
    model: 'en_US-john-medium',
    license: 'Public Domain',
  },
];

export const PLAYBACK_SPEED_OPTIONS: Array<{
  rate: PlaybackSpeed;
  label: string;
  shortLabel: string;
}> = [
  { rate: 0.8, label: 'Lente (0,8x)', shortLabel: '0,8x' },
  { rate: 1, label: 'Normale (1,0x)', shortLabel: '1,0x' },
  { rate: 1.2, label: 'Rapide (1,2x)', shortLabel: '1,2x' },
];

const VALID_VOICE_IDS = new Set<VoiceId>(VOICES.map((v) => v.id));
const VALID_PLAYBACK_RATES = new Set<number>([0.8, 1, 1.2]);
const STORAGE_KEY = 'diang-anglais:v1';

let activeVoiceId: VoiceId = DEFAULT_VOICE_ID;
let activePlaybackRate: PlaybackSpeed = DEFAULT_PLAYBACK_RATE;
let currentAudioElement: HTMLAudioElement | null = null;
const preloadedClips = new Map<string, HTMLAudioElement>();
const MAX_PRELOAD_CACHE = 16;

export function isValidVoiceId(val: unknown): val is VoiceId {
  return typeof val === 'string' && VALID_VOICE_IDS.has(val as VoiceId);
}

export function isValidPlaybackSpeed(val: unknown): val is PlaybackSpeed {
  return typeof val === 'number' && VALID_PLAYBACK_RATES.has(val);
}

export function getVoiceProfile(voiceId: VoiceId): VoiceProfile {
  return VOICES.find((v) => v.id === voiceId) ?? VOICES[0];
}

/**
 * Implémentation pure JS de SHA-1 (RFC 3174) sur la chaîne UTF-8 normalisée (`text.trim()`)
 * retournant les 12 premiers caractères hexadécimaux.
 */
export function computeTextHash(text: string): string {
  const normalized = String(text ?? '').trim();
  const bytes = new TextEncoder().encode(normalized);

  const ml = bytes.length * 8;
  const withOne = bytes.length + 1;
  const padLen = (64 - ((withOne + 8) % 64)) % 64;
  const totalLen = withOne + padLen + 8;

  const buffer = new Uint8Array(totalLen);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  const highBits = Math.floor(ml / 0x100000000);
  const lowBits = ml >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  const rotl = (n: number, s: number) => ((n << s) | (n >>> (32 - s))) >>> 0;

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const hex = [h0, h1, h2, h3, h4]
    .map((h) => h.toString(16).padStart(8, '0'))
    .join('');

  return hex.slice(0, 12);
}

function readStoredAudioSettings(): { voiceId: VoiceId; playbackRate: PlaybackSpeed } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const voiceId = isValidVoiceId(parsed.voiceId) ? parsed.voiceId : activeVoiceId;
        const playbackRate = isValidPlaybackSpeed(parsed.playbackRate)
          ? parsed.playbackRate
          : activePlaybackRate;
        activeVoiceId = voiceId;
        activePlaybackRate = playbackRate;
        return { voiceId, playbackRate };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return { voiceId: activeVoiceId, playbackRate: activePlaybackRate };
}

function persistAudioSettingsToStorage(
  updates: Partial<{ voiceId: VoiceId; playbackRate: PlaybackSpeed }>
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next = {
      ...parsed,
      ...(updates.voiceId ? { voiceId: updates.voiceId } : {}),
      ...(updates.playbackRate ? { playbackRate: updates.playbackRate } : {}),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write errors
  }
}

export function getSelectedVoiceId(): VoiceId {
  return readStoredAudioSettings().voiceId;
}

export function setSelectedVoiceId(voiceId: VoiceId): void {
  if (!isValidVoiceId(voiceId)) return;
  activeVoiceId = voiceId;
  persistAudioSettingsToStorage({ voiceId });
}

export function getSelectedPlaybackRate(): PlaybackSpeed {
  return readStoredAudioSettings().playbackRate;
}

export function setSelectedPlaybackRate(rate: PlaybackSpeed): void {
  if (!isValidPlaybackSpeed(rate)) return;
  activePlaybackRate = rate;
  persistAudioSettingsToStorage({ playbackRate: rate });
}

export function syncAudioPreferences(
  voiceId: VoiceId,
  playbackRate: PlaybackSpeed
): void {
  if (isValidVoiceId(voiceId)) {
    activeVoiceId = voiceId;
  }
  if (isValidPlaybackSpeed(playbackRate)) {
    activePlaybackRate = playbackRate;
  }
}

export function getAudioClipUrl(
  text: string,
  voiceId: VoiceId = getSelectedVoiceId()
): string {
  const hash = computeTextHash(text);
  return `/audio/${voiceId}/${hash}.mp3`;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function speakWithWebSpeechFallback(
  text: string,
  rate = 1.0,
  locale: 'en-US' | 'en-GB' = 'en-US'
): boolean {
  if (!isSpeechSynthesisSupported() || !text.trim()) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text.trim());
    utterance.lang = locale;
    utterance.rate = Math.min(2.0, Math.max(0.5, rate));
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice =
      voices.find((v) => v.lang === locale && v.localService) ||
      voices.find((v) => v.lang === locale) ||
      voices.find((v) => v.lang.startsWith('en'));

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Ignore HTMLAudioElement stop errors
    }
    currentAudioElement = null;
  }

  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore Web Speech cancel errors
    }
  }
}

/**
 * Précharge le prochain clip audio dans un élément HTMLAudioElement en mémoire
 * afin que sa lecture suivante démarre instantanément.
 */
export function preloadAudioClip(
  text: string,
  voiceId: VoiceId = getSelectedVoiceId()
): HTMLAudioElement | null {
  const cleaned = String(text ?? '').trim();
  if (!cleaned || typeof Audio === 'undefined') {
    return null;
  }

  const url = getAudioClipUrl(cleaned, voiceId);
  if (preloadedClips.has(url)) {
    return preloadedClips.get(url)!;
  }

  try {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    if (typeof audio.load === 'function') {
      audio.load();
    }

    if (preloadedClips.size >= MAX_PRELOAD_CACHE) {
      const oldestKey = preloadedClips.keys().next().value;
      if (oldestKey) {
        preloadedClips.delete(oldestKey);
      }
    }
    preloadedClips.set(url, audio);
    return audio;
  } catch {
    return null;
  }
}

export interface PlayAudioOptions {
  voiceId?: VoiceId;
  playbackRate?: number;
  preloadNextText?: string;
}

export interface PlayAudioResult {
  mode: 'neural' | 'webspeech' | 'none';
  url?: string;
  voiceId: VoiceId;
  playbackRate: number;
}

/**
 * Joue le clip MP3 pré-généré de la voix choisie via HTMLAudioElement,
 * précharge le prochain clip si fourni, et bascule automatiquement
 * sur la Web Speech API si le fichier audio est absent ou ne charge pas.
 */
export async function playAudio(
  text: string,
  options: PlayAudioOptions = {}
): Promise<PlayAudioResult> {
  const cleaned = String(text ?? '').trim();
  const stored = readStoredAudioSettings();
  const voiceId: VoiceId =
    options.voiceId && isValidVoiceId(options.voiceId)
      ? options.voiceId
      : stored.voiceId;
  const effectiveRate =
    typeof options.playbackRate === 'number' && options.playbackRate > 0
      ? options.playbackRate
      : stored.playbackRate;

  if (!cleaned) {
    return { mode: 'none', voiceId, playbackRate: effectiveRate };
  }

  stopSpeaking();

  if (options.preloadNextText) {
    preloadAudioClip(options.preloadNextText, voiceId);
  }

  const profile = getVoiceProfile(voiceId);
  const url = getAudioClipUrl(cleaned, voiceId);

  if (typeof Audio !== 'undefined') {
    try {
      const cachedAudio = preloadedClips.get(url);
      const audio = cachedAudio ?? new Audio(url);
      if (!cachedAudio) {
        audio.preload = 'auto';
      } else {
        audio.currentTime = 0;
      }
      audio.playbackRate = effectiveRate;
      currentAudioElement = audio;

      const played = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          audio.removeEventListener('error', onError);
          resolve(ok);
        };

        const onError = () => finish(false);
        audio.addEventListener('error', onError, { once: true });

        try {
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(() => finish(true)).catch(() => finish(false));
          } else {
            finish(true);
          }
        } catch {
          finish(false);
        }
      });

      if (played) {
        return {
          mode: 'neural',
          url,
          voiceId,
          playbackRate: effectiveRate,
        };
      }
    } catch {
      // En cas d'échec HTMLAudioElement, repli vers Web Speech API ci-dessous
    }
  }

  const fallbackOk = speakWithWebSpeechFallback(cleaned, effectiveRate, profile.locale);
  return {
    mode: fallbackOk ? 'webspeech' : 'none',
    url,
    voiceId,
    playbackRate: effectiveRate,
  };
}

/**
 * Fonction utilitaire appelée dans les écrans d'apprentissage (flashcards, dictée,
 * leçons, quiz, compréhension orale du test de niveau) :
 * - Utilise la voix choisie par l'utilisateur (Aminata par défaut)
 * - Applique la vitesse choisie dans Paramètres (ou un multiplicateur lent si demandé)
 * - Précharge le prochain clip si indiqué
 */
export function speakEnglish(
  text: string,
  rateHint?: number,
  options?: { voiceId?: VoiceId; preloadNextText?: string }
): boolean {
  const cleaned = String(text ?? '').trim();
  if (!cleaned) return false;

  const userRate = getSelectedPlaybackRate();
  // Si un bouton "Écoute lente" passe un rateHint <= 0.76, on applique une lecture ralentie (0.8x)
  const effectiveRate =
    typeof rateHint === 'number' && rateHint <= 0.78
      ? 0.8
      : typeof rateHint === 'number' && (rateHint === 0.8 || rateHint === 1 || rateHint === 1.2)
      ? rateHint
      : userRate;

  void playAudio(cleaned, {
    voiceId: options?.voiceId,
    playbackRate: effectiveRate,
    preloadNextText: options?.preloadNextText,
  });

  return true;
}
