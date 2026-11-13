/* 크극 최적화 계산 — 엑셀 <최적화 계산> 시트(크리·극대·보뎀을 0.1%씩 가장 효율 좋은 곳에 배분)를 그대로 옮김 */
(function (root) {
  'use strict';
  const CALC = '<계산기>', MAIN = '<Main>', CLS = '<직업별 특이사항>';
  // 기준 보뎀: 보뎀 1%를 크극 스탯 몇 %로 볼지 (엑셀 <최적화 계산> J2:K3)
  const BASES = [
    { v: 'atma', t: '아트마석 극옵 (보뎀 3%)', h3: 2.0 },
    { v: 'hunt', t: '사냥석 (보뎀 2.5%)', h3: 2.4 },
  ];
  const STEP = 0.001, MAX_ROWS = 7000;

  const dimC = (x) => x <= 0.4 ? x : x <= 0.75 ? (x - 0.4) * 0.8 + 0.4 : x <= 1.05 ? (x - 0.75) * 0.6 + 0.68 : x <= 1.4 ? (x - 1.05) * 0.4 + 0.86 : 1;
  const dimM = (x) => x < 0.4 ? x : x < 0.8 ? (x - 0.4) * 0.75 + 0.4 : x < 1.2 ? (x - 0.8) * 0.5 + 0.7 : x < 1.6 ? (x - 1.2) * 0.25 + 0.9 : 1;
  // 스탯창 표시값 (엑셀 C27: 마지막 구간은 100%로 자르지 않음)
  const winC = (x) => x <= 0.4 ? x : x <= 0.75 ? (x - 0.4) * 0.8 + 0.4 : x <= 1.05 ? (x - 0.75) * 0.6 + 0.68 : (x - 1.05) * 0.4 + 0.86;

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  function run(wb, opts) {
    opts = opts || {};
    const base = BASES.find(b => b.v === opts.base) || BASES[0];
    const H3 = base.h3;
    const minCrit = typeof opts.minCrit === 'number' ? opts.minCrit : 0.25;
    const q = (a) => num(wb.get(CALC, a));
    const physical = wb.get(CALC, 'E6') === '물리';
    const atk = physical ? q('E19') : q('E20');
    if (!atk) return null;

    // 직업별 특수 크리티컬 확률 상수 (VLOOKUP(C6,'<직업별 특이사항>'!C5:I64,7,0))
    const cls = wb.get(MAIN, 'C6');
    let K = 0;
    for (let r = 5; r <= 64; r++) if (wb.get(CLS, 'C' + r) === cls) { K = num(wb.get(CLS, 'I' + r)); break; }

    // 공통사항 (크리)
    const N = {};
    for (let i = 6; i <= 22; i++) N[i] = q('Q' + (i + 15));
    const N25 = (1 + N[9]) * (1 + N[10]) * (1 + N[16]) - 1;
    const N26 = N[17] - N[22];
    const N31 = N[18] * ((1 + N[13]) * (1 + N[14]) * (1 + N[21])) - N[18];
    const N32 = N[6] + N[19] + N31 + (N[18] - 1.5);
    const N34 = N32 * (1 + N[20]);
    // 공통사항 (극대)
    const Q5 = q('V21'), Q6 = q('V22'), Q7 = q('V23'), Q8 = q('V24'), Q9 = q('V25'), Q10 = q('V26'), Q14 = q('V30');
    const fixedBoss = q('Z20') + q('Z21') + q('Z22') + q('Z23');

    const critF = (x) => {
      const d = dimC(x);
      const p0 = d * (1 + N25) + N26, p = p0 > 1 ? 1 : p0;
      const inc = d * (1 + N25) * (1 + N[11]) - d * (1 + N25);
      const avg = p <= 1 - inc ? p + inc * N[12] : p + (1 - p) * N[12];
      const fin = (1 - avg) * K + avg;
      return fin * N34 + (1 - fin);
    };
    const maxF = (y) => {
      const r0 = dimM(y) * (1 + Q9) * (1 + Q6) * (1 + Q7) + Q10, r = r0 > 1 ? 1 : r0;
      return (atk + Q14 * 0.5 * (r >= 1 ? 1 : r)) / atk;
    };
    const bossF = (z) => z / H3 + 1;

    // 현재 총 스탯과 바꿀 수 없는 최솟값
    const C6 = q('Q38'), D6 = q('V27'), E6 = q('Z24');
    const I6 = C6 + D6 + H3 * E6;
    const C20 = q('Q22') + q('Q23') + q('Q30') + minCrit;
    const D20 = q('V21') + q('V24');
    const E20 = fixedBoss + 0.2 + 0.4;
    const F20 = H3 * E20;
    const C22 = I6 - (C20 + D20 + F20);
    const D33 = Math.floor(C22 / STEP + 1e-9) + 1;
    const steps = Math.max(0, Math.min(D33 - 1, MAX_ROWS));

    let c = C20, m = D20, b = F20;
    for (let i = 0; i < steps; i++) {
      const t = critF(c + STEP) / critF(c), u = maxF(m + STEP) / maxF(m), v = bossF(b + STEP) / bossF(b);
      if (t >= u && t >= v) c += STEP; else if (u >= v) m += STEP; else b += STEP;
    }
    const E26 = b / H3;
    const optCrit = winC(c - N[7] - N[8] - N[15]);
    const optMax = dimM(m - Q5 - Q8);
    const optBoss = E26 - fixedBoss;
    const dps = (critF(c) * maxF(m) * (1 + E26)) / (q('Q50') * (1 + q('V32')) * (1 + q('Z24'))) - 1;
    const cur = { crit: num(wb.get(MAIN, 'C17')), max: num(wb.get(MAIN, 'C19')), boss: num(wb.get(MAIN, 'C21')) };
    const cp = q('E44');
    return {
      base: base.v, minCrit, short: C22 < 0,
      cur, opt: { crit: optCrit, max: optMax, boss: optBoss },
      change: { crit: c - C6, max: m - D6, boss: optBoss - cur.boss },
      dps, cp, cpOpt: cp * (1 + dps),
    };
  }

  const api = { run, BASES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SilOpt = api;
})(typeof window !== 'undefined' ? window : globalThis);
