import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../src/data');
const audioDir = path.resolve(__dirname, '../public/audio');

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2']);
const VALID_KIDS_LEVELS = new Set(['A0', 'A1', 'A2']);
const VALID_KIDS_THEMES = new Set([
  'animaux',
  'couleurs',
  'nombres',
  'famille',
  'corps',
  'école',
  'nourriture',
  'vêtements',
  'météo',
  'maison',
  'routines',
]);
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

function readSplitGroup(groupName, levels) {
  const combined = [];
  for (const lvl of levels) {
    const rel = path.join(groupName, `${lvl.toLowerCase()}.json`);
    const fullPath = path.join(dataDir, rel);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Fichier découpé manquant : ${fullPath}`);
    }
    const items = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    assert(Array.isArray(items), `${rel} doit être un tableau JSON.`);
    for (const item of items) {
      assert(
        item && item.level === lvl,
        `${rel} contient une entrée de niveau "${item?.level}" au lieu de "${lvl}".`
      );
    }
    combined.push(...items);
  }
  return combined;
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

    const normFr = normalizeText(c.fr);
    assert(
      Array.isArray(c.distractors) && c.distractors.length === 2,
      `${label}: 'distractors' doit contenir exactement 2 faux choix français.`
    );
    const seenFrDist = new Set();
    for (const d of c.distractors) {
      assert(
        typeof d === 'string' && d.trim().length > 0,
        `${label}: distracteur français vide ou invalide.`
      );
      const nd = normalizeText(d);
      assert(
        nd !== normFr,
        `${label}: distracteur français égal à la bonne réponse ("${d}").`
      );
      assert(
        !seenFrDist.has(nd),
        `${label}: distracteurs français en doublon ("${d}").`
      );
      seenFrDist.add(nd);
    }

    assert(
      Array.isArray(c.distractorsEn) && c.distractorsEn.length === 2,
      `${label}: 'distractorsEn' doit contenir exactement 2 faux choix anglais.`
    );
    const seenEnDist = new Set();
    for (const d of c.distractorsEn) {
      assert(
        typeof d === 'string' && d.trim().length > 0,
        `${label}: distracteur anglais vide ou invalide.`
      );
      const nd = normalizeText(d);
      assert(
        nd !== normEn,
        `${label}: distracteur anglais égal à la bonne réponse ("${d}").`
      );
      assert(
        !seenEnDist.has(nd),
        `${label}: distracteurs anglais en doublon ("${d}").`
      );
      seenEnDist.add(nd);
    }
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

function validateConstructions(constructions) {
  assert(Array.isArray(constructions), 'constructions.json doit être un tableau.');

  const expectedUnitsByLevel = { A1: 12, A2: 12, B1: 10, B2: 8 };
  const ids = new Set();
  const seenPrompts = new Set();
  const seenPrimaryAnswers = new Set();
  const unitsByLevel = {
    A1: new Map(),
    A2: new Map(),
    B1: new Map(),
    B2: new Map(),
  };

  for (let i = 0; i < constructions.length; i++) {
    const item = constructions[i];
    const label = `constructions.json[${i}] (${item?.id ?? 'sans-id'})`;
    assert(item && typeof item === 'object', `${label}: entrée invalide.`);
    assert(typeof item.id === 'string' && item.id.trim().length > 0, `${label}: 'id' requis.`);
    assert(!ids.has(item.id), `${label}: id en doublon "${item.id}".`);
    ids.add(item.id);

    assert(VALID_LEVELS.has(item.level), `${label}: 'level' invalide "${item.level}".`);
    assert(
      Number.isInteger(item.unit) && item.unit >= 1,
      `${label}: 'unit' invalide (${item.unit}).`
    );
    assert(
      typeof item.unitTitleFr === 'string' && item.unitTitleFr.trim().length >= 3,
      `${label}: 'unitTitleFr' requis.`
    );
    assert(
      Number.isInteger(item.order) && item.order >= 1,
      `${label}: 'order' invalide (${item.order}).`
    );
    assert(
      typeof item.promptFr === 'string' && item.promptFr.trim().length >= 3,
      `${label}: 'promptFr' requis.`
    );
    assert(
      Array.isArray(item.answers) && item.answers.length >= 1,
      `${label}: au moins une réponse requise dans 'answers'.`
    );
    for (const ans of item.answers) {
      assert(
        typeof ans === 'string' && ans.trim().length > 0,
        `${label}: réponse vide dans 'answers'.`
      );
    }

    if (item.tiles !== undefined) {
      assert(Array.isArray(item.tiles), `${label}: 'tiles' doit être un tableau.`);
    }

    const normPrompt = normalizeText(item.promptFr);
    assert(!seenPrompts.has(normPrompt), `${label}: promptFr en doublon "${item.promptFr}".`);
    seenPrompts.add(normPrompt);

    const normAns0 = normalizeText(item.answers[0]);
    assert(!seenPrimaryAnswers.has(normAns0), `${label}: answers[0] en doublon "${item.answers[0]}".`);
    seenPrimaryAnswers.add(normAns0);

    const levelMap = unitsByLevel[item.level];
    levelMap.set(item.unit, (levelMap.get(item.unit) ?? 0) + 1);
  }

  for (const [lvl, expectedUnitCount] of Object.entries(expectedUnitsByLevel)) {
    const levelMap = unitsByLevel[lvl];
    assert(
      levelMap.size === expectedUnitCount,
      `constructions.json ${lvl} : attendu ${expectedUnitCount} unités, reçu ${levelMap.size}.`
    );
    for (let u = 1; u <= expectedUnitCount; u++) {
      const count = levelMap.get(u) ?? 0;
      assert(
        count >= 10 && count <= 14,
        `constructions.json ${lvl} Unité ${u} : attendu 10 à 14 phrases, reçu ${count}.`
      );
    }
  }
}

function validateAudioClips(allDatasets) {
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

  const requiredTexts = new Set([SAMPLE_PREVIEW_TEXT]);
  for (const ds of allDatasets) {
    for (const c of ds.cards) {
      requiredTexts.add(c.en.trim());
      requiredTexts.add(c.example.trim());
    }
    for (const s of ds.sentences) {
      requiredTexts.add(s.en.trim());
    }
    for (const q of ds.placement) {
      if (q.audioText) {
        requiredTexts.add(q.audioText.trim());
      }
    }
    for (const l of ds.lessons) {
      if (l.audioText) {
        requiredTexts.add(l.audioText.trim());
      }
      for (const ex of l.examples ?? []) {
        if (ex.en) {
          requiredTexts.add(ex.en.trim());
        }
      }
    }
    for (const c of ds.constructions) {
      if (Array.isArray(c.answers) && c.answers[0]) {
        requiredTexts.add(c.answers[0].trim());
      }
    }
  }

  const MAX_PACK_BYTES = 5 * 1024 * 1024;
  let verifiedCount = 0;

  for (const voiceId of EXPECTED_VOICE_IDS) {
    const voiceManifestPath = path.join(audioDir, voiceId, 'manifest.json');
    assert(
      fs.existsSync(voiceManifestPath),
      `Manifest de voix manquant : public/audio/${voiceId}/manifest.json`
    );
    const vManifest = JSON.parse(fs.readFileSync(voiceManifestPath, 'utf-8'));
    assert(
      vManifest && vManifest.packs && vManifest.clips,
      `public/audio/${voiceId}/manifest.json invalide.`
    );

    const packSizes = new Map();
    for (const packId of Object.keys(vManifest.packs)) {
      const packPath = path.join(audioDir, voiceId, `${packId}.bin`);
      assert(
        fs.existsSync(packPath),
        `Paquet audio manquant : public/audio/${voiceId}/${packId}.bin`
      );
      const stat = fs.statSync(packPath);
      assert(stat.size > 0, `Paquet audio vide : public/audio/${voiceId}/${packId}.bin`);
      assert(
        stat.size <= MAX_PACK_BYTES,
        `Paquet audio > 5 Mo (${stat.size} octets) : public/audio/${voiceId}/${packId}.bin`
      );
      packSizes.set(packId, stat.size);
    }

    for (const text of requiredTexts) {
      const hash = computeTextHash(text);
      const entry = vManifest.clips[hash];
      assert(
        Array.isArray(entry) && entry.length === 3,
        `Clip manquant dans ${voiceId}/manifest.json pour "${text.slice(0, 40)}..." (${hash})`
      );
      const [packId, offset, length] = entry;
      const packSize = packSizes.get(packId);
      assert(
        typeof packSize === 'number' &&
          Number.isInteger(offset) &&
          Number.isInteger(length) &&
          offset >= 0 &&
          length > 100 &&
          offset + length <= packSize,
        `Offset/longueur invalide pour ${voiceId}/${hash} dans ${packId}.bin`
      );
      verifiedCount += 1;
    }
  }

  return { uniqueTexts: requiredTexts.size, totalClips: verifiedCount };
}

function validateKidsData() {
  const kidsLevels = ['A0', 'A1', 'A2'];
  const kidsCards = readSplitGroup('kids/cards', kidsLevels);
  const kidsLessons = readSplitGroup('kids/lessons', kidsLevels);
  const kidsPlacement = readSplitGroup('kids/placement', kidsLevels);
  const kidsSentences = readSplitGroup('kids/sentences', kidsLevels);
  const kidsConstructions = readSplitGroup('kids/constructions', kidsLevels);

  assert(
    Array.isArray(kidsCards) && kidsCards.length === 320,
    `kids/cards.json doit contenir exactement 320 cartes (actuel : ${kidsCards?.length}).`
  );
  const kCardIds = new Set();
  const kCardEn = new Set();
  const kCardExamples = new Set();
  const kCardLevels = { A0: 0, A1: 0, A2: 0 };
  for (let i = 0; i < kidsCards.length; i++) {
    const c = kidsCards[i];
    const label = `kids/cards.json[${i}] (${c?.id ?? 'sans-id'})`;
    assert(c && typeof c.id === 'string' && !kCardIds.has(c.id), `${label}: id invalide ou en doublon.`);
    kCardIds.add(c.id);
    assert(VALID_KIDS_LEVELS.has(c.level), `${label}: niveau enfant invalide "${c.level}".`);
    kCardLevels[c.level] += 1;
    assert(VALID_KIDS_THEMES.has(c.theme), `${label}: thème enfant invalide "${c.theme}".`);
    assert(typeof c.emoji === 'string' && c.emoji.trim().length > 0, `${label}: champ 'emoji' requis.`);
    for (const field of ['en', 'fr', 'example', 'exampleFr']) {
      assert(typeof c[field] === 'string' && c[field].trim().length > 0, `${label}: '${field}' requis.`);
    }
    const nEn = normalizeText(c.en);
    assert(!kCardEn.has(nEn), `${label}: mot anglais en doublon "${c.en}".`);
    kCardEn.add(nEn);
    const nEx = normalizeText(c.example);
    assert(!kCardExamples.has(nEx), `${label}: exemple en doublon "${c.example}".`);
    kCardExamples.add(nEx);
    const wordCount = c.example.trim().split(/\s+/).length;
    assert(wordCount <= 6, `${label}: phrase d'exemple > 6 mots (${wordCount} mots : "${c.example}").`);
    assert(Array.isArray(c.distractors) && c.distractors.length === 2, `${label}: 2 distracteurs FR requis.`);
    assert(Array.isArray(c.distractorsEn) && c.distractorsEn.length === 2, `${label}: 2 distracteurs EN requis.`);
    assert(
      !c.distractors.some((d) => normalizeText(d) === normalizeText(c.fr)),
      `${label}: distracteur FR égal à la bonne réponse.`
    );
    assert(
      normalizeText(c.distractors[0]) !== normalizeText(c.distractors[1]),
      `${label}: distracteurs FR en doublon.`
    );
    assert(
      !c.distractorsEn.some((d) => normalizeText(d) === normalizeText(c.en)),
      `${label}: distracteur EN égal à la bonne réponse.`
    );
    assert(
      normalizeText(c.distractorsEn[0]) !== normalizeText(c.distractorsEn[1]),
      `${label}: distracteurs EN en doublon.`
    );
  }
  assert(kCardLevels.A0 === 120, `kids/cards.json A0 attendu 120, reçu ${kCardLevels.A0}`);
  assert(kCardLevels.A1 === 120, `kids/cards.json A1 attendu 120, reçu ${kCardLevels.A1}`);
  assert(kCardLevels.A2 === 80, `kids/cards.json A2 attendu 80, reçu ${kCardLevels.A2}`);

  assert(
    Array.isArray(kidsLessons) && kidsLessons.length === 18,
    `kids/lessons.json doit contenir exactement 18 leçons (actuel : ${kidsLessons?.length}).`
  );
  const kLessonIds = new Set();
  const kLessonLevels = { A0: 0, A1: 0, A2: 0 };
  for (let i = 0; i < kidsLessons.length; i++) {
    const l = kidsLessons[i];
    assert(typeof l.id === 'string' && !kLessonIds.has(l.id), `kids/lessons.json[${i}]: id invalide ou en doublon.`);
    kLessonIds.add(l.id);
    assert(VALID_KIDS_LEVELS.has(l.level), `kids/lessons.json[${i}]: niveau invalide "${l.level}".`);
    kLessonLevels[l.level] += 1;
    assert(Array.isArray(l.examples) && l.examples.length === 2, `kids/lessons.json[${i}]: 2 exemples requis.`);
    assert(Array.isArray(l.exercises) && l.exercises.length === 4, `kids/lessons.json[${i}]: 4 exercices requis.`);
    for (const ex of l.exercises) {
      validateQuizOptions(ex.options, ex.answerIndex, `kids/lessons.json[${i}]`);
    }
  }
  assert(kLessonLevels.A0 === 6, `kids/lessons.json A0 attendu 6, reçu ${kLessonLevels.A0}`);
  assert(kLessonLevels.A1 === 6, `kids/lessons.json A1 attendu 6, reçu ${kLessonLevels.A1}`);
  assert(kLessonLevels.A2 === 6, `kids/lessons.json A2 attendu 6, reçu ${kLessonLevels.A2}`);

  assert(
    Array.isArray(kidsPlacement) && kidsPlacement.length === 90,
    `kids/placement.json doit contenir exactement 90 questions (actuel : ${kidsPlacement?.length}).`
  );
  const kPlaceIds = new Set();
  const kPlacePrompts = new Set();
  const kPlaceLevels = { A0: 0, A1: 0, A2: 0 };
  for (let i = 0; i < kidsPlacement.length; i++) {
    const q = kidsPlacement[i];
    assert(typeof q.id === 'string' && !kPlaceIds.has(q.id), `kids/placement.json[${i}]: id invalide ou en doublon.`);
    kPlaceIds.add(q.id);
    const nPrompt = normalizeText(q.prompt);
    assert(!kPlacePrompts.has(nPrompt), `kids/placement.json[${i}]: question en doublon "${q.prompt}".`);
    kPlacePrompts.add(nPrompt);
    assert(VALID_KIDS_LEVELS.has(q.level), `kids/placement.json[${i}]: niveau invalide "${q.level}".`);
    kPlaceLevels[q.level] += 1;
    assert(VALID_SKILLS.has(q.skill), `kids/placement.json[${i}]: compétence invalide "${q.skill}".`);
    validateQuizOptions(q.options, q.answerIndex, `kids/placement.json[${i}]`);
  }
  assert(kPlaceLevels.A0 === 30, `kids/placement.json A0 attendu 30, reçu ${kPlaceLevels.A0}`);
  assert(kPlaceLevels.A1 === 30, `kids/placement.json A1 attendu 30, reçu ${kPlaceLevels.A1}`);
  assert(kPlaceLevels.A2 === 30, `kids/placement.json A2 attendu 30, reçu ${kPlaceLevels.A2}`);

  assert(
    Array.isArray(kidsSentences) && kidsSentences.length === 120,
    `kids/sentences.json doit contenir exactement 120 phrases (actuel : ${kidsSentences?.length}).`
  );
  const kSentIds = new Set();
  const kSentEn = new Set();
  for (let i = 0; i < kidsSentences.length; i++) {
    const s = kidsSentences[i];
    assert(typeof s.id === 'string' && !kSentIds.has(s.id), `kids/sentences.json[${i}]: id invalide ou en doublon.`);
    kSentIds.add(s.id);
    assert(VALID_KIDS_LEVELS.has(s.level), `kids/sentences.json[${i}]: niveau invalide.`);
    const nSent = normalizeText(s.en);
    assert(!kSentEn.has(nSent), `kids/sentences.json[${i}]: phrase en doublon "${s.en}".`);
    kSentEn.add(nSent);
  }

  assert(
    Array.isArray(kidsConstructions) && kidsConstructions.length === 64,
    `kids/constructions.json doit contenir exactement 64 constructions (actuel : ${kidsConstructions?.length}).`
  );
  const kConIds = new Set();
  const kConUnits = new Set();
  for (let i = 0; i < kidsConstructions.length; i++) {
    const item = kidsConstructions[i];
    assert(typeof item.id === 'string' && !kConIds.has(item.id), `kids/constructions.json[${i}]: id invalide ou en doublon.`);
    kConIds.add(item.id);
    assert(VALID_KIDS_LEVELS.has(item.level), `kids/constructions.json[${i}]: niveau invalide.`);
    kConUnits.add(`${item.level}-u${item.unit}`);
    assert(Array.isArray(item.answers) && item.answers.length >= 1, `kids/constructions.json[${i}]: réponse requise.`);
    assert(Array.isArray(item.tiles) && item.tiles.length >= 1, `kids/constructions.json[${i}]: tuiles requises.`);
  }
  assert(kConUnits.size === 8, `kids/constructions.json doit contenir 8 unités (actuel : ${kConUnits.size}).`);

  return {
    cards: kidsCards,
    lessons: kidsLessons,
    placement: kidsPlacement,
    sentences: kidsSentences,
    constructions: kidsConstructions,
  };
}

function main() {
  const adultLevels = ['A1', 'A2', 'B1', 'B2'];
  const cards = readSplitGroup('cards', adultLevels);
  const lessons = readSplitGroup('lessons', adultLevels);
  const placement = readSplitGroup('placement', adultLevels);
  const sentences = readSplitGroup('sentences', adultLevels);
  const constructions = readSplitGroup('constructions', adultLevels);

  validateCards(cards);
  validateLessons(lessons);
  validatePlacement(placement);
  validateSentences(sentences);
  validateConstructions(constructions);
  const kidsData = validateKidsData();
  const audioStats = validateAudioClips([
    { cards, lessons, placement, sentences, constructions },
    kidsData,
  ]);

  console.log(
    `[validate-data] OK — cards: ${cards.length}, lessons: ${lessons.length}, placement: ${placement.length}, sentences: ${sentences.length}, constructions: ${constructions.length}, audioTexts: ${audioStats.uniqueTexts}, audioClips: ${audioStats.totalClips} | kids(cards: ${kidsData.cards.length}, lessons: ${kidsData.lessons.length}, placement: ${kidsData.placement.length}, sentences: ${kidsData.sentences.length}, constructions: ${kidsData.constructions.length})`
  );
}

main();
