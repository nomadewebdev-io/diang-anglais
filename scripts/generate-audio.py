#!/usr/bin/env python3
"""
Génération incrémentale des paquets audio MP3 pour Diang-Anglais via Piper TTS.
- 4 voix en parité (2 femmes : Ragui US, Fatou Sarre GB ; 2 hommes : Omare US, Boubacar GB)
- Mélange d'accents US et GB, qualité medium (22 050 Hz), licences commerciales ouvertes
- Sortie : public/audio/<voiceId>/<packId>.bin + manifest.json (MP3 mono 24 kbps, 22,05 kHz)
- Silence début/fin rogné + volume normalisé
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
AUDIO_CACHE_DIR = ROOT_DIR / "audio-cache"
OUTPUT_AUDIO_DIR = ROOT_DIR / "public" / "audio"
MODELS_CACHE_DIR = ROOT_DIR / ".piper-models"

HF_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
SAMPLE_PREVIEW_TEXT = "Good morning! Let's practice English together today."
TARGET_SAMPLE_RATE = 22050
DEFAULT_BITRATE_KBPS = 24
TARGET_PACK_MAX_BYTES = 2_600_000  # Cible 1-3 Mo par paquet
HARD_PACK_MAX_BYTES = 4_900_000    # Toujours < 5 Mo
MAX_TOTAL_SIZE_BYTES = 148 * 1024 * 1024  # 148 Mo max (< 150 Mo)

VOICES_CONFIG: list[dict[str, Any]] = [
    {
        "id": "ragui",
        "name": "Ragui",
        "prenom": "Ragui",
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
        "id": "fatou-sarre",
        "name": "Fatou Sarre",
        "prenom": "Fatou Sarre",
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
        "id": "omare",
        "name": "Omare",
        "prenom": "Omare",
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
        "id": "boubacar",
        "name": "Boubacar",
        "prenom": "Boubacar",
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
]


def compute_text_hash(text: str) -> str:
    normalized = text.strip()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def _load_json_group(base_dir: Path, name: str) -> list[dict[str, Any]]:
    single = base_dir / f"{name}.json"
    if single.exists():
        return json.loads(single.read_text(encoding="utf-8"))
    split_dir = base_dir / name
    if split_dir.exists():
        items: list[dict[str, Any]] = []
        for p in sorted(split_dir.glob("*.json")):
            items.extend(json.loads(p.read_text(encoding="utf-8")))
        return items
    return []


def collect_unit_texts() -> tuple[list[tuple[str, list[tuple[str, str]]]], dict[str, str]]:
    """
    Collecte tous les textes anglais regroupés par unité d'apprentissage ordonnée
    (shared-core, adult-a1..b2, kids-a0..a2), en dédoublonnant les textes identiques.
    """
    unit_order = [
        "shared-core",
        "adult-a1",
        "adult-a2",
        "adult-b1",
        "adult-b2",
        "kids-a0",
        "kids-a1",
        "kids-a2",
    ]
    buckets: dict[str, list[str]] = {u: [] for u in unit_order}
    buckets["shared-core"].append(SAMPLE_PREVIEW_TEXT)

    def add_to(unit_key: str, text: Any) -> None:
        if text and isinstance(text, str):
            t = text.strip()
            if t and unit_key in buckets:
                buckets[unit_key].append(t)

    for card in _load_json_group(DATA_DIR, "cards"):
        u = f"adult-{str(card.get('level', 'A1')).lower()}"
        add_to(u, card.get("en"))
        add_to(u, card.get("example"))
    for sent in _load_json_group(DATA_DIR, "sentences"):
        u = f"adult-{str(sent.get('level', 'A1')).lower()}"
        add_to(u, sent.get("en"))
    for q in _load_json_group(DATA_DIR, "placement"):
        u = f"adult-{str(q.get('level', 'A1')).lower()}"
        add_to(u, q.get("audioText"))
    for lesson in _load_json_group(DATA_DIR, "lessons"):
        u = f"adult-{str(lesson.get('level', 'A1')).lower()}"
        add_to(u, lesson.get("audioText"))
        for ex in lesson.get("examples", []):
            add_to(u, ex.get("en"))
        for exer in lesson.get("exercises", []):
            add_to(u, exer.get("audioText"))
    for item in _load_json_group(DATA_DIR, "constructions"):
        u = f"adult-{str(item.get('level', 'A1')).lower()}"
        answers = item.get("answers", [])
        if isinstance(answers, list) and answers:
            add_to(u, answers[0])

    kids_dir = DATA_DIR / "kids"
    if kids_dir.exists():
        for card in _load_json_group(kids_dir, "cards"):
            u = f"kids-{str(card.get('level', 'A0')).lower()}"
            add_to(u, card.get("en"))
            add_to(u, card.get("example"))
        for sent in _load_json_group(kids_dir, "sentences"):
            u = f"kids-{str(sent.get('level', 'A0')).lower()}"
            add_to(u, sent.get("en"))
        for q in _load_json_group(kids_dir, "placement"):
            u = f"kids-{str(q.get('level', 'A0')).lower()}"
            add_to(u, q.get("audioText"))
        for lesson in _load_json_group(kids_dir, "lessons"):
            u = f"kids-{str(lesson.get('level', 'A0')).lower()}"
            for ex in lesson.get("examples", []):
                add_to(u, ex.get("en"))
        for item in _load_json_group(kids_dir, "constructions"):
            u = f"kids-{str(item.get('level', 'A0')).lower()}"
            answers = item.get("answers", [])
            if isinstance(answers, list) and answers:
                add_to(u, answers[0])

    text_to_hash: dict[str, str] = {}
    hash_to_text: dict[str, str] = {}
    grouped_items: list[tuple[str, list[tuple[str, str]]]] = []

    for unit_key in unit_order:
        unit_items: list[tuple[str, str]] = []
        for raw in buckets[unit_key]:
            if raw in text_to_hash:
                continue
            h = compute_text_hash(raw)
            if h in hash_to_text and hash_to_text[h] != raw:
                raise RuntimeError(
                    f"Collision SHA-1 (12 chars) : {h} entre '{hash_to_text[h]}' et '{raw}'"
                )
            text_to_hash[raw] = h
            hash_to_text[h] = raw
            unit_items.append((raw, h))
        if unit_items:
            grouped_items.append((unit_key, unit_items))

    return grouped_items, text_to_hash


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
    voice_cache_dir = AUDIO_CACHE_DIR / voice_id
    voice_out_dir = OUTPUT_AUDIO_DIR / voice_id
    voice_cache_dir.mkdir(parents=True, exist_ok=True)
    voice_out_dir.mkdir(parents=True, exist_ok=True)

    # Migrer d'éventuels anciens clips .mp3 de public/audio/<voiceId>/ vers audio-cache/<voiceId>/
    for old_mp3 in voice_out_dir.glob("*.mp3"):
        dest_cache = voice_cache_dir / old_mp3.name
        if not dest_cache.exists():
            os.replace(old_mp3, dest_cache)
        else:
            old_mp3.unlink()

    missing_items: list[tuple[str, str]] = []
    skipped_count = 0

    for text, h in items:
        out_file = voice_cache_dir / f"{h}.mp3"
        if not force_regenerate and out_file.exists() and out_file.stat().st_size > 120:
            skipped_count += 1
        else:
            missing_items.append((text, h))

    if not missing_items:
        print(f"[{voice_id}] 0 à générer ({skipped_count} en cache).", flush=True)
        return {"generated": 0, "skipped": skipped_count}

    print(
        f"[{voice_id}] Synthèse de {len(missing_items)} clips manquants vers audio-cache/ ({skipped_count} en cache)...",
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
        out_file = voice_cache_dir / f"{h}.mp3"
        tmp_file = voice_cache_dir / f"{h}.{os.getpid()}.tmp.mp3"

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
    return sum(
        p.stat().st_size
        for p in OUTPUT_AUDIO_DIR.rglob("*")
        if p.is_file() and p.suffix in (".bin", ".json")
    )


def build_voice_packs(
    voice_id: str,
    grouped_items: list[tuple[str, list[tuple[str, str]]]],
) -> dict[str, Any]:
    voice_cache_dir = AUDIO_CACHE_DIR / voice_id
    voice_out_dir = OUTPUT_AUDIO_DIR / voice_id
    voice_out_dir.mkdir(parents=True, exist_ok=True)

    packs_meta: dict[str, dict[str, int]] = {}
    clips_index: dict[str, list[Any]] = {}
    expected_bin_files: set[str] = set()

    for unit_key, unit_items in grouped_items:
        part = 1
        chunks_buf: list[bytes] = []
        chunk_entries: list[tuple[str, int, int]] = []
        current_offset = 0

        def flush_pack(pack_suffix: str) -> None:
            nonlocal chunks_buf, chunk_entries, current_offset
            if not chunk_entries:
                return
            pack_id = f"{unit_key}-{pack_suffix}" if part > 1 or len(unit_items) > len(chunk_entries) else unit_key
            pack_filename = f"{pack_id}.bin"
            expected_bin_files.add(pack_filename)
            pack_bytes = b"".join(chunks_buf)
            pack_path = voice_out_dir / pack_filename
            if not pack_path.exists() or pack_path.stat().st_size != len(pack_bytes) or pack_path.read_bytes() != pack_bytes:
                pack_path.write_bytes(pack_bytes)
            packs_meta[pack_id] = {"size": len(pack_bytes), "count": len(chunk_entries)}
            for h, off, length in chunk_entries:
                clips_index[h] = [pack_id, off, length]
            chunks_buf = []
            chunk_entries = []
            current_offset = 0

        for _text, h in unit_items:
            clip_bytes = (voice_cache_dir / f"{h}.mp3").read_bytes()
            if current_offset > 0 and (current_offset + len(clip_bytes)) > TARGET_PACK_MAX_BYTES:
                flush_pack(str(part))
                part += 1
            if len(clip_bytes) > HARD_PACK_MAX_BYTES:
                raise RuntimeError(f"Clip individuel > 5 Mo : {voice_id}/{h}.mp3")
            chunks_buf.append(clip_bytes)
            chunk_entries.append((h, current_offset, len(clip_bytes)))
            current_offset += len(clip_bytes)

        flush_pack(str(part))

    # Nettoyer d'éventuels paquets obsolètes
    for existing in voice_out_dir.glob("*.bin"):
        if existing.name not in expected_bin_files:
            existing.unlink()

    voice_manifest = {
        "version": 2,
        "voiceId": voice_id,
        "packs": packs_meta,
        "clips": clips_index,
    }
    manifest_path = voice_out_dir / "manifest.json"
    manifest_text = json.dumps(voice_manifest, separators=(",", ":"), ensure_ascii=False)
    if not manifest_path.exists() or manifest_path.read_text(encoding="utf-8") != manifest_text:
        manifest_path.write_text(manifest_text, encoding="utf-8")

    return {"packs": len(packs_meta), "clips": len(clips_index)}


def write_root_manifest(bitrate_kbps: int, total_texts: int) -> None:
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
        "version": 2,
        "defaultVoiceId": "ragui",
        "sampleText": SAMPLE_PREVIEW_TEXT,
        "sampleHash": compute_text_hash(SAMPLE_PREVIEW_TEXT),
        "uniqueTexts": total_texts,
        "audioSpec": {
            "format": "mp3-pack",
            "channels": 1,
            "bitrateKbps": bitrate_kbps,
            "sampleRateHz": TARGET_SAMPLE_RATE,
        },
        "voices": manifest_voices,
    }

    manifest_path = OUTPUT_AUDIO_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest_data, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )


def run_generation(bitrate_kbps: int = DEFAULT_BITRATE_KBPS, force: bool = False) -> int:
    grouped_items, text_to_hash = collect_unit_texts()
    flat_items = [item for _u, unit_list in grouped_items for item in unit_list]
    print(
        f"[audio:generate] {len(flat_items)} textes uniques × {len(VOICES_CONFIG)} voix ({bitrate_kbps} kbps, {TARGET_SAMPLE_RATE} Hz).",
        flush=True,
    )

    # Vérifier si des modèles doivent être téléchargés uniquement s'il manque des clips
    need_models = force or any(
        not (AUDIO_CACHE_DIR / v["id"] / f"{h}.mp3").exists()
        for v in VOICES_CONFIG
        for _t, h in flat_items
    )
    if need_models:
        ensure_voice_models_downloaded()

    start_time = time.time()
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(
                generate_voice_clips_worker,
                voice_cfg,
                flat_items,
                bitrate_kbps,
                force,
            ): voice_cfg["id"]
            for voice_cfg in VOICES_CONFIG
        }
        for fut in concurrent.futures.as_completed(futures):
            vid = futures[fut]
            res = fut.result()
            pack_stats = build_voice_packs(vid, grouped_items)
            print(
                f"[audio:generate] Voix '{vid}' : {res['generated']} générés, {res['skipped']} en cache -> {pack_stats['packs']} paquets ({pack_stats['clips']} clips).",
                flush=True,
            )

    write_root_manifest(bitrate_kbps, len(text_to_hash))
    total_bytes = compute_total_audio_bytes()
    total_mb = total_bytes / (1024 * 1024)
    elapsed_total = time.time() - start_time
    print(
        f"[audio:generate] Terminé en {elapsed_total:.1f}s — Poids total public/audio : {total_mb:.2f} Mo ({total_bytes} octets).",
        flush=True,
    )
    return total_bytes


if __name__ == "__main__":
    run_generation()
