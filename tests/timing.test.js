'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PROFILES, ADJACENCY_MAP, clampedNormal, randBetween, skewedRand, wpmToDelay, jitterDelay } = require('../lib/timing.js');

describe('wpmToDelay', () => {
  test('60 wpm yields 200ms', () => {
    assert.equal(wpmToDelay(60), 200);
  });
  test('120 wpm yields 100ms', () => {
    assert.equal(wpmToDelay(120), 100);
  });
  test('result is always positive', () => {
    for (const wpm of [20, 40, 60, 100, 150, 200]) {
      assert.ok(wpmToDelay(wpm) > 0, `wpmToDelay(${wpm}) should be > 0`);
    }
  });
});

describe('randBetween', () => {
  test('always within [min, max]', () => {
    for (let i = 0; i < 500; i++) {
      const v = randBetween(10, 50);
      assert.ok(v >= 10 && v <= 50, `${v} out of [10, 50]`);
    }
  });
  test('returns integer', () => {
    for (let i = 0; i < 100; i++) {
      const v = randBetween(0, 100);
      assert.equal(v, Math.floor(v));
    }
  });
  test('works when min === max', () => {
    assert.equal(randBetween(7, 7), 7);
  });
});

describe('skewedRand', () => {
  test('always within [min, max]', () => {
    for (let i = 0; i < 500; i++) {
      const v = skewedRand(100, 500);
      assert.ok(v >= 100 && v <= 500, `${v} out of [100, 500]`);
    }
  });
  test('skews toward min', () => {
    let sum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) sum += skewedRand(0, 100);
    const mean = sum / N;
    // Right-skewed: mean should be noticeably below the midpoint (50)
    assert.ok(mean < 45, `mean ${mean.toFixed(1)} should be < 45 (skewed toward min)`);
  });
});

describe('clampedNormal', () => {
  test('always within [min, max]', () => {
    for (let i = 0; i < 500; i++) {
      const v = clampedNormal(60, 10, 40, 80);
      assert.ok(v >= 40 && v <= 80, `${v} out of [40, 80]`);
    }
  });
  test('returns integer', () => {
    for (let i = 0; i < 100; i++) {
      const v = clampedNormal(60, 10, 40, 80);
      assert.equal(v, Math.round(v));
    }
  });
  test('centers near the mean over many samples', () => {
    let sum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) sum += clampedNormal(60, 5, 40, 80);
    const mean = sum / N;
    assert.ok(mean > 57 && mean < 63, `mean ${mean.toFixed(2)} should be near 60`);
  });
});

describe('jitterDelay', () => {
  test('never returns less than 30ms', () => {
    const profile = { ikiJitter: 0.99 }; // extreme jitter
    for (let i = 0; i < 500; i++) {
      assert.ok(jitterDelay(50, profile) >= 30);
    }
  });
  test('returns integer', () => {
    const profile = { ikiJitter: 0.2 };
    for (let i = 0; i < 100; i++) {
      const v = jitterDelay(200, profile);
      assert.equal(v, Math.round(v));
    }
  });
});

describe('PROFILES', () => {
  const requiredKeys = [
    'wpmMean', 'wpmStd', 'wpmMin', 'wpmMax',
    'typoRate', 'lateDetectionProbability',
    'burstProbability', 'burstLengthMin', 'burstLengthMax',
    'wordPauseMin', 'wordPauseMax',
    'typoCorrectionPauseMin', 'typoCorrectionPauseMax',
    'sentencePauseMin', 'sentencePauseMax',
    'paragraphPauseMin', 'paragraphPauseMax',
    'ikiJitter', 'postCorrectionPause', 'thinkingPauseChance',
  ];
  const expectedProfiles = ['casual', 'student', 'professional', 'executive', 'writer', 'developer', 'rusher'];

  test('all expected profiles exist', () => {
    for (const id of expectedProfiles) {
      assert.ok(id in PROFILES, `missing profile: ${id}`);
    }
  });

  for (const id of expectedProfiles) {
    test(`${id} has all required keys`, () => {
      for (const key of requiredKeys) {
        assert.ok(key in PROFILES[id], `${id} missing key: ${key}`);
      }
    });
    test(`${id} wpmMin < wpmMean < wpmMax`, () => {
      const p = PROFILES[id];
      assert.ok(p.wpmMin < p.wpmMean, `${id}: wpmMin >= wpmMean`);
      assert.ok(p.wpmMean < p.wpmMax, `${id}: wpmMean >= wpmMax`);
    });
    test(`${id} typoRate is between 0 and 0.15`, () => {
      const p = PROFILES[id];
      assert.ok(p.typoRate >= 0 && p.typoRate <= 0.15, `${id} typoRate out of range`);
    });
    test(`${id} pause ranges are ordered (min < max)`, () => {
      const p = PROFILES[id];
      assert.ok(p.wordPauseMin < p.wordPauseMax, `${id} wordPause range invalid`);
      assert.ok(p.sentencePauseMin < p.sentencePauseMax, `${id} sentencePause range invalid`);
      assert.ok(p.paragraphPauseMin < p.paragraphPauseMax, `${id} paragraphPause range invalid`);
    });
  }
});

describe('ADJACENCY_MAP', () => {
  test('covers all lowercase letters a-z', () => {
    for (let c = 97; c <= 122; c++) {
      const ch = String.fromCharCode(c);
      assert.ok(ch in ADJACENCY_MAP, `missing key: ${ch}`);
    }
  });
  test('each key maps to a non-empty array', () => {
    for (const [key, neighbors] of Object.entries(ADJACENCY_MAP)) {
      assert.ok(Array.isArray(neighbors) && neighbors.length > 0, `empty neighbors for ${key}`);
    }
  });
  test('no key appears as its own neighbor', () => {
    for (const [key, neighbors] of Object.entries(ADJACENCY_MAP)) {
      assert.ok(!neighbors.includes(key), `${key} is its own neighbor`);
    }
  });
});
