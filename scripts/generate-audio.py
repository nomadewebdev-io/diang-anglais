#!/usr/bin/env python3
"""
Génération incrémentale des clips audio MP3 pour Diang-Anglais via Piper TTS.
- 6 voix (3 femmes : Aminata, Fatou, Khady ; 3 hommes : Moussa, Cheikh, Ibrahima)
- Mélange d'accents US et GB, qualité medium (22 050 Hz), licences commerciales ouvertes
- Sortie : public/audio/<voiceId>/<hash>.mp3 (SHA-1 12 caractères, MP3 mono 32 kbps, 22,05 kHz)
- Silence début/fin rogné + volume normalisé
- Génère public/audio/manifest.json
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import lameenc
import numpy as np
import onnxruntime
from piper.config import PiperConfig
from piper.voice import ESPEAK_DATA_DIR, PiperVoice

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "src" / "data"
OUTPUT_AUDIO_DIR = ROOT_DIR / "public" / "audio"
MODELS_CACHE_DIR = ROOT_DIR / ".piper-models"

HF_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
SAMPLE_PREVIEW_TEXT = "Good morning! Let's practice English together today."
TARGET_SAMPLE_RATE = 22050
DEFAULT_BITRATE_KBPS = 32
MAX_TOTAL_SIZE_BYTES = 148 * 1024 * 1024  # 148 Mo max (< 150 Mo)

VOICES_CONFIG: list[dict[str, Any]] = [
    {
        "id": "aminata",
        "name": "Aminata",
        "prenom": "Aminata",
        "gender": "female",
        "genre": "femme",
        "accent": "US",
        "locale": "en-US",
        "accentLabel": "Anglais américain (US)",
        "quality": "medium",
        "model": "en_US-kristin-medium",
        "repoPath": "en/en_US/kristin/medium/en_US-kristin-medium",
        "license": "Public Domain (LibriVox / Bryce Beattie)",
    },
    {
        "id": "fatou",
        "name": "Fatou",
        "prenom": "Fatou",
        "gender": "female",
        "genre": "femme",
        "accent": "GB",
        "locale": "en-GB",
        "accentLabel": "Anglais britannique (GB)",
        "quality": "medium",
        "model": "en_GB-cori-medium",
        "repoPath": "en/en_GB/cori/medium/en_GB-cori-medium",
        "license": "CC BY 4.0 (Hi-Fi TTS / Cori Samuel)",
    },
    {
        "id": "khady",
        "name": "Khady",
        "prenom": "Khady",
        "gender": "female",
        "genre": "femme",
        "accent": "GB",
        "locale": "en-GB",
        "accentLabel": "Anglais britannique (GB)",
        "quality": "medium",
        "model": "en_GB-alba-medium",
        "repoPath": "en/en_GB/alba/medium/en_GB-alba-medium",
        "license": "CC BY 4.0 (University of Edinburgh DataShare)",
    },
    {
        "id": "moussa",
        "name": "Moussa",
        "prenom": "Moussa",
        "gender": "male",
        "genre": "homme",
        "accent": "US",
        "locale": "en-US",
        "accentLabel": "Anglais américain (US)",
        "quality": "medium",
        "model": "en_US-joe-medium",
        "repoPath": "en/en_US/joe/medium/en_US-joe-medium",
        "license": "CC0 1.0 Universal (OHF-Voice)",
    },
    {
        "id": "cheikh",
        "name": "Cheikh",
        "prenom": "Cheikh",
        "gender": "male",
        "genre": "homme",
        "accent": "GB",
        "locale": "en-GB",
        "accentLabel": "Anglais britannique (GB)",
        "quality": "medium",
        "model": "en_GB-northern_english_male-medium",
        "repoPath": "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium",
        "license": "CC BY-SA 4.0 International (OpenSLR SLR83)",
    },
    {
        "id": "ibrahima",
        "name": "Ibrahima",
        "prenom": "Ibrahima",
        "gender": "male",
        "genre": "homme",
        "accent": "US",
        "locale": "en-US",
        "accentLabel": "Anglais américain (US)",
        "quality": "medium",
        "model": "en_US-john-medium",
        "repoPath": "en/en_US/john/medium/en_US-john-medium",
        "license": "Public Domain (LibriVox / Bryce Beattie)",
    },
]


def compute_text_hash(text: str) -> str:
    normalized = text.strip()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def collect_all_texts() -> dict[str, str]:
    """
    Collecte tous les textes anglais à synthétiser :
    - cards.json : en, example
    - sentences.json : en
    - placement.json : audioText
    - lessons.json : examples[].en (et audioText éventuel)
    - phrase fixe d'aperçu des voix dans Paramètres
    Retourne un dictionnaire { texte_normalisé: hash_12_chars }.
    """
    texts_list: list[str] = [SAMPLE_PREVIEW_TEXT]

    cards = json.loads((DATA_DIR / "cards.json").read_text(encoding="utf-8"))
    for card in cards:
        if card.get("en"):
            texts_list.append(str(card["en"]).strip())
        if card.get("example"):
            texts_list.append(str(card["example"]).strip())

    sentences = json.loads((DATA_DIR / "sentences.json").read_text(encoding="utf-8"))
    for sent in sentences:
        if sent.get("en"):
            texts_list.append(str(sent["en"]).strip())

    placement = json.loads((DATA_DIR / "placement.json").read_text(encoding="utf-8"))
    for item in placement:
        if item.get("audioText"):
            texts_list.append(str(item["audioText"]).strip())

    lessons = json.loads((DATA_DIR / "lessons.json").read_text(encoding="utf-8"))
    for lesson in lessons:
        if lesson.get("audioText"):
            texts_list.append(str(lesson["audioText"]).strip())
        for ex in lesson.get("examples", []):
            if ex.get("en"):
                texts_list.append(str(ex["en"]).strip())
        for exercise in lesson.get("exercises", []):
            if exercise.get("audioText"):
                texts_list.append(str(exercise["audioText"]).strip())

    text_to_hash: dict[str, str] = {}
    hash_to_text: dict[str, str] = {}

    for raw in texts_list:
        cleaned = raw.strip()
        if not cleaned:
            continue
        h = compute_text_hash(cleaned)
        if h in hash_to_text and hash_to_text[h] != cleaned:
            raise RuntimeError(
                f"Collision de hash SHA-1 (12 caractères) détectée : {h} entre '{hash_to_text[h]}' et '{cleaned}'"
            )
        text_to_hash[cleaned] = h
        hash_to_text[h] = cleaned

    return text_to_hash


def download_file_if_missing(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 1024:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest.with_suffix(dest.suffix + ".part")
    print(f"[download] Téléchargement de {dest.name} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "diang-anglais-tts-generator/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response, open(tmp_path, "wb") as out_file:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            out_file.write(chunk)
    os.replace(tmp_path, dest)


def ensure_voice_models_downloaded() -> None:
    MODELS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for voice in VOICES_CONFIG:
        model_name = voice["model"]
        repo_path = voice["repoPath"]
        onnx_dest = MODELS_CACHE_DIR / f"{model_name}.onnx"
        json_dest = MODELS_CACHE_DIR / f"{model_name}.onnx.json"

        download_file_if_missing(f"{HF_BASE_URL}/{repo_path}.onnx", onnx_dest)
        download_file_if_missing(f"{HF_BASE_URL}/{repo_path}.onnx.json", json_dest)


def trim_silence_and_normalize(
    audio_float: np.ndarray,
    sample_rate: int = TARGET_SAMPLE_RATE,
    silence_threshold: float = 0.0075,
    pad_ms: int = 25,
    target_peak: float = 0.89,
) -> np.ndarray:
    """
    Rogne le silence de début et de fin, ajoute une légère marge naturelle (25 ms)
    et normalise l'amplitude crête à target_peak (-1 dBFS), puis convertit en int16.
    """
    if audio_float.size == 0:
        return np.zeros(int(sample_rate * 0.1), dtype=np.int16)

    non_silent_indices = np.flatnonzero(np.abs(audio_float) > silence_threshold)
    if non_silent_indices.size > 0:
        pad_samples = int((pad_ms / 1000.0) * sample_rate)
        start_idx = max(0, int(non_silent_indices[0]) - pad_samples)
        end_idx = min(audio_float.size, int(non_silent_indices[-1]) + pad_samples + 1)
        trimmed = audio_float[start_idx:end_idx]
    else:
        trimmed = audio_float

    peak = float(np.max(np.abs(trimmed))) if trimmed.size > 0 else 0.0
    if peak > 1e-6:
        normalized = trimmed * (target_peak / peak)
    else:
        normalized = trimmed

    clipped = np.clip(normalized, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16)


def encode_pcm_to_mp3(
    pcm_int16: np.ndarray,
    sample_rate: int = TARGET_SAMPLE_RATE,
    bitrate_kbps: int = DEFAULT_BITRATE_KBPS,
) -> bytes:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(bitrate_kbps)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(5)
    mp3_data = encoder.encode(pcm_int16.tobytes())
    mp3_data += encoder.flush()
    return bytes(mp3_data)


def generate_voice_clips_worker(
    voice_cfg: dict[str, Any],
    items: list[tuple[str, str]],
    bitrate_kbps: int,
    force_regenerate: bool = False,
) -> dict[str, int]:
    voice_id = voice_cfg["id"]
    model_name = voice_cfg["model"]
    voice_out_dir = OUTPUT_AUDIO_DIR / voice_id
    voice_out_dir.mkdir(parents=True, exist_ok=True)

    missing_items: list[tuple[str, str]] = []
    skipped_count = 0

    for text, h in items:
        out_file = voice_out_dir / f"{h}.mp3"
        if not force_regenerate and out_file.exists() and out_file.stat().st_size > 120:
            skipped_count += 1
        else:
            missing_items.append((text, h))

    if not missing_items:
        print(f"[{voice_id}] 0 à générer ({skipped_count} déjà présents).", flush=True)
        return {"generated": 0, "skipped": skipped_count}

    print(
        f"[{voice_id}] Chargement du modèle {model_name} ({len(missing_items)} clips à générer, {skipped_count} déjà présents)...",
        flush=True,
    )

    onnx_path = MODELS_CACHE_DIR / f"{model_name}.onnx"
    config_path = MODELS_CACHE_DIR / f"{model_name}.onnx.json"

    with open(config_path, "r", encoding="utf-8") as f:
        config_dict = json.load(f)

    sess_options = onnxruntime.SessionOptions()
    sess_options.intra_op_num_threads = 2
    sess_options.inter_op_num_threads = 1

    piper_voice = PiperVoice(
        config=PiperConfig.from_dict(config_dict),
        session=onnxruntime.InferenceSession(
            str(onnx_path),
            sess_options=sess_options,
            providers=["CPUExecutionProvider"],
        ),
        espeak_data_dir=Path(ESPEAK_DATA_DIR),
        download_dir=MODELS_CACHE_DIR,
    )

    generated_count = 0
    t0 = time.time()

    for idx, (text, h) in enumerate(missing_items, start=1):
        out_file = voice_out_dir / f"{h}.mp3"
        tmp_file = voice_out_dir / f"{h}.{os.getpid()}.tmp.mp3"

        chunks = list(piper_voice.synthesize(text))
        if chunks:
            audio_float = np.concatenate([c.audio_float_array for c in chunks])
            sr = chunks[0].sample_rate
        else:
            audio_float = np.zeros(int(TARGET_SAMPLE_RATE * 0.15), dtype=np.float32)
            sr = TARGET_SAMPLE_RATE

        if sr != TARGET_SAMPLE_RATE and audio_float.size > 1:
            duration = audio_float.size / float(sr)
            target_len = max(1, int(round(duration * TARGET_SAMPLE_RATE)))
            x_old = np.linspace(0.0, 1.0, num=audio_float.size, endpoint=False)
            x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            audio_float = np.interp(x_new, x_old, audio_float).astype(np.float32)

        pcm_int16 = trim_silence_and_normalize(audio_float, TARGET_SAMPLE_RATE)
        mp3_bytes = encode_pcm_to_mp3(pcm_int16, TARGET_SAMPLE_RATE, bitrate_kbps)

        with open(tmp_file, "wb") as f:
            f.write(mp3_bytes)
        os.replace(tmp_file, out_file)
        generated_count += 1

        if idx % 300 == 0 or idx == len(missing_items):
            elapsed = max(0.001, time.time() - t0)
            rate = idx / elapsed
            print(
                f"[{voice_id}] {idx}/{len(missing_items)} générés ({rate:.1f} clips/s)",
                flush=True,
            )

    return {"generated": generated_count, "skipped": skipped_count}


def compute_total_audio_bytes() -> int:
    if not OUTPUT_AUDIO_DIR.exists():
        return 0
    return sum(p.stat().st_size for p in OUTPUT_AUDIO_DIR.rglob("*.mp3"))


def write_manifest(text_to_hash: dict[str, str], bitrate_kbps: int) -> None:
    OUTPUT_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    manifest_voices = [
        {
            "id": v["id"],
            "name": v["name"],
            "prenom": v["prenom"],
            "gender": v["gender"],
            "genre": v["genre"],
            "accent": v["accent"],
            "locale": v["locale"],
            "accentLabel": v["accentLabel"],
            "quality": v["quality"],
            "model": v["model"],
            "license": v["license"],
        }
        for v in VOICES_CONFIG
    ]

    manifest_data = {
        "version": 1,
        "defaultVoiceId": "aminata",
        "sampleText": SAMPLE_PREVIEW_TEXT,
        "sampleHash": compute_text_hash(SAMPLE_PREVIEW_TEXT),
        "audioSpec": {
            "format": "mp3",
            "channels": 1,
            "bitrateKbps": bitrate_kbps,
            "sampleRateHz": TARGET_SAMPLE_RATE,
        },
        "voices": manifest_voices,
        "texts": text_to_hash,
    }

    manifest_path = OUTPUT_AUDIO_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest_data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def run_generation(bitrate_kbps: int = DEFAULT_BITRATE_KBPS, force: bool = False) -> int:
    ensure_voice_models_downloaded()
    text_to_hash = collect_all_texts()
    items = sorted(text_to_hash.items(), key=lambda kv: kv[1])
    print(
        f"[audio:generate] {len(items)} textes uniques à synthétiser × {len(VOICES_CONFIG)} voix = {len(items) * len(VOICES_CONFIG)} clips MP3 ({bitrate_kbps} kbps, {TARGET_SAMPLE_RATE} Hz).",
        flush=True,
    )

    write_manifest(text_to_hash, bitrate_kbps)

    start_time = time.time()
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(
                generate_voice_clips_worker,
                voice_cfg,
                items,
                bitrate_kbps,
                force,
            ): voice_cfg["id"]
            for voice_cfg in VOICES_CONFIG
        }
        for fut in concurrent.futures.as_completed(futures):
            vid = futures[fut]
            res = fut.result()
            print(
                f"[audio:generate] Voix '{vid}' terminée : {res['generated']} générés, {res['skipped']} conservés.",
                flush=True,
            )

    total_bytes = compute_total_audio_bytes()
    total_mb = total_bytes / (1024 * 1024)
    elapsed_total = time.time() - start_time
    print(
        f"[audio:generate] Terminé en {elapsed_total:.1f}s — Poids total des audios : {total_mb:.2f} Mo ({total_bytes} octets).",
        flush=True,
    )

    if total_bytes > MAX_TOTAL_SIZE_BYTES and bitrate_kbps > 24:
        print(
            f"[audio:generate] Total ({total_mb:.1f} Mo) > 148 Mo : réduction automatique du débit MP3 à 24 kbps...",
            flush=True,
        )
        return run_generation(bitrate_kbps=24, force=True)

    return total_bytes


if __name__ == "__main__":
    run_generation()
