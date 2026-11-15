import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../src/data');
const audioDir = path.resolve(__dirname, '../public/audio');

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);
const VALID_SKILLS = new Set(['vocab', 'grammar', 'reading', 'listening']);
const EXPECTED_VOICE_IDS = ['aminata', 'fatou', 'khady', 'moussa', 'cheikh', 'ibrahima'];
const SAMPLE_PREVIEW_TEXT = "Good morning! Let's practice English together today.";

function computeTextHash(text) {
  return crypto
    .createHash('sha1')
    .update(String(text ?? '').trim(), 'utf-8')
    .digest('hex')
    .slice(0, 12);
}

function readJson(filename) {
  const fullPath = path.join(dataDir, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fichier manquant : ${fullPath}`);
  }
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw);
}

function normalizeText(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[VALIDATION ERROR] ${message}`);
  }
}

function validateQuizOptions(options, answerIndex, contextLabel) {
  assert(
    Array.isArray(options) && options.length >= 3 && options.length <= 5,
    `${contextLabel}: 'options' doit être un tableau de 3 à 5 choix.`
  );
  assert(
    Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length,
    `${contextLabel}: 'answerIndex' (${answerIndex}) hors limites pour ${options.length} options.`
  );
  const normalizedOpts = new Set();
  for (const opt of options) {
    assert(
      typeof opt === 'string' && opt.trim().length > 0,
      `${contextLabel}: option vide ou invalide.`
    );
    const norm = normalizeText(opt);
    assert(
      !normalizedOpts.has(norm),
      `${contextLabel}: options en doublon détectées ("${opt}").`
    );
    normalizedOpts.add(norm);
  }
}

function validateCards(cards) {
  assert(Array.isArray(cards), 'cards.json doit être un tableau.');
  assert(
    cards.length === 800,
    `cards.json doit contenir exactement 800 cartes (actuel : ${cards.length}).`
  );

  const ids = new Set();
  const seenEn = new Set();
  const seenExamples = new Set();
  const countsByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const label = `cards.json[${i}] (${c?.id ?? 'sans-id'})`;
    assert(c && typeof c === 'object', `${label}: entrée invalide.`);
    assert(typeof c.id === 'string' && c.id.trim().length > 0, `${label}: 'id' requis.`);
    assert(!ids.has(c.id), `${label}: id en doublon "${c.id}".`);
    ids.add(c.id);

    assert(VALID_LEVELS.has(c.level), `${label}: 'level' invalide "${c.level}".`);
    countsByLevel[c.level] += 1;

    for (const field of ['en', 'fr', 'example', 'exampleFr', 'theme']) {
      assert(
        typeof c[field] === 'string' && c[field].trim().length > 0,
        `${label}: champ '${field}' manquant ou vide.`
      );
    }

    const normEn = normalizeText(c.en);
    assert(!seenEn.has(normEn), `${label}: mot anglais en doublon "${c.en}".`);
    seenEn.add(normEn);

    const normEx = normalizeText(c.example);
    assert(!seenExamples.has(normEx), `${label}: phrase d'exemple en doublon "${c.example}".`);
    seenExamples.add(normEx);
  }

  assert(countsByLevel.A1 === 250, `cards.json A1 attendu 250, reçu ${countsByLevel.A1}`);
  assert(countsByLevel.A2 === 250, `cards.json A2 attendu 250, reçu ${countsByLevel.A2}`);
  assert(countsByLevel.B1 === 200, `cards.json B1 attendu 200, reçu ${countsByLevel.B1}`);
  assert(countsByLevel.B2 === 100, `cards.json B2 attendu 100, reçu ${countsByLevel.B2}`);
}

function validateLessons(lessons) {
  assert(Array.isArray(lessons), 'lessons.json doit être un tableau.');
  assert(
    lessons.length === 40,
    `lessons.json doit contenir exactement 40 leçons (actuel : ${lessons.length}).`
  );

  const ids = new Set();
  const titles = new Set();
  const seenPrompts = new Set();
  const countsByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };

  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    const label = `lessons.json[${i}] (${l?.id ?? 'sans-id'})`;
    assert(l && typeof l === 'object', `${label}: entrée invalide.`);
    assert(typeof l.id === 'string' && l.id.trim().length > 0, `${label}: 'id' requis.`);
    assert(!ids.has(l.id), `${label}: id en doublon "${l.id}".`);
    ids.add(l.id);

    assert(VALID_LEVELS.has(l.level), `${label}: 'level' invalide "${l.level}".`);
    countsByLevel[l.level] += 1;

    assert(typeof l.title === 'string' && l.title.trim().length > 5, `${label}: 'title' invalide.`);
    const normTitle = normalizeText(l.title);
    assert(!titles.has(normTitle), `${label}: titre de leçon en doublon "${l.title}".`);
    titles.add(normTitle);

    assert(
      typeof l.explanationFr === 'string' && l.explanationFr.trim().length >= 30,
      `${label}: 'explanationFr' trop courte ou manquante.`
    );

    assert(
      Array.isArray(l.examples) && l.examples.length === 3,
      `${label}: doit contenir exactement 3 exemples (actuel : ${l.examples?.length}).`
    );
    for (let j = 0; j < l.examples.length; j++) {
      const ex = l.examples[j];
      assert(
        typeof ex?.en === 'string' && ex.en.trim().length > 0 &&
        typeof ex?.fr === 'string' && ex.fr.trim().length > 0,
        `${label}.examples[${j}]: 'en' et 'fr' requis.`
      );
    }

    assert(
      Array.isArray(l.exercises) && l.exercises.length === 5,
      `${label}: doit contenir exactement 5 exercices QCM (actuel : ${l.exercises?.length}).`
    );
    for (let k = 0; k < l.exercises.length; k++) {
      const ex = l.exercises[k];
      const exLabel = `${label}.exercises[${k}]`;
      assert(
        typeof ex?.prompt === 'string' && ex.prompt.trim().length > 0,
        `${exLabel}: 'prompt' requis.`
      );
      const normPrompt = normalizeText(ex.prompt);
      assert(!seenPrompts.has(normPrompt), `${exLabel}: prompt en doublon "${ex.prompt}".`);
      seenPrompts.add(normPrompt);
      validateQuizOptions(ex.options, ex.answerIndex, exLabel);
    }
  }

  assert(countsByLevel.A1 === 12, `lessons.json A1 attendu 12, reçu ${countsByLevel.A1}`);
  assert(countsByLevel.A2 === 12, `lessons.json A2 attendu 12, reçu ${countsByLevel.A2}`);
  assert(countsByLevel.B1 === 10, `lessons.json B1 attendu 10, reçu ${countsByLevel.B1}`);
  assert(countsByLevel.B2 === 6, `lessons.json B2 attendu 6, reçu ${countsByLevel.B2}`);
}

function validatePlacement(questions) {
  assert(Array.isArray(questions), 'placement.json doit être un tableau.');
  assert(
    questions.length === 400,
    `placement.json doit contenir exactement 400 questions (actuel : ${questions.length}).`
  );

  const ids = new Set();
  const seenPrompts = new Set();
  const seenAudioTexts = new Set();
  const countsByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };
  const skillCountsByLevel = {
    A1: { vocab: 0, grammar: 0, reading: 0, listening: 0 },
    A2: { vocab: 0, grammar: 0, reading: 0, listening: 0 },
    B1: { vocab: 0, grammar: 0, reading: 0, listening: 0 },
    B2: { vocab: 0, grammar: 0, reading: 0, listening: 0 },
  };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const label = `placement.json[${i}] (${q?.id ?? 'sans-id'})`;
    assert(q && typeof q === 'object', `${label}: entrée invalide.`);
    assert(typeof q.id === 'string' && q.id.trim().length > 0, `${label}: 'id' requis.`);
    assert(!ids.has(q.id), `${label}: id en doublon "${q.id}".`);
    ids.add(q.id);

    assert(VALID_LEVELS.has(q.level), `${label}: 'level' invalide "${q.level}".`);
    assert(VALID_SKILLS.has(q.skill), `${label}: 'skill' invalide "${q.skill}".`);
    countsByLevel[q.level] += 1;
    skillCountsByLevel[q.level][q.skill] += 1;

    assert(typeof q.prompt === 'string' && q.prompt.trim().length > 5, `${label}: 'prompt' requis.`);
    if (q.skill === 'listening') {
      assert(
        typeof q.audioText === 'string' && q.audioText.trim().length > 5,
        `${label}: 'audioText' requis pour une question listening.`
      );
      const normAudio = normalizeText(q.audioText);
      assert(!seenAudioTexts.has(normAudio), `${label}: audioText en doublon "${q.audioText}".`);
      seenAudioTexts.add(normAudio);
    }

    const signature = `${normalizeText(q.prompt)}||${normalizeText(q.audioText ?? '')}`;
    assert(!seenPrompts.has(signature), `${label}: question en doublon "${q.prompt}".`);
    seenPrompts.add(signature);

    validateQuizOptions(q.options, q.answerIndex, label);
  }

  for (const lvl of ['A1', 'A2', 'B1', 'B2']) {
    assert(
      countsByLevel[lvl] === 100,
      `placement.json ${lvl} attendu 100 questions, reçu ${countsByLevel[lvl]}.`
    );
    for (const sk of ['vocab', 'grammar', 'reading', 'listening']) {
      assert(
        skillCountsByLevel[lvl][sk] >= 20,
        `placement.json ${lvl}/${sk} trop faible (${skillCountsByLevel[lvl][sk]}), attendu au moins 20.`
      );
    }
  }
}

function validateSentences(sentences) {
  assert(Array.isArray(sentences), 'sentences.json doit être un tableau.');
  assert(
    sentences.length === 300,
    `sentences.json doit contenir exactement 300 phrases (actuel : ${sentences.length}).`
  );

  const ids = new Set();
  const seenEn = new Set();
  const countsByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const label = `sentences.json[${i}] (${s?.id ?? 'sans-id'})`;
    assert(s && typeof s === 'object', `${label}: entrée invalide.`);
    assert(typeof s.id === 'string' && s.id.trim().length > 0, `${label}: 'id' requis.`);
    assert(!ids.has(s.id), `${label}: id en doublon "${s.id}".`);
    ids.add(s.id);

    assert(VALID_LEVELS.has(s.level), `${label}: 'level' invalide "${s.level}".`);
    countsByLevel[s.level] += 1;

    assert(typeof s.en === 'string' && s.en.trim().length > 5, `${label}: 'en' requis.`);
    assert(typeof s.fr === 'string' && s.fr.trim().length > 5, `${label}: 'fr' requis.`);

    const normEn = normalizeText(s.en);
    assert(!seenEn.has(normEn), `${label}: phrase anglaise en doublon "${s.en}".`);
    seenEn.add(normEn);
  }

  for (const lvl of ['A1', 'A2', 'B1', 'B2']) {
    assert(
      countsByLevel[lvl] >= 50,
      `sentences.json ${lvl} doit contenir au moins 50 phrases (reçu ${countsByLevel[lvl]}).`
    );
  }
}

function validateAudioClips(cards, lessons, placement, sentences) {
  const manifestPath = path.join(audioDir, 'manifest.json');
  assert(
    fs.existsSync(manifestPath),
    `manifest.json manquant dans public/audio/ (${manifestPath}). Lancez 'npm run audio:generate'.`
  );

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert(
    Array.isArray(manifest.voices) && manifest.voices.length === 6,
    `manifest.json doit contenir exactement 6 voix (actuel : ${manifest.voices?.length}).`
  );

  const manifestVoiceIds = manifest.voices.map((v) => v.id);
  for (const vid of EXPECTED_VOICE_IDS) {
    assert(
      manifestVoiceIds.includes(vid),
      `manifest.json : voix attendue "${vid}" absente.`
    );
  }

  assert(
    manifest.texts && typeof manifest.texts === 'object',
    `manifest.json doit contenir la table texte-hash 'texts'.`
  );

  const requiredTexts = new Set([SAMPLE_PREVIEW_TEXT]);
  for (const c of cards) {
    requiredTexts.add(c.en.trim());
    requiredTexts.add(c.example.trim());
  }
  for (const s of sentences) {
    requiredTexts.add(s.en.trim());
  }
  for (const q of placement) {
    if (q.audioText) {
      requiredTexts.add(q.audioText.trim());
    }
  }
  for (const l of lessons) {
    if (l.audioText) {
      requiredTexts.add(l.audioText.trim());
    }
    for (const ex of l.examples ?? []) {
      if (ex.en) {
        requiredTexts.add(ex.en.trim());
      }
    }
  }

  let verifiedCount = 0;
  for (const text of requiredTexts) {
    const hash = computeTextHash(text);
    assert(
      manifest.texts[text] === hash,
      `manifest.json : hash manquant ou invalide pour le texte "${text.slice(0, 40)}..." (attendu ${hash}).`
    );

    for (const voiceId of EXPECTED_VOICE_IDS) {
      const clipPath = path.join(audioDir, voiceId, `${hash}.mp3`);
      assert(
        fs.existsSync(clipPath),
        `Clip audio manquant : public/audio/${voiceId}/${hash}.mp3 pour "${text.slice(0, 40)}..."`
      );
      const stat = fs.statSync(clipPath);
      assert(
        stat.size > 100,
        `Clip audio vide ou corrompu (${stat.size} octets) : public/audio/${voiceId}/${hash}.mp3`
      );
      verifiedCount += 1;
    }
  }

  return { uniqueTexts: requiredTexts.size, totalClips: verifiedCount };
}

function main() {
  const cards = readJson('cards.json');
  const lessons = readJson('lessons.json');
  const placement = readJson('placement.json');
  const sentences = readJson('sentences.json');

  validateCards(cards);
  validateLessons(lessons);
  validatePlacement(placement);
  validateSentences(sentences);
  const audioStats = validateAudioClips(cards, lessons, placement, sentences);

  console.log(
    `[validate-data] OK — cards: ${cards.length}, lessons: ${lessons.length}, placement: ${placement.length}, sentences: ${sentences.length}, audioTexts: ${audioStats.uniqueTexts}, audioClips: ${audioStats.totalClips}`
  );
}

main();
