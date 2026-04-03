// lib/timing.js — typing profiles, timing math, and adjacency map.
// Loaded via importScripts() in background.js and require()'d in tests.
// No browser APIs used here.

const PROFILES = {
  casual: {
    wpmMean: 38, wpmStd: 14, wpmMin: 22, wpmMax: 56,
    typoRate: 0.038, lateDetectionProbability: 0.35,
    burstProbability: 0.12, burstLengthMin: 4, burstLengthMax: 10,
    slowdownProbability: 0.15,
    wordPauseMin: 40, wordPauseMax: 140,
    typoCorrectionPauseMin: 280, typoCorrectionPauseMax: 700,
    sentencePauseMin: 350, sentencePauseMax: 1000,
    paragraphPauseMin: 1000, paragraphPauseMax: 2600,
    ikiJitter: 0.38, postCorrectionPause: 200, thinkingPauseChance: 0.12,
  },
  student: {
    wpmMean: 52, wpmStd: 14, wpmMin: 28, wpmMax: 72,
    typoRate: 0.026, lateDetectionProbability: 0.28,
    burstProbability: 0.20, burstLengthMin: 6, burstLengthMax: 14,
    slowdownProbability: 0.12,
    wordPauseMin: 30, wordPauseMax: 120,
    typoCorrectionPauseMin: 200, typoCorrectionPauseMax: 600,
    sentencePauseMin: 250, sentencePauseMax: 800,
    paragraphPauseMin: 800, paragraphPauseMax: 2000,
    ikiJitter: 0.30, postCorrectionPause: 150, thinkingPauseChance: 0.08,
  },
  professional: {
    wpmMean: 60, wpmStd: 9, wpmMin: 40, wpmMax: 80,
    typoRate: 0.012, lateDetectionProbability: 0.12,
    burstProbability: 0.10, burstLengthMin: 5, burstLengthMax: 10,
    slowdownProbability: 0.10,
    wordPauseMin: 15, wordPauseMax: 75,
    typoCorrectionPauseMin: 80, typoCorrectionPauseMax: 220,
    sentencePauseMin: 200, sentencePauseMax: 600,
    paragraphPauseMin: 600, paragraphPauseMax: 1400,
    ikiJitter: 0.20, postCorrectionPause: 100, thinkingPauseChance: 0.06,
  },
  executive: {
    wpmMean: 45, wpmStd: 10, wpmMin: 28, wpmMax: 64,
    typoRate: 0.008, lateDetectionProbability: 0.10,
    burstProbability: 0.08, burstLengthMin: 4, burstLengthMax: 8,
    slowdownProbability: 0.18,
    wordPauseMin: 40, wordPauseMax: 160,
    typoCorrectionPauseMin: 150, typoCorrectionPauseMax: 450,
    sentencePauseMin: 400, sentencePauseMax: 1200,
    paragraphPauseMin: 1200, paragraphPauseMax: 3000,
    ikiJitter: 0.22, postCorrectionPause: 180, thinkingPauseChance: 0.14,
  },
  writer: {
    wpmMean: 72, wpmStd: 11, wpmMin: 48, wpmMax: 96,
    typoRate: 0.010, lateDetectionProbability: 0.08,
    burstProbability: 0.30, burstLengthMin: 8, burstLengthMax: 18,
    slowdownProbability: 0.10,
    wordPauseMin: 10, wordPauseMax: 60,
    typoCorrectionPauseMin: 60, typoCorrectionPauseMax: 180,
    sentencePauseMin: 150, sentencePauseMax: 500,
    paragraphPauseMin: 900, paragraphPauseMax: 2400,
    ikiJitter: 0.18, postCorrectionPause: 80, thinkingPauseChance: 0.10,
  },
  developer: {
    wpmMean: 65, wpmStd: 10, wpmMin: 42, wpmMax: 88,
    typoRate: 0.014, lateDetectionProbability: 0.12,
    burstProbability: 0.25, burstLengthMin: 6, burstLengthMax: 16,
    slowdownProbability: 0.11,
    wordPauseMin: 12, wordPauseMax: 80,
    typoCorrectionPauseMin: 70, typoCorrectionPauseMax: 200,
    sentencePauseMin: 180, sentencePauseMax: 550,
    paragraphPauseMin: 700, paragraphPauseMax: 1800,
    ikiJitter: 0.22, postCorrectionPause: 90, thinkingPauseChance: 0.07,
  },
  rusher: {
    wpmMean: 78, wpmStd: 12, wpmMin: 52, wpmMax: 104,
    typoRate: 0.050, lateDetectionProbability: 0.15,
    burstProbability: 0.55, burstLengthMin: 15, burstLengthMax: 28,
    slowdownProbability: 0.12,
    wordPauseMin: 5, wordPauseMax: 30,
    typoCorrectionPauseMin: 45, typoCorrectionPauseMax: 180,
    sentencePauseMin: 70, sentencePauseMax: 280,
    paragraphPauseMin: 200, paragraphPauseMax: 650,
    ikiJitter: 0.35, postCorrectionPause: 55, thinkingPauseChance: 0.04,
  },
};

const ADJACENCY_MAP = {
  'a': ['s','q','w','z'], 'b': ['v','g','h','n'], 'c': ['x','d','f','v'],
  'd': ['s','e','r','f','c','x'], 'e': ['w','r','d','s'],
  'f': ['d','r','t','g','v','c'], 'g': ['f','t','y','h','b','v'],
  'h': ['g','y','u','j','n','b'], 'i': ['u','o','k','j'],
  'j': ['h','u','i','k','n','m'], 'k': ['j','i','o','l','m'],
  'l': ['k','o','p',';'], 'm': ['n','j','k'],
  'n': ['b','h','j','m'], 'o': ['i','p','l','k'],
  'p': ['o','l',';'], 'q': ['w','a'], 'r': ['e','t','f','d'],
  's': ['a','w','e','d','x','z'], 't': ['r','y','g','f'],
  'u': ['y','i','h','j'], 'v': ['c','f','g','b'],
  'w': ['q','e','s','a'], 'x': ['z','s','d','c'],
  'y': ['t','u','g','h'], 'z': ['a','s','x']
};

function clampedNormal(mean, std, min, max) {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, Math.round(mean + z * std)));
}

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function skewedRand(min, max) {
  // Right-skewed distribution: clusters near min with a long tail toward max.
  return Math.round(min + (max - min) * Math.pow(Math.random(), 1.5));
}

function wpmToDelay(wpm) {
  return Math.round(60000 / (wpm * 5));
}

// Per-character IKI jitter using Box-Muller transform.
// Minimum 30ms to avoid near-zero delays at high WPM.
function jitterDelay(base, profile) {
  const u1 = Math.random(), u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  const jittered = base * (1 + z * profile.ikiJitter);
  return Math.max(30, Math.round(jittered));
}

if (typeof module !== 'undefined') {
  module.exports = { PROFILES, ADJACENCY_MAP, clampedNormal, randBetween, skewedRand, wpmToDelay, jitterDelay };
}
