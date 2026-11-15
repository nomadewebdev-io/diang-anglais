# Crédits et Licences des Voix de Synthèse (TTS)

Les fichiers audio de **Diang-Anglais** sont générés hors-ligne à l'aide du moteur neuronal open-source **[Piper TTS](https://github.com/rhasspy/piper)** (licence MIT, Open Home Foundation / Michael Hansen) et de modèles vocaux officiels issus du dépôt **[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)**.

> **Note importante** : Les prénoms **Aminata**, **Fatou**, **Khady**, **Moussa**, **Cheikh** et **Ibrahima** utilisés dans l'interface de Diang-Anglais sont des identifiants de voix de synthèse attribués pour faciliter le repérage dans l'application. Il s'agit exclusivement de voix de synthèse neuronale et non de personnes réelles.

Toutes les voix retenues ci-dessous disposent de licences ouvertes autorisant explicitement l'usage commercial (`Public Domain`, `CC0 1.0`, `CC BY 4.0`, `CC BY-SA 4.0`).

---

## 1. Voix féminines

### Voix « Aminata » (`aminata` — Voix par défaut)
- **Genre** : Femme
- **Accent** : Anglais américain (`en-US`)
- **Modèle Piper** : `en_US-kristin-medium` (`en/en_US/kristin/medium/en_US-kristin-medium.onnx`, 22 050 Hz)
- **Jeu de données & Entraînement** : Enregistrements LibriVox (domaine public), modèle entraîné par Bryce Beattie (`https://brycebeattie.com/files/tts/`).
- **Licence** : **Domaine Public (Public Domain)** — usage commercial autorisé sans restriction.

### Voix « Fatou » (`fatou`)
- **Genre** : Femme
- **Accent** : Anglais britannique (`en-GB`)
- **Modèle Piper** : `en_GB-cori-medium` (`en/en_GB/cori/medium/en_GB-cori-medium.onnx`, 22 050 Hz)
- **Jeu de données & Attribution** : *Hi-Fi Multi-Speaker English TTS Dataset* (NVIDIA Corporation — Bakhturina, Lavrukhin, Ginsburg & Zhang, Interspeech 2021, OpenSLR SLR109), basé sur les lectures LibriVox dans le domaine public de **Cori Samuel** (lectrice n° 92).
- **Licence** : **[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)** — usage commercial autorisé avec mention d'attribution.

### Voix « Khady » (`khady`)
- **Genre** : Femme
- **Accent** : Anglais britannique (`en-GB`)
- **Modèle Piper** : `en_GB-alba-medium` (`en/en_GB/alba/medium/en_GB-alba-medium.onnx`, 22 050 Hz)
- **Jeu de données & Attribution** : Corpus vocal publié sur University of Edinburgh DataShare (`https://datashare.ed.ac.uk/handle/10283/3270`), affiné à partir du modèle de base `hifi_tts_92` (Cori Samuel / Hi-Fi TTS Dataset, NVIDIA Corporation).
- **Licence** : **[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)** — usage commercial autorisé avec mention d'attribution.

---

## 2. Voix masculines

### Voix « Moussa » (`moussa`)
- **Genre** : Homme
- **Accent** : Anglais américain (`en-US`)
- **Modèle Piper** : `en_US-joe-medium` (`en/en_US/joe/medium/en_US-joe-medium.onnx`, 22 050 Hz)
- **Jeu de données & Attribution** : Open Home Foundation Voice Datasets (`https://github.com/OHF-Voice/voice-datasets`), affiné à partir du modèle `rdh` (CC0).
- **Licence** : **[CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)** — usage commercial autorisé sans restriction.

### Voix « Cheikh » (`cheikh`)
- **Genre** : Homme
- **Accent** : Anglais britannique (`en-GB`)
- **Modèle Piper** : `en_GB-northern_english_male-medium` (`en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx`, 22 050 Hz)
- **Jeu de données & Attribution** : *Crowdsourced high-quality UK and Ireland English Dialect speech data set* (OpenSLR SLR83, `https://www.openslr.org/83/`, Google / Kjartansson et al.).
- **Licence** : **[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)** — usage commercial autorisé avec mention d'attribution et partage dans les mêmes conditions des adaptations du modèle.

### Voix « Ibrahima » (`ibrahima`)
- **Genre** : Homme
- **Accent** : Anglais américain (`en-US`)
- **Modèle Piper** : `en_US-john-medium` (`en/en_US/john/medium/en_US-john-medium.onnx`, 22 050 Hz)
- **Jeu de données & Entraînement** : Enregistrements LibriVox (domaine public, 12,5 heures), modèle entraîné par Bryce Beattie (`https://brycebeattie.com/files/tts/`).
- **Licence** : **Domaine Public (Public Domain)** — usage commercial autorisé sans restriction.

---

## 3. Logiciels tiers utilisés pour la génération

- **Piper TTS (`piper-tts`)** : Licence MIT — Copyright (c) 2023 Michael Hansen / Open Home Foundation.
- **ONNX Runtime (`onnxruntime`)** : Licence MIT — Copyright (c) Microsoft Corporation.
