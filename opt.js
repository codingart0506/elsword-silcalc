/* 크극 최적화 — 스탯창의 크리·극대·보뎀을 합계는 그대로 두고 다시 나눠서 실투력이 가장 높은 배분을 찾음.
   시트 2.x <최적화 계산>과 같은 가정을 씀: 크리 최소 수치와 보뎀 60%까지는 못 옮기고, 보뎀 1%는 크극 2%(아트마석)·2.4%(사냥석)와 맞바꿈.
   시트 3.0에는 그 계산 시트가 없어서(소켓 배분 계산으로 바뀜) 효율 식 대신 계산기 실투력을 직접 재 가며 찾음 */
(function (root) {
  'use strict';
  // 기준 보뎀: 보뎀 1%를 크극 스탯 몇 %로 볼지
  const BASES = [
    { v: 'atma', t: '아트마석 극옵 (보뎀 3%)', h3: 2.0 },
    { v: 'hunt', t: '사냥석 (보뎀 2.5%)', h3: 2.4 },
  ];
  // 스탯창 ↔ 원래 수치(크리·극대는 많이 올릴수록 스탯창에 덜 오름. 스탯창 100%가 끝)
  const CI = w => w >= .86 ? (w - .86) * 2.5 + 1.05 : w >= .68 ? (w - .68) * 5 / 3 + .75 : w >= .4 ? (w - .4) * 1.25 + .4 : w;
  const CW = x => x <= .4 ? x : x <= .75 ? (x - .4) * .8 + .4 : x <= 1.05 ? (x - .75) * .6 + .68 : (x - 1.05) * .4 + .86;
  const MI = w => w < .4 ? w : w < .7 ? (w - .4) * 4 / 3 + .4 : w < .9 ? (w - .7) * 2 + .8 : (w - .9) * 4 + 1.2;
  const MW = x => x < .4 ? x : x < .8 ? (x - .4) * .75 + .4 : x < 1.2 ? (x - .8) * .5 + .7 : (x - 1.2) * .25 + .9;
  const X_MAX = CI(1), Y_MAX = MI(1), MIN_BOSS = 0.6, STEPS = [0.08, 0.02, 0.005, 0.001];
  const num = (v) => typeof v === 'number' && isFinite(v) ? v : 0;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // ev({crit, max, boss}) → 그 스탯창 값일 때 실투력. cur = 지금 스탯창 값(0.83 = 83%)
  // opts: base, minCrit, tick(가끔 쉬어 가기), alive(그사이 입력이 바뀌었으면 그만두기)
  async function run(ev, cur, opts) {
    opts = opts || {};
    const base = BASES.find(b => b.v === opts.base) || BASES[0], H = base.h3;
    const minCrit = typeof opts.minCrit === 'number' ? opts.minCrit : 0.25;
    const tick = opts.tick || (() => null), alive = opts.alive || (() => true);
    const c0 = clamp(num(cur.crit), 0, 1), m0 = clamp(num(cur.max), 0, 1), b0 = Math.max(num(cur.boss), 0);
    const x0 = CI(c0), y0 = MI(m0);
    // 못 옮기는 양: 지금 수치가 그보다 낮으면 지금 수치까지만
    const xMin = Math.min(minCrit, x0), bMin = Math.min(MIN_BOSS, b0);
    const T = x0 + y0 + H * b0; // 합계(크극 수치로 환산)
    const cp0 = ev({ crit: c0, max: m0, boss: b0 });
    if (!(cp0 > 0)) return null;
    const cache = new Map(); let evals = 0;
    const bossOf = (x, y) => (T - x - y) / H;
    const f = (x, y) => {
      const k = Math.round(x * 1e4) + '|' + Math.round(y * 1e4);
      if (cache.has(k)) return cache.get(k);
      evals++;
      const v = ev({ crit: Math.min(CW(x), 1), max: Math.min(MW(y), 1), boss: bossOf(x, y) });
      const r = v > 0 ? v : -Infinity; cache.set(k, r); return r;
    };
    const ok = (x, y) => bossOf(x, y) >= bMin - 1e-9;
    const climb = async (x, y) => {
      let v = f(x, y);
      for (const d of STEPS) {
        for (let it = 0; it < 500; it++) {
          let bx = x, by = y, bv = v;
          for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, -d], [-d, d]]) {
            const nx = clamp(x + dx, xMin, X_MAX), ny = clamp(y + dy, 0, Y_MAX);
            if ((nx === x && ny === y) || !ok(nx, ny)) continue;
            const nv = f(nx, ny); if (nv > bv * (1 + 1e-12)) { bv = nv; bx = nx; by = ny; }
          }
          if (bx === x && by === y) break;
          x = bx; y = by; v = bv;
          if (it % 4 === 3) { await tick(); if (!alive()) return null; }
        }
      }
      return { x, y, v };
    };
    // 출발점 둘(지금 배분, 고르게 나눈 배분)에서 올라가 더 높은 쪽
    const free = (x0 - xMin) + y0 + H * (b0 - bMin);
    const a = await climb(x0, y0); if (!a) return null;
    const b = await climb(Math.min(xMin + free / 3, X_MAX), Math.min(free / 3, Y_MAX)); if (!b) return null;
    const best = b.v > a.v ? b : a;
    const bo = bossOf(best.x, best.y);
    return {
      base: base.v, minCrit, evals,
      cur: { crit: c0, max: m0, boss: b0 },
      opt: { crit: Math.min(CW(best.x), 1), max: Math.min(MW(best.y), 1), boss: bo },
      change: { crit: best.x - x0, max: best.y - y0, boss: bo - b0 },
      cp: cp0, cpOpt: best.v, gain: best.v / cp0 - 1,
    };
  }

  const api = { run, BASES, CI, CW, MI, MW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SilOpt = api;
})(typeof window !== 'undefined' ? window : globalThis);
