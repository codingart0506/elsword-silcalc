/* 가열기 아바타/액세서리 추천 계산 — 룰루님 시트(v1.5.1) Apps Script를 그대로 옮김 */
(function (root) {
  'use strict';
  const TARGET_STATS = ['적응력', '초적응력', '강배', '역강배', '100이하', '추피', '양극화', '물마퍼', '모스댐', '초댐증', '크댐증', '보댐증', '쿨감'];
  const ALL_PARTS = ['무기', '웨폰가드', '서포트유닛', '얼굴(상)', '얼굴(중)', '얼굴(하)', '상의', '하의', '팔', '귀걸이', '목걸이', '반지'];
  const COOLDOWN_CAP = 35, COOLDOWN_STEP = 5, TOP_KEEP_RATIO = 0.3;
  const FIVESET_CATEGORY = '아바타5셋';
  const ELIOS_SET_NAME = '엘리오스 수호 기사단';

  const emptySums = () => { const o = {}; for (const k of TARGET_STATS) o[k] = 0; return o; };
  const addSums = (t, s) => { if (!s) return; for (const k of TARGET_STATS) t[k] += s[k] || 0; };
  const mergeSums = (a, b) => { if (!a && !b) return null; const o = emptySums(); addSums(o, a); addSums(o, b); return o; };
  const sumsToAddArr = (s) => [s['적응력'], s['초적응력'], s['강배'], s['역강배'], s['100이하'], s['추피'], s['양극화'], s['물마퍼'], s['모스댐'], s['초댐증'], s['크댐증'], s['보댐증']];
  function addArrPlus(arr, src) {
    if (!src) return arr.slice();
    return [arr[0] + (src['적응력'] || 0), arr[1] + (src['초적응력'] || 0), arr[2] + (src['강배'] || 0), arr[3] + (src['역강배'] || 0),
      arr[4] + (src['100이하'] || 0), arr[5] + (src['추피'] || 0), arr[6] + (src['양극화'] || 0), arr[7] + (src['물마퍼'] || 0),
      arr[8] + (src['모스댐'] || 0), arr[9] + (src['초댐증'] || 0), arr[10] + (src['크댐증'] || 0), arr[11] + (src['보댐증'] || 0)];
  }
  function combinations(arr, k) {
    const out = [];
    (function h(st, path) { if (path.length === k) { out.push(path.slice()); return; } for (let i = st; i < arr.length; i++) { path.push(arr[i]); h(i + 1, path); path.pop(); } })(0, []);
    return out;
  }
  const safeDivide = (a, b) => { const n = Number(a || 0), d = Number(b || 0); return Math.abs(d) < 1e-9 ? 1 : n / d; };
  function factors(b, a, env, crit) {
    return [
      safeDivide(Math.min(100 - env + (Math.min(b.adapt + a[0], 60) + (b.superAdapt + a[1])), 100), Math.min(100 - env + (Math.min(b.adapt, 60) + b.superAdapt), 100)),
      safeDivide(100 + ((b.strong + a[2]) + (b.reverseStrong + a[3])) / 2, 100 + (b.strong + b.reverseStrong) / 2),
      safeDivide(100 + b.under100 + a[4], 100 + b.under100),
      safeDivide(100 + b.bossDmg + a[5], 100 + b.bossDmg),
      safeDivide(100 + Math.min(b.polar + a[6], 60), 100 + Math.min(b.polar, 60)),
      safeDivide(100 + b.atkPercent + a[7], 100 + b.atkPercent),
      safeDivide(100 + b.allSkill + a[8], 100 + b.allSkill),
      safeDivide(100 + b.critSkill + a[9], 100 + b.critSkill),
      safeDivide(crit + a[10], crit),
      safeDivide(100 + b.normalDmg + a[11], 100 + b.normalDmg)
    ];
  }
  function computeScore(b, a, env, crit) { let t = 1; for (const f of factors(b, a, env, crit)) t *= f; return t * 100 - 100; }

  // 아이템DB 가공 (한 번만)
  function prepareDb(items) {
    const setToParts = new Map(), displayBySetPart = new Map(), statsByDisplay = new Map(), partCandidates = new Map();
    const displayToPart = new Map(), displayToSet = new Map(), setEffectByKey = new Map(), fiveSetStats = new Map(), fiveSetDisplay = new Map(), fiveSetList = [];
    const setEffects = []; // {set, need, display}
    for (const [category, setName, part, display, statName, statValue, needCount] of items) {
      if (category === FIVESET_CATEGORY && setName) {
        if (!fiveSetStats.has(setName)) { fiveSetStats.set(setName, emptySums()); fiveSetList.push(setName); }
        if (statName && TARGET_STATS.includes(statName)) fiveSetStats.get(setName)[statName] += statValue;
        if (display && !fiveSetDisplay.has(setName)) fiveSetDisplay.set(setName, display);
        continue;
      }
      if (setName && display && part && ALL_PARTS.includes(part)) {
        if (!setToParts.has(setName)) setToParts.set(setName, []);
        const arr = setToParts.get(setName); if (!arr.includes(part)) arr.push(part);
        if (!displayToSet.has(display)) displayToSet.set(display, setName);
      }
      if (setName && part && display) { const k = setName + '||' + part; if (!displayBySetPart.has(k)) displayBySetPart.set(k, display); }
      if (display && statName && TARGET_STATS.includes(statName)) {
        let b = statsByDisplay.get(display); if (!b) { b = emptySums(); statsByDisplay.set(display, b); } b[statName] += statValue;
      }
      if (display && part && statName) {
        if (!partCandidates.has(part)) partCandidates.set(part, new Set());
        partCandidates.get(part).add(display);
        if (!displayToPart.has(display)) displayToPart.set(display, part);
      }
      if (category === '세트효과' && setName && needCount > 0 && display) {
        const k = setName + '||' + needCount; if (!setEffectByKey.has(k)) { setEffectByKey.set(k, display); setEffects.push({ set: setName, need: needCount, display }); }
      }
    }
    return { setToParts, displayBySetPart, statsByDisplay, partCandidates, displayToPart, displayToSet, setEffectByKey, fiveSetStats, fiveSetDisplay, fiveSetList, setEffects };
  }

  // 3세트 조합 가능 여부 (조합DB '가능 여부'와 같은 계산)
  function comboFeasible(pA, pB, pC) {
    if (pA.length < 3 || pB.length < 3 || pC.length < 3) return false;
    const slots = [pA, pA, pA, pB, pB, pB, pC, pC, pC], match = {};
    const aug = (si, vis) => { for (const p of slots[si]) { if (vis[p]) continue; vis[p] = true; if (match[p] === undefined || aug(match[p], vis)) { match[p] = si; return true; } } return false; };
    let c = 0; for (let s = 0; s < 9; s++) if (aug(s, {})) c++;
    return c === 9;
  }

  // 지금 입은 것의 스탯 합 (설정!J13:J25 — 개별·5셋 + 발동된 세트효과)
  function wornContribution(db, worn) {
    const sums = emptySums(); const counts = new Map(); const active = [];
    for (const part of ['아바타5셋'].concat(ALL_PARTS)) {
      const d = worn[part]; if (!d) continue;
      if (part === '아바타5셋') {
        for (const [s, disp] of db.fiveSetDisplay) if (disp === d) addSums(sums, db.fiveSetStats.get(s));
        continue;
      }
      addSums(sums, db.statsByDisplay.get(d));
      const s = db.displayToSet.get(d); if (s) counts.set(s, (counts.get(s) || 0) + 1);
    }
    for (const e of db.setEffects) if ((counts.get(e.set) || 0) >= e.need) { addSums(sums, db.statsByDisplay.get(e.display)); active.push(e.display); }
    return { sums, active };
  }

  /* 순정 스탯 (설정!AK) — cur: 현재 스탯(설정 G13:G25), opt: 변수 제어 */
  const RALLY_ADAPT = { '수색대원의 결의': 2, '엘 하우스 버프': 0, '공존의 축제 버프': 3 };
  const RALLY_BOSS = { '엘 하우스 버프': 0, '강화 엘 하우스 버프': 2, '수색대원의 결의': 2, '공존의 축제 버프': 0 };
  const GUILD = { '2.5% (5레벨)': 2.5, '2.0% (4레벨)': 2, '1.5% (3레벨)': 1.5, '1.0% (2레벨)': 1, '0.5% (1레벨)': 0.5, '0% (0레벨)': 0 };
  const ATMA = { '없음': 1, '일반': 1.2, '레어': 1.23, '엘리트': 1.26, '유니크': 1.3 };
  const MEDAL = { '없음': 1, '1개 장착(0.5%)': 1.005, '2개 장착(1%)': 1.01 };
  const IMPRINT = { '없음': 1, '4% (찬란석 하옵)': 1.04, '5% (찬란석 상옵)': 1.05, '5.5% (강수, 11강)': 1.055, '6% (강수, 12강)': 1.06, '6.5% (강수, 13강)': 1.065 };
  function bareStats(cur, J, cls, chars, opt) {
    const c = chars[cls] || [0, 1, 0, 1, '', 0, 0, 150]; // [합연산 크댐증, 곱연산 크댐증, 합연산 보댐증, -, 물/마, 패시브 물마퍼, 강렬/초월, 기본 크리]
    const g = (k) => Number(cur[k] || 0);
    const adapt = g('적응력') + (RALLY_ADAPT[opt.rally] || 0) + (opt.elixir ? 3 : 0) + Number(opt.adaptEtc || 0) - J['적응력'];
    const bossN = g('보댐증') - J['보댐증'] + (GUILD[opt.guild] || 0) + c[2] + Number(opt.bossEtc || 0) + (RALLY_BOSS[opt.rally] || 0);
    const base = {
      adapt, superAdapt: g('초적응력') - J['초적응력'], strong: g('강배') - J['강배'], reverseStrong: g('역강배') - J['역강배'],
      under100: g('100이하') - J['100이하'], bossDmg: g('추피') - J['추피'], polar: g('양극화') - J['양극화'],
      atkPercent: g('물마퍼') - J['물마퍼'], allSkill: g('모스댐') - J['모스댐'], critSkill: g('초댐증') - J['초댐증'] + c[6],
      normalDmg: bossN
    };
    const critBase = c[7];
    const mul = (opt.party ? 1.1 : 1) * (opt.maestro ? 1.03 : 1) * (ATMA[opt.atma] || 1) * (MEDAL[opt.medal] || 1) * (IMPRINT[opt.imprint] || 1) * Number(opt.critMul || 1) * c[1];
    const critReal = critBase * mul + (g('크댐증') + Number(opt.critAdd || 0) + c[0] - critBase);
    return { base, baseCritReal: critReal - J['크댐증'], baseCooldownBare: g('쿨감') - J['쿨감'] };
  }

  /* 추천 실행. p = {items, chars, cls, cur, worn, fixed, fiveFixed, opt:{env, cool, coolAtLeast, owned(Set|null), ...}} */
  function run(p) {
    const db = prepareDb(p.items);
    const opt = p.opt || {};
    const J = wornContribution(db, p.worn || {});
    const bare = bareStats(p.cur || {}, J.sums, p.cls, p.chars || {}, opt);
    const env = Number(opt.env != null ? opt.env : 95);
    const curScore = computeScore(bare.base, sumsToAddArr(J.sums), env, bare.baseCritReal);

    // 컨텍스트 (Code.gs loadRecommendationContext_)
    const clone = (m) => new Map([...m].map(([k, v]) => [k, Array.isArray(v) ? v.slice() : v instanceof Set ? new Set(v) : v]));
    const setToParts = clone(db.setToParts), partCandidates = clone(db.partCandidates);
    let fiveSetList = db.fiveSetList.slice();
    const worn = p.worn || {}, fixedIn = p.fixed || {};
    const fiveSetFixed = !!p.fiveFixed;
    let current5set = '';
    for (const [s, d] of db.fiveSetDisplay) if (d === worn['아바타5셋']) { current5set = s; break; }
    const fixedChecks = { '아바타5셋': fiveSetFixed }, currentFixedDisplays = { '아바타5셋': worn['아바타5셋'] || '' };
    for (const part of ALL_PARTS) { fixedChecks[part] = !!fixedIn[part]; currentFixedDisplays[part] = worn[part] || ''; }
    const owned = opt.owned || null;
    if (owned) {
      const keep = new Set(owned);
      for (const part of ALL_PARTS) if (fixedChecks[part] && currentFixedDisplays[part]) keep.add(currentFixedDisplays[part]);
      fiveSetList = fiveSetList.filter(s => keep.has(db.fiveSetDisplay.get(s) || '') || (fiveSetFixed && s === current5set));
      for (const [, set] of partCandidates) for (const d of [...set]) if (!keep.has(d)) set.delete(d);
      for (const [s, arr] of setToParts) { const k = arr.filter(pp => keep.has(db.displayBySetPart.get(s + '||' + pp) || '')); arr.length = 0; arr.push(...k); }
    }
    const coolRaw = Number(opt.cool || 0), coolOn = isFinite(coolRaw) && coolRaw > 0;
    const coolMode = opt.coolAtLeast === false ? 'exact' : 'atleast';
    let coolTarget = 0;
    if (coolOn) {
      coolTarget = coolRaw <= bare.baseCooldownBare ? bare.baseCooldownBare : bare.baseCooldownBare + Math.ceil((coolRaw - bare.baseCooldownBare) / COOLDOWN_STEP) * COOLDOWN_STEP;
      if (coolTarget > COOLDOWN_CAP) coolTarget = COOLDOWN_CAP;
    }
    const maxCoolByPart = new Map();
    for (const [part, set] of partCandidates) { let mx = 0; for (const d of set) { const s = db.statsByDisplay.get(d); if (s && s['쿨감'] > mx) mx = s['쿨감']; } maxCoolByPart.set(part, mx); }
    const eliosFixedParts = ALL_PARTS.filter(pp => fixedChecks[pp] && db.displayToSet.get(currentFixedDisplays[pp]) === ELIOS_SET_NAME);
    const effOf = (set, need) => { const d = db.setEffectByKey.get(set + '||' + need); const o = emptySums(); if (d) addSums(o, db.statsByDisplay.get(d)); return o; };
    const eliosPartStats = new Map(), eliosDisplayByPart = new Map();
    for (const pp of (setToParts.get(ELIOS_SET_NAME) || [])) { const d = db.displayBySetPart.get(ELIOS_SET_NAME + '||' + pp); if (!d) continue; eliosPartStats.set(pp, db.statsByDisplay.get(d) || emptySums()); eliosDisplayByPart.set(pp, d); }
    const eligibleSets = [...setToParts].filter(([s, parts]) => s !== ELIOS_SET_NAME && parts.length >= 3).map(([s]) => s);
    const ctx = {
      db, setToParts, partCandidates, statsByDisplay: db.statsByDisplay, displayBySetPart: db.displayBySetPart,
      envDebuff: env, baseStat: bare.base, baseCritReal: bare.baseCritReal, baseCooldownBare: bare.baseCooldownBare,
      fixedChecks, currentFixedDisplays, coolOn, coolMode, coolTarget, maxCoolByPart,
      fiveSetStats: db.fiveSetStats, fiveSetList, fiveSetFixed, current5set,
      eliosFixedParts, eliosK: eliosFixedParts.length, eliosEffect3: effOf(ELIOS_SET_NAME, 3), eliosEffect4: effOf(ELIOS_SET_NAME, 4),
      eliosPartStats, eliosDisplayByPart, eligibleSets, ownedFilterOn: !!owned,
      _setPartInfo: new Map(), _setEffect: new Map()
    };
    const fiveSets = fiveSetFixed ? (current5set ? [current5set] : fiveSetList) : fiveSetList;

    let best = null, mode = '';
    const k = ctx.eliosK;
    if (k >= 4) { mode = `엘리오스 ${k}셋 빌드`; best = runEliosBuild(ctx, fiveSets, k); }
    else if (k === 3) {
      const recs = buildCombos(ctx);
      const bY = runStandard(ctx, fiveSets, recs, ctx.eliosEffect3);
      let bX = null, bXP = 0; const maxP = ctx.ownedFilterOn ? Math.min(6, ctx.eliosPartStats.size) : (ctx.coolOn ? 4 : 0);
      for (let P = 4; P <= maxP; P++) { const bx = runEliosBuild(ctx, fiveSets, P); if (bx && (!bX || bx.score > bX.score)) { bX = bx; bXP = P; } }
      best = (!bY) ? bX : (!bX) ? bY : (bX.score > bY.score ? bX : bY);
      mode = best && best === bX ? `엘리오스 ${bXP}셋 빌드` : '엘리오스 3셋';
    } else {
      mode = '표준 9파츠';
      const recs = buildCombos(ctx);
      best = runStandard(ctx, fiveSets, recs, null);
      if (ctx.ownedFilterOn) {
        const maxP = Math.min(6, ctx.eliosPartStats.size);
        for (let P = Math.max(4, k + 1); P <= maxP; P++) { const bx = runEliosBuild(ctx, fiveSets, P); if (bx && (!best || bx.score > best.score)) { best = bx; mode = `엘리오스 ${P}셋 빌드`; } }
      }
    }
    if (best) best.fiveSetDisplay = db.fiveSetDisplay.get(best.fiveSet) || (best.fiveSet + ' 5셋');
    return { cur: { score: curScore, sums: J.sums, active: J.active }, bare, best, mode,
      gain: best ? (100 + best.score) / (100 + curScore) - 1 : 0, coolTarget };
  }

  function getSetPartInfo(ctx, s) {
    let m = ctx._setPartInfo.get(s); if (m) return m; m = new Map();
    for (const part of (ctx.setToParts.get(s) || [])) { const d = ctx.displayBySetPart.get(s + '||' + part) || ''; m.set(part, { display: d, stats: ctx.statsByDisplay.get(d) || null }); }
    ctx._setPartInfo.set(s, m); return m;
  }
  function getSetEffect(ctx, s) {
    let e = ctx._setEffect.get(s); if (e) return e;
    const displays = [], d2 = ctx.db.setEffectByKey.get(s + '||2'), d3 = ctx.db.setEffectByKey.get(s + '||3');
    if (d2) displays.push(d2); if (d3) displays.push(d3);
    const stats = emptySums(); for (const d of displays) addSums(stats, ctx.statsByDisplay.get(d));
    e = { displays, stats }; ctx._setEffect.set(s, e); return e;
  }
  function buildCombos(ctx) {
    const recs = [], sets = ctx.eligibleSets;
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) for (let q = j + 1; q < sets.length; q++) {
      const set1 = sets[i], set2 = sets[j], set3 = sets[q];
      const pA = ctx.setToParts.get(set1), pB = ctx.setToParts.get(set2), pC = ctx.setToParts.get(set3);
      if (!comboFeasible(pA, pB, pC)) continue;
      const iA = getSetPartInfo(ctx, set1), iB = getSetPartInfo(ctx, set2), iC = getSetPartInfo(ctx, set3);
      const eff = emptySums(); addSums(eff, getSetEffect(ctx, set1).stats); addSums(eff, getSetEffect(ctx, set2).stats); addSums(eff, getSetEffect(ctx, set3).stats);
      for (const a of combinations(pA, 3)) {
        const uA = new Set(a), pB2 = pB.filter(x => !uA.has(x)); if (pB2.length < 3) continue;
        for (const b of combinations(pB2, 3)) {
          const uAB = new Set(a.concat(b)), pC2 = pC.filter(x => !uAB.has(x)); if (pC2.length < 3) continue;
          for (const c of combinations(pC2, 3)) {
            const sums = emptySums();
            for (const x of a) addSums(sums, iA.get(x).stats); for (const x of b) addSums(sums, iB.get(x).stats); for (const x of c) addSums(sums, iC.get(x).stats);
            addSums(sums, eff);
            const parts = a.concat(b, c), used = new Set(parts), remain = ALL_PARTS.filter(x => !used.has(x));
            recs.push({ set1, set2, set3, parts,
              displays: [...a.map(x => iA.get(x).display), ...b.map(x => iB.get(x).display), ...c.map(x => iC.get(x).display)],
              baseAddArr: sumsToAddArr(sums), cool9: sums['쿨감'], remain: [remain[0] || '', remain[1] || '', remain[2] || ''] });
          }
        }
      }
    }
    return recs;
  }
  function runStandard(ctx, fiveSets, recs, forcedBase) {
    let best = null;
    for (const set of fiveSets) {
      const fin = process5Set(ctx, set, recs, forcedBase);
      if (!fin.length) continue;
      fin.sort((a, b) => b.finalScore - a.finalScore);
      if (!best || fin[0].finalScore > best.finals[0].finalScore) best = { set, finals: fin };
    }
    if (!best) return null;
    const f = best.finals[0], partToDisplay = {};
    for (let i = 0; i < 9; i++) partToDisplay[f.rec.parts[i]] = f.rec.displays[i];
    for (let i = 0; i < 3; i++) partToDisplay[f.rec.remain[i]] = f.best[i];
    return { fiveSet: best.set, score: f.finalScore, coolReal: f.coolReal, partToDisplay, setLabels: [f.rec.set1, f.rec.set2, f.rec.set3] };
  }
  function process5Set(ctx, fiveSet, recs, forcedBase) {
    const offset = mergeSums(ctx.fiveSetStats.get(fiveSet) || null, forcedBase);
    const baseCool = ctx.baseCooldownBare + (offset ? (offset['쿨감'] || 0) : 0);
    let scored = recs.map(rec => { const addArr = offset ? addArrPlus(rec.baseAddArr, offset) : rec.baseAddArr; return { rec, addArr, score: computeScore(ctx.baseStat, addArr, ctx.envDebuff, ctx.baseCritReal) }; });
    const T = ctx.coolTarget, atLeast = ctx.coolMode === 'atleast';
    if (ctx.coolOn) {
      scored = scored.filter(it => {
        let mx = 0, mn = 0;
        for (const p of it.rec.remain) {
          if (ctx.fixedChecks[p]) { const s = ctx.statsByDisplay.get(ctx.currentFixedDisplays[p]); const cv = s ? (s['쿨감'] || 0) : 0; mx += cv; mn += cv; }
          else mx += (ctx.maxCoolByPart.get(p) || 0);
        }
        const minT = Math.min(baseCool + it.rec.cool9 + mn, COOLDOWN_CAP), maxT = Math.min(baseCool + it.rec.cool9 + mx, COOLDOWN_CAP);
        return atLeast ? maxT >= T : (minT <= T && T <= maxT);
      });
    }
    scored.sort((x, y) => y.score - x.score);
    const top = scored.slice(0, scored.length < 10 ? scored.length : Math.ceil(scored.length * TOP_KEEP_RATIO));
    const finals = [], ZERO = emptySums();
    for (const it of top) {
      const rec = it.rec, spd = {};
      for (let q = 0; q < 9; q++) spd[rec.parts[q]] = rec.displays[q];
      let ok = true;
      for (const part in ctx.fixedChecks) { if (!ctx.fixedChecks[part] || part === '아바타5셋') continue; if (part in spd && spd[part] !== ctx.currentFixedDisplays[part]) { ok = false; break; } }
      if (!ok) continue;
      const cl = rec.remain.map(part => {
        let list = [...(ctx.partCandidates.get(part) || [])];
        if (ctx.fixedChecks[part]) list = list.filter(d => d === ctx.currentFixedDisplays[part]);
        return list.map(d => { const s = ctx.statsByDisplay.get(d) || ZERO; return { d, s, cool: s['쿨감'] || 0 }; });
      });
      const b9 = baseCool + rec.cool9; let bs = -Infinity, bA = '', bB = '', bC = '', bCool = 0;
      for (const x of cl[0]) { const a0 = addArrPlus(it.addArr, x.s), cA = b9 + x.cool;
        for (const y of cl[1]) { const ab = addArrPlus(a0, y.s), cAB = cA + y.cool;
          for (const z of cl[2]) { const tc = Math.min(cAB + z.cool, COOLDOWN_CAP);
            if (ctx.coolOn && (atLeast ? tc < T : tc !== T)) continue;
            const sc = computeScore(ctx.baseStat, addArrPlus(ab, z.s), ctx.envDebuff, ctx.baseCritReal);
            if (sc > bs) { bs = sc; bA = x.d; bB = y.d; bC = z.d; bCool = tc; } } } }
      if (bs > -Infinity) finals.push({ rec, best: [bA, bB, bC], finalScore: bs, score9: it.score, coolReal: bCool });
    }
    return finals;
  }
  function runEliosBuild(ctx, fiveSets, P) {
    const fixedEP = ctx.eliosFixedParts.slice(), autoCount = P - fixedEP.length; if (autoCount < 0) return null;
    const autoCand = ALL_PARTS.filter(p => !fixedEP.includes(p) && ctx.eliosPartStats.has(p));
    const autoCombos = autoCount === 0 ? [[]] : combinations(autoCand, autoCount);
    const T = ctx.coolTarget, atLeast = ctx.coolMode === 'atleast'; let best = null;
    for (const autoParts of autoCombos) {
      const EP = fixedEP.concat(autoParts); if (EP.length !== P) continue; const epSet = new Set(EP);
      const eb = emptySums(); for (const p of EP) addSums(eb, ctx.eliosPartStats.get(p)); addSums(eb, ctx.eliosEffect3); addSums(eb, ctx.eliosEffect4);
      const remainParts = ALL_PARTS.filter(p => !epSet.has(p));
      const os = ctx.eligibleSets;
      for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) {
        const s2 = os[i], s3 = os[j];
        const ps2 = (ctx.setToParts.get(s2) || []).filter(p => !epSet.has(p)), ps3 = (ctx.setToParts.get(s3) || []).filter(p => !epSet.has(p));
        if (ps2.length < 3 || ps3.length < 3) continue;
        const i2 = getSetPartInfo(ctx, s2), i3 = getSetPartInfo(ctx, s3), e2 = getSetEffect(ctx, s2), e3 = getSetEffect(ctx, s3);
        for (const a of combinations(ps2, 3)) {
          const uA = new Set(a), ps3b = ps3.filter(p => !uA.has(p)); if (ps3b.length < 3) continue;
          for (const b of combinations(ps3b, 3)) {
            const used6 = new Set(a.concat(b)), free = remainParts.filter(p => !used6.has(p));
            const base = emptySums(); addSums(base, eb); for (const p of a) addSums(base, i2.get(p).stats); for (const p of b) addSums(base, i3.get(p).stats); addSums(base, e2.stats); addSums(base, e3.stats);
            const pd = {}; for (const p of EP) pd[p] = ctx.eliosDisplayByPart.get(p); for (const p of a) pd[p] = i2.get(p).display; for (const p of b) pd[p] = i3.get(p).display;
            let okFix = true; for (const fp of ALL_PARTS) { if (ctx.fixedChecks[fp] && fp in pd && pd[fp] !== ctx.currentFixedDisplays[fp]) { okFix = false; break; } } if (!okFix) continue;
            const bAA = sumsToAddArr(base);
            for (const fiveSet of fiveSets) {
              const off = ctx.fiveSetStats.get(fiveSet) || null, addArr0 = off ? addArrPlus(bAA, off) : bAA.slice();
              const cool0 = ctx.baseCooldownBare + (off ? (off['쿨감'] || 0) : 0) + base['쿨감'];
              const fr = optimizeFree(ctx, free, addArr0, cool0, T, atLeast); if (!fr) continue;
              if (!best || fr.score > best.score) { const full = Object.assign({}, pd); free.forEach((p, t) => { full[p] = fr.displays[t]; }); best = { fiveSet, score: fr.score, coolReal: fr.cool, partToDisplay: full, setLabels: [ELIOS_SET_NAME, s2, s3] }; }
            }
          }
        }
      }
    }
    return best;
  }
  function optimizeFree(ctx, free, baseAddArr, cool0, T, atLeast) {
    const ZERO = emptySums();
    const cl = free.map(part => { let list = [...(ctx.partCandidates.get(part) || [])]; if (ctx.fixedChecks[part]) list = list.filter(d => d === ctx.currentFixedDisplays[part]); return list.map(d => { const s = ctx.statsByDisplay.get(d) || ZERO; return { d, s, cool: s['쿨감'] || 0 }; }); });
    const bad = (t) => ctx.coolOn && (atLeast ? t < T : t !== T);
    if (free.length === 0) { const t = Math.min(cool0, COOLDOWN_CAP); if (bad(t)) return null; return { score: computeScore(ctx.baseStat, baseAddArr, ctx.envDebuff, ctx.baseCritReal), displays: [], cool: t }; }
    let best = null;
    if (free.length === 1) { for (const x of cl[0]) { const t = Math.min(cool0 + x.cool, COOLDOWN_CAP); if (bad(t)) continue; const sc = computeScore(ctx.baseStat, addArrPlus(baseAddArr, x.s), ctx.envDebuff, ctx.baseCritReal); if (!best || sc > best.score) best = { score: sc, displays: [x.d], cool: t }; } return best; }
    if (free.length === 2) { for (const x of cl[0]) for (const y of cl[1]) { const t = Math.min(cool0 + x.cool + y.cool, COOLDOWN_CAP); if (bad(t)) continue; const sc = computeScore(ctx.baseStat, addArrPlus(addArrPlus(baseAddArr, x.s), y.s), ctx.envDebuff, ctx.baseCritReal); if (!best || sc > best.score) best = { score: sc, displays: [x.d, y.d], cool: t }; } return best; }
    return null;
  }

  const api = { run, prepareDb, wornContribution, bareStats, computeScore, ALL_PARTS, TARGET_STATS, GUILD, ATMA, MEDAL, IMPRINT, RALLY: ['없음', '수색대원의 결의', '엘 하우스 버프', '강화 엘 하우스 버프', '공존의 축제 버프'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SilAvRec = api;
})(typeof window !== 'undefined' ? window : globalThis);
