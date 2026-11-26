/* 가열기 아바타 추천 카드: 장비창 스크린샷에서 지금 입은 아바타·레어 악세 인식 + 룰루님 시트 방식 추천 */
(function () {
  'use strict';
  const A = window.SIL_AV, R = window.SilAvRec, APP = window.SilApp;
  if (!A || !R || !APP) return;
  const $ = (s) => document.querySelector(s);
  const el = APP.el;
  const PARTS = ['한벌', '아바타5셋', '무기', '웨폰가드', '서포트유닛', '얼굴(상)', '얼굴(중)', '얼굴(하)', '상의', '하의', '팔', '귀걸이', '목걸이', '반지'];
  const PART_LABEL = { '아바타5셋': '아바타 5셋', '한벌': '한벌 아바타', '무기': '무기 아바타' };
  // 한벌 아바타: 실투력 시트 '아이템 테이블'의 한벌 아바타 값(공은 물공·마공 같은 값, 나머지는 %). 다른 부위와 따로 입는 칸이라 세트 효과 없이 더하기만
  const SUITS = {
    '공존의 축제 예복': { atk: 20, mp: 1, crit: 1 },
    '엘리오스의 고귀한 결투사 예복': { atk: 40, mos: 1 },
    '공존의 축제 엘리아노드 의상': { atk: 20, max: 3, mos: 2 },
    '스포티 메이드': { atk: 30, crit: 3, mos: 2 },
    '베스마풍 공존의 축제 의상': { atk: 25, max: 3, spd: 3, dot: 2 },
    '천하일미 덤플링 서번트 의상': { atk: 25, crit: 3, pol: 3 },
    '동방미식 덤플링 서번트 의상': { atk: 25, max: 3, adapt: 3 },
    '모험가 성장 부스팅 투명 아바타': { atk: 30, crit: 5, max: 5, spd: 5, mos: 4, limited: true },
  };
  // 동작속도(spd)는 실투력 시트에 칸이 없어서 안 씀
  const SUIT_CELL = { crit: 'C17', max: 'C19', mos: 'C33', pol: 'C20', adapt: 'C14', dot: 'C22', boss: 'C21' };
  const db = R.prepareDb(A.items);
  const optionsOf = (part) => part === '아바타5셋' ? db.fiveSetList.map(s => db.fiveSetDisplay.get(s)) : part === '한벌' ? Object.keys(SUITS) : [...(db.partCandidates.get(part) || [])];
  const short = (d) => { const t = String(d || ''); const m = t.match(/^(.+?) : (.+)$/); return m ? m[2] + ' · ' + m[1] : t; };

  // ---------- 저장 (세팅별 착용·고정, 공용 계산 조건·보유 목록) ----------
  const KEY = 'silcalc.av.v1';
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  st.p = st.p || {}; st.o = Object.assign({ guild: '2.5% (5레벨)', elixir: false, adaptEtc: 0, bossEtc: 0, medal: '없음', critAdd: 0, critMul: 1, cool: 0, coolAtLeast: true }, st.o || {});
  // 목표 쿨감 기본값이 35 → 0(조건 없음)으로 바뀜. 쿨감도 실투력에 들어가 있어서 조건 없이 실투력만 보고 고르는 게 기본
  if (st.o.coolV !== 2) { if (Number(st.o.cool) === 35) st.o.cool = 0; st.o.coolV = 2; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 무시 */ } }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 공간 없음 */ } };
  const prof = () => { const k = APP.key() || 'default'; if (!st.p[k]) st.p[k] = { worn: {}, fixed: {}, how: {} }; return st.p[k]; };

  // ---------- 계산기 값 → 시트의 '현재 스탯' ----------
  const num = (c) => { const v = Number(APP.val(c)); return isFinite(v) ? v : 0; };
  const pct = (c) => Math.round(num(c) * 10000) / 100;
  function curStats() {
    const cls = sheetClass(APP.cls());
    const atk = num('C11'), mx = num('C12'), wep = num('C13');
    const mp = wep > 0 ? Math.round(((mx - atk) / (0.55 * wep) * 100 - 100 + (cls === '메타모르피' ? 20 : 0)) * 100) / 100 : 0;
    return { '적응력': pct('C14'), '초적응력': pct('C15'), '강배': pct('C24'), '역강배': pct('C25'), '100이하': pct('C26'), '추피': pct('C22'), '양극화': pct('C20'),
      '물마퍼': mp, '모스댐': pct('C33'), '초댐증': pct('C30'), '크댐증': pct('C18'), '보댐증': pct('C21'), '쿨감': pct('C32') || pct('C31'), '강렬댐증': pct('C29') };
  }
  const IMPRINT_OF = { 0.04: '4% (찬란석 하옵)', 0.05: '5% (찬란석 상옵)', 0.055: '5.5% (강수, 11강)', 0.06: '6% (강수, 12강)', 0.065: '6.5% (강수, 13강)' };
  function calcOpts() {
    const inp = APP.inputs();
    let env = num('L8'); if (env > 0 && env <= 1.5) env *= 100; if (!(env > 0)) env = 95;
    let imprint = '없음';
    for (const [k, v] of [['D20', 'H20'], ['D21', 'H21'], ['D22', 'H22']]) if (String(inp[k] || '').startsWith('크리티컬 데미지')) imprint = IMPRINT_OF[Math.round(Number(inp[v]) * 1000) / 1000] || imprint;
    const atma = inp.G34 === '초목' ? ({ '일반': '일반', '레어': '레어', '엘리트': '엘리트', '유니크': '유니크' }[inp.H34] || '없음') : '없음';
    const town = String(inp.J17 || '');
    const rally = /강화/.test(town) && /엘 ?하우스/.test(town) ? '강화 엘 하우스 버프' : /엘 ?하우스/.test(town) ? '엘 하우스 버프' : /수색대원/.test(town) ? '수색대원의 결의' : /공존/.test(town) ? '공존의 축제 버프' : '없음';
    return { env: Math.round(env * 100) / 100, party: Number(inp.H11) > 0, maestro: inp.G27 === '마에스트로 헤일로', atma, imprint, rally };
  }

  // ---------- 화면 인식 ----------
  const F = 16, MASK = new Uint8Array(F * F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) MASK[y * F + x] = ((x >= 11 && y < 10) || (x >= 9 && y >= 9) || (x < 4 && y < 4)) ? 0 : 1;
  const b64 = (b) => Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
  function feat(canvas, x, y, s) {
    const t = document.createElement('canvas'); t.width = F; t.height = F;
    const g = t.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, x, y, s, s, 0, 0, F, F);
    const d = g.getImageData(0, 0, F, F).data, f = new Uint8Array(F * F * 3);
    for (let i = 0; i < F * F; i++) { f[i * 3] = d[i * 4]; f[i * 3 + 1] = d[i * 4 + 1]; f[i * 3 + 2] = d[i * 4 + 2]; }
    return f;
  }
  function dist(a, b) { let s = 0, n = 0; for (let i = 0; i < F * F; i++) { if (!MASK[i]) continue; const k = i * 3; s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); n += 3; } return s / n; }
  const loaded = {};
  function loadChar(k) {
    if (loaded[k]) return loaded[k];
    loaded[k] = new Promise((res, rej) => {
      if (window.SIL_AV_ICONS && window.SIL_AV_ICONS[k]) return res(window.SIL_AV_ICONS[k]);
      const s = document.createElement('script'); s.src = `av/c${k}.js?v=${A.ver || 1}`;
      s.onload = () => (window.SIL_AV_ICONS && window.SIL_AV_ICONS[k]) ? res(window.SIL_AV_ICONS[k]) : rej(new Error('아이콘 없음'));
      s.onerror = () => { loaded[k] = null; rej(new Error('아이콘을 못 불러왔어요')); };
      document.head.appendChild(s);
    });
    return loaded[k];
  }
  // 방어구(엑사스케일·네블론·테네브로스)·한벌 아바타 아이콘(코보덱스)
  const loaded2 = {};
  function loadGear2(k) {
    if (loaded2[k]) return loaded2[k];
    loaded2[k] = new Promise((res, rej) => {
      if (window.SIL_GEAR2 && window.SIL_GEAR2[k]) return res(window.SIL_GEAR2[k]);
      const s = document.createElement('script'); s.src = `av/g${k}.js?v=${A.ver || 1}3`;
      s.onload = () => (window.SIL_GEAR2 && window.SIL_GEAR2[k]) ? res(window.SIL_GEAR2[k]) : rej(new Error('아이콘 없음'));
      s.onerror = () => { loaded2[k] = null; rej(new Error('아이콘을 못 불러왔어요')); };
      document.head.appendChild(s);
    });
    return loaded2[k];
  }
  // 방어구 칸은 왼쪽 위 S·자물쇠 표시와 오른쪽 아래 회로 표시를 빼고 비교
  const MASK_ARM = new Uint8Array(F * F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) MASK_ARM[y * F + x] = ((x < 6 && y < 6) || (x >= 10 && y >= 10)) ? 0 : 1;
  // 잠근 아이템은 왼쪽 위에 큰 자물쇠 방패가 덮여 있어서, 보통 비교로 못 알아보면 그 자리까지 빼고 다시 비교
  const MASK_LOCK = new Uint8Array(F * F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) MASK_LOCK[y * F + x] = ((x >= 11 && y < 10) || (x >= 9 && y >= 9) || (x < 8 && y < 9)) ? 0 : 1;
  function distM(a, b, M) { let s = 0, n = 0; for (let i = 0; i < F * F; i++) { if (!M[i]) continue; const k = i * 3; s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); n += 3; } return s / n; }
  // 칸(x, y, 크기 s) 안의 아이콘을 크기·자리를 조금씩 바꿔 가며 견본들과 비교: 이름별 가장 가까운 거리
  function scan(canvas, x0, y0, s, scales, pool, M) {
    const byName = {}, R = Math.max(2, Math.round(s * 0.07));
    for (const k of scales) {
      const z = Math.round(s * k), off = Math.round((s - z) / 2);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = Math.round(x0 + off + dx), y = Math.round(y0 + off + dy);
        if (x < 0 || y < 0 || x + z > canvas.width || y + z > canvas.height) continue;
        const f = feat(canvas, x, y, z);
        for (const e of pool) { const d = distM(f, e.fb, M); if (!(e.n in byName) || d < byName[e.n]) byName[e.n] = d; }
      }
    }
    return Object.entries(byName).map(([n, d]) => ({ n, d })).sort((a, b) => a.d - b.d);
  }
  async function recognizeArmor(canvas, grid, k) {
    const lib = await loadGear2(k);
    const P = grid.pitch, left = grid.cells.filter(c => c.slot[0] === '좌');
    if (!left.length) return null;
    const ax = left[0].x, ay = Math.min(...left.map(c => c.y)), S = 1.2381 * P, top = ay - 1.9762 * P, avx = ax - 13.2857 * P;
    const armor = {};
    ['상의', '하의', '장갑', '신발'].forEach((part, i) => {
      const pool = Object.entries(lib.a || {}).filter(([, v]) => v[i]).map(([n, v]) => ({ n, fb: b64(v[i]) }));
      if (!pool.length) return;
      const r = scan(canvas, avx + 1.2857 * P, top + (i + 2) * 1.3095 * P, S, [1.0, 1.06, 1.12], pool, MASK_ARM);
      const best = r[0], gap = r[1] ? r[1].d - best.d : 99;
      armor[part] = { set: best.n, d: Math.round(best.d * 10) / 10, gap: Math.round(gap * 10) / 10, ok: best.d <= 18 && gap >= 4 };
    });
    let suit = null;
    const sp = (lib.s || []).map(([n, f]) => ({ n, fb: b64(f) }));
    if (sp.length) {
      const judge = (r) => { const best = r[0], gap = r[1] ? r[1].d - best.d : 99; return { name: best.n, d: Math.round(best.d * 10) / 10, gap: Math.round(gap * 10) / 10, ok: (best.d <= 21 && gap >= 4) || (best.d <= 25 && gap >= 8) }; };
      suit = judge(scan(canvas, avx, top, S, [0.94, 1.0, 1.06, 1.12], sp, MASK));
      if (!suit.ok) { const sl = judge(scan(canvas, avx, top, S, [0.94, 1.0, 1.06, 1.12], sp, MASK_LOCK)); if (sl.ok) suit = Object.assign(sl, { locked: true }); }
    }
    return { armor, suit };
  }
  // 전직 → 캐릭터 (캐릭터DB 순서: 캐릭터마다 4전직, 루/시엘은 9·10)
  const nsp = (t) => String(t || '').replace(/\s+/g, '');
  const sheetClass = (cls) => Object.keys(A.chars).find(k => nsp(k) === nsp(cls)) || cls;
  function charsOfClass(cls) {
    const i = Object.keys(A.chars).indexOf(sheetClass(cls));
    if (i < 0) return null;
    if (i < 36) return [Math.floor(i / 4)];
    if (i < 40) return [9, 10];
    return [Math.floor(i / 4) + 1];
  }
  // 장비창 칸 위치 (초록 일반 악세 격자 기준, 1920x1080에서 잰 비율)
  function slotBoxes(grid) {
    const P = grid.pitch, s = grid.size;
    const left = grid.cells.filter(c => c.slot[0] === '좌');
    if (!left.length) return null;
    const ax = left[0].x, ay = Math.min(...left.map(c => c.y));
    const out = [];
    const ACC0 = ['웨폰가드', '얼굴(상)', '얼굴(중)', '얼굴(하)', '귀걸이', null], ACC1 = ['서포트유닛', '상의', '하의', '팔', '목걸이', '반지'];
    for (let r = 0; r < 6; r++) {
      if (ACC0[r]) out.push({ part: ACC0[r], kind: 'acc', x: ax - 2.0952 * P, y: ay + r * P, s });
      out.push({ part: ACC1[r], kind: 'acc', x: ax - 1.0952 * P, y: ay + r * P, s });
    }
    const S = 1.2381 * P, top = ay - 1.9762 * P;
    out.push({ part: '무기', kind: 'wep', x: ax - 0.5476 * P, y: top, s: S });
    ['헤어', '상의', '하의', '장갑', '신발'].forEach((pc, i) => out.push({ part: '아바타5셋', piece: pc, kind: 'av', x: ax - 13.2857 * P, y: top + (i + 1) * 1.3095 * P, s: S }));
    return out.map(b => Object.assign(b, { x: Math.round(b.x), y: Math.round(b.y), s: Math.round(b.s) }));
  }
  function bgColor(canvas, boxes) {
    const g = canvas.getContext('2d', { willReadFrequently: true }); const px = [];
    for (const b of boxes.filter(q => q.kind === 'acc')) {
      const k = Math.max(2, Math.round(b.s * 0.12)), i = Math.max(2, Math.round(b.s * 0.08));
      for (const [ox, oy] of [[i, i], [i, b.s - i - k]]) {
        if (b.x + ox < 0 || b.y + oy < 0 || b.x + ox + k > canvas.width || b.y + oy + k > canvas.height) continue;
        const d = g.getImageData(b.x + ox, b.y + oy, k, k).data;
        for (let j = 0; j < d.length; j += 4) px.push([d[j], d[j + 1], d[j + 2]]);
      }
    }
    if (!px.length) return null;
    const med = (ch) => { const a = px.map(p => p[ch]).sort((x, y) => x - y); return a[a.length >> 1]; };
    return [med(0), med(1), med(2)];
  }
  const MATCH = 13;
  async function recognize(canvas, gear) {
    if (!gear || !gear.grid) return { ok: false, why: '캐릭터 장비창(일반 악세서리 초록 칸)을 못 찾았어요' };
    const boxes = slotBoxes(gear.grid); if (!boxes) return { ok: false, why: '장비창 칸 위치를 못 잡았어요' };
    const bg = bgColor(canvas, boxes);
    let cand = charsOfClass((gear.cls && gear.cls.match && gear.cls.match.name) || APP.cls());
    const byBg = bg ? A.charNames.map((n, k) => ({ k, d: Math.hypot(...A.bg[k].map((v, j) => v - bg[j])) })).sort((a, b) => a.d - b.d) : [];
    if (!cand) cand = byBg.length ? [byBg[0].k] : null;
    else if (cand.length > 1 && byBg.length) cand = [byBg.find(x => cand.includes(x.k)).k];
    if (!cand) return { ok: false, why: '캐릭터를 알 수 없어요' };
    const k = cand[0];
    const lib = (await loadChar(k)).map(e => Object.assign({}, e, { fb: e.fb || (e.fb = b64(e.f)) }));
    const found = {}, detail = [];
    const pieces = {};
    for (const b of boxes) {
      const pool = lib.filter(e => b.kind === 'acc' ? e.k === 'acc' : b.kind === 'wep' ? e.k === 'wep' : (e.k === 'av' && e.p === b.piece));
      if (!pool.length) continue;
      const ins = Math.max(1, Math.round(b.s * 0.05)), st = Math.max(1, Math.round(b.s / 40));
      // 아바타·무기 칸은 초록 격자에서 멀리 떨어져 있어서(1920x1080이 아닌 화면에선 몇 픽셀 어긋남) 더 넓게 찾음
      const R = b.kind === 'acc' ? Math.max(st, Math.round(b.s / 18)) : Math.max(2, Math.round(b.s / 16)), stp = 1;
      const byName = {}, byNameL = {};
      for (let dy = -R; dy <= R; dy += stp) for (let dx = -R; dx <= R; dx += stp) {
        const x = b.x + ins + dx, y = b.y + ins + dy, s = b.s - 2 * ins;
        if (x < 0 || y < 0 || x + s > canvas.width || y + s > canvas.height) continue;
        const f = feat(canvas, x, y, s);
        for (const e of pool) {
          const d = dist(f, e.fb); if (!(e.n in byName) || d < byName[e.n].d) byName[e.n] = { d, e };
          const dl = distM(f, e.fb, MASK_LOCK); if (!(e.n in byNameL) || dl < byNameL[e.n].d) byNameL[e.n] = { d: dl, e };
        }
      }
      // 충분히 가깝거나, 조금 멀어도 2등과 차이가 아주 크면 인정(염색·별 표시·화질 차이로 거리가 조금 커지는 경우)
      const judge = (m) => { const r = Object.values(m).sort((a, b2) => a.d - b2.d); if (!r.length) return null; const best = r[0], second = r[1] ? r[1].d : Infinity; return { best, gap: second - best.d, ok: (best.d <= MATCH && second - best.d >= 3) || (best.d <= 18 && second - best.d >= 8) }; };
      let jd = judge(byName); if (!jd) continue;
      if (!jd.ok) { const jl = judge(byNameL); if (jl && jl.ok) jd = Object.assign(jl, { locked: true }); }
      const best = jd.best, ok = jd.ok;
      detail.push({ part: b.part, piece: b.piece, name: best.e.n, d: best.d, gap: jd.gap, ok, locked: !!jd.locked });
      if (!ok) continue;
      if (b.kind === 'av') { pieces[best.e.d] = (pieces[best.e.d] || 0) + 1; continue; }
      if (b.part === best.e.p || b.kind === 'wep') found[b.part] = { d: best.e.d, n: best.e.n, known: optionsOf(b.part).includes(best.e.d) };
    }
    // 5셋: 다섯 부위 중 셋 이상 같은 세트면 그 세트
    const top5 = Object.entries(pieces).sort((a, b) => b[1] - a[1])[0];
    if (top5 && top5[1] >= 3) found['아바타5셋'] = { d: top5[0], n: top5[0], known: optionsOf('아바타5셋').includes(top5[0]), pieces: top5[1] };
    // 방어구 종류(계산기 장비 칸)·한벌 아바타
    let armor = null;
    try {
      const g2 = await recognizeArmor(canvas, gear.grid, k);
      if (g2) {
        armor = g2.armor;
        if (g2.suit && g2.suit.ok) found['한벌'] = { d: g2.suit.name, n: g2.suit.name, known: true };
        detail.push({ part: '한벌', name: g2.suit ? g2.suit.name : '', d: g2.suit ? g2.suit.d : null, gap: g2.suit ? g2.suit.gap : null, ok: !!(g2.suit && g2.suit.ok) });
      }
    } catch (e) { console.warn(e); }
    return { ok: true, char: A.charNames[k], found, detail, armor };
  }
  // 앱에서 스크린샷을 읽은 뒤 부름
  async function fromShot(canvas, gear) {
    const r = await recognize(canvas, gear);
    if (!r.ok) { lastRec = r; render(); return r; }
    if (gear && r.armor) gear.armor = r.armor; // 계산기 인식 결과에 방어구 종류 줄로 보여 줌
    const p = prof();
    for (const part of PARTS) {
      const f = r.found[part];
      if (f && f.known) { p.worn[part] = f.d; p.how[part] = 'shot'; }
      else { p.worn[part] = ''; p.how[part] = f ? 'other:' + f.n : 'none'; }
    }
    save(); lastRec = r; result = null; render();
    return r;
  }
  let lastRec = null, result = null;
  async function readShot(blob) {
    const note = $('#avNote'); note.textContent = '스크린샷에서 아바타를 찾는 중이에요';
    try {
      const bm = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
      if (window.SilGear) await window.SilGear.load().catch(() => {});
      const gear = window.SilGear ? window.SilGear.recognize(c) : null;
      await fromShot(c, gear || {});
    } catch (e) { console.error(e); lastRec = { ok: false, why: '사진을 읽지 못했어요' }; render(); }
  }

  // ---------- 카드 ----------
  const OPT_SEL = { guild: Object.keys(R.GUILD), medal: Object.keys(R.MEDAL) };
  function render() {
    const card = $('#avCard'); if (!card) return;
    const p = prof();
    const note = $('#avNote');
    if (lastRec && !lastRec.ok) note.textContent = lastRec.why + '. 아래에서 직접 골라 주세요';
    else if (lastRec && lastRec.ok) {
      const n = Object.keys(lastRec.found).length;
      note.textContent = `${lastRec.char} 장비창에서 ${n}칸을 알아봤어요. 다르면 직접 고쳐 주세요`;
    } else note.textContent = '장비창 스크린샷을 읽으면 지금 입은 아바타가 자동으로 채워져요';
    const body = $('#avWorn'); body.textContent = '';
    for (const part of PARTS) {
      const sel = el('select', { 'aria-label': (PART_LABEL[part] || part) + ' 지금 착용' });
      sel.append(el('option', { value: '', text: '없음·시트에 없는 것' }));
      for (const d of optionsOf(part)) sel.append(el('option', { value: d, text: short(d) }));
      sel.value = p.worn[part] || '';
      sel.onchange = () => { p.worn[part] = sel.value; p.how[part] = 'hand'; save(); result = null; renderResult(); renderTag(); };
      let row = null;
      const fx = el('input', { type: 'checkbox', 'aria-label': (PART_LABEL[part] || part) + ' 고정' });
      fx.checked = part === '아바타5셋' ? !!p.fiveFixed : !!p.fixed[part];
      fx.onchange = () => { if (part === '아바타5셋') p.fiveFixed = fx.checked; else p.fixed[part] = fx.checked; save(); result = null; renderResult(); };
      const tag = el('span', { class: 'av-tag' });
      // 비어 있는 칸(인식 못 함·시트에 없는 것·아직 안 고름)은 연한 빨간 상자로. 직접 '없음'을 고르면 확인한 걸로 봄
      const renderTag = () => {
        const h = p.how[part] || '', empty = !p.worn[part];
        tag.className = 'av-tag'; tag.textContent = ''; tag.title = '';
        if (h === 'shot' && !empty) { tag.textContent = '인식'; tag.classList.add('ok'); }
        else if (empty && h.startsWith('other:')) { tag.textContent = '시트에 없음'; tag.title = h.slice(6); tag.classList.add('bad'); }
        else if (empty && h === 'none') { tag.textContent = '인식 못 함'; tag.classList.add('bad'); }
        else if (empty && h !== 'hand') { tag.textContent = '골라 주세요'; tag.classList.add('bad'); }
        if (row) row.classList.toggle('need', tag.classList.contains('bad'));
      };
      row = el('div', { class: 'av-row' }, el('span', { class: 'av-part', text: PART_LABEL[part] || part }), tag, sel, el('label', { class: 'av-fix' }, fx, el('span', { text: '고정' })));
      renderTag();
      body.append(row);
    }
    {
      const sel = el('select', { 'aria-label': '일반 악세 하의 지금 착용' });
      sel.append(el('option', { value: '', text: '모름·그 밖의 것 (추천 안 함)' }));
      for (const d of Object.keys(BOTTOMS)) sel.append(el('option', { value: d, text: d }));
      sel.value = p.bottom || '';
      const fx = el('input', { type: 'checkbox', 'aria-label': '일반 악세 하의 고정' });
      fx.checked = !!p.fixed['하의악세'];
      fx.onchange = () => { p.fixed['하의악세'] = fx.checked; save(); result = null; renderResult(); };
      const tagB = el('span', { class: 'av-tag' });
      const rowB = el('div', { class: 'av-row' }, el('span', { class: 'av-part', text: '일반 악세 하의' }), tagB, sel, el('label', { class: 'av-fix' }, fx, el('span', { text: '고정' })));
      const markB = () => { const bad = !p.bottom && !p.bottomSet; tagB.className = 'av-tag' + (bad ? ' bad' : ''); tagB.textContent = bad ? '골라 주세요' : ''; rowB.classList.toggle('need', bad); };
      sel.onchange = () => { p.bottom = sel.value; p.bottomSet = true; save(); result = null; renderResult(); markB(); };
      markB();
      body.append(rowB);
      body.append(el('p', { class: 'av-hint' }, '스탯 창을 찍을 때 끼고 있던 것을 골라 주세요. 영혼의 족쇄는 모든 스킬 데미지 5%에 사룡 세트 한 부위(2부위면 크리티컬 5%·보스 데미지 7%, 3부위면 양극화 5%·추가 지속 피해 5% 더), 글로잉 플라워는 크리티컬 10%·적응력 2%예요. 추천 받기를 누르면 둘 다 끼워 보고 실투력이 높은 쪽을 골라요'));
    }
    const allFixed = !!p.fiveFixed && PARTS.filter(x => x !== '아바타5셋').every(x => p.fixed[x]) && !!p.fixed['하의악세'];
    body.append(el('div', { class: 'av-fix-acts' },
      el('button', { type: 'button', class: 'txt sm', text: '전체 고정', onclick: () => { p.fiveFixed = true; for (const x of PARTS) if (x !== '아바타5셋') p.fixed[x] = true; p.fixed['하의악세'] = true; save(); result = null; render(); } }),
      el('button', { type: 'button', class: 'txt sm mute', text: '고정 해제', onclick: () => { p.fiveFixed = false; p.fixed = {}; save(); result = null; render(); } }),
      allFixed ? el('span', { class: 'av-hint', text: '모두 고정하면 지금 세팅 그대로예요' }) : ''));
    renderStats(); renderOpts(); renderOwn(); renderResult();
  }
  function renderStats() {
    const box = $('#avStatBody'); if (!box) return; box.textContent = '';
    if (!APP.cls() || !(num('C11') > 0)) { box.append(el('p', { class: 'av-hint warn', text: '계산기 탭에 지금 스탯이 없어요. 상세 스탯 창 스크린샷을 먼저 읽어 주세요' })); return; }
    const cur = curStats(), grid = el('div', { class: 'av-stat' });
    for (const [k, v] of Object.entries(cur)) grid.append(el('div', null, el('span', { text: k }), el('span', { text: String(Math.round(v * 100) / 100) })));
    box.append(grid, el('p', { class: 'av-hint', text: `${APP.cls()} · 계산기 탭에 넣은 값을 그대로 써요. 강배·역강배는 체력 50% 초과·이하, 추피는 추가 지속 피해, 보댐증은 보스 피해, 초댐증은 초월 스킬 데미지예요` }));
  }
  function renderOpts() {
    const box = $('#avOptBody'); if (!box) return; box.textContent = '';
    const o = st.o, c = calcOpts();
    const row = (label, ctl, hint) => box.append(el('div', { class: 'av-opt' }, el('span', { class: 'lab', text: label }), ctl, hint ? el('span', { class: 'av-hint', text: hint }) : ''));
    const numIn = (key, w) => { const i = el('input', { type: 'text', inputmode: 'decimal', class: 'num', value: String(o[key] ?? '') }); if (w) i.style.width = w; i.onchange = () => { const v = Number(String(i.value).replace(',', '.')); o[key] = isFinite(v) ? v : 0; i.value = o[key]; save(); result = null; renderResult(); }; return i; };
    const selIn = (key, opts) => { const s = el('select'); for (const t of opts) s.append(el('option', { value: t, text: t })); s.value = o[key]; s.onchange = () => { o[key] = s.value; save(); result = null; renderResult(); }; return s; };
    const chk = (key) => { const b = el('input', { type: 'checkbox' }); b.checked = !!o[key]; b.onchange = () => { o[key] = b.checked; save(); result = null; renderResult(); }; return b; };
    // 목표 쿨감은 자주 바꾸는 값이라 접힌 '계산 조건' 말고 '추천 받기' 버튼 바로 위(#avCoolBox)에 둠
    renderCool();
    row('길드 사냥꾼의 본능', selIn('guild', OPT_SEL.guild));
    row('적응의 영약', chk('elixir'));
    row('글리터의 훈장 카트리지 세트', selIn('medal', OPT_SEL.medal));
    row('기타 적응력', numIn('adaptEtc', '56px'));
    row('기타 보댐증(합)', numIn('bossEtc', '56px'));
    row('기타 크댐증(합)', numIn('critAdd', '56px'));
    row('기타 크댐증 곱 배율', numIn('critMul', '56px'));
    const p = prof(); p.sr = p.sr || {};
    const srChk = (key, label) => { const b = el('input', { type: 'checkbox' }); b.checked = p.sr[key] !== false; b.onchange = () => { p.sr[key] = b.checked; save(); result = null; renderResult(); }; return el('label', { class: 'av-fix' }, b, el('span', { text: label })); };
    row('사룡 세트 부위', el('span', { class: 'av-inline' }, srChk('book', '운명의 예언서'), srChk('medal', 'Type-Q 여왕의 훈장')),
      `무기는 계산기의 '${String(APP.inputs().J26 || '-')}'를 써요. 영혼의 족쇄를 끼면 세트가 몇 부위인지에 따라 세트 효과까지 따져요`);
    {
      const on = el('input', { type: 'checkbox' }); on.checked = !!st.buffOn;
      on.onchange = () => { st.buffOn = on.checked; save(); result = null; renderOpts(); renderResult(); };
      box.append(el('label', { class: 'av-fix av-own-on' }, on, el('span', { text: '버프·영약도 함께 고르기 (쓸 수 있는 것만 켜 주세요)' })));
      if (st.buffOn) {
        st.buffOk = st.buffOk || {};
        for (const c of BUFF_CELLS) {
          // '미사용'·'해당사항 없음'은 고를 거리가 아님(쓸 수 있는 버프는 쓰는 쪽이 늘 실투력이 높음). 지금 값일 때만 보여 줌
          const now = String(APP.val(c) ?? '');
          const all = (APP.optionsOf(c) || []).filter(x => x !== '' && (!NONE_BUFF.has(String(x)) || String(x) === now));
          if (all.filter(x => String(x) !== now).length === 0) continue; // 지금 것 말고 고를 게 없으면(어둠의 문 사용 등) 줄을 안 보임
          if (!(c in st.buffOk)) st.buffOk[c] = all.slice();
          const ok = new Set(st.buffOk[c]);
          const chips = all.map(v => {
            const isNow = String(APP.val(c) ?? '') === v, on2 = ok.has(v) || isNow;
            const b = el('button', { type: 'button', class: 'av-chip' + (on2 ? ' on' : ''), text: v + (isNow ? ' (지금)' : ''), 'aria-pressed': on2 ? 'true' : 'false' });
            if (isNow) b.disabled = true;
            b.onclick = () => { const cur = new Set(st.buffOk[c] || []); if (cur.has(v)) cur.delete(v); else cur.add(v); st.buffOk[c] = [...cur]; save(); result = null; renderOpts(); renderResult(); };
            return b;
          });
          box.append(el('div', { class: 'av-own-set' }, el('span', { class: 'av-own-name', text: buffLabel(c) }), el('div', { class: 'av-chips' }, ...chips)));
        }
        box.append(el('p', { class: 'av-hint', text: '켜 둔 것 중에서 실투력이 가장 높은 걸 골라요. 미사용은 따로 고르지 않아요. 파티 버프와 이벤트 버프는 계산기 탭에 넣은 그대로 써요' }));
      }
    }
    box.append(el('p', { class: 'av-hint', text: `계산기에서 가져온 값: 환경 디버프 ${c.env}, 집결지 ${c.rally}, 파티 크뎀증 ${c.party ? '켬' : '끔'}, 마에스트로 헤일로 ${c.maestro ? '있음' : '없음'}, 초목의 아트마 ${c.atma}, 각인석 크뎀 ${c.imprint}` }));
  }
  function renderOwn() {
    const box = $('#avOwnBody'); if (!box) return; box.textContent = '';
    const sets = A.sets.filter(s => db.fiveSetStats.has(s) || db.setToParts.has(s));
    const itemsOf = (s) => {
      const items = [];
      if (db.fiveSetDisplay.has(s)) items.push(db.fiveSetDisplay.get(s));
      for (const part of (db.setToParts.get(s) || [])) { const d = db.displayBySetPart.get(s + '||' + part); if (d) items.push(d); }
      return items;
    };
    // 전체 선택 = 세트 아바타 + 한벌 아바타(기간제 빼고) + 일반 악세 하의. 처음 켜면 이걸로 체크해 두고, 없는 것만 끄게 함
    const all = sets.flatMap(itemsOf).concat(Object.keys(SUITS).filter(n => !SUITS[n].limited), Object.keys(BOTTOMS));
    const on = el('input', { type: 'checkbox' }); on.checked = !!st.ownOn;
    on.onchange = () => { st.ownOn = on.checked; if (on.checked && !(st.own && st.own.length)) st.own = [...all]; save(); result = null; renderOwn(); renderResult(); };
    box.append(el('label', { class: 'av-fix av-own-on' }, on, el('span', { text: '가진 것만으로 추천 (없는 아이템은 체크를 꺼 주세요)' })));
    if (!st.ownOn) return;
    const own = new Set(st.own || []);
    const p = prof(); for (const part of PARTS) if (p.worn[part]) own.add(p.worn[part]);
    const setOwn = (list) => { st.own = [...new Set(list)]; save(); result = null; renderOwn(); renderResult(); };
    box.append(el('div', { class: 'av-own-acts' },
      el('button', { type: 'button', class: 'txt sm', text: '전체 선택', onclick: () => setOwn(all) }),
      el('button', { type: 'button', class: 'txt sm mute', text: '전체 취소', onclick: () => setOwn([]) }),
      el('span', { class: 'av-hint', text: '지금 낀 아이템은 늘 가진 것으로 쳐요. 세트 이름을 누르면 그 세트를 한꺼번에 골라요' })));
    // 한벌 아바타(세트 없이 한 칸)
    const sn = Object.keys(SUITS);
    const sChips = sn.map(d => {
      const b = el('button', { type: 'button', class: 'av-chip' + (own.has(d) ? ' on' : ''), text: d + (SUITS[d].limited ? ' (기간제)' : ''), 'aria-pressed': own.has(d) ? 'true' : 'false' });
      b.onclick = () => { const cur = new Set(st.own || []); if (cur.has(d)) cur.delete(d); else cur.add(d); setOwn([...cur]); };
      return b;
    });
    const sAll = sn.every(d => own.has(d));
    const sName = el('button', { type: 'button', class: 'av-own-name', text: '한벌 아바타', title: sAll ? '모두 빼기' : '모두 고르기' });
    sName.onclick = () => { const cur = new Set(st.own || []); for (const d of sn) { if (sAll) cur.delete(d); else cur.add(d); } setOwn([...cur]); };
    box.append(el('div', { class: 'av-own-set' }, sName, el('div', { class: 'av-chips' }, ...sChips)));
    for (const s of sets) {
      const items = itemsOf(s);
      const chips = items.map(d => {
        const b = el('button', { type: 'button', class: 'av-chip' + (own.has(d) ? ' on' : ''), text: d.replace(s, '').replace(/^ : /, '').trim() || d, 'aria-pressed': own.has(d) ? 'true' : 'false' });
        b.onclick = () => { const cur = new Set(st.own || []); if (cur.has(d)) cur.delete(d); else cur.add(d); setOwn([...cur]); };
        return b;
      });
      const allOn = items.every(d => own.has(d));
      const name = el('button', { type: 'button', class: 'av-own-name', text: s, title: allOn ? '이 세트 모두 빼기' : '이 세트 모두 고르기' });
      name.onclick = () => { const cur = new Set(st.own || []); for (const d of items) { if (allOn) cur.delete(d); else cur.add(d); } setOwn([...cur]); };
      box.append(el('div', { class: 'av-own-set' }, name, el('div', { class: 'av-chips' }, ...chips)));
    }
    const bn = Object.keys(BOTTOMS);
    const bChips = bn.map(d => {
      const b = el('button', { type: 'button', class: 'av-chip' + (own.has(d) || p.bottom === d ? ' on' : ''), text: d, 'aria-pressed': own.has(d) || p.bottom === d ? 'true' : 'false' });
      b.onclick = () => { const cur = new Set(st.own || []); if (cur.has(d)) cur.delete(d); else cur.add(d); setOwn([...cur]); };
      return b;
    });
    box.append(el('div', { class: 'av-own-set' }, el('span', { class: 'av-own-name', text: '일반 악세 하의' }), el('div', { class: 'av-chips' }, ...bChips)));
  }
  // 아바타로 더할 수 있는 쿨감 값들: 부위 아이템(부위마다 하나) + 세트 효과(세트마다 개수에 따라 하나) 조합. 데이터에서 그대로 셈
  // (부위 쿨감은 5%지만 창해유주 3세트처럼 3%짜리 세트 효과도 있어서 5%씩만이 아님)
  let COOL_INC = null;
  function coolIncrements() {
    if (COOL_INC) return COOL_INC;
    const byPart = new Map(), bySet = new Map();
    for (const it of A.items) {
      if (it[4] !== '쿨감' || !(Number(it[5]) > 0)) continue;
      if (it[0] === '세트효과') { const a = bySet.get(it[1]) || []; a.push([Number(it[6]) || 0, Number(it[5])]); bySet.set(it[1], a); }
      else { const k = it[0] === '아바타5셋' ? '아바타5셋' : it[2], a = byPart.get(k) || new Set(); a.add(Number(it[5])); byPart.set(k, a); }
    }
    let S = new Set([0]);
    const add = (vals) => { const n = new Set(S); for (const x of S) for (const v of vals) n.add(Math.round((x + v) * 100) / 100); S = n; };
    for (const vs of byPart.values()) add([...vs]);
    for (const ef of bySet.values()) { ef.sort((a, b) => a[0] - b[0]); let c = 0; const cum = []; for (const [, v] of ef) { c += v; cum.push(c); } add(cum); }
    COOL_INC = [...S].sort((a, b) => a - b);
    return COOL_INC;
  }
  // 목표 쿨감 목록: 아바타·악세를 뺀 쿨감 + 아바타로 더할 수 있는 값(직업 쿨감 상한까지)
  function coolSteps(bare, cap) {
    const r2 = (x) => Math.round(x * 100) / 100, list = [];
    for (const d of coolIncrements()) { const t = r2(bare + d); if (t > 0 && t < cap - 1e-9) list.push(t); }
    list.push(cap); // 아무리 껴도 상한까지
    return [...new Set(list)].sort((a, b) => a - b);
  }
  function coolChoices() {
    const cap = APP.coolCap ? APP.coolCap() : 35, now = Number(curStats()['쿨감']) || 0;
    if (!(now > 0)) return { cap, bare: null, list: [] };
    const worn = R.wornContribution(db, prof().worn || {}).sums['쿨감'] || 0;
    const bare = Math.round(Math.max(0, now - worn) * 100) / 100;
    return { cap, bare, list: coolSteps(bare, cap) };
  }
  function renderCool() {
    const box = $('#avCoolBox'); if (!box) return; box.textContent = '';
    const o = st.o, { cap, bare, list } = coolChoices();
    const s = el('select', { id: 'avCoolSel' });
    s.append(el('option', { value: '0', text: '조건 없음' }));
    for (const t of list) s.append(el('option', { value: String(t), text: `${t}%${t === bare ? ' (아바타 쿨감 없이)' : ''}` }));
    const want = Number(o.cool) || 0, eff = want > 0 ? (list.find((t) => t >= want - 1e-9) ?? list[list.length - 1]) : 0;
    s.value = String(eff ?? 0);
    s.onchange = () => { o.cool = Number(s.value) || 0; save(); result = null; renderResult(); };
    const atLeast = el('input', { type: 'checkbox' }); atLeast.checked = o.coolAtLeast !== false;
    atLeast.onchange = () => { o.coolAtLeast = atLeast.checked; save(); result = null; renderResult(); };
    box.append(s);
    if (want > 0) box.append(el('label', { class: 'av-fix' }, atLeast, el('span', { text: '이상이면 됨' })));
    const hint = $('#avCoolHint');
    if (hint) hint.textContent = want > 0
      ? `아바타 쿨감은 부위 5%, 세트 효과 3%·5%라서, 아바타 쿨감이 하나도 없을 때${bare != null ? `(${bare}%)` : ''}에서 그만큼 오른 값만 고를 수 있어요. 끝은 이 전직의 쿨감 상한(${cap}%)이에요.`
      : '조건 없음이면 쿨감까지 실투력에 넣어 가장 높은 조합을 골라요. 쿨감을 꼭 맞춰야 할 때만 골라 주세요.';
  }
  function renderResult() {
    renderCool();
    const box = $('#avResult'); if (!box) return; box.textContent = '';
    if (!result) return;
    if (result.err) { box.append(el('p', { class: 'av-hint warn', text: result.err })); return; }
    const r = result.r, p = prof();
    if (result.warn && result.warn.length) {
      box.append(el('div', { class: 'av-warn' }, el('b', { text: '조건에 맞는 세팅이 없어요' }), ...result.warn.map(w => el('p', { text: w })),
        result.relaxed ? el('p', { class: 'av-relax', text: `아래는 ${result.relaxed} 계산한 결과예요. 조건은 '목표 쿨감'·'계산 조건'·'보유 아바타'·고정 칸에서 바꿀 수 있어요` }) : ''));
    }
    if (!r.best) return;
    const g = r.gain * 100, fmt = (n) => Math.round(n).toLocaleString('ko-KR');
    const rec = Object.assign({ '아바타5셋': r.best.fiveSetDisplay, '한벌': r.best.suit != null ? r.best.suit : (p.worn['한벌'] || '') }, r.best.partToDisplay);
    const showBottom = r.best.bottom != null && !!(p.bottom || r.best.bottom), buffs = Object.entries(r.best.buffs || {});
    const moves = (r.best.sock && r.best.sock.moves) || [];
    const changed = PARTS.some(part => (p.worn[part] || '') !== (rec[part] || '')) || (showBottom && (p.bottom || '') !== r.best.bottom) || buffs.some(([c, v]) => String(APP.val(c) ?? '') !== String(v)) || moves.length > 0;
    // 지금 세팅이 목표 쿨감을 못 채우면, 추천(목표를 채우는 조합 중 최고)이 지금보다 낮을 수 있음 → 그렇다고 알려 줌
    const curCool = Number(curStats()['쿨감']) || 0, T = Number(r.coolTarget) || 0;
    const coolMiss = T > 0 && (st.o.coolAtLeast === false ? Math.abs(curCool - T) > 0.005 : curCool < T - 0.005);
    const byCp = r.cpNow > 0 && r.best.cp > 0, up = byCp ? r.best.cp - r.cpNow : 0;
    const better = byCp ? up >= 1 : g > 0.0005;
    // 지금 세팅도 조건을 채우는데 더 높은 조합이 없으면 지금 그대로가 추천(더 낮은 조합을 바꾸라고 보여 주지 않음)
    const keepNow = !better && changed && !coolMiss;
    let head;
    if (better) head = byCp
      ? el('span', null, '추천대로 바꾸면 실투력 ', el('b', { text: fmt(r.cpNow) }), ' → ', el('b', { class: 'up', text: fmt(r.best.cp) }), el('span', { class: 'av-gain-sub', text: ` (+${(up / r.cpNow * 100).toFixed(2)}%)` }))
      : el('span', null, '추천대로 바꾸면 실뎀 ', el('b', { class: 'up', text: '+' + g.toFixed(2) + '%' }));
    else if (!changed || keepNow) head = el('span', { text: byCp ? '지금 세팅이 이미 실투력이 가장 높아요' : '지금 세팅이 이미 가장 좋아요' });
    else {
      const want = Number(st.o.cool) || 0, tText = want > 0 && Math.abs(want - T) > 0.005 ? `${want}% 이상(아바타로 맞출 수 있는 값이 ${T}%)` : `${T}%`;
      const lead = `목표 쿨감 ${tText}를 맞추는 조합 중에서는 이 세팅이 가장 높아요. 지금 세팅(쿨감 ${Math.round(curCool * 100) / 100}%)과 비교하면 `;
      head = byCp
        ? (up <= -1 ? el('span', null, lead + '실투력 ', el('b', { text: fmt(r.cpNow) }), ' → ', el('b', { class: 'down', text: fmt(r.best.cp) }), el('span', { class: 'av-gain-sub down', text: ` (−${(-up / r.cpNow * 100).toFixed(2)}%)` })) : el('span', { text: lead + '실투력은 같아요' }))
        : el('span', { text: lead + (g < -0.0005 ? `실뎀 ${g.toFixed(2)}%` : '실뎀은 같아요') });
    }
    box.append(el('p', { class: 'av-gain' }, head));
    const tb = el('tbody');
    for (const part of PARTS) {
      const now = p.worn[part] || '', want = keepNow ? now : (rec[part] || '');
      const same = now === want;
      tb.append(el('tr', { class: same ? '' : 'chg' }, el('th', { scope: 'row', text: PART_LABEL[part] || part }), el('td', { text: short(now) || '-' }), el('td', { class: same ? 'same' : 'to', text: same ? '그대로' : short(want) })));
    }
    const extraRow = (label, now, want) => { const same = now === want; tb.append(el('tr', { class: same ? '' : 'chg' }, el('th', { scope: 'row', text: label }), el('td', { text: now || '-' }), el('td', { class: same ? 'same' : 'to', text: same ? '그대로' : (want || '-') }))); };
    if (showBottom) extraRow('하의 악세', p.bottom || '', keepNow ? (p.bottom || '') : r.best.bottom);
    for (const [c, v] of buffs) { const now = String(APP.val(c) ?? ''); extraRow(buffLabel(c), now, keepNow ? now : v); }
    if (!keepNow) for (const m of moves) extraRow(`마법석(${m.t})`, m.n > 0 ? m.from : `${m.t} ${-m.n}칸`, m.n > 0 ? `${m.t} ${m.n}칸` : `힘트마 ${-m.n}칸`);
    if (r.best.coolReal != null && curCool > 0) { const c2 = (x) => `${Math.round(x * 100) / 100}%`; extraRow('쿨감', c2(curCool), keepNow ? c2(curCool) : c2(r.best.coolReal)); }
    box.append(el('table', { class: 'av-table' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'sr', text: '부위' })), el('th', { scope: 'col', text: '지금' }), el('th', { scope: 'col', text: '추천' }))), tb));
    // 하의 악세 비교: 지금 실투력은 스탯 창(지금 낀 하의 악세가 이미 들어 있음)으로 재서 칸만 바꿔선 안 변하니, 따로 보여 줌
    const rv = !keepNow && r.best.rivals;
    if (rv && rv.modes) {
      // 하의 악세 비교: 하의 악세마다 아바타·한벌·마법석까지 맞춘 가장 좋은 세팅을 나란히 보여 줌. 지금 실투력 대비 몇 %인지와 바꿀 것을 같이
      const pc = (v) => `${Math.round(v * 1000) / 10}%`, inpA = APP.inputs(), base0 = r.cpNow > 0 ? r.cpNow : APP.cpWith({});
      const vsNow = (v) => { const d = (v / base0 - 1) * 100; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}%`; };
      const matched = rv.order[0] !== 'plain', goalM = rv.byCap ? '만극' : '지금 극대화';
      const MODE_TXT = { ceil: '지금 크리 이상', near: '지금 크리에 가깝게', floor: '지금 크리보다 살짝 덜', plain: '', opt: '마법석까지 최적' };
      const SHORT_B = { '영혼의 족쇄': '족쇄', '글로잉 플라워': '글플' };
      const sorted = (md) => rv.modes[md].slice().sort((x, y) => y.cp - x.cp);
      const gap = (md) => { const l = sorted(md); return { top: l[0], low: l[1], d: (l[0].cp - l[1].cp) / l[1].cp * 100 }; };
      // 이/가: 마지막 글자에 받침이 있으면 '이'
      const iga = (w) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? '이' : '가'; };
      // 지금(계산기에 넣은 값) → 이 세팅: 바꾸는 것마다 [이름, 지금, 바뀐 것]
      const changesOf = (x) => {
        const out = [];
        if (x.n !== p.bottom) out.push(['하의 악세', p.bottom || '-', x.n]);
        if (x.cand) {
          const rec2 = Object.assign({ '아바타5셋': x.cand.fiveSetDisplay, '한벌': x.suit || '' }, x.cand.partToDisplay);
          for (const part of PARTS) { const a0 = p.worn[part] || '', b0 = rec2[part] || ''; if (b0 && a0 !== b0) out.push([PART_LABEL[part] || part, short(a0) || '-', short(b0)]); }
        }
        for (const [c, v] of buffs) { const now = String(APP.val(c) ?? ''); if (now !== String(v)) out.push([buffLabel(c), now || '-', v]); }
        if (x.sock) for (const m of x.sock.moves) out.push(m.n > 0 ? ['마법석', m.from || `힘트마 ${m.n}칸`, `${m.t} 마법석 ${m.n}칸`] : ['마법석', `${m.t} 마법석 ${-m.n}칸`, `힘트마 ${-m.n}칸`]);
        return out;
      };
      // 스탯: 크리·극대화·적응력은 늘, 나머지는 달라진 것만
      const STAT_ROWS = [['C17', '크리', 1], ['C19', '극대화', 1], ['C14', '적응력', 1], ['C15', '초적응력'], ['C18', '크리티컬 데미지'], ['C20', '양극화'], ['C21', '보스 데미지'], ['C22', '추가 지속 피해'],
        ['C33', '모든 스킬 데미지'], ['C29', '강렬 스킬 데미지'], ['C30', '초월 스킬 데미지'], ['C24', '체력 50% 초과 적'], ['C25', '체력 50% 이하 적'], ['C26', '체력 100% 이하 적'], ['C31', '강렬 스킬 쿨감'], ['C32', '초월 스킬 쿨감']];
      const statsOf = (x) => {
        const fin = x.sock ? x.sock.over : (x.o || {}), at = (c) => Number(c in fin ? fin[c] : inpA[c]) || 0, rows = [];
        for (const [c, t, always] of STAT_ROWS) { const a = Number(inpA[c]) || 0, b = at(c); if (always || Math.abs(b - a) >= 0.0005) rows.push([t, pc(a), pc(b), Math.abs(b - a) < 0.0005 ? 0 : b > a ? 1 : -1]); }
        const a11 = Number(inpA.C11) || 0, b11 = at('C11');
        if (a11 > 0 && Math.abs(b11 / a11 - 1) >= 0.0005) rows.push(['공격력', '', `${b11 > a11 ? '+' : '−'}${Math.abs((b11 / a11 - 1) * 100).toFixed(2)}%`, b11 > a11 ? 1 : -1]);
        return rows;
      };
      const cmpBox = el('div', { class: 'av-rival' });
      const head = el('div'), cards = el('div', { class: 'av-vs' });
      cmpBox.append(el('p', { class: 'av-rival-h' }, el('b', { text: '하의 악세 비교' })), head);
      let cur = rv.order[0];
      const seg = matched && rv.order.length > 1 ? el('div', { class: 'av-rival-seg', role: 'group', 'aria-label': '크리 맞추는 방식' }) : null;
      const draw = () => {
        if (seg) for (const bt of seg.children) bt.setAttribute('aria-pressed', String(bt.dataset.m === cur));
        const { top, low, d } = gap(cur);
        head.textContent = '';
        head.append(el('p', { class: 'av-vs-verdict' }, d < 0.3 ? `거의 같아요. ${top.n}${iga(top.n)} ${low.n}보다 ${d.toFixed(2)}% 높아요` : `${top.n}${iga(top.n)} ${low.n}보다 ${d.toFixed(2)}% 더 높아요`));
        head.append(el('p', { class: 'av-rival-note', text: cur === 'opt'
          ? `지금 실투력 ${fmt(base0)} 기준이에요. 하의 악세마다 아바타·한벌과 크리·극대 마법석(힘트마와 바꾸기)까지 실투력이 가장 높게 다시 골랐어요`
          : matched
          ? `지금 실투력 ${fmt(base0)} 기준이에요. 두 쪽 다 아바타·한벌을 다시 고르고, 크리는 ${MODE_TXT[cur]}(${pc(rv.critT)} 기준) 힘트마를 바꿔 맞췄어요. 극대화는 ${goalM}(${pc(rv.maxT)})까지 채우는 게 더 높을 때만 채워요`
          : `지금 실투력 ${fmt(base0)} 기준이에요. 두 쪽 다 아바타·한벌을 다시 골랐어요` }));
        { const t = srNote(rv.modes[cur].map(x => x.n)); if (t) head.append(el('p', { class: 'av-rival-note', text: t })); }
        if (matched && cur !== 'opt' && rv.modes[cur].every(x => x.cp < base0)) head.append(el('p', { class: 'av-rival-note', text: '두 쪽 다 지금보다 낮은 건 크리를 기준에 맞추느라 힘트마를 뺐기 때문이에요' }));
        cards.textContent = '';
        const order = rv.modes[cur].slice().sort((x, y) => (x.n === p.bottom ? -1 : 0) - (y.n === p.bottom ? -1 : 0));
        for (const x of order) {
          const win = x === top, ch = changesOf(x), sk = x.sock && x.sock.skip, same = Math.abs(x.cp - base0) < 0.5;
          const stT = el('table', { class: 'av-vs-st' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'sr', text: '스탯' })), el('th', { scope: 'col', text: '지금' }), el('th', { scope: 'col', text: '이 세팅' }))),
            el('tbody', null, ...statsOf(x).map(([t, a, b, d]) => el('tr', { class: d ? 'chg' : '' }, el('th', { scope: 'row', text: t }), el('td', { text: a }), el('td', { class: d > 0 ? 'up' : d < 0 ? 'down' : 'same', text: d ? b : '그대로' })))));
          cards.append(el('div', { class: 'av-vs-card' + (win ? ' win' : '') },
            el('p', { class: 'nm' }, el('b', { text: x.n }), x.n === p.bottom ? el('span', { class: 'tag', text: '지금 낀 것' }) : '', win ? el('span', { class: 'tag win', text: '더 높음' }) : ''),
            el('p', { class: 'cp' }, fmt(x.cp), el('span', { class: 'dv ' + (same ? 'same' : x.cp > base0 ? 'up' : 'down'), text: same ? '지금과 같음' : `지금보다 ${vsNow(x.cp)}` })),
            el('p', { class: 'ch-h', text: ch.length ? '지금 입력한 것에서 바꾸는 것' : '지금 입력한 그대로예요' }),
            ch.length ? el('ul', { class: 'av-vs-ch' }, ...ch.map(([t, a, b]) => el('li', null, el('span', { class: 'k', text: t }), el('span', { class: 'v' }, el('span', { class: 'from', text: a }), el('span', { class: 'ar', 'aria-hidden': 'true', text: '→' }), el('span', { class: 'sr', text: '에서 ' }), el('span', { class: 'to', text: b }))))) : '',
            el('p', { class: 'ch-h', text: '스탯 변화' }), stT,
            sk ? el('p', { class: 'av-rival-note', text: `극대화는 만극(${pc(sk.T)})까지 힘트마 ${sk.need - sk.used}칸을 더 바꿔야 해요. 바꾸면 실투력이 ${((1 - sk.cpFill / sk.cpKeep) * 100).toFixed(2)}% 줄어서 안 채웠어요` }) : '',
            x.sock && x.sock.short ? el('p', { class: 'av-rival-note', text: '힘트마를 다 빼도 기준 크리·극대에 못 미쳐요' }) : '',
            x.adaptShort ? el('p', { class: 'av-rival-note', text: `적응력이 상한에 ${pc(x.adaptShort)} 모자라요. 다른 악세로 채울 수 있으면 최대 +${(x.adaptGain * 100).toFixed(2)}%(그 악세에서 잃는 것 빼기 전)` }) : ''));
        }
      };
      if (seg) {
        for (const md of rv.order) { const g = gap(md); seg.append(el('button', { type: 'button', class: 'av-seg-b', 'data-m': md, onclick: () => { cur = md; draw(); } }, el('span', { class: 't', text: MODE_TXT[md] }), el('span', { class: 's' }, `${SHORT_B[g.top.n] || g.top.n}${iga(SHORT_B[g.top.n] || g.top.n)} ${SHORT_B[g.low.n] || g.low.n}보다 `, el('span', { class: 'n', text: `+${g.d.toFixed(2)}%` })))); }
        cmpBox.append(el('p', { class: 'av-seg-h', text: '크리 맞추는 방식' }), seg);
      }
      cmpBox.append(cards); draw();
      const tableBottom = r.best.bottom, top0 = sorted(rv.order[0])[0];
      if (matched && rv.order[0] !== 'opt' && tableBottom && tableBottom !== top0.n) cmpBox.append(el('p', { class: 'av-rival-note tip', text: `위 표의 추천(${tableBottom})은 크리·극대를 맞추기 전 실투력으로 고른 거예요` }));
      box.append(cmpBox);
    } else if (p.bottom && BOTTOMS[p.bottom] && APP.cpWith) {
      const cmp = Object.keys(BOTTOMS).map(n => ({ n, cp: APP.cpWith(bottomOver({}, p.bottom, n)) }));
      if (cmp.every(x => x.cp > 0)) {
        const top = cmp.slice().sort((x, y) => y.cp - x.cp)[0];
        const txt = cmp.map(x => x === top ? `${x.n} ${fmt(x.cp)}` : `${x.n} ${fmt(x.cp)} (−${((top.cp - x.cp) / top.cp * 100).toFixed(2)}%)`).join(' · ');
        box.append(el('p', { class: 'av-hint' }, el('b', { text: `하의 악세는 ${top.n}가 더 높아요. ` }), `지금 세팅에 하의 악세만 바꿔 끼우면 ${txt}`));
      }
    }
    if (keepNow) { box.append(el('p', { class: 'av-hint', text: '조건에 맞는 다른 조합은 모두 지금 세팅보다 낮았어요' })); return; }
    box.append(el('p', { class: 'av-hint', text: `세트: ${r.best.setLabels.join(' · ') || '없음'}` }));
    if (r.stats) {
      const notes = ['아바타 조합을 빠짐없이 다 따져서 실투력이 가장 높은 걸 골랐어요', '크리·극대 마법석(힘트마와 바꾸기)도 같이 맞췄어요', '아바타 세트 효과는 3세트까지만 들어가요'];
      if (r.stats.capped) notes.push('비슷한 조합이 너무 많아 위쪽 일부만 실투력으로 다시 쟀어요');
      box.append(el('ul', { class: 'av-notes' }, ...notes.map(t => el('li', { text: t }))));
    }
  }
  // 아바타 점수 상위 조합을 계산기 본체(시트와 같은 실투력 계산)에 넣어 실투력으로 다시 줄 세움
  const STAT_CELL = { '적응력': ['C14'], '초적응력': ['C15'], '강배': ['C24'], '역강배': ['C25'], '100이하': ['C26'], '추피': ['C22'], '양극화': ['C20'], '모스댐': ['C33'], '초댐증': ['C30'], '크댐증': ['C18'], '보댐증': ['C21'], '쿨감': ['C31', 'C32'], '강렬댐증': ['C29'] };
  // 후보 세팅과 지금 낀 것의 차이만큼 계산기 칸을 바꾼 값.
  // 후보도 지금 낀 것과 같은 셈법(세트 효과는 3세트까지만)으로 셈 — 지금과 똑같은 조합이면 차이가 정확히 0
  function overridesFor(r, worn, cand) {
    const cw = R.wornContribution(r.db, Object.assign({ '아바타5셋': cand.fiveSetDisplay }, cand.partToDisplay)).sums;
    const w = R.sumsToAddArr(R.wornContribution(r.db, worn || {}).sums), a = R.sumsToAddArr(cw), inp = APP.inputs(), o = {}, cs = curStats();
    const cap = APP.coolCap ? APP.coolCap() : 35;
    const coolReal = r.bare && isFinite(r.bare.baseCooldownBare) ? Math.max(Number(cand.coolReal) || 0, Math.min(r.bare.baseCooldownBare + (cw['쿨감'] || 0), cap)) : cand.coolReal;
    AIDX.forEach((k, i) => {
      const d = (a[i] || 0) - (w[i] || 0); if (!d) return;
      if (k === '물마퍼') { const m = (100 + cs['물마퍼'] + d) / (100 + cs['물마퍼']); o.C11 = Math.round(num('C11') * m); o.C12 = Math.round(num('C12') * m); return; }
      for (const c of STAT_CELL[k]) o[c] = Math.round(((Number(inp[c]) || 0) + d / 100) * 1e6) / 1e6;
    });
    const dc = Math.min(coolReal, cap) - cs['쿨감'];
    if (dc) for (const c of STAT_CELL['쿨감']) o[c] = Math.round(((Number(inp[c]) || 0) + dc / 100) * 1e6) / 1e6;
    return o;
  }
  // 탐색 점수를 계산기 실투력에 맞춤: 지금 세팅에서 스탯을 조금씩 바꿔 실투력(로그)이 얼마나 변하는지 재서 씀.
  // 적응력·양극화·쿨감은 상한이 있어서 구간별로 재고, 나머지는 1%p당 변화량. 모두 늘면 줄지 않게(상한 건너뛰기에 필요)
  const AIDX = ['적응력', '초적응력', '강배', '역강배', '100이하', '추피', '양극화', '물마퍼', '모스댐', '초댐증', '크댐증', '보댐증', '강렬댐증'];
  function buildScorer(db, worn, base) {
    if (!APP.cpWith) return null;
    base = base || {};
    const cp0 = APP.cpWith(base); if (!(cp0 > 0)) return null;
    const L0 = Math.log(cp0), inp = APP.inputs(), cs = curStats(), mp = cs['물마퍼'], curCool = cs['쿨감'];
    // base에 스탯 칸이 들어 있으면(한벌·하의 악세를 바꿔 본 상태) 그 값에서부터 잼
    const at = (c) => Number(c in base ? base[c] : inp[c]) || 0;
    const over = (stat, d) => {
      if (stat === '물마퍼') { const k = (100 + mp + d) / (100 + mp); return { C11: Math.round(('C11' in base ? at('C11') : num('C11')) * k), C12: Math.round(('C12' in base ? at('C12') : num('C12')) * k) }; }
      const o = {}; for (const c of STAT_CELL[stat]) o[c] = Math.round((at(c) + d / 100) * 1e6) / 1e6; return o;
    };
    const lg = (stat, d) => { const v = APP.cpWith(Object.assign({}, base, over(stat, d))); return v > 0 ? Math.log(v) - L0 : 0; };
    const table = (stat, lo, hi, step) => {
      const xs = [], ys = []; let m = -Infinity;
      for (let d = lo; d <= hi + 1e-9; d += step) { xs.push(d); m = Math.max(m, d === 0 ? 0 : lg(stat, d)); ys.push(m); }
      const s0 = Math.max(0, (ys[1] - ys[0]) / step), s1 = Math.max(0, (ys[ys.length - 1] - ys[ys.length - 2]) / step);
      return (d) => {
        if (d <= xs[0]) return ys[0] + (d - xs[0]) * s0;
        if (d >= xs[xs.length - 1]) return ys[ys.length - 1] + (d - xs[xs.length - 1]) * s1;
        const i = Math.min(xs.length - 2, Math.floor((d - xs[0]) / step)), t = (d - xs[i]) / step;
        return ys[i] + (ys[i + 1] - ys[i]) * t;
      };
    };
    const w = R.sumsToAddArr(R.wornContribution(db, worn || {}).sums);
    const lin = AIDX.map((k, i) => (i === 0 || i === 6) ? 0 : Math.max(0, lg(k, 2) / 2));
    const tAdapt = table('적응력', -20, 20, 2.5), tPolar = table('양극화', -20, 20, 2.5);
    const cap = APP.coolCap ? APP.coolCap() : 35;
    const lo = Math.max(0, Math.floor(curCool) - 20), tCool = table('쿨감', lo - curCool, Math.max(cap, curCool) - curCool, 1);
    return (a, cool) => {
      let L = 0;
      for (let i = 0; i < AIDX.length; i++) if (lin[i]) L += lin[i] * ((a[i] || 0) - (w[i] || 0));
      L += tAdapt(a[0] - w[0]) + tPolar(a[6] - w[6]);
      if (cool != null) L += tCool(Math.min(cool, cap) - curCool);
      return L * 1000;
    };
  }
  // 한벌 아바타를 from → to로 바꿨을 때 계산기 칸 변화(o에 더함). 공격력은 물마퍼까지 곱해진 창 값이라 그만큼 키움
  function statOver(o, delta) {
    const inp = APP.inputs(), cs = curStats();
    const val = (c) => (c in o ? Number(o[c]) : Number(inp[c])) || 0;
    for (const [k, c] of Object.entries(SUIT_CELL)) {
      const d = delta[k] || 0; if (!d) continue;
      o[c] = Math.max(0, APP.addRaw ? APP.addRaw(c, val(c), d / 100) : Math.round((val(c) + d / 100) * 1e6) / 1e6) || 0;
    }
    const dmp = delta.mp || 0, datk = delta.atk || 0;
    if (dmp || datk) {
      const c11 = val('C11') || num('C11'), c12 = val('C12') || num('C12'), mp = cs['물마퍼'];
      const k = (100 + mp + dmp) / (100 + mp), add = datk * (1 + (mp + dmp) / 100);
      o.C11 = Math.round(c11 * k + add); o.C12 = Math.round(c12 * k + add * (c11 > 0 ? c12 / c11 : 1));
    }
    return o;
  }
  const diffStats = (a, b) => { const d = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { const v = ((b || {})[k] || 0) - ((a || {})[k] || 0); if (v && typeof v === 'number') d[k] = v; } return d; };
  function suitOver(o, from, to) { return from === to ? o : statOver(o, diffStats(SUITS[from], SUITS[to])); }
  // 일반 악세 하의: 영혼의 족쇄(사룡 세트 부위)·글로잉 플라워. 사룡 세트(공중 요새의 유산)는 2·3부위에서 단계별로 켜짐
  // 사룡 세트 부위: 무기(사룡무 = 계산기 무기 칸) · 운명의 예언서 · Type-Q 여왕의 훈장 · 영혼의 족쇄. 계산기는 이 세트를 따로 계산하지 않아서(스탯창에만 들어 있음) 바꿀 때 차이만큼 더함
  const BOTTOMS = { '영혼의 족쇄': { mos: 5, sr: true }, '글로잉 플라워': { crit: 10, adapt: 2 } };
  const SR_STAGE = [[2, { crit: 5, boss: 7 }], [3, { pol: 5, dot: 5 }]];
  const srSet = (n) => { const o = {}; for (const [need, fx] of SR_STAGE) if (n >= need) for (const [k, v] of Object.entries(fx)) o[k] = (o[k] || 0) + v; return o; };
  function srFixed() { const p = prof(), sr = p.sr || {}; return (String(APP.inputs().J26 || '') === '사룡무' ? 1 : 0) + (sr.book !== false ? 1 : 0) + (sr.medal !== false ? 1 : 0); }
  // 하의 악세 비교에 영혼의 족쇄가 있으면: 사룡 세트를 몇 부위로 쳤는지 한 줄로
  function srNote(names) {
    const srN = (names || []).find(n => BOTTOMS[n] && BOTTOMS[n].sr); if (!srN) return '';
    const p = prof(), sr = p.sr || {}, with_ = [];
    if (String(APP.inputs().J26 || '') === '사룡무') with_.push('사룡무');
    if (sr.book !== false) with_.push('운명의 예언서'); if (sr.medal !== false) with_.push('Type-Q 여왕의 훈장');
    const n = with_.length + 1, eff = n >= 3 ? '3부위 효과(양극화·추가 지속 피해 +5%)까지 넣었어요' : n === 2 ? '2부위 효과(크리 +5%·보스 +7%)만 넣었어요' : '세트 효과 없이 쳤어요';
    return `${srN}는 사룡 세트 ${n}부위${with_.length ? `(${with_.join('·')}${(() => { const c = with_[with_.length - 1].charCodeAt(with_[with_.length - 1].length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '과' : '와'; })()} 함께)` : ''}로 보고 ${eff}. 사룡 세트 부위는 '계산 조건'에서 바꿀 수 있어요`;
  }
  function bottomOver(o, from, to) {
    if (from === to) return o;
    const k = srFixed(), isSr = (n) => !!(BOTTOMS[n] && BOTTOMS[n].sr);
    const d = diffStats(BOTTOMS[from], BOTTOMS[to]), ds = diffStats(srSet(k + (isSr(from) ? 1 : 0)), srSet(k + (isSr(to) ? 1 : 0)));
    for (const [x, v] of Object.entries(ds)) d[x] = (d[x] || 0) + v;
    delete d.sr;
    return statOver(o, d);
  }
  function bottomChoices() {
    const p = prof(), now = p.bottom || '';
    if (p.fixed['하의악세'] || !now) return [now];
    const own = st.ownOn ? new Set(st.own || []) : null;
    const list = [now].concat(Object.keys(BOTTOMS).filter(n => n !== now && (!own || own.has(n))));
    return [...new Set(list)];
  }
  // 버프·영약(계산기 도핑 칸): 쓸 수 있다고 고른 것 중에서 실투력이 가장 높은 조합
  // 파티 버프(J21)는 파티에 따라 정해지고, 이벤트 버프(J22)는 기간 한정이라 넣지 않음
  const BUFF_CELLS = ['J17', 'J18', 'J19', 'J20', 'J23'];
  const NONE_BUFF = new Set(['미사용', '해당사항 없음', '미적용', '미착용']);
  const buffLabel = (c) => { const v = APP.val('I' + c.slice(1)); return v && !String(v).startsWith('#') ? String(v).trim() : c; };
  function buffOptions(c) {
    const now = String(APP.val(c) ?? '');
    const ok = (st.buffOk || {})[c];
    const all = (APP.optionsOf ? APP.optionsOf(c) : []) || [];
    const list = ok && ok.length ? all.filter(x => ok.includes(x) && !NONE_BUFF.has(String(x))) : [];
    return [...new Set([now].concat(list))].filter(x => x !== '');
  }
  // 바깥 루프 후보: 쓸 수 있는 버프 조합을 지금 아바타로 먼저 재서 위에서 M개만 안쪽(아바타 탐색)으로 넘김
  function buffBases(M) {
    if (!st.buffOn) return [{}];
    const cats = BUFF_CELLS.map(c => [c, buffOptions(c)]).filter(([, l]) => l.length > 1);
    let combos = [{}];
    for (const [c, list] of cats) combos = combos.flatMap(o => list.map(v => Object.assign({}, o, { [c]: v })));
    const scored = combos.slice(0, 2000).map(b => {
      const o = {}; for (const [k, v] of Object.entries(b)) if (String(APP.val(k) ?? '') !== String(v)) o[k] = v;
      return { o, v: APP.cpWith(o) };
    }).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const out = [], seen = new Set();
    for (const x of scored) { const k = JSON.stringify(x.o); if (seen.has(k)) continue; seen.add(k); out.push(x.o); if (out.length >= M) break; }
    return out.length ? out : [{}];
  }
  // 추천에 넣을 한벌 아바타: 고정이면 지금 것만, 보유 필터를 켜면 가진 것만. 기간제(성장 부스팅 투명 아바타)는 입고 있거나 보유로 고른 때만
  // 하의 악세별 최고 세팅: 하의 악세를 하나로 정해 놓고 그에 맞는 아바타·한벌을 따로 골라 실투력을 비교함
  // (족쇄 + 동방 같은 조합과 글로잉 플라워 + 다른 아바타 조합 중 어느 쪽이 높은지 보려는 것)
  function bottomRivals(r, worn, base, ctx) {
    const bNow = prof().bottom || '', now = worn['한벌'] || '';
    if (!bNow || !BOTTOMS[bNow] || !r || !r.best || !r.cands || !APP.cpWith) return null;
    // 크리·극대화를 지금 값에 맞춰 놓고 잼: 모자라면 힘트마(보스 데미지 마법석)를 빼고 크리·극대 마법석을 넣고, 넘치면 힘트마로 되돌림.
    // 한벌·아바타를 고를 때부터 이렇게 맞춘 실투력으로 비교함(예: 족쇄 쪽은 크리 있는 한벌이 힘트마를 덜 빼서 유리할 수 있음)
    // 기준은 만크극: 크리·극대화를 더 올려도 실투력이 안 오르는 가장 낮은 값(전직 패시브·버프까지 넣어 크리·극대가 100%가 되는 지점).
    // 시트 계산이 그 위는 잘라서, 실투력이 그대로가 되는 곳을 찾아 씀. 못 찾으면 지금 값
    const inp0 = APP.inputs();
    const capOf = (c) => { try { const top = APP.cpWith({ [c]: 1 }); if (!(top > APP.cpWith({ [c]: 0.3 }) + 0.5)) return 0; let lo = 0.3, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (APP.cpWith({ [c]: m }) >= top - 0.5) hi = m; else lo = m; } return Math.ceil(hi * 1000) / 1000; } catch (e) { return 0; } };
    const capM = capOf('C19');
    const T = Number(inp0.C17) || 0, TM = capM || Number(inp0.C19) || 0;
    const canMatch = !!APP.sockMatch && (T > 0 || TM > 0);
    // ceil: 크리·극대를 지금 값 이상으로 맞춤 / near: 지금 값에 가장 가깝게(마법석을 덜 바꾸고, 조금 모자랄 수 있음)
    // 극대화는 만극까지 채우는 것과 덜 채우는 것 중 실투력이 높은 쪽(best: 조금 모자랄 때 힘트마를 빼면 손해일 수 있어서). 크리는 세 가지로: 지금 크리 이상(ceil) / 가장 가깝게(near) / 살짝 모자라게(floor, 마법석 한 칸 덜)
    const MODES = canMatch ? ['ceil', 'near', 'floor'] : ['plain'];
    const measure = (o, md) => {
      if (md !== 'plain') { const sk = APP.sockMatch(o, { C17: T, C19: TM, modeC: md, modeM: 'best' }); if (sk && sk.cp > 0) return { cp: sk.cp, sock: sk, crit: Number(sk.over.C17) || 0, max: Number(sk.over.C19) || 0, o }; }
      return { cp: APP.cpWith(o), crit: Number('C17' in o ? o.C17 : inp0.C17) || 0, max: Number('C19' in o ? o.C19 : inp0.C19) || 0, o };
    };
    const pickSuits = (bn) => {
      let ss = suitChoices(worn);
      if (ss.length > 4) {
        const sc = ss.map(n => ({ n, v: measure(bottomOver(suitOver(Object.assign({}, base), now, n), bNow, bn), MODES[0]).cp })).sort((a, b) => b.v - a.v);
        ss = [...new Set(sc.slice(0, 4).map(x => x.n).concat(now))];
      }
      return ss;
    };
    const pool = r.cands.includes(r.best) ? r.cands : r.cands.concat([r.best]);
    const toS = (c) => Object.assign({ '아바타5셋': c.fiveSetDisplay || '' }, c.partToDisplay);
    const W = {}; for (const pt of ['아바타5셋'].concat(R.ALL_PARTS)) if (worn[pt]) W[pt] = worn[pt];
    const out = {}; for (const md of MODES) out[md] = [];
    // 지금 입은 아바타 그대로도 후보로 넣음(지금 세팅이 목표 쿨감을 채울 때만). 그래야 지금 낀 하의 악세 쪽이 지금보다 낮게 나오지 않음
    const curCool = Number(curStats()['쿨감']) || 0, CT = Number(r.coolTarget) || 0;
    const coolOkNow = !(CT > 0) || (st.o.coolAtLeast === false ? Math.abs(curCool - CT) <= 0.005 : curCool >= CT - 0.005);
    const candW = { fiveSetDisplay: worn['아바타5셋'] || '', partToDisplay: {} };
    for (const pt of R.ALL_PARTS) if (worn[pt]) candW.partToDisplay[pt] = worn[pt];
    for (const bn of Object.keys(BOTTOMS)) {
      const suits = pickSuits(bn);
      // 한 세팅(아바타 후보 c)에서 한벌마다 재고, 방식마다 가장 높은 것
      const evalC = (c, mds) => { const res = {}; for (const sName of suits) { const o = Object.assign({}, base, overridesFor(r, worn, c)); suitOver(o, now, sName); bottomOver(o, bNow, bn); for (const md of mds) { const m = measure(o, md); if (!res[md] || m.cp > res[md].cp) res[md] = Object.assign({ suit: sName, c }, m); } } return res; };
      // 후보 전부는 첫 방식으로만 재고, 다른 방식은 위쪽 후보 12개만 다시 잼(시간 줄이려고)
      const all = pool.map(c => evalC(c, [MODES[0]]));
      if (MODES.length > 1) { const top12 = all.filter(x => x[MODES[0]]).sort((a, b) => b[MODES[0]].cp - a[MODES[0]].cp).slice(0, 12); for (const x of top12) Object.assign(x, evalC(x[MODES[0]].c, MODES.slice(1))); }
      const best = {}; for (const md of MODES) for (const x of all) if (x[md] && x[md].cp > 0 && (!best[md] || x[md].cp > best[md].cp)) best[md] = x[md];
      if (!best[MODES[0]]) continue;
      try {
        const starts = all.filter(x => x[MODES[0]]).sort((a, b) => b[MODES[0]].cp - a[MODES[0]].cp).slice(0, 5).map(x => toS(x[MODES[0]].c));
        const pol = polish(r, worn, base, ctx, starts.concat([W]), best[MODES[0]].suit, bn);
        if (pol) { const pr = evalC(pol, MODES); for (const md of MODES) if (pr[md] && (!best[md] || pr[md].cp > best[md].cp + 0.5)) best[md] = pr[md]; }
      } catch (e) { console.error(e); }
      if (coolOkNow) try { const xw = evalC(candW, MODES); for (const md of MODES) if (xw[md] && xw[md].cp > 0 && (!best[md] || xw[md].cp >= best[md].cp - 0.5)) best[md] = xw[md]; } catch (e) { console.error(e); }
      // 마법석으로 크리·극대를 맞춘 값으로 아바타 악세를 한 칸씩 더 바꿔 봄(모자란 적응력을 다른 악세로 채우는 경우 등)
      for (const md of MODES) if (best[md] && md !== 'plain') {
        try {
          const sName = best[md].suit;
          const evalS = (c) => { const o = Object.assign({}, base, overridesFor(r, worn, c)); suitOver(o, now, sName); bottomOver(o, bNow, bn); return Object.assign({ suit: sName, c }, measure(o, md)); };
          const ref = refineMatched(r, worn, ctx, toS(best[md].c), evalS);
          if (ref && ref.cp > best[md].cp + 0.5) best[md] = ref;
        } catch (e) { console.error(e); }
      }
      for (const md of MODES) if (best[md]) {
        const x = best[md], row = { n: bn, cp: x.cp, suit: x.suit, cand: x.c, crit: x.crit, max: x.max, sock: x.sock || null, o: x.o };
        // 적응력이 상한에 모자라면 얼마나 모자라고, 그걸 (다른 악세로) 채우면 얼마나 오르는지(채우는 데 드는 것은 빼기 전 값)
        try {
          const base1 = x.sock ? x.sock.over : x.o, a1 = Number('C14' in base1 ? base1.C14 : inp0.C14) || 0, cp1 = APP.cpWith(base1);
          let k = 0, prev = cp1;
          while (k < 20) { const v = APP.cpWith(Object.assign({}, base1, { C14: a1 + (k + 1) * 0.005 })); if (!(v > prev + 0.5)) break; prev = v; k++; }
          if (k > 0) { row.adaptShort = k * 0.005; row.adaptGain = (prev - cp1) / cp1; }
        } catch (e) { console.error(e); }
        out[md].push(row);
      }
    }
    if (out[MODES[0]].length < 2) return null;
    return { modes: out, order: MODES, critT: T, maxT: TM, byCap: !!capM };
  }
  function suitChoices(worn) {
    const p = prof(), now = worn['한벌'] || '';
    if (p.fixed['한벌']) return [now];
    const own = st.ownOn ? new Set(st.own || []) : null;
    const list = Object.keys(SUITS).filter(n => n === now || ((!own || own.has(n)) && (!SUITS[n].limited || (own && own.has(n)))));
    return list.length ? list : [now];
  }
  // 마무리 탐색: 탐색이 고른 조합(3세트 + 남는 3부위)과 지금 세팅에서 출발해, 부위를 하나씩 바꾸거나 한 세트의 2~3부위를 한꺼번에 넣어 보며
  // 실투력이 더 오르는 조합을 찾음. 세트 효과는 게임 규칙대로 3세트까지만 침(R.wornContribution).
  // 빠른 점수(buildScorer)로 이웃을 훑고, 마지막에는 계산기 실투력으로 다시 재서 확인함
  function polish(r, worn, base, ctx, starts, suit, bottom) {
    const db = r.db, sc = ctx.scorer, cap = APP.coolCap ? APP.coolCap() : 35;
    if (!sc || !r.bare || !isFinite(r.bare.baseCooldownBare)) return null;
    const T = Number(r.coolTarget) || 0, atLeast = st.o.coolAtLeast !== false, bare = r.bare.baseCooldownBare;
    const fixed = ctx.fixed || {}, owned = ctx.owned || null;
    const ok = (part, d) => !owned || owned.has(d) || d === (worn[part] || '');
    const FREE = R.ALL_PARTS.filter(pt => !fixed[pt]);
    const opts = {}; for (const pt of FREE) opts[pt] = [...(db.partCandidates.get(pt) || [])].filter(d => ok(pt, d));
    const fives = ctx.fiveFixed ? [] : db.fiveSetList.map(x => db.fiveSetDisplay.get(x)).filter(d => d && ok('아바타5셋', d));
    const setItems = [];
    for (const [sn, parts] of db.setToParts) {
      const xs = []; for (const pt of parts) { if (fixed[pt]) continue; const d = db.displayBySetPart.get(sn + '||' + pt); if (d && ok(pt, d)) xs.push([pt, d]); }
      if (xs.length >= 2) setItems.push(xs);
    }
    const coolOf = (sums) => Math.min(bare + (sums['쿨감'] || 0), cap);
    const fast = (S) => { const sums = R.wornContribution(db, S).sums, c = coolOf(sums); if (T && (atLeast ? c < T - 1e-9 : Math.abs(c - T) > 1e-9)) return -Infinity; return sc(R.sumsToAddArr(sums), c); };
    const candOf = (S) => { const pd = {}; for (const pt of R.ALL_PARTS) if (S[pt]) pd[pt] = S[pt]; return { fiveSetDisplay: S['아바타5셋'] || '', partToDisplay: pd, coolReal: coolOf(R.wornContribution(db, S).sums), polished: true }; };
    const cpOf = (S) => { const o = Object.assign({}, base, overridesFor(r, worn, candOf(S))); suitOver(o, worn['한벌'] || '', suit); bottomOver(o, prof().bottom || '', bottom); return APP.cpWith(o); };
    const moves = (S, each) => {
      for (const pt of FREE) for (const d of opts[pt]) if (S[pt] !== d) each({ [pt]: d });
      for (const d of fives) if (S['아바타5셋'] !== d) each({ '아바타5셋': d });
      for (const xs of setItems) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
        const hi = S[xs[i][0]] === xs[i][1], hj = S[xs[j][0]] === xs[j][1];
        if (!(hi && hj)) each({ [xs[i][0]]: xs[i][1], [xs[j][0]]: xs[j][1] });
        for (let k = j + 1; k < xs.length; k++) if (!(hi && hj && S[xs[k][0]] === xs[k][1])) each({ [xs[i][0]]: xs[i][1], [xs[j][0]]: xs[j][1], [xs[k][0]]: xs[k][1] });
      }
    };
    const climb = (S0) => {
      const S = Object.assign({}, S0); let v = fast(S);
      for (let it = 0; it < 40; it++) {
        let bm = null, bv = v;
        moves(S, (m) => { const x = fast(Object.assign({}, S, m)); if (x > bv + 1e-9) { bv = x; bm = m; } });
        if (!bm) break; Object.assign(S, bm); v = bv;
      }
      return v > -Infinity ? S : null;
    };
    const seen = new Set(), outs = [];
    for (const S0 of starts) {
      const S = climb(S0); if (!S) continue;
      const key = ['아바타5셋'].concat(R.ALL_PARTS).map(pt => S[pt] || '').join('|'); if (seen.has(key)) continue; seen.add(key);
      outs.push([S, cpOf(S)]);
    }
    outs.sort((a, b) => b[1] - a[1]);
    if (!outs.length || !(outs[0][1] > 0)) return null;
    // 유망 세트 전수 조사: 출발점·마무리 결과에서 2부위 이상 쓰인 세트를 모아, 그 세트 아이템(+지금·최고 조합의 아이템)만으로
    // 만들 수 있는 모든 조합을 빠짐없이 따짐(세트를 통째로 갈아 끼우는 조합은 한두 부위씩 바꿔서는 못 찾음)
    try {
      const freq = new Map();
      const note = (S1, w) => { const c = new Map(); for (const pt of R.ALL_PARTS) { const sn = db.displayToSet.get(S1[pt]); if (sn) c.set(sn, (c.get(sn) || 0) + 1); } for (const [sn, n] of c) if (n >= 2) freq.set(sn, (freq.get(sn) || 0) + w); };
      for (const S0 of starts) note(S0, 1);
      for (const [S1] of outs) note(S1, 3);
      const order = [...freq].sort((x, y) => y[1] - x[1]).map(x => x[0]), base0 = outs[0][0];
      const optFor = (sets) => R.ALL_PARTS.map(pt => {
        if (fixed[pt]) return [base0[pt] || ''];
        const o = new Set([base0[pt] || '']); if (worn[pt]) o.add(worn[pt]);
        for (const sn of sets) { const d = db.displayBySetPart.get(sn + '||' + pt); if (d && ok(pt, d)) o.add(d); }
        return [...o];
      });
      let use = [], fo = null;
      for (const sn of order) { const t = optFor(use.concat(sn)); if (t.reduce((x, o) => x * o.length, 1) > 150000) break; use.push(sn); fo = t; }
      if (fo) {
        const S1 = Object.assign({}, base0), top = [], P = R.ALL_PARTS;
        const rec = (i) => {
          if (i === P.length) { const x = fast(S1); if (x > -Infinity && (top.length < 12 || x > top[top.length - 1][0])) { top.push([x, Object.assign({}, S1)]); top.sort((m, n) => n[0] - m[0]); if (top.length > 12) top.pop(); } return; }
          for (const d of fo[i]) { S1[P[i]] = d; rec(i + 1); }
        };
        rec(0);
        for (const [, S2] of top) { const key = ['아바타5셋'].concat(P).map(pt => S2[pt] || '').join('|'); if (seen.has(key)) continue; seen.add(key); outs.push([S2, cpOf(S2)]); }
        outs.sort((a, b) => b[1] - a[1]);
      }
    } catch (e) { console.error(e); }
    let [S, v] = outs[0];
    for (let pass = 0; pass < 8; pass++) {
      const list = []; moves(S, (m) => { const x = fast(Object.assign({}, S, m)); if (x > -Infinity) list.push([x, m]); });
      list.sort((a, b) => b[0] - a[0]);
      let bm = null, bv = v;
      for (const [, m] of list.slice(0, 30)) { const x = cpOf(Object.assign({}, S, m)); if (x > bv + 0.5) { bv = x; bm = m; } }
      if (!bm) break; S = Object.assign({}, S, bm); v = bv;
    }
    const cnt = new Map(); for (const pt of R.ALL_PARTS) { const sn = db.displayToSet.get(S[pt]); if (sn) cnt.set(sn, (cnt.get(sn) || 0) + 1); }
    // 효과가 적용되는 세트만 보여 줌(3세트까지)
    return Object.assign(candOf(S), { cp: v, setLabels: (R.wornContribution(db, S).sets || []).map(sn => `${sn}(${cnt.get(sn) || 0})`) });
  }
  // 정밀 탐색: 위 탐색이 놓치는 두 가지를 메움.
  //  ① 한벌 아바타(·하의 악세)마다 그 한벌을 입은 상태에 맞춘 빠른 점수를 따로 만들어 다시 오르막 탐색(한벌이 바뀌면 맞는 아바타도 달라짐)
  //  ② 위쪽 몇 개는 계산기 실투력으로 이웃 조합을 직접 재 봄: 한 부위, 5셋, 한 세트의 2~3부위, 아무 두 부위(세트 부위를 다른 칸으로 옮기는 조합 등)
  // 조건(고정·보유·목표 쿨감)은 다른 탐색과 같게 지킴
  function deepen(r, worn, base, ctx, seeds, suits, bottoms) {
    const db = r.db, cap = APP.coolCap ? APP.coolCap() : 35;
    if (!ctx.scorer || !r.bare || !isFinite(r.bare.baseCooldownBare)) return null;
    const T = Number(r.coolTarget) || 0, atLeast = st.o.coolAtLeast !== false, bare = r.bare.baseCooldownBare;
    const fixed = ctx.fixed || {}, owned = ctx.owned || null, P = R.ALL_PARTS, F5 = '아바타5셋', SLOTS = [F5].concat(P);
    const ok = (part, d) => !owned || owned.has(d) || d === (worn[part] || '');
    const FREE = P.filter(pt => !fixed[pt]);
    const opts = {}; for (const pt of FREE) opts[pt] = [...(db.partCandidates.get(pt) || [])].filter(d => ok(pt, d));
    if (!ctx.fiveFixed) opts[F5] = db.fiveSetList.map(x => db.fiveSetDisplay.get(x)).filter(d => d && ok(F5, d));
    const VAR = (ctx.fiveFixed ? [] : [F5]).concat(FREE);
    const setItems = [];
    for (const [sn, parts] of db.setToParts) {
      const xs = []; for (const pt of parts) { if (fixed[pt]) continue; const d = db.displayBySetPart.get(sn + '||' + pt); if (d && ok(pt, d)) xs.push([pt, d]); }
      if (xs.length >= 2) setItems.push(xs);
    }
    const now = worn['한벌'] || '', bNow = prof().bottom || '';
    const keyOf = (S) => SLOTS.map(pt => S[pt] || '').join('|');
    // 빠른 합산: 아이템 스탯을 숫자 배열로 미리 바꿔 두고 R.wornContribution과 같은 규칙(세트 효과는 3세트까지)으로 더함
    const TS = R.TARGET_STATS, NS = TS.length, IC = TS.indexOf('쿨감'), IG = TS.indexOf('강렬댐증');
    const vecOf = (o) => { const v = new Float64Array(NS); if (o) for (let i = 0; i < NS; i++) v[i] = Number(o[TS[i]]) || 0; return v; };
    const sizeOf = (o) => { let t = 0; for (const k in (o || {})) t += Number(o[k]) || 0; return t; };
    const setIx = new Map(), six = (n) => { if (!n) return -1; let i = setIx.get(n); if (i === undefined) { i = setIx.size; setIx.set(n, i); } return i; };
    const effs = db.setEffects.map(e => ({ si: six(e.set), need: e.need, v: vecOf(db.statsByDisplay.get(e.display)), size: sizeOf(db.statsByDisplay.get(e.display) || {}) }));
    const info = new Map(), infoOf = (d) => { let x = info.get(d); if (!x) { x = { v: vecOf(db.statsByDisplay.get(d)), si: six(db.displayToSet.get(d)) }; info.set(d, x); } return x; };
    const fiveVec = new Map(); for (const [sname, disp] of db.fiveSetDisplay) { const v = fiveVec.get(disp) || new Float64Array(NS), a = vecOf(db.fiveSetStats.get(sname)); for (let i = 0; i < NS; i++) v[i] += a[i]; fiveVec.set(disp, v); }
    for (const pt of P) for (const d of (db.partCandidates.get(pt) || [])) infoOf(d);
    for (const pt of P) if (worn[pt]) infoOf(worn[pt]);
    const NSET = setIx.size + 8, cnt = new Int32Array(NSET), ssz = new Float64Array(NSET), vec = new Float64Array(NS), arr = new Array(13).fill(0);
    const sums = (S) => {
      vec.fill(0); cnt.fill(0);
      const f = S[F5] && fiveVec.get(S[F5]); if (f) for (let i = 0; i < NS; i++) vec[i] += f[i];
      for (let p = 0; p < P.length; p++) { const d = S[P[p]]; if (!d) continue; const x = infoOf(d), v = x.v; for (let i = 0; i < NS; i++) vec[i] += v[i]; if (x.si >= 0) cnt[x.si]++; }
      const act = [];
      for (let k = 0; k < effs.length; k++) { const e = effs[k]; if (cnt[e.si] >= e.need) { if (act.indexOf(e.si) < 0) { act.push(e.si); ssz[e.si] = 0; } ssz[e.si] += e.size; } }
      if (act.length > 3) { act.sort((x, y) => Math.min(cnt[y], 3) - Math.min(cnt[x], 3) || ssz[y] - ssz[x]); act.length = 3; }
      else if (act.length > 1) act.sort((x, y) => Math.min(cnt[y], 3) - Math.min(cnt[x], 3) || ssz[y] - ssz[x]);
      for (let a = 0; a < act.length; a++) { const si = act[a]; for (let k = 0; k < effs.length; k++) { const e = effs[k]; if (e.si === si && cnt[si] >= e.need) { const v = e.v; for (let i = 0; i < NS; i++) vec[i] += v[i]; } } }
      return vec;
    };
    const coolNow = () => Math.min(bare + vec[IC], cap);
    const okCool = (c) => !T || (atLeast ? c >= T - 1e-9 : Math.abs(c - T) <= 1e-9);
    const fastOf = (sc) => (S) => { sums(S); const c = coolNow(); if (!okCool(c)) return -Infinity; for (let i = 0; i < 12; i++) arr[i] = vec[i]; arr[12] = vec[IG]; return sc(arr, c); };
    const candOf = (S) => { const pd = {}; for (const pt of P) if (S[pt]) pd[pt] = S[pt]; sums(S); return { fiveSetDisplay: S[F5] || '', partToDisplay: pd, coolReal: coolNow(), polished: true }; };
    const memo = new Map();
    const overOf = (S, sn, bn) => { const o = Object.assign({}, base, overridesFor(r, worn, candOf(S))); suitOver(o, now, sn); bottomOver(o, bNow, bn); return o; };
    const real = (S, sn, bn) => {
      const k = sn + '\u0001' + bn + '\u0001' + keyOf(S); let v = memo.get(k);
      if (v === undefined) { sums(S); v = okCool(coolNow()) ? APP.cpWith(overOf(S, sn, bn)) : -1; if (!(v > 0)) v = -1; memo.set(k, v); }
      return v;
    };
    // 이웃: S를 그 자리에서 바꿨다가 되돌림. each(값들을 넣은 뒤 부르는 함수, 바꾼 내용)
    const one = (S, each) => { for (const pt of VAR) { const keep = S[pt]; for (const d of opts[pt]) { if (d === keep) continue; S[pt] = d; each(pt, d); } S[pt] = keep; } };
    const sets = (S, each) => {
      for (const xs of setItems) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
        const [pi, di] = xs[i], [pj, dj] = xs[j], ki = S[pi], kj = S[pj];
        S[pi] = di; S[pj] = dj;
        if (!(ki === di && kj === dj)) each(pi, di, pj, dj);
        for (let k = j + 1; k < xs.length; k++) { const [pk, dk] = xs[k], kk = S[pk]; if (ki === di && kj === dj && kk === dk) continue; S[pk] = dk; each(pi, di, pj, dj, pk, dk); S[pk] = kk; }
        S[pi] = ki; S[pj] = kj;
      }
    };
    const two = (S, each) => {
      for (let a = 0; a < VAR.length; a++) { const pa = VAR[a], ka = S[pa];
        for (const da of opts[pa]) { if (da === ka) continue; S[pa] = da;
          for (let b = a + 1; b < VAR.length; b++) { const pb = VAR[b], kb = S[pb]; for (const d2 of opts[pb]) { if (d2 === kb) continue; S[pb] = d2; each(pa, da, pb, d2); } S[pb] = kb; }
        }
        S[pa] = ka; }
    };
    const apply = (S, m) => { for (let i = 0; i < m.length; i += 2) S[m[i]] = m[i + 1]; };
    const climb = (S0, fast) => {
      const S = Object.assign({}, S0); let v = fast(S);
      for (let it = 0; it < 60; it++) {
        let bm = null, bv = v;
        const each = (...m) => { const x = fast(S); if (x > bv + 1e-9) { bv = x; bm = m; } };
        one(S, each); sets(S, each);
        if (!bm) two(S, each);
        if (!bm) break; apply(S, bm); v = bv;
      }
      return v > -Infinity ? S : null;
    };
    // ① 한벌·하의 악세마다 맞춘 점수로 탐색 → 계산기 실투력으로 잼
    const found = [], seen = new Set();
    for (const sn of suits) for (const bn of bottoms) {
      const same = sn === now && bn === bNow;
      const sc = same ? ctx.scorer : buildScorer(db, worn, bottomOver(suitOver(Object.assign({}, base), now, sn), bNow, bn));
      if (!sc) continue;
      const fast = fastOf(sc);
      for (const S0 of seeds) {
        const S = climb(S0, fast); if (!S) continue;
        const k = sn + '\u0001' + bn + '\u0001' + keyOf(S); if (seen.has(k)) continue; seen.add(k);
        const cp = real(S, sn, bn); if (cp > 0) found.push({ S, sn, bn, cp, fast });
      }
    }
    if (!found.length) return null;
    found.sort((a, b) => b.cp - a.cp);
    // ② 위쪽 조합은 계산기 실투력으로 이웃을 직접 재 봄(한 부위·5셋은 전부, 세트·두 부위 바꾸기는 빠른 점수 위쪽만)
    const finish = (x) => {
      const S = Object.assign({}, x.S); let v = x.cp;
      for (let pass = 0; pass < 6; pass++) {
        let bm = null, bv = v;
        const tryReal = (m) => { const c = real(S, x.sn, x.bn); if (c > bv + 0.5) { bv = c; bm = m; } };
        one(S, (...m) => tryReal(m));
        const list = [], push = (...m) => { const f = x.fast(S); if (f > -Infinity) list.push([f, m]); };
        sets(S, push); two(S, push);
        list.sort((a, b) => b[0] - a[0]);
        for (const [, m] of list.slice(0, DEEP_TOP)) { const keep = []; for (let i = 0; i < m.length; i += 2) keep.push(m[i], S[m[i]]); apply(S, m); tryReal(m); apply(S, keep); }
        if (!bm) break; apply(S, bm); v = bv;
      }
      return { S, sn: x.sn, bn: x.bn, cp: v, fast: x.fast };
    };
    let best = null; const done = new Set();
    for (const x of found.slice(0, DEEP_SEEDS)) {
      const y = finish(x), k = y.sn + '\u0001' + y.bn + '\u0001' + keyOf(y.S); if (done.has(k)) continue; done.add(k);
      if (!best || y.cp > best.cp) best = y;
    }
    // 끝으로 찾은 조합에 다른 한벌·하의 악세도 대 봄
    for (const sn of suits) for (const bn of bottoms) { const c = real(best.S, sn, bn); if (c > best.cp + 0.5) best = { S: best.S, sn, bn, cp: c, fast: best.fast }; }
    const S = best.S, cntS = new Map(); for (const pt of P) { const sn = db.displayToSet.get(S[pt]); if (sn) cntS.set(sn, (cntS.get(sn) || 0) + 1); }
    return Object.assign(candOf(S), { cp: best.cp, suit: best.sn, bottom: best.bn, over: overOf(S, best.sn, best.bn), setLabels: (R.wornContribution(db, S).sets || []).map(sn => `${sn}(${cntS.get(sn) || 0})`) });
  }
  const DEEP_SEEDS = 3, DEEP_TOP = 120;
  // 크리·극대를 마법석으로 맞춘 실투력(evalS)으로 아바타 부위를 한 칸씩 더 바꿔 봄.
  // 적응력처럼 상한(60%)에 걸리는 옵션은 빠른 점수로는 잘 안 잡혀서, 적응력이 달라지는 부위는 모두 실제로 재 봄
  // (하의 악세를 바꿔 모자라거나 남는 적응력을 다른 아바타 악세로 채우거나 돌리는 경우)
  function refineMatched(r, worn, ctx, S0, evalS) {
    const db = r.db, sc = ctx.scorer, cap = APP.coolCap ? APP.coolCap() : 35;
    if (!r.bare || !isFinite(r.bare.baseCooldownBare)) return null;
    const T = Number(r.coolTarget) || 0, atLeast = st.o.coolAtLeast !== false, bare = r.bare.baseCooldownBare;
    const fixed = ctx.fixed || {}, owned = ctx.owned || null;
    const ok = (part, d) => !owned || owned.has(d) || d === (worn[part] || '');
    const FREE = R.ALL_PARTS.filter(pt => !fixed[pt]);
    const opts = {}; for (const pt of FREE) opts[pt] = [...(db.partCandidates.get(pt) || [])].filter(d => ok(pt, d));
    const coolOf = (sums) => Math.min(bare + (sums['쿨감'] || 0), cap);
    const okCool = (sums) => !T || (atLeast ? coolOf(sums) >= T - 1e-9 : Math.abs(coolOf(sums) - T) <= 1e-9);
    const candOf = (S) => { const pd = {}; for (const pt of R.ALL_PARTS) if (S[pt]) pd[pt] = S[pt]; return { fiveSetDisplay: S['아바타5셋'] || '', partToDisplay: pd, coolReal: coolOf(R.wornContribution(db, S).sums), polished: true }; };
    let S = Object.assign({}, S0), best = evalS(candOf(S)), moved = false;
    if (!best) return null;
    for (let pass = 0; pass < 3; pass++) {
      const a0 = R.wornContribution(db, S).sums['적응력'] || 0, list = [];
      for (const pt of FREE) for (const d of opts[pt]) {
        if (S[pt] === d) continue;
        const S1 = Object.assign({}, S, { [pt]: d }), sums = R.wornContribution(db, S1).sums;
        if (!okCool(sums)) continue;
        list.push({ S1, da: (sums['적응력'] || 0) - a0, f: sc ? sc(R.sumsToAddArr(sums), coolOf(sums)) : 0 });
      }
      const pick = new Set(list.filter(x => Math.abs(x.da) > 1e-9).concat(list.slice().sort((a, b) => b.f - a.f).slice(0, 20)));
      let bm = null;
      for (const x of pick) { const m = evalS(candOf(x.S1)); if (m && m.cp > best.cp + 0.5) { best = m; bm = x.S1; } }
      if (!bm) break; S = bm; moved = true;
    }
    return moved ? best : null;
  }
  function rerank(r, worn, base, ctx) {
    if (!r || !r.cands || !r.cands.length || !APP.cpWith) return r;
    base = base || {};
    r.cpNow = APP.cpWith({});
    // 한벌 아바타·일반 악세 하의는 다른 부위와 따로라서, 후보마다 가능한 것을 모두 대 보고 실투력으로 고름
    const now = worn['한벌'] || '';
    let suits = suitChoices(worn);
    if (suits.length > 3) {
      const sc = suits.map(n => ({ n, v: APP.cpWith(suitOver(Object.assign({}, base), now, n)) })).sort((a, b) => b.v - a.v);
      suits = [...new Set(sc.slice(0, 3).map(x => x.n).concat(now))];
    }
    const bNow = prof().bottom || '', bottoms = bottomChoices();
    const evalCand = (c) => {
      const ov = overridesFor(r, worn, c);
      let best = null;
      for (const sName of suits) for (const bName of bottoms) {
        const o = Object.assign({}, base, ov);
        suitOver(o, now, sName); bottomOver(o, bNow, bName);
        const v = APP.cpWith(o);
        if (!best || v > best.cp) best = { cp: v, suit: sName, bottom: bName, over: o };
      }
      return Object.assign(c, best);
    };
    for (const c of r.cands) evalCand(c);
    let top = r.cands.slice().sort((a, b) => b.cp - a.cp)[0];
    if (!(top.cp > 0)) return r;
    r.scoreRank = r.cands.indexOf(top) + 1;
    if (ctx && ctx.scorer) {
      try {
        const toS = (c) => Object.assign({ '아바타5셋': c.fiveSetDisplay || '' }, c.partToDisplay);
        const starts = r.cands.slice().sort((a, b) => b.cp - a.cp).slice(0, 5).map(toS);
        const W = {}; for (const pt of ['아바타5셋'].concat(R.ALL_PARTS)) if (worn[pt]) W[pt] = worn[pt];
        starts.push(W);
        const pol = polish(r, worn, base, ctx, starts, top.suit, top.bottom);
        if (pol && pol.cp > top.cp + 0.5) { evalCand(pol); if (pol.cp > top.cp + 0.5) { pol.score = top.score; pol.mode = '마무리 탐색'; top = pol; } }
        // 정밀 탐색: 한벌마다 따로, 그리고 계산기 실투력으로 이웃 조합을 직접 재서 더 높은 조합이 있으면 그걸로
        const seeds = [toS(top)].concat(starts.slice(0, 3), [W]);
        const dp = deepen(r, worn, base, ctx, seeds, suitChoices(worn), bottoms);
        if (dp && dp.cp > top.cp + 0.5) { dp.score = top.score; dp.mode = '마무리 탐색'; top = dp; }
      } catch (e) { console.error(e); }
    }
    top.buffs = Object.assign({}, base);
    r.best = top; r.mode = top.mode || r.mode;
    r.gain = (100 + (top.rScore != null ? top.rScore : top.score)) / (100 + r.cur.score) - 1;
    return r;
  }
  // ---------- 최고 보장 탐색 ----------
  // 실투력 모델: 지금 세팅에서 스탯을 하나씩 바꿔 잰 계산기 실투력(로그) 변화를 더하고, 서로 영향을 주는 세 쌍
  // (강배·역강배, 강렬·초월 스킬 데미지, 크리·크뎀)은 곱 항으로 보정. 크리·극대는 마법석(크리·극대 ↔ 힘트마)을 다시 맞춘 것 중 가장 높은 값으로 셈.
  // 가지치기: 고른 부위 + 남은 부위마다 스탯별 최댓값 + 켤 수 있는 세트 효과 최대치로 잰 값이 지금 후보에 못 미치면 그 갈래를 통째로 건너뜀
  // (모델 기준으로는 빠지는 조합이 없음). 마지막에 모델 위쪽 조합을 계산기 실투력으로 다시 재고, 모델 오차만큼 아래 조합까지 모두 재서 1등을 고름
  const XS = ['적응력', '초적응력', '강배', '역강배', '100이하', '추피', '양극화', '물마퍼', '모스댐', '초댐증', '크댐증', '보댐증', '쿨감', '강렬댐증', '크리', '극대', '고정공'];
  const XN = XS.length, XI = {}; XS.forEach((k, i) => { XI[k] = i; });
  const XCELL = { '적응력': 'C14', '초적응력': 'C15', '강배': 'C24', '역강배': 'C25', '100이하': 'C26', '추피': 'C22', '양극화': 'C20', '모스댐': 'C33', '초댐증': 'C30', '크댐증': 'C18', '보댐증': 'C21', '강렬댐증': 'C29' };
  const SUIT_X = { atk: '고정공', mp: '물마퍼', crit: '크리', max: '극대', mos: '모스댐', pol: '양극화', adapt: '적응력', dot: '추피', boss: '보댐증' };
  const I_CR = XI['크리'], I_MX = XI['극대'], I_BS = XI['보댐증'], I_CD = XI['크댐증'], I_CL = XI['쿨감'], I_HA = XI['강배'], I_HB = XI['역강배'], I_SA = XI['강렬댐증'], I_SB = XI['초댐증'];
  const X_LIN = XS.map((k, i) => i).filter(i => i !== I_CR && i !== I_MX && i !== I_BS);
  const xVec = (o, map) => { const v = new Float64Array(XN); for (const k in (o || {})) { const s = map ? map[k] : k; if (s != null && XI[s] != null) v[XI[s]] += Number(o[k]) || 0; } return v; };
  const suitVec = (n) => xVec(SUITS[n], SUIT_X);
  const bottomVec = (n) => { const isSr = !!(BOTTOMS[n] && BOTTOMS[n].sr), a = xVec(BOTTOMS[n], SUIT_X), b = xVec(srSet(srFixed() + (isSr ? 1 : 0)), SUIT_X); for (let i = 0; i < XN; i++) a[i] += b[i]; return a; };
  // 실투력 모델(버프 조합 base마다 하나). worn·suitNow·bNow: 지금 낀 것(스탯창 값에 이미 들어 있음)
  function xModel(base, worn, suitNow, bNow) {
    base = base || {};
    const inp = Object.assign({}, APP.inputs(), base), cs = curStats(), cap = APP.coolCap ? APP.coolCap() : 35;
    const W = R.wornContribution(db, worn).sums, Wv = xVec(W), sv0 = suitVec(suitNow), bv0 = bottomVec(bNow);
    for (let i = 0; i < XN; i++) Wv[i] += sv0[i] + bv0[i];
    const curCool = Number(cs['쿨감']) || 0, bare = curCool - (W['쿨감'] || 0), mp = Number(cs['물마퍼']) || 0;
    const sk = APP.sockInfo ? APP.sockInfo() : { v: { crit: 6, max: 6, boss: 3, boss2: 2.5 }, counted: false, n: null, rawC: 0, rawM: 0 };
    const vc = sk.v.crit || 6, vm = sk.v.max || 6, vb = sk.v.boss || 3, vh = sk.v.boss2 || 2.5, NR = 12;
    const haveH = sk.counted ? sk.n.boss2 : 0, bossSlots = sk.counted ? sk.n.boss + sk.n.boss2 : Infinity;
    const drop = (t) => { if (t <= 0) return t * vb; const a = Math.min(t, haveH); return a * vh + (t - a) * vb; };
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    const C11 = Number(inp.C11) || 0, C12 = Number(inp.C12) || 0, C17 = Number(inp.C17) || 0, C19 = Number(inp.C19) || 0, C21 = Number(inp.C21) || 0;
    // Δ(지금 대비 아바타 스탯 변화, 쿨감은 상한 적용 뒤 변화) + 마법석 옮김(nc: 힘트마 → 크리 칸 수, nm: 힘트마 → 극대) → 계산기 칸
    const over = (d, nc, nm) => {
      const o = Object.assign({}, base);
      for (const k in XCELL) { const i = XI[k]; let dv = d[i]; if (i === I_BS) dv -= drop(nc + nm); if (dv) o[XCELL[k]] = r6(Math.max(0, (Number(inp[XCELL[k]]) || 0) + dv / 100)); }
      const dc = d[I_CL]; if (dc) for (const c of ['C31', 'C32']) o[c] = r6(Math.max(0, (Number(inp[c]) || 0) + dc / 100));
      const dmp = d[XI['물마퍼']], datk = d[XI['고정공']];
      if (dmp || datk) { const k = (100 + mp + dmp) / (100 + mp), add = datk * (1 + (mp + dmp) / 100); o.C11 = Math.max(1, Math.round(C11 * k + add)); o.C12 = Math.max(1, Math.round(C12 * k + add * (C11 > 0 ? C12 / C11 : 1))); }
      const dcr = d[I_CR] + vc * nc, dmx = d[I_MX] + vm * nm;
      if (dcr) o.C17 = APP.addRaw('C17', C17, dcr / 100);
      if (dmx) o.C19 = APP.addRaw('C19', C19, dmx / 100);
      return o;
    };
    const cp0 = APP.cpWith(base), L0 = Math.log(cp0 > 0 ? cp0 : 1);
    const lg = (o) => { const c = APP.cpWith(o); return c > 0 ? Math.log(c) - L0 : -50; };
    const z = new Float64Array(XN), hm = XS.map(() => new Map());
    let calls = 0;
    // 스탯 하나만 dv(%) 바꿨을 때의 실투력 변화(로그)
    // 빠른 표(±150, 고정공 ±1500 안쪽은 배열, 밖은 Map). 탐색이 끝나면 free()로 비움
    let HD = XS.map(k => { const R = k === '고정공' ? 150000 : 15000; return { R, a: new Float64Array(2 * R + 1).fill(NaN) }; });
    // 크리·극대: 계산기 칸(스탯창 값)은 0~1에서 잘리고, 만크극 위로는 실투력이 그대로라 칸 값으로 모아서 한 번만 계산
    // (실투력은 크리·극대가 늘면 줄지 않으므로, 어떤 칸 값에서 1일 때와 같으면 그 위는 모두 같음)
    const SAT = {}; for (const [i, c, w0] of [[I_CR, 'C17', C17], [I_MX, 'C19', C19]]) SAT[i] = { c, w0, top: null, sat: 1, m: new Map(), lin: undefined };
    // 크리·극대 칸 값(0~1)에 대한 실투력이 '직선이다가 만크극에서 꺾여 평평'인지 9곳으로 확인 → 맞으면 계산 없이 min(직선, 꼭대기)
    const cpCell = (c, w) => { calls++; return APP.cpWith(Object.assign({}, base, { [c]: r6(w) })); };
    const satLine = (S) => {
      if (S.lin !== undefined) return S.lin;
      S.lin = null;
      const top = cpCell(S.c, 1), a0 = cpCell(S.c, 0), a1 = cpCell(S.c, 0.25), k = (a1 - a0) / 0.25;
      if (!(top > 0) || !(a0 > 0) || !(k > 0)) return null;
      const ws = Math.min(1, (top - a0) / k), f = (w) => Math.min(a0 + k * w, top);
      const chk = [0.5, 0.75, ws * 0.9, ws - 0.003, ws + 0.003, (ws + 1) / 2].filter(w => w > 0 && w < 1);
      for (const w of chk) { const c = cpCell(S.c, w), e = f(w); if (Math.abs(c / e - 1) > 1e-10) return null; }
      S.lin = { a0, k, top }; return S.lin;
    };
    // 고정공·물마퍼: 계산기 공격력 칸(C11·C12)에 대해 실투력이 평면인지 6곳으로 확인 → 맞으면 반올림까지 똑같이 따라 하고 평면으로 계산
    let ATK;
    const atkPlane = () => {
      if (ATK !== undefined) return ATK;
      ATK = null;
      const F = (a, b) => { calls++; return APP.cpWith(Object.assign({}, base, { C11: a, C12: b })); };
      if (!(C11 > 0 && C12 > 0)) return null;
      const f0 = F(C11, C12), d = Math.max(1000, Math.round(C11 * 0.1)), fb = F(C11 + d, C12), fc = F(C11, C12 + d);
      const b = (fb - f0) / d, c = (fc - f0) / d, a = f0 - b * C11 - c * C12, P = (x, y) => a + b * x + c * y;
      for (const [x, y] of [[C11 * 2, C12 * 2], [Math.round(C11 * 0.6), Math.round(C12 * 0.7)], [C11 + 3 * d, C12 + 5 * d]]) { const v = F(x, y), e = P(x, y); if (!(e > 0) || Math.abs(v / e - 1) > 1e-10) return null; }
      ATK = { P }; return ATK;
    };
    const callsBy = new Int32Array(XN), realBy = new Int32Array(XN);
    const hCalc = (i, key) => {
      callsBy[i]++;
      const S = SAT[i];
      if (S) { const w = Math.min(1, Math.max(0, APP.addRaw(S.c, S.w0, key / 10000)));
        const Ln = satLine(S); if (Ln) { const c = Math.min(Ln.a0 + Ln.k * r6(w), Ln.top); return c > 0 ? Math.log(c) - L0 : -50; }
        if (S.top === null) { calls++; S.top = lg(Object.assign({}, base, { [S.c]: 1 })); }
        if (w >= S.sat - 1e-12) return S.top;
        const k = Math.round(w * 1e6); let v = S.m.get(k); if (v !== undefined) return v;
        calls++; realBy[i]++; v = lg(Object.assign({}, base, { [S.c]: r6(w) })); S.m.set(k, v); if (Math.abs(v - S.top) < 1e-13 && w < S.sat) S.sat = w; return v; }
      if (XS[i] === '고정공' || XS[i] === '물마퍼') { const AP = atkPlane(); if (AP) { z.fill(0); z[i] = key / 100; const o = over(z, 0, 0), c = AP.P(o.C11 ?? C11, o.C12 ?? C12); return c > 0 ? Math.log(c) - L0 : -50; } }
      const A = affOf(i);
      if (A) { const dv = key / 100; if (dv >= A.L - 1e-9 && dv <= A.U + 1e-9) { const c = A.c0 + A.k * (dv - A.L); return c > 0 ? Math.log(c) - L0 : -50; } if (A.clampLo && dv < A.L) return A.vL; }
      return rawH(i, key); };
    const rawH = (i, key) => { z.fill(0); z[i] = key / 100; calls++; realBy[i]++; return lg(over(z, 0, 0)); };
    // 칸 하나만 바뀌는 스탯은 쓰는 범위에서 실투력이 직선인지 7곳으로 확인 → 직선이면 그 범위는 계산 없이 직선으로
    // (모스·보뎀·크뎀처럼 곱해지기만 하는 스탯. 상한·꺾임이 있으면 확인에서 걸려서 그 스탯은 그대로 하나하나 계산)
    const AFF = {};
    const affOf = (i) => {
      if (i in AFF) return AFF[i];
      AFF[i] = null;
      // 고정공·물마퍼는 공격력 반올림 때문에 직선에서 아주 조금 어긋나서 그대로 계산
      if (i === I_CR || i === I_MX || XS[i] === '고정공' || XS[i] === '물마퍼') return null;
      const cell = XCELL[XS[i]];
      let L = -150, U = 150, clampLo = false;
      if (cell) { const d0 = -(Number(inp[cell]) || 0) * 100; if (d0 > L) { L = Math.ceil(d0 * 100) / 100; clampLo = true; } }
      if (!(U - L > 4)) return null;
      const tol = 1e-10, N = 7, pts = [];
      for (let q = 0; q < N; q++) { const dv = Math.round((L + (U - L) * q / (N - 1)) * 100) / 100, v = rawH(i, Math.round(dv * 100)); pts.push([dv, Math.exp(v + L0)]); }
      const [x0, c0] = pts[0], [x1, c1] = pts[N - 1], k = (c1 - c0) / (x1 - x0);
      for (const [x, c] of pts) { const l = c0 + k * (x - x0); if (!(l > 0) || Math.abs(c / l - 1) > tol) return null; }
      AFF[i] = { L: x0, U: x1, c0, k, clampLo, vL: Math.log(c0) - L0 };
      return AFF[i];
    };
    const h = (i, dv) => { const key = Math.round(dv * 100);
      if (HD) { const D = HD[i], ix = key + D.R; if (ix >= 0 && ix < D.a.length) { let v = D.a[ix]; if (v !== v) { v = hm[i].get(key); if (v === undefined) { v = hCalc(i, key); hm[i].set(key, v); } D.a[ix] = v; } return v; } }
      const m = hm[i]; let v = m.get(key); if (v === undefined) { v = hCalc(i, key); m.set(key, v); } return v; };
    const pair = (i, j, a, b) => { z.fill(0); z[i] = a; z[j] = b; calls++; return (lg(over(z, 0, 0)) - h(i, a) - h(j, b)) / (a * b); };
    const cHP = pair(I_HA, I_HB, 5, 5), cSK = pair(I_SA, I_SB, 5, 5);
    // 크리·크뎀: 크뎀 변화 × 스탯창 크리 변화(크리는 100%에서 끝나서 원래 수치가 아니라 스탯창 값으로)
    const wm = new Map(), w0 = Math.min(1, Math.max(0, C17));
    const wc = (dRaw) => { const key = Math.round(dRaw * 100); let v = wm.get(key); if (v === undefined) { v = (Math.min(1, Math.max(0, APP.addRaw('C17', C17, key / 10000))) - w0) * 100; wm.set(key, v); } return v; };
    let cCD = 0;
    for (const dr of [vc, -vc]) { const dw = wc(dr); if (Math.abs(dw) > 0.05) { z.fill(0); z[I_CD] = 5; z[I_CR] = dr; calls++; cCD = (lg(over(z, 0, 0)) - h(I_CD, 5) - h(I_CR, dr)) / (5 * dw); break; } }
    // 마법석 옮김 범위: 소켓 칸 수를 넣었으면 그 안에서. 원래 수치·보뎀이 0 밑으로는 못 감
    const ncLo0 = sk.counted ? -sk.n.crit : -NR, nmLo0 = sk.counted ? -sk.n.max : -NR;
    const Rm = new Map();
    // 크리·극대·보뎀(+크뎀 곱 항)을 마법석까지 맞춘 가장 높은 값. arg: 그때 옮긴 칸 수
    const R4 = (dc, dm, db, dcd) => {
      const key = ((Math.round(dc * 2) + 2000) * 4000 + (Math.round(dm * 2) + 2000)) * 4000 * 4000 + (Math.round(db * 2) + 2000) * 4000 + (Math.round(dcd * 2) + 2000);
      let r = Rm.get(key); if (r) return r;
      const ncLo = Math.max(ncLo0, Math.ceil(-(sk.rawC + dc) / vc - 1e-9)), nmLo = Math.max(nmLo0, Math.ceil(-(sk.rawM + dm) / vm - 1e-9));
      const fc = [], fm = [];
      for (let n = ncLo; n <= NR; n++) fc.push(h(I_CR, dc + vc * n) + cCD * dcd * wc(dc + vc * n));
      for (let n = nmLo; n <= NR; n++) fm.push(h(I_MX, dm + vm * n));
      let bv = -Infinity, bc = 0, bmx = 0;
      for (let a = 0; a < fc.length; a++) {
        const nc = ncLo + a;
        for (let b = 0; b < fm.length; b++) {
          const nm = nmLo + b, t = nc + nm;
          if (t > bossSlots || C21 * 100 + db - drop(t) < -1e-9) continue;
          const v = fc[a] + fm[b] + h(I_BS, db - drop(t));
          if (v > bv) { bv = v; bc = nc; bmx = nm; }
        }
      }
      r = { v: bv, nc: bc, nm: bmx }; Rm.set(key, r); return r;
    };
    // 아바타 스탯 합(절대값, 세트 효과 포함) → 모델 값(지금 대비 실투력 로그 변화)
    const d = new Float64Array(XN);
    const delta = (x) => { for (let i = 0; i < XN; i++) d[i] = x[i] - Wv[i]; d[I_CL] = Math.min(bare + x[I_CL], cap) - curCool; return d; };
    const value = (x) => {
      delta(x);
      let v = 0; for (const i of X_LIN) if (d[i]) v += h(i, d[i]);
      v += cHP * d[I_HA] * d[I_HB] + cSK * d[I_SA] * d[I_SB];
      return v + R4(d[I_CR], d[I_MX], d[I_BS], d[I_CD]).v;
    };
    // 계산기 실투력(마법석은 모델이 고른 칸 수에서 시작해 한 칸씩 옮겨 가며 가장 높은 곳)
    const real = (x) => {
      const dd = Float64Array.from(delta(x)), hint = R4(dd[I_CR], dd[I_MX], dd[I_BS], dd[I_CD]);
      const ncLo = Math.max(ncLo0, Math.ceil(-(sk.rawC + dd[I_CR]) / vc - 1e-9)), nmLo = Math.max(nmLo0, Math.ceil(-(sk.rawM + dd[I_MX]) / vm - 1e-9));
      const memo = new Map();
      const f = (nc, nm) => {
        if (nc < ncLo || nm < nmLo || nc > NR || nm > NR || nc + nm > bossSlots || C21 * 100 + dd[I_BS] - drop(nc + nm) < -1e-9) return -Infinity;
        const k = nc * 100 + nm; let v = memo.get(k); if (v === undefined) { v = APP.cpWith(over(dd, nc, nm)); if (!(v > 0)) v = -Infinity; memo.set(k, v); } return v;
      };
      let nc = hint.nc, nm = hint.nm, v = f(nc, nm);
      if (!(v > 0)) { nc = 0; nm = 0; v = f(0, 0); }
      for (let it = 0; it < 40; it++) {
        let bn = null, bvv = v;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) { const w = f(nc + a, nm + b); if (w > bvv + 1e-6) { bvv = w; bn = [nc + a, nm + b]; } }
        if (!bn) break; [nc, nm] = bn; v = bvv;
      }
      return { cp: v, nc, nm, over: over(dd, nc, nm), model: Math.exp(value(x)) * Math.exp(L0) };
    };
    // 가지치기용 기울기: lo~hi 사이에서 스탯 하나가 1 늘 때 모델 값이 가장 많이 오르는 폭(위로 넉넉하게).
    // 끝점 두 곳의 한 칸 차이와 할선 중 큰 값(오목·볼록 둘 다 덮음), 쿨감은 상한 바로 아래도 봄. 곱 항은 짝 스탯이 가장 유리한 끝에서
    const dl = new Float64Array(XN), dh = new Float64Array(XN), STEP = XS.map(k => k === '고정공' ? 10 : 1);
    const sl1 = (f, a, b, st) => { let s = (f(a + st) - f(a)) / st; if (b > a + 1e-9) { s = Math.max(s, (f(b) - f(b - st)) / st, (f(b) - f(a)) / (b - a)); } return s; };
    const capX = cap - bare;
    const slopes = (xlo, xhi, S) => {
      delta(xlo); dl.set(d); delta(xhi); dh.set(d);
      for (const i of X_LIN) {
        if (i === I_CL) { const f = (x) => h(I_CL, Math.min(bare + x, cap) - curCool), a = xlo[i], b = Math.max(a, xhi[i]); let s = sl1(f, a, b, 1); const e = Math.min(b, capX); if (e - 1 >= a - 1) s = Math.max(s, f(e) - f(e - 1)); S[i] = s; continue; }
        const st = STEP[i], f = (v) => h(i, v); S[i] = sl1(f, dl[i], Math.max(dl[i], dh[i]), st);
      }
      S[I_HA] += Math.max(cHP * dl[I_HB], cHP * dh[I_HB]); S[I_HB] += Math.max(cHP * dl[I_HA], cHP * dh[I_HA]);
      S[I_SA] += Math.max(cSK * dl[I_SB], cSK * dh[I_SB]); S[I_SB] += Math.max(cSK * dl[I_SA], cSK * dh[I_SA]);
      const lo4 = [dl[I_CR], dl[I_MX], dl[I_BS], dl[I_CD]], hi4 = [dh[I_CR], dh[I_MX], dh[I_BS], Math.max(dl[I_CD], dh[I_CD])];
      const RR = (v) => R4(v[0], v[1], v[2], v[3]).v;
      [I_CR, I_MX, I_BS, I_CD].forEach((ix, q) => {
        let s = -Infinity;
        for (const corner of [lo4, hi4]) {
          const f = (t) => { const v = corner.slice(); v[q] = t; return RR(v); };
          s = Math.max(s, sl1(f, lo4[q], Math.max(lo4[q], hi4[q]), 1));
        }
        S[ix] = s;
      });
      for (let i = 0; i < XN; i++) S[i] = Math.max(0, S[i]) * 1.03 + 1e-6;
      return S;
    };
    // 라그랑주 상한: 스탯마다 가격 lam → 상자 [Lo, Hi](아바타 스탯 합) 안에서 (모델 값 − lam·x)의 최댓값과 그 점(y).
    // 아바타 수치는 모두 정수(고정공은 5 단위)라 그 칸만 보면 정확. 크리·극대·보뎀·크뎀은 마법석 칸 수마다 나눠서
    const GR = XS.map(k => k === '고정공' ? 5 : 1);
    const grid = (lo, hi, st) => { const a = []; for (let x = Math.ceil(lo / st - 1e-9) * st; x <= hi + 1e-9; x += st) a.push(Math.round(x * 100) / 100); return a.length ? a : [lo]; };
    const fx = (i, x) => i === I_CL ? h(I_CL, Math.min(bare + x, cap) - curCool) : h(i, x - Wv[i]);
    // 상자마다 한 번: 칸별 h 값을 미리 표로(가격만 바뀌는 반복에서는 더하기·빼기만)
    const conjPrep = (Lo, Hi) => {
      const B = { singles: [], pairs: [] };
      for (const i of X_LIN) {
        if (i === I_HA || i === I_HB || i === I_SA || i === I_SB || i === I_CD) continue;
        // 한 스탯짜리는 다 계산하지 않고 필요한 칸만(conj에서 단조성으로 나머지를 위로 묶음)
        const gx = grid(Lo[i], Hi[i], GR[i]); B.singles.push({ i, gx, fv: new Float64Array(gx.length).fill(NaN), full: false });
      }
      for (const [ia, ib, c] of [[I_HA, I_HB, cHP], [I_SA, I_SB, cSK]]) {
        const ga = grid(Lo[ia], Hi[ia], GR[ia]), gb = grid(Lo[ib], Hi[ib], GR[ib]);
        B.pairs.push({ ia, ib, c, ga, gb, fa: Float64Array.from(ga, x => fx(ia, x)), fb: Float64Array.from(gb, x => fx(ib, x)), da: Float64Array.from(ga, x => x - Wv[ia]), db: Float64Array.from(gb, x => x - Wv[ib]), fbl: new Float64Array(gb.length) });
      }
      const gc = grid(Lo[I_CR], Hi[I_CR], 1), gd = grid(Lo[I_CD], Hi[I_CD], 1), gm = grid(Lo[I_MX], Hi[I_MX], 1), gb = grid(Lo[I_BS], Hi[I_BS], 1);
      const hd = Float64Array.from(gd, x => h(I_CD, x - Wv[I_CD])), dd = Float64Array.from(gd, x => x - Wv[I_CD]);
      // 크리: (마법석 nc, xc)마다 u = dc + vc·nc. 크뎀 곱 항은 u에만 달려서 같은 u는 한 번만
      const uKey = new Map(), uH = [], uW = [], Aent = [];
      for (let nc = ncLo0; nc <= NR; nc++) { const xs = [], us = [];
        for (let a = 0; a < gc.length; a++) { const dc = gc[a] - Wv[I_CR]; if (nc < Math.ceil(-(sk.rawC + dc) / vc - 1e-9)) continue; const u = dc + vc * nc, k = Math.round(u * 100);
          let ui = uKey.get(k); if (ui === undefined) { ui = uH.length; uKey.set(k, ui); uH.push(h(I_CR, u)); uW.push(cCD * wc(u)); } xs.push(a); us.push(ui); }
        Aent.push({ xs: Int32Array.from(xs), us: Int32Array.from(us) }); }
      const Bent = []; for (let nm = nmLo0; nm <= NR; nm++) { const xs = [], hv = []; for (let a = 0; a < gm.length; a++) { const dm = gm[a] - Wv[I_MX]; if (nm < Math.ceil(-(sk.rawM + dm) / vm - 1e-9)) continue; xs.push(a); hv.push(h(I_MX, dm + vm * nm)); } Bent.push({ xs: Int32Array.from(xs), hv: Float64Array.from(hv) }); }
      const tLo = ncLo0 + nmLo0, Cent = [];
      for (let t = tLo; t <= 2 * NR; t++) { const xs = [], hv = []; if (t <= bossSlots) for (let a = 0; a < gb.length; a++) { const db = gb[a] - Wv[I_BS]; if (C21 * 100 + db - drop(t) < -1e-9) continue; xs.push(a); hv.push(h(I_BS, db - drop(t))); } Cent.push({ xs: Int32Array.from(xs), hv: Float64Array.from(hv) }); }
      const nU = uH.length;
      B.r4 = { gc, gd, gm, gb, hd, dd, ad: new Float64Array(gd.length), uH: Float64Array.from(uH), uW: Float64Array.from(uW), uBest: new Float64Array(nU), uArg: new Int32Array(nU), Aent, Bent, Cent, tLo,
        A: new Float64Array(Aent.length), Aa: new Int32Array(Aent.length), Bv: new Float64Array(Bent.length), Ba: new Int32Array(Bent.length), Cv: new Float64Array(Cent.length), Ca: new Int32Array(Cent.length) };
      return B;
    };
    // 라그랑주 상한: 가격 lam → 상자 안에서 (모델 값 − lam·x)의 최댓값(정확: 아바타 수치가 정수라 칸만 보면 됨)과 그 점 y
    const conj = (lam, B, y) => {
      let phi = 0;
      for (const S of B.singles) {
        const i = S.i, L = lam[i], gx = S.gx, fv = S.fv, m = gx.length;
        const get = (a) => { let v = fv[a]; if (v !== v) { v = fx(i, gx[a]); fv[a] = v; } return v; };
        if (S.full) { for (let a = 0; a < m; a++) get(a); }
        else { get(0); get(m - 1); }
        // 실투력은 스탯이 늘면 줄지 않음 → 아직 안 잰 칸 (a, b) 사이는 h(b) − min(L·x(a+1), L·x(b−1)) 보다 클 수 없음. 그 값이 지금 최고보다 크면 가운데를 재서 쪼갬
        for (;;) {
          let bv = -Infinity, bx = 0;
          for (let a = 0; a < m; a++) { const v = fv[a]; if (v === v) { const w = v - L * gx[a]; if (w > bv) { bv = w; bx = a; } } }
          let need = -1, pa = -1;
          for (let a = 0; a < m; a++) { if (fv[a] !== fv[a]) continue; if (pa >= 0 && a > pa + 1 && fv[a] - Math.min(L * gx[pa + 1], L * gx[a - 1]) > bv + 1e-12) { need = (pa + a) >> 1; break; } pa = a; }
          if (need < 0) { phi += bv; if (y) y[i] = gx[bx]; break; }
          const v = get(need);
          // 단조가 아니면(그럴 일은 없지만) 이 스탯은 모든 칸을 잼
          let l = need - 1; while (l >= 0 && fv[l] !== fv[l]) l--; let r = need + 1; while (r < m && fv[r] !== fv[r]) r++;
          if ((l >= 0 && v < fv[l] - 1e-12) || (r < m && v > fv[r] + 1e-12)) { S.full = true; for (let a = 0; a < m; a++) get(a); }
        }
      }
      for (const Pp of B.pairs) { const La = lam[Pp.ia], Lb = lam[Pp.ib], nb = Pp.gb.length, fbl = Pp.fbl, dbv = Pp.db; let bv = -Infinity, ba = 0, bb = 0;
        for (let q = 0; q < nb; q++) fbl[q] = Pp.fb[q] - Lb * Pp.gb[q];
        for (let a = 0; a < Pp.ga.length; a++) { const fa = Pp.fa[a] - La * Pp.ga[a], cd = Pp.c * Pp.da[a]; for (let q = 0; q < nb; q++) { const v = fa + fbl[q] + cd * dbv[q]; if (v > bv) { bv = v; ba = a; bb = q; } } }
        phi += bv; if (y) { y[Pp.ia] = Pp.ga[ba]; y[Pp.ib] = Pp.gb[bb]; } }
      const Q = B.r4, Lc = lam[I_CR], Ld = lam[I_CD], Lm = lam[I_MX], Lb = lam[I_BS], nd = Q.gd.length, ad = Q.ad, dd = Q.dd;
      for (let q = 0; q < nd; q++) ad[q] = Q.hd[q] - Ld * Q.gd[q];
      for (let ui = 0; ui < Q.uH.length; ui++) { const w = Q.uW[ui]; let bv = -Infinity, bq = 0; for (let q = 0; q < nd; q++) { const v = ad[q] + w * dd[q]; if (v > bv) { bv = v; bq = q; } } Q.uBest[ui] = Q.uH[ui] + bv; Q.uArg[ui] = bq; }
      const A = Q.A, Aa = Q.Aa, Bv = Q.Bv, Ba = Q.Ba, Cv = Q.Cv, Ca = Q.Ca;
      for (let a = 0; a < A.length; a++) { const E = Q.Aent[a]; let bv = -Infinity, bi = -1; for (let k = 0; k < E.xs.length; k++) { const v = Q.uBest[E.us[k]] - Lc * Q.gc[E.xs[k]]; if (v > bv) { bv = v; bi = k; } } A[a] = bv; Aa[a] = bi; }
      for (let b = 0; b < Bv.length; b++) { const E = Q.Bent[b]; let bv = -Infinity, bi = -1; for (let k = 0; k < E.xs.length; k++) { const v = E.hv[k] - Lm * Q.gm[E.xs[k]]; if (v > bv) { bv = v; bi = k; } } Bv[b] = bv; Ba[b] = bi; }
      for (let t = 0; t < Cv.length; t++) { const E = Q.Cent[t]; let bv = -Infinity, bi = -1; for (let k = 0; k < E.xs.length; k++) { const v = E.hv[k] - Lb * Q.gb[E.xs[k]]; if (v > bv) { bv = v; bi = k; } } Cv[t] = bv; Ca[t] = bi; }
      let bv = -Infinity, ba = -1, bb = -1, bt = -1;
      for (let a = 0; a < A.length; a++) { if (A[a] === -Infinity) continue; for (let b = 0; b < Bv.length; b++) { if (Bv[b] === -Infinity) continue; const t = ncLo0 + a + nmLo0 + b - Q.tLo; if (t < 0 || t >= Cv.length || Cv[t] === -Infinity) continue; const v = A[a] + Bv[b] + Cv[t]; if (v > bv) { bv = v; ba = a; bb = b; bt = t; } } }
      if (y && ba >= 0) { const E = Q.Aent[ba]; y[I_CR] = Q.gc[E.xs[Aa[ba]]]; y[I_CD] = Q.gd[Q.uArg[E.us[Aa[ba]]]]; y[I_MX] = Q.gm[Q.Bent[bb].xs[Ba[bb]]]; y[I_BS] = Q.gb[Q.Cent[bt].xs[Ca[bt]]]; }
      return phi + bv;
    };
    const free = () => { HD = null; };
    return { affInfo: () => XS.map((k, i) => [k, i === I_CR || i === I_MX ? (SAT[i].lin ? 'sat-line' : String(SAT[i].lin)) : (k === '고정공' || k === '물마퍼') ? (ATK ? 'plane' : String(ATK)) : AFF[i] === undefined ? 'unused' : AFF[i] ? 'line' : 'no']), callsBy: () => Array.from(realBy), value, real, slopes, conj, conjPrep, free, GR, Wv, bare, cap, curCool, cp0, L0, h, calls: () => calls, sk, inp };
  }
  // 고를 칸들(5셋·12부위·한벌·하의 악세). 고정했으면 지금 것만, 보유 필터를 켰으면 가진 것과 지금 낀 것만
  function xSlots(worn, o) {
    const fixed = o.fixed || {}, owned = o.owned || null;
    const ok = (part, d) => !owned || owned.has(d) || d === (worn[part] || '');
    const setIx = new Map(), six = (n) => { if (!n) return -1; let i = setIx.get(n); if (i === undefined) { i = setIx.size; setIx.set(n, i); } return i; };
    const slots = [];
    const add = (name, list) => slots.push({ name, opts: list.length ? list : [{ d: worn[name] || '', v: new Float64Array(XN), si: -1 }] });
    if (o.fiveFixed) add('아바타5셋', worn['아바타5셋'] ? [{ d: worn['아바타5셋'], v: xVec(fiveStats(worn['아바타5셋'])), si: -1 }] : []);
    else add('아바타5셋', db.fiveSetList.map(s => db.fiveSetDisplay.get(s)).filter(d => d && ok('아바타5셋', d)).map(d => ({ d, v: xVec(fiveStats(d)), si: -1 })));
    for (const pt of R.ALL_PARTS) {
      const list = fixed[pt] ? (worn[pt] ? [worn[pt]] : []) : [...(db.partCandidates.get(pt) || [])].filter(d => ok(pt, d));
      add(pt, list.map(d => ({ d, v: xVec(db.statsByDisplay.get(d)), si: six(db.displayToSet.get(d)) })));
    }
    slots.push({ name: '한벌', opts: (o.suits || ['']).map(n => ({ d: n, v: suitVec(n), si: -1 })) });
    slots.push({ name: '하의악세', opts: (o.bottoms || ['']).map(n => ({ d: n, v: bottomVec(n), si: -1 })) });
    // 세트 효과: 세트마다 필요한 개수별 효과(누적)
    const sets = [];
    for (const [name, i] of setIx) sets[i] = { name, effs: [] };
    for (const e of db.setEffects) { const i = setIx.get(e.set); if (i === undefined) continue; const st0 = db.statsByDisplay.get(e.display) || {}; let size = 0; for (const k in st0) size += Number(st0[k]) || 0; sets[i].effs.push({ need: e.need, v: xVec(st0), size }); }
    for (const s of sets) { s.effs.sort((a, b) => a.need - b.need); s.cum = []; const acc = new Float64Array(XN); let sz = 0, j = 0; for (let c = 0; c <= 13; c++) { while (j < s.effs.length && s.effs[j].need <= c) { for (let k = 0; k < XN; k++) acc[k] += s.effs[j].v[k]; sz += s.effs[j].size; j++; } s.cum.push({ v: Float64Array.from(acc), size: sz, any: j > 0 }); } }
    return { slots, sets };
  }
  const fiveStats = (disp) => { const o = {}; for (const [s, d] of db.fiveSetDisplay) if (d === disp) { const st0 = db.fiveSetStats.get(s) || {}; for (const k in st0) o[k] = (o[k] || 0) + st0[k]; } return o; };
  // 가지치기 탐색. opt.K: 모델 위쪽 K개 / opt.thr: 이 값 이상인 조합 모두(opt.max개까지). 같은 스탯 합이면 지금과 덜 바뀐 쪽 하나만
  const nzOfV = (v) => { const a = []; for (let k = 0; k < XN; k++) if (v[k]) a.push(k, v[k]); return a; };
  function xSearch(Mo, SL, worn, opt) {
    const { slots, sets } = SL, NSET = sets.length, NSL = slots.length;
    const T0 = performance.now(), C0 = Mo.calls(), TM = {};
    for (const s of slots) for (const o of s.opts) if (!o.nz) o.nz = nzOfV(o.v);
    for (const st of sets) for (const c of st.cum) if (!c.nz) c.nz = nzOfV(c.v);
    const cool = opt.cool || null; // { T, atLeast }
    // 부위 순서: 옵션 사이 차이가 큰 칸부터. 옵션은 혼자 넣었을 때 모델 값이 큰 것부터(좋은 후보를 빨리 찾아 가지치기를 세게)
    // 순서 정하기용 값: 마법석 다시 맞추기 없이 스탯 하나씩 더한 값의 합(빠름)
    const solo = (v) => { let t = 0; for (let i = 0; i < XN; i++) if (v[i]) t += i === I_CL ? Mo.h(I_CL, Math.min(Mo.bare + Mo.Wv[i] + v[i], Mo.cap) - Mo.curCool) : Mo.h(i, v[i]); return t; };
    const ord = slots.map(s => { const sc = s.opts.map(o => ({ o, s: solo(o.v) - solo(new Float64Array(XN)) })).sort((a, b) => b.s - a.s); return { name: s.name, opts: sc.map(x => x.o), spread: sc.length ? sc[0].s - sc[sc.length - 1].s : 0 }; }).sort(opt.order === 'size' ? ((a, b) => b.opts.length - a.opts.length || b.spread - a.spread) : opt.order === 'sizeAsc' ? ((a, b) => a.opts.length - b.opts.length || b.spread - a.spread) : ((a, b) => b.spread - a.spread));
    TM.ord = [Math.round(performance.now() - T0), Mo.calls() - C0];
    // 남은 칸 스탯별 최대·최소, 남은 칸에 세트 아이템이 있는 개수
    const remMax = [], remMin = [], avail = [];
    for (let dpt = 0; dpt <= NSL; dpt++) { const mx = new Float64Array(XN), mn = new Float64Array(XN), av = new Int32Array(NSET);
      for (let j = dpt; j < NSL; j++) { const os = ord[j].opts, seen = new Set(); for (let k = 0; k < XN; k++) { let a = -Infinity, b = Infinity; for (const o of os) { if (o.v[k] > a) a = o.v[k]; if (o.v[k] < b) b = o.v[k]; } mx[k] += a; mn[k] += b; } for (const o of os) if (o.si >= 0 && !seen.has(o.si)) { seen.add(o.si); av[o.si]++; } }
      remMax.push(mx); remMin.push(mn); avail.push(av); }
    const P = new Float64Array(XN), cnt = new Int32Array(NSET), xb = new Float64Array(XN), xl = new Float64Array(XN), pick = new Array(NSL);
    // 칸마다 스탯별 최솟값, 옵션마다 (값 − 최솟값)이 0이 아닌 스탯
    const slotMin = ord.map(s => { const m = new Float64Array(XN); for (let k = 0; k < XN; k++) m[k] = Math.min(...s.opts.map(o => o.v[k])); return m; });
    const nzOf = ord.map((s, j) => s.opts.map(o => { const a = []; for (let k = 0; k < XN; k++) { const dv = o.v[k] - slotMin[j][k]; if (dv) a.push(k, dv); } return a; }));
    const xlo = new Float64Array(XN), SV = new Float64Array(XN);
    const bound2 = (dpt, xbHi) => {
      const mn = remMin[dpt];
      for (let k = 0; k < XN; k++) xlo[k] = P[k] + mn[k];
      Mo.slopes(xlo, xbHi, SV);
      let add = 0;
      for (let j = dpt; j < NSL; j++) { let bst = 0; for (const a of nzOf[j]) { let s = 0; for (let q = 0; q < a.length; q += 2) s += SV[a[q]] * a[q + 1]; if (s > bst) bst = s; } add += bst; }
      // 세트 효과 몫: 켤 수 있는 세트마다 (기울기 · 효과) → 큰 것 3개(세트 효과는 3세트까지)
      const av = avail[dpt]; let s1 = 0, s2 = 0, s3 = 0;
      for (let q = 0; q < NSET; q++) { const c = Math.min(13, cnt[q] + av[q]), v = sets[q].cum[c].v; let w = 0; for (let k = 0; k < XN; k++) if (v[k]) w += SV[k] * v[k]; if (w > s3) { if (w > s1) { s3 = s2; s2 = s1; s1 = w; } else if (w > s2) { s3 = s2; s2 = w; } else s3 = w; } }
      add += s1 + s2 + s3;
      return Mo.value(xlo) + add;
    };
    const top = [], byKey = new Map(); let thr = opt.thr != null ? opt.thr : -Infinity, nodes = 0, leaves = 0, capped = false, bestV = -Infinity;
    // 라그랑주 가지치기: 가격 lam을 정해 두면 어떤 조합이든 모델 값 ≤ phi(lam, 상자) + lam·x.
    // lam·x의 위쪽: 칸마다 lam·v 최댓값(base) 합 + 세트마다 (그 세트 아이템을 r곳에 꼈을 때 base 대비 손해 + 세트 효과(c+r))의 최댓값(r을 다 따짐) 중 큰 3개
    // (세트 효과는 3세트까지. 두 세트가 같은 칸을 원하면 위쪽으로만 셈 → 가지치기는 안전)
    const lagInfo = {};
    const PRF = opt.prof ? { at: new Array(NSL + 1).fill(0), lag: new Array(NSL + 1).fill(0), cool: new Array(NSL + 1).fill(0), box: new Array(NSL + 1).fill(0), sl: new Array(NSL + 1).fill(0) } : null;
    const SLOTS_OF = sets.map(() => []);
    ord.forEach((s, j) => { const seen = new Set(); for (const o of s.opts) if (o.si >= 0 && !seen.has(o.si)) { seen.add(o.si); SLOTS_OF[o.si].push(j); } });
    const mkCtx = (L) => {
      const lw = ord.map(s => new Float64Array(s.opts.length)), linRem = new Float64Array(NSL + 1), baseO = new Array(NSL), baseW = new Float64Array(NSL), bsl = ord.map(() => new Map());
      for (let j = NSL - 1; j >= 0; j--) { const os = ord[j].opts, W = lw[j]; let bi = 0;
        for (let t = 0; t < os.length; t++) { const nz = os[t].nz; let w = 0; for (let i = 0; i < nz.length; i += 2) w += L[nz[i]] * nz[i + 1]; W[t] = w; if (w > W[bi]) bi = t; const si = os[t].si; if (si >= 0) { const e = bsl[j].get(si); if (e === undefined || w > W[e]) bsl[j].set(si, t); } }
        baseO[j] = os[bi]; baseW[j] = W[bi]; linRem[j] = linRem[j + 1] + W[bi]; }
      const setLin = sets.map(st => { const B = new Float64Array(14); for (let i = 0; i < st.cum.length; i++) { const nz = st.cum[i].nz; let w = 0; for (let t = 0; t < nz.length; t += 2) w += L[nz[t]] * nz[t + 1]; B[i] = w; } return B; });
      const sOrd = sets.map((st, q) => SLOTS_OF[q].map(j => { const t = bsl[j].get(q); return { j, o: ord[j].opts[t], d: lw[j][t] - baseW[j] }; }).sort((x, y) => y.d - x.d));
      const C = { lam: Float64Array.from(L), lw, linRem, baseO, setLin, sOrd, phi: Infinity, F: null };
      // 쿨감을 딱 맞춰야 할 때: 칸마다 '쿨감 값별' 최대 lam·v → 남은 칸 쿨감 합이 s일 때의 최대(F[j][s], 고른 것 FA). 세트 몫(d)도 같은 쿨감 값 안에서 잼
      if (coolMode && (coolR || coolMode === 'ge')) {
        // eq: 쿨감 합이 딱 s, ge: 합을 needI에서 잘라 s(= needI면 'needI 이상')
        const NI = needI + 1, F = [], FA = [], FP = [], bc = [], ge = coolMode === 'ge';
        F[NSL] = new Float64Array(NI).fill(-Infinity); F[NSL][0] = 0; FA[NSL] = null;
        for (let j = NSL - 1; j >= 0; j--) {
          const os = ord[j].opts, W = lw[j], m = new Map(); for (let t = 0; t < os.length; t++) { const c = Math.round(os[t].v[I_CL]); const e = m.get(c); if (e === undefined || W[t] > W[e]) m.set(c, t); }
          bc[j] = m; const Fj = new Float64Array(NI).fill(-Infinity), Aj = new Int32Array(NI).fill(-1), Pj = new Int32Array(NI).fill(-1), N = F[j + 1];
          for (const [c, t] of m) for (let a = 0; a < NI; a++) { if (N[a] === -Infinity) continue; let s2 = a + c; if (ge) s2 = Math.min(s2, needI); if (s2 < 0 || s2 >= NI) continue; const v = N[a] + W[t]; if (v > Fj[s2]) { Fj[s2] = v; Aj[s2] = t; Pj[s2] = a; } }
          F[j] = Fj; FA[j] = Aj; FP[j] = Pj;
        }
        C.F = F; C.FA = FA; C.FP = FP;
        if (ge) { C.FS = F.map(Fj => { const S = new Float64Array(NI), A = new Int32Array(NI); let bv = -Infinity, bs = -1; for (let s2 = NI - 1; s2 >= 0; s2--) { if (Fj[s2] > bv) { bv = Fj[s2]; bs = s2; } S[s2] = bv; A[s2] = bs; } return { S, A }; }); }
        C.sOrd = sets.map((st, q) => SLOTS_OF[q].map(j => { const t = bsl[j].get(q), o = ord[j].opts[t], c = Math.round(o.v[I_CL]); return { j, o, d: lw[j][t] - lw[j][bc[j].get(c)] }; }).sort((x, y) => y.d - x.d));
      }
      return C;
    };
    // 쿨감 딱 맞추기: 이 마디에서 세트 효과로 더할 수 있는 쿨감 합들(rest까지). 남은 칸 수는 avail[dpt] 기준(자식에도 쓸 수 있게 넉넉히)
    const setCoolSums = (dpt, rest) => {
      let S = new Uint8Array(rest + 1); S[0] = 1; const av = avail[dpt];
      for (const q of coolSets) { const vals = []; for (let c = cnt[q]; c <= Math.min(13, cnt[q] + av[q]); c++) { const v = Math.round(sets[q].cum[c].v[I_CL]); if (v > 0) vals.push(v); }
        if (!vals.length) continue; const N = S.slice(); for (let a = 0; a <= rest; a++) if (S[a]) for (const v of vals) if (a + v <= rest) N[a + v] = 1; S = N; }
      return S;
    };
    // 남은 칸 몫: 쿨감 조건이 없으면 칸마다 최댓값 합, 딱 맞추기면 '남은 칸 쿨감 합 = 필요한 값 − 세트 효과 쿨감' 중 최댓값(그때 세트 효과 쿨감 tStar)
    let tStar = 0;
    const remLin = (C, dpt) => {
      if (!C.F) return C.linRem[dpt];
      const rest = needI - Math.round(P[I_CL]); if (rest < 0) return -Infinity;
      const S = setCoolSums(dpt, rest), Fd = C.F[dpt]; let bv = -Infinity; tStar = 0;
      for (let t = 0; t <= rest; t++) if (S[t] && Fd[rest - t] > bv) { bv = Fd[rest - t]; tStar = t; }
      return bv;
    };
    // 쿨감 딱 맞추기: 세트 효과 쿨감이 어떻게 나뉘는지(어느 쿨감 세트를 몇 단계로 켜는지)를 모두 따져서,
    // 켜야 하는 세트는 그 단계로 꼭 넣고(손해가 나도), 나머지 칸은 '쿨감 합이 딱 남은 값'인 조합 중 최대로 → 위쪽 값이 훨씬 빡빡해짐
    const GX = new Float64Array(64), RX = new Int32Array(64);
    // 쿨감 세트 q의 단계(쿨감 값)별 최댓값: 지금 c개에서 r개 더 낄 때
    const coolLv = (C, q, c, dpt) => { const B = C.setLin[q], m = new Map(), av = avail[dpt][q]; let acc = 0, r = 0;
      const put = (rr) => { const cc = Math.min(13, c + rr), b = Math.round(sets[q].cum[cc].v[I_CL]), v = B[cc] + acc, e = m.get(b); if (!e || v > e.v) m.set(b, { v, r: rr }); };
      put(0); for (const e of C.sOrd[q]) { if (e.j < dpt) continue; if (r >= av) break; r++; acc += e.d; put(r); }
      return [...m.entries()]; };
    // 마디 준비: 모든 세트의 G(위 linSet과 같은 식), 큰 순서, 쿨감 세트 단계표
    const exPrep = (C, dpt) => {
      for (let q = 0; q < NSET; q++) {
        const c = cnt[q], B = C.setLin[q]; let G = B[c > 13 ? 13 : c], acc = 0, r = 0, br = 0;
        for (const e of C.sOrd[q]) { if (e.j < dpt) continue; r++; acc += e.d; const cc = c + r, v = B[cc > 13 ? 13 : cc] + acc; if (v > G) { G = v; br = r; } }
        GX[q] = G; RX[q] = br;
      }
      const top = []; for (let q = 0; q < NSET; q++) if (GX[q] > 0) top.push(q); top.sort((a, b) => GX[b] - GX[a]);
      return { top, lv: coolSets.map(q => coolLv(C, q, cnt[q], dpt)) };
    };
    // 세트 효과 쿨감을 나누는 모든 경우 중 최대. qx는 자식이 하나 늘린 세트(그 세트만 G·단계를 바꿔 끼움)
    const exEval = (C, dpt, rest, X, qx, Gqx, lvqx, want) => {
      let best = -Infinity, bestF = null, bestT = 0; const forced = [];
      const walk = (i, sumT) => {
        const ge = coolMode === 'ge';
        if (!ge && sumT > rest) return;
        if (i === coolSets.length) {
          const Fv = ge ? C.FS[dpt].S[Math.max(0, rest - sumT)] : C.F[dpt][rest - sumT]; if (Fv === -Infinity || forced.length > 3) return;
          let v = Fv, k = 3 - forced.length; for (const f of forced) v += f.v;
          const isF = (q) => { for (const f of forced) if (f.q === q) return true; return false; };
          let qxDone = qx < 0 || isF(qx) || !(Gqx > 0);
          for (let a = 0; a < X.top.length && k > 0; a++) { const q = X.top[a]; if (q === qx || isF(q)) continue;
            if (!qxDone && Gqx >= GX[q]) { v += Gqx; k--; qxDone = true; if (k === 0) break; }
            v += GX[q]; k--; }
          if (k > 0 && !qxDone) v += Gqx;
          if (v > best) { best = v; bestF = forced.slice(); bestT = sumT; }
          return;
        }
        const q = coolSets[i], L = q === qx && lvqx ? lvqx : X.lv[i];
        for (const [b, e] of L) { if (b > 0) forced.push({ q, v: e.v, r: e.r }); walk(i + 1, sumT + b); if (b > 0) forced.pop(); }
      };
      walk(0, 0);
      if (want) { want.F = bestF; want.T = bestT; }
      return best;
    };
    const exactLin = (C, dpt, xh) => {
      let rest = needI - Math.round(P[I_CL]); if (rest < 0) { if (coolMode === 'ge') rest = 0; else return -Infinity; }
      const X = exPrep(C, dpt), W = xh ? {} : null, best = exEval(C, dpt, rest, X, -1, 0, null, W);
      if (xh && best > -Infinity) { xh.fill(0);
        let sCur = coolMode === 'ge' ? C.FS[dpt].A[Math.max(0, rest - W.T)] : rest - W.T;
        for (let j = dpt; j < NSL; j++) { const t = sCur >= 0 ? C.FA[j][sCur] : -1, o = ord[j].opts[t >= 0 ? t : 0]; LPICK[j] = o; for (let k = 0; k < XN; k++) xh[k] += o.v[k]; sCur = sCur >= 0 ? C.FP[j][sCur] : -1; }
        const picks = W.F.map(f => [f.q, f.r]); let k = 3 - picks.length; for (let a = 0; a < X.top.length && k > 0; a++) { const q = X.top[a]; if (W.F.some(f => f.q === q)) continue; picks.push([q, RX[q]]); k--; }
        for (const [q, r] of picks) { let n = 0;
          for (const e of C.sOrd[q]) { if (e.j < dpt) continue; if (n++ >= r) break; const a = e.o.v, b0 = LPICK[e.j].v; for (let k2 = 0; k2 < XN; k2++) xh[k2] += a[k2] - b0[k2]; LPICK[e.j] = e.o; }
          const v = sets[q].cum[Math.min(13, cnt[q] + r)].v; for (let k2 = 0; k2 < XN; k2++) xh[k2] += v[k2]; }
      }
      return best;
    };
    const linSet = (C, dpt, xh) => {
      if (C.F) return exactLin(C, dpt, xh);
      let s1 = 0, s2 = 0, s3 = 0, q1 = -1, q2 = -1, q3 = -1, r1 = 0, r2 = 0, r3 = 0;
      for (let q = 0; q < NSET; q++) {
        const c = cnt[q], B = C.setLin[q]; let G = B[c > 13 ? 13 : c], acc = 0, r = 0, br = 0;
        for (const e of C.sOrd[q]) { if (e.j < dpt) continue; r++; acc += e.d; const cc = c + r; const v = B[cc > 13 ? 13 : cc] + acc; if (v > G) { G = v; br = r; } }
        if (G > s3) { if (G > s1) { s3 = s2; q3 = q2; r3 = r2; s2 = s1; q2 = q1; r2 = r1; s1 = G; q1 = q; r1 = br; } else if (G > s2) { s3 = s2; q3 = q2; r3 = r2; s2 = G; q2 = q; r2 = br; } else { s3 = G; q3 = q; r3 = br; } }
      }
      const RL = remLin(C, dpt);
      if (xh) { xh.fill(0);
        if (C.F && RL > -Infinity) { let sCur = needI - Math.round(P[I_CL]) - tStar; for (let j = dpt; j < NSL; j++) { const t = C.FA[j][sCur], o = ord[j].opts[t]; LPICK[j] = o; for (let k = 0; k < XN; k++) xh[k] += o.v[k]; sCur -= Math.round(o.v[I_CL]); } }
        else for (let j = dpt; j < NSL; j++) { const v = C.baseO[j].v; for (let k = 0; k < XN; k++) xh[k] += v[k]; LPICK[j] = C.baseO[j]; }
        for (const [q, r] of [[q1, r1], [q2, r2], [q3, r3]]) { if (q < 0) continue; let n = 0;
          for (const e of C.sOrd[q]) { if (e.j < dpt) continue; if (n++ >= r) break; const a = e.o.v, b0 = LPICK[e.j].v; for (let k = 0; k < XN; k++) xh[k] += a[k] - b0[k]; LPICK[e.j] = e.o; }
          const v = sets[q].cum[Math.min(13, cnt[q] + r)].v; for (let k = 0; k < XN; k++) xh[k] += v[k]; }
      }
      return RL + Math.max(0, s1) + Math.max(0, s2) + Math.max(0, s3);
    };
    const LPICK = new Array(NSL);
    // 가격으로 고른 조합(남은 칸은 LPICK)을 실제로 모델에 넣어 봄 → 좋은 후보를 일찍 찾아 기준을 올림(지금 마디 상태는 되돌려 놓음)
    const tryPick = (dpt) => {
      for (let j = dpt; j < NSL; j++) if (!LPICK[j]) return;
      const P0 = Float64Array.from(P), c0 = Int32Array.from(cnt), p0 = pick.slice();
      for (let j = dpt; j < NSL; j++) { const o = LPICK[j]; for (let k = 0; k < XN; k++) P[k] += o.v[k]; if (o.si >= 0) cnt[o.si]++; pick[j] = o.d; }
      leaf();
      P.set(P0); cnt.set(c0); for (let j = 0; j < NSL; j++) pick[j] = p0[j];
    };
    const dotP = (L) => { let t = 0; for (let k = 0; k < XN; k++) t += L[k] * P[k]; return t; };
    // 깊이 dpt 마디(지금 고른 것 P, 세트 개수 cnt)에서 U(lam) = phi(lam, 상자) + lam·P + lam·(남은 칸) 위쪽을 줄이는 가격 찾기(Polyak + 막히면 걸음 절반)
    const tuneLam = (dpt, lam0, Bx, IT, ST, mu0) => {
      const lam = Float64Array.from(lam0), y = new Float64Array(XN), xh = new Float64Array(XN), g = new Float64Array(XN);
      let best = null, mu = mu0, stall = 0, its = 0;
      for (let it = 0; it < IT; it++) {
        its++;
        const C = mkCtx(lam), phi = Mo.conj(lam, Bx, y), U = phi + dotP(lam) + linSet(C, dpt, xh);
        if (opt.lagPick !== false && U > -Infinity) tryPick(dpt);
        if (!best || U < best.U - 1e-7) { best = { U, C, phi }; stall = 0; } else if (++stall >= ST) { mu /= 2; stall = 0; lam.set(best.C.lam); if (mu < 1e-3) break; continue; }
        const tg = thr > -Infinity ? thr : TGT;
        if (U - tg < 1e-7) break;
        let gg = 0; for (let k = 0; k < XN; k++) { g[k] = P[k] + xh[k] - y[k]; gg += g[k] * g[k]; }
        if (gg < 1e-12) break;
        const eta = mu * (U - tg) / gg;
        for (let k = 0; k < XN; k++) { const v = lam[k] - eta * g[k]; lam[k] = (k === I_CL && cool) ? v : Math.max(0, v); }
      }
      best.C.phi = best.phi; best.its = its; return best;
    };
    let TGT = 0;
    const ctxS = new Array(NSL + 1).fill(null), LoN = new Float64Array(XN); let phiCalls = 0, tuneCalls = 0;
    const boxAt = (dpt) => { const mn = remMin[dpt]; for (let k = 0; k < XN; k++) LoN[k] = P[k] + mn[k]; const Hi = Float64Array.from(bound(dpt)); clampBox(LoN, Hi); return Mo.conjPrep(LoN, Hi); };
    const lagOk = (dpt, pre) => {
      let C = ctxS[dpt - 1];
      if (!pre && !(C.phi + dotP(C.lam) + linSet(C, dpt) > thr - 1e-12)) return false;
      if (dpt <= (opt.lagD ?? 3)) {
        const Bx = boxAt(dpt);
        if (dpt <= (opt.lagR ?? 0)) { tuneCalls++; const T = tuneLam(dpt, C.lam, Bx, opt.lagRIt ?? 40, opt.lagStall ?? 6, opt.lagMu ?? 2); if (T.U < C.phi + dotP(C.lam) + linSet(C, dpt)) C = T.C; else { const phi = Mo.conj(C.lam, Bx, null); C = Object.assign({}, C, { phi: Math.min(C.phi, phi) }); } }
        else { phiCalls++; const phi = Mo.conj(C.lam, Bx, null); if (phi < C.phi) C = Object.assign({}, C, { phi }); }
        ctxS[dpt] = C;
        return C.phi + dotP(C.lam) + linSet(C, dpt) > thr - 1e-12;
      }
      ctxS[dpt] = C;
      return true; };
    const lagSetup = (x0) => {
      const c0 = Mo.calls(), Lo = Float64Array.from(remMin[0]), Hi = Float64Array.from(bound(0)); clampBox(Lo, Hi); const Bx = Mo.conjPrep(Lo, Hi); lagInfo.prepCalls = Mo.calls() - c0; lagInfo.callsBefore = c0;
      const lam = new Float64Array(XN), GR = Mo.GR, tmp = new Float64Array(XN);
      for (let k = 0; k < XN; k++) { if (Hi[k] - Lo[k] < 1e-9) continue; const st = GR[k];
        tmp.set(x0); tmp[k] = Math.min(Hi[k], x0[k] + st); const up = Mo.value(tmp); tmp[k] = Math.max(Lo[k], x0[k] - st); const dn = Mo.value(tmp); tmp[k] = x0[k];
        const a = Math.min(Hi[k], x0[k] + st) - Math.max(Lo[k], x0[k] - st); lam[k] = a > 0 ? Math.max(0, (up - dn) / a) : 0; }
      cnt.fill(0); P.fill(0);
      const T = tuneLam(0, lam, Bx, opt.lagIt ?? 300, opt.lagStall ?? 6, opt.lagMu ?? 2);
      lagInfo.U = T.U; lagInfo.its = T.its; lagInfo.thr = thr;
      return T.C;
    };
    const T1 = new Float64Array(XN), T2 = new Float64Array(XN), T3 = new Float64Array(XN);
    const bound = (dpt) => {
      const mx = remMax[dpt], av = avail[dpt];
      // 세트 효과 최대치: 스탯마다 켤 수 있는 세트 효과 중 큰 것 3개(세트 효과는 3세트까지). 세트 효과는 스탯 몇 개뿐이라 0 아닌 것만 봄
      T1.fill(0); T2.fill(0); T3.fill(0);
      for (let q = 0; q < NSET; q++) { const c = cnt[q] + av[q], nz = sets[q].cum[c > 13 ? 13 : c].nz;
        for (let t = 0; t < nz.length; t += 2) { const k = nz[t], v = nz[t + 1]; if (v > T3[k]) { if (v > T1[k]) { T3[k] = T2[k]; T2[k] = T1[k]; T1[k] = v; } else if (v > T2[k]) { T3[k] = T2[k]; T2[k] = v; } else T3[k] = v; } } }
      for (let k = 0; k < XN; k++) xb[k] = P[k] + mx[k] + T1[k] + T2[k] + T3[k];
      return xb;
    };
    // 쿨감 조건이 있으면 라그랑주 상한의 상자를 '조건을 채우는 쿨감'으로 좁힘(쿨감 가격은 음수도 됨 → 조건을 상한 안에 넣는 셈)
    const coolLoX = cool ? cool.T - Mo.bare - 1e-6 : -Infinity, coolHiX = cool && !cool.atLeast && cool.T < Mo.cap - 1e-9 ? cool.T - Mo.bare + 1e-6 : Infinity;
    const clampBox = (Lo, Hi) => { if (!cool) return; Lo[I_CL] = Math.max(Lo[I_CL], coolLoX); Hi[I_CL] = Math.min(Hi[I_CL], coolHiX); if (Hi[I_CL] < Lo[I_CL]) Hi[I_CL] = Lo[I_CL]; };
    // 쿨감을 '딱' 맞춰야 할 때: 남은 칸 아이템 쿨감으로 만들 수 있는 합(표) + 쿨감 세트 효과로 만들 수 있는 합으로 목표에 닿는지 정확히 봄
    // (범위만 보면 5%·3%가 섞여서 못 맞추는 갈래를 끝까지 내려가 버림)
    // 'eq': 딱 맞추기, 'ge': 이상(상한까지 딱 맞추기도 '상한 이상'이라 여기에). needI = 아바타로 채워야 하는 쿨감(아이템·세트 효과 합)
    const eqWant = cool && !cool.atLeast && cool.T < Mo.cap - 1e-9;
    const needF = cool ? (eqWant ? cool.T : Math.min(cool.T, Mo.cap)) - Mo.bare : null;
    const needI = needF == null ? null : eqWant ? Math.round(needF) : Math.ceil(needF - 1e-6);
    const exactCool = eqWant && Math.abs(needF - needI) < 1e-6 && needI >= 0 && needI <= 200;
    const coolMode = exactCool ? 'eq' : (cool && !eqWant && needI >= 1 && needI <= 200) ? 'ge' : null;
    let coolR = null, coolSets = null;
    if (coolMode) { coolSets = []; sets.forEach((st, q) => { if (st.cum.some(c => c.v[I_CL])) coolSets.push(q); }); }
    if (exactCool) {
      coolR = new Array(NSL + 1); coolR[NSL] = new Uint8Array(needI + 1); coolR[NSL][0] = 1;
      for (let j = NSL - 1; j >= 0; j--) { const R = new Uint8Array(needI + 1), N = coolR[j + 1]; for (const o of ord[j].opts) { const c = Math.round(o.v[I_CL]); if (Math.abs(o.v[I_CL] - c) > 1e-9) { coolR = null; break; } for (let a = 0; a + c <= needI; a++) if (N[a] && a + c >= 0) R[a + c] = 1; } if (!coolR) break; coolR[j] = R; }
      coolSets = []; sets.forEach((st, q) => { if (st.cum.some(c => c.v[I_CL])) coolSets.push(q); });
    }
    const coolExactOk = (dpt) => {
      if (!coolR) return true;
      let rest = needI - Math.round(P[I_CL]); if (rest < 0) return false;
      let S = new Uint8Array(rest + 1); S[0] = 1; const av = avail[dpt];
      for (const q of coolSets) { const vals = []; for (let c = cnt[q]; c <= Math.min(13, cnt[q] + av[q]); c++) { const v = Math.round(sets[q].cum[c].v[I_CL]); if (v > 0) vals.push(v); }
        if (!vals.length) continue; const N = S.slice(); for (let a = 0; a <= rest; a++) if (S[a]) for (const v of vals) if (a + v <= rest) N[a + v] = 1; S = N; }
      const R = coolR[dpt]; for (let a = 0; a <= rest; a++) if (S[a] && R[rest - a]) return true;
      return false;
    };
    const coolOk = (lo, hi) => { if (!cool) return true; const T = cool.T, cLo = Math.min(Mo.bare + lo, Mo.cap), cHi = Math.min(Mo.bare + hi, Mo.cap); return cool.atLeast ? cHi >= T - 1e-9 : (cHi >= T - 1e-9 && cLo <= T + 1e-9); };
    const leaf = () => {
      leaves++;
      for (let k = 0; k < XN; k++) xl[k] = P[k];
      // 세트 효과(3세트까지: 3부위 이상 낀 세트 먼저, 그다음 효과가 큰 순)
      const act = [];
      for (let s = 0; s < NSET; s++) if (cnt[s] > 0 && sets[s].cum[Math.min(13, cnt[s])].any) act.push(s);
      if (act.length > 1) act.sort((a, b) => Math.min(cnt[b], 3) - Math.min(cnt[a], 3) || sets[b].cum[Math.min(13, cnt[b])].size - sets[a].cum[Math.min(13, cnt[a])].size);
      for (let a = 0; a < Math.min(3, act.length); a++) { const v = sets[act[a]].cum[Math.min(13, cnt[act[a]])].v; for (let k = 0; k < XN; k++) xl[k] += v[k]; }
      const c = Math.min(Mo.bare + xl[I_CL], Mo.cap);
      if (cool && (cool.atLeast ? c < cool.T - 1e-9 : Math.abs(c - cool.T) > 1e-9)) return;
      const v = Mo.value(xl); if (!(v > thr - 1e-12)) return;
      let key = ''; for (let k = 0; k < XN; k++) key += Math.round(xl[k] * 100) + ',';
      let ch = 0; for (let j = 0; j < NSL; j++) { const nm = ord[j].name, cur = nm === '한벌' ? (worn['한벌'] || '') : nm === '하의악세' ? (opt.bNow || '') : (worn[nm] || ''); if (pick[j] !== cur) ch++; }
      const ex = byKey.get(key);
      if (ex) { if (ch < ex.ch) { ex.ch = ch; ex.pick = pick.slice(); } return; }
      const e = { v, x: Float64Array.from(xl), pick: pick.slice(), ch, key };
      byKey.set(key, e); top.push(e);
      if (opt.K) {
        top.sort((a, b) => b.v - a.v);
        while (top.length > opt.K) byKey.delete(top.pop().key);
        if (top.length === opt.K) thr = Math.max(thr, top[top.length - 1].v);
      } else if (opt.margin != null) {
        // 1등 모델 값에서 margin 안쪽은 모두 모음(실제 실투력으로 다시 잴 후보)
        if (v > bestV) { bestV = v; thr = Math.max(thr, bestV - opt.margin); }
        if (top.length > (opt.max || 200) * 2) { top.sort((a, b) => b.v - a.v); while (top.length && top[top.length - 1].v < thr) byKey.delete(top.pop().key); if (top.length > (opt.max || 200)) { while (top.length > (opt.max || 200)) byKey.delete(top.pop().key); capped = true; thr = Math.max(thr, top[top.length - 1].v); } }
      } else if (opt.max && top.length > opt.max * 4) { top.sort((a, b) => b.v - a.v); while (top.length > opt.max) byKey.delete(top.pop().key); capped = true; thr = Math.max(thr, top[top.length - 1].v); }
    };
    // 자식 마디의 라그랑주 위쪽 값을 부모에서 한꺼번에: 세트마다 G를 한 번 구하고, 아이템이 속한 세트만 하나 늘린 G로 바꿔 끼움
    const gq = (C, q, c, d1) => { const B = C.setLin[q]; let G = B[c > 13 ? 13 : c], acc = 0, r = 0; for (const e of C.sOrd[q]) { if (e.j < d1) continue; r++; acc += e.d; const cc = c + r, v = B[cc > 13 ? 13 : cc] + acc; if (v > G) G = v; } return G; };
    const chB = ord.map(s => new Float64Array(s.opts.length)), tv = new Float64Array(4), ti = new Int32Array(4);
    const childBounds = (dpt) => {
      const C = ctxS[dpt], d1 = dpt + 1, out = chB[dpt];
      if (C.F) { // 쿨감 딱 맞추기: 마디에서 한 번 준비하고, 자식마다 그 아이템의 쿨감·세트만 바꿔 끼워 잼
        const os = ord[dpt].opts, W = C.lw[dpt], base = C.phi + dotP(C.lam), rest0 = needI - Math.round(P[I_CL]), X = exPrep(C, d1), ge = coolMode === 'ge';
        const ci = new Map(coolSets.map((q, i) => [q, i]));
        for (let t = 0; t < os.length; t++) { const o = os[t]; let r = rest0 - Math.round(o.v[I_CL]); if (r < 0) { if (ge) r = 0; else { out[t] = -Infinity; continue; } }
          const q = o.si; let Gq = 0, lvq = null;
          if (q >= 0) { Gq = gq(C, q, cnt[q] + 1, d1); if (ci.has(q)) lvq = coolLv(C, q, cnt[q] + 1, d1); }
          const v = exEval(C, d1, r, X, q, Gq, lvq, null); out[t] = v === -Infinity ? -Infinity : base + W[t] + v; }
        return out;
      }
      tv.fill(-Infinity); ti.fill(-1);
      for (let q = 0; q < NSET; q++) { const G = gq(C, q, cnt[q], d1); if (G > tv[3]) { let p = 3; while (p > 0 && G > tv[p - 1]) { tv[p] = tv[p - 1]; ti[p] = ti[p - 1]; p--; } tv[p] = G; ti[p] = q; } }
      const pos = (x) => x > 0 ? x : 0, top3 = pos(tv[0]) + pos(tv[1]) + pos(tv[2]);
      const os = ord[dpt].opts, W = C.lw[dpt];
      let base = C.phi + dotP(C.lam) + (C.F ? 0 : C.linRem[d1]), Sc = null, rest0 = 0;
      if (C.F) { rest0 = needI - Math.round(P[I_CL]); Sc = rest0 >= 0 ? setCoolSums(dpt, rest0) : null; }
      for (let t = 0; t < os.length; t++) { const q = os[t].si; let S3 = top3, RB = 0;
        if (C.F) { // 이 아이템을 고른 뒤 남은 칸으로 쿨감을 딱 맞출 때의 최댓값
          const r = rest0 - Math.round(os[t].v[I_CL]); let bv = -Infinity; if (Sc && r >= 0) { const Fd = C.F[d1]; for (let a = 0; a <= r; a++) if (Sc[a] && Fd[r - a] > bv) bv = Fd[r - a]; }
          if (bv === -Infinity) { out[t] = -Infinity; continue; }
          RB = bv; }
        if (q >= 0) { const G1 = gq(C, q, cnt[q] + 1, d1);
          if (q === ti[0] || q === ti[1] || q === ti[2]) { // q가 위 3개 안: 그 자리를 G1로 바꾼 4개 중 큰 3개
            let a = -Infinity, b = -Infinity, c = -Infinity; for (let p = 0; p < 4; p++) { const v = ti[p] === q ? G1 : tv[p]; if (v > a) { c = b; b = a; a = v; } else if (v > b) { c = b; b = v; } else if (v > c) c = v; }
            S3 = pos(a) + pos(b) + pos(c);
          } else if (G1 > tv[2]) S3 = top3 - pos(tv[2]) + pos(G1); }
        out[t] = base + W[t] + RB + S3; }
      return out; };
    const OI = ord.map(s => new Int32Array(s.opts.length));
    const rec = (dpt, pre) => {
      nodes++;
      if (opt.maxNodes && nodes > opt.maxNodes) { capped = true; return; }
      if (dpt === NSL) { leaf(); return; }
      if (dpt > 0) {
        if (PRF) PRF.at[dpt]++;
        if (ctxS[0] && !lagOk(dpt, pre)) { if (PRF) PRF.lag[dpt]++; return; }
        const b = bound(dpt);
        if (!coolOk(P[I_CL] + remMin[dpt][I_CL], b[I_CL]) || !coolExactOk(dpt)) { if (PRF) PRF.cool[dpt]++; return; }
        if (!(Mo.value(b) > thr - 1e-12)) { if (PRF) PRF.box[dpt]++; return; }
        if (opt.tight !== false && thr > -Infinity && !(bound2(dpt, Float64Array.from(b)) > thr - 1e-12)) { if (PRF) PRF.sl[dpt]++; return; }
      }
      const os = ord[dpt].opts, cb = ctxS[dpt] && dpt + 1 < NSL ? childBounds(dpt) : null, oi = OI[dpt];
      // 위쪽 값이 큰 자식부터(좋은 조합을 일찍 찾아 기준을 빨리 올림)
      for (let t = 0; t < os.length; t++) { oi[t] = t; if (cb && opt.sortKids) { let p = t; while (p > 0 && cb[oi[p - 1]] < cb[t]) { oi[p] = oi[p - 1]; p--; } oi[p] = t; } }
      for (let u = 0; u < os.length; u++) {
        const t = oi[u];
        if (cb && !(cb[t] > thr - 1e-12)) { if (!opt.sortKids) continue; if (PRF) { PRF.at[dpt + 1] += os.length - u; PRF.lag[dpt + 1] += os.length - u; } break; }
        const o = os[t];
        for (let k = 0; k < XN; k++) P[k] += o.v[k];
        if (o.si >= 0) cnt[o.si]++;
        pick[dpt] = o.d;
        rec(dpt + 1, !!cb);
        if (o.si >= 0) cnt[o.si]--;
        for (let k = 0; k < XN; k++) P[k] -= o.v[k];
      }
    };
    // 먼저 넣어 둘 후보(빠른 오르막 탐색 결과): 가지치기 기준을 처음부터 높게
    const runBench = () => { const Lo = Float64Array.from(remMin[0]), Hi = Float64Array.from(bound(0)); let t = performance.now(); const Bx = Mo.conjPrep(Lo, Hi); const tp = performance.now() - t; const lam = new Float64Array(XN).fill(0.003), y = new Float64Array(XN), xh = new Float64Array(XN);
      t = performance.now(); for (let i = 0; i < 1000; i++) Mo.conj(lam, Bx, y); const tc = performance.now() - t; t = performance.now(); let C; for (let i = 0; i < 1000; i++) C = mkCtx(lam); const tm = performance.now() - t;
      t = performance.now(); for (let i = 0; i < 1000; i++) linSet(C, 0, xh); const tl = performance.now() - t; t = performance.now(); for (let i = 0; i < 1000; i++) linSet(C, 5); const tl2 = performance.now() - t;
      t = performance.now(); for (let i = 0; i < 1000; i++) Mo.value(Hi); const tv = performance.now() - t; t = performance.now(); for (let i = 0; i < 1000; i++) bound(5); const tb = performance.now() - t;
      lagInfo.bench = { prep: tp, conjUs: tc, ctxUs: tm, linSetUs: tl, linSet5Us: tl2, valueUs: tv, boundUs: tb, sizes: Bx.singles.map(x => x.gx.length).concat(Bx.pairs.map(x => x.ga.length + 'x' + x.gb.length), [Bx.r4.uH.length, Bx.r4.gd.length, Bx.r4.Aent.length]) }; };
    if (opt.bench) runBench();
    // 출발점(지금 세팅 등)을 먼저 넣어 둠. 가격의 첫값은 그중 모델 값이 가장 높은 점의 기울기로(조건에 안 맞아도 점으로는 씀)
    let x0 = null, x0v = -Infinity;
    for (const S0 of (opt.seeds || [])) {
      for (let k = 0; k < XN; k++) P[k] = 0; cnt.fill(0);
      for (let j = 0; j < NSL; j++) { const o = ord[j].opts.find(x => x.d === (S0[ord[j].name] ?? '')) || ord[j].opts[0]; for (let k = 0; k < XN; k++) P[k] += o.v[k]; if (o.si >= 0) cnt[o.si]++; pick[j] = o.d; }
      leaf();
      const xs = Float64Array.from(xl), vs = Mo.value(xs); if (vs > x0v) { x0v = vs; x0 = xs; }
    }
    for (let k = 0; k < XN; k++) P[k] = 0; cnt.fill(0);
    TM.seeds = [Math.round(performance.now() - T0), Mo.calls() - C0];
    if (opt.lag !== false && x0) { const t0 = performance.now(); TGT = thr > -Infinity ? thr : x0v - 0.05; ctxS[0] = lagSetup(x0); lagInfo.ms = Math.round(performance.now() - t0); }
    TM.lag = [Math.round(performance.now() - T0), Mo.calls() - C0];
    rec(0);
    TM.tree = [Math.round(performance.now() - T0), Mo.calls() - C0];
    top.sort((a, b) => b.v - a.v || a.ch - b.ch);
    const out = (opt.max ? top.slice(0, opt.max) : top).map(e => { const S = {}; ord.forEach((s, j) => { S[s.name] = e.pick[j]; }); return { S, v: e.v, x: e.x, ch: e.ch, key: e.key }; });
    return { list: out, nodes, leaves, capped: capped || (opt.max && top.length > opt.max), lag: Object.assign({}, lagInfo, { phiCalls, tuneCalls }), tm: TM, prof: PRF, order: ord.map(s => s.name + ':' + s.opts.length).join(' ') };
  }
  function xClimb(Mo, SL, worn, starts, cool) {
    const { slots, sets } = SL, NSET = sets.length;
    const optOf = {}; for (const s of slots) { optOf[s.name] = new Map(s.opts.map(o => [o.d, o])); }
    const names = slots.map(s => s.name), x = new Float64Array(XN), cnt = new Int32Array(NSET);
    const val = (S) => {
      x.fill(0); cnt.fill(0);
      for (const n of names) { const o = optOf[n].get(S[n] ?? ''); if (!o) return -Infinity; for (let k = 0; k < XN; k++) x[k] += o.v[k]; if (o.si >= 0) cnt[o.si]++; }
      const act = []; for (let s = 0; s < NSET; s++) if (cnt[s] > 0 && sets[s].cum[Math.min(13, cnt[s])].any) act.push(s);
      if (act.length > 1) act.sort((a, b) => Math.min(cnt[b], 3) - Math.min(cnt[a], 3) || sets[b].cum[Math.min(13, cnt[b])].size - sets[a].cum[Math.min(13, cnt[a])].size);
      for (let a = 0; a < Math.min(3, act.length); a++) { const v = sets[act[a]].cum[Math.min(13, cnt[act[a]])].v; for (let k = 0; k < XN; k++) x[k] += v[k]; }
      const c = Math.min(Mo.bare + x[I_CL], Mo.cap);
      if (cool && (cool.atLeast ? c < cool.T - 1e-9 : Math.abs(c - cool.T) > 1e-9)) return -Infinity;
      return Mo.value(x);
    };
    const setMoves = []; for (const s of sets) { const xs = []; for (const sl of slots) for (const o of sl.opts) if (o.si >= 0 && sets[o.si] === s) xs.push([sl.name, o.d]); if (xs.length >= 2) setMoves.push(xs); }
    const outs = [];
    for (const S0 of starts) {
      const S = {}; for (const n of names) S[n] = optOf[n].has(S0[n] ?? '') ? (S0[n] ?? '') : slots.find(s => s.name === n).opts[0].d;
      let v = val(S);
      for (let it = 0; it < 80; it++) {
        let bm = null, bv = v;
        const tryM = (m) => { const keep = m.map(([n]) => [n, S[n]]); for (const [n, dd] of m) S[n] = dd; const w = val(S); for (const [n, dd] of keep) S[n] = dd; if (w > bv + 1e-12) { bv = w; bm = m; } };
        for (const n of names) for (const dd of optOf[n].keys()) if (dd !== S[n]) tryM([[n, dd]]);
        for (const xs of setMoves) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) { if (xs[i][0] === xs[j][0]) continue; tryM([xs[i], xs[j]]); for (let k = j + 1; k < xs.length; k++) if (xs[k][0] !== xs[i][0] && xs[k][0] !== xs[j][0]) tryM([xs[i], xs[j], xs[k]]); }
        if (!bm) for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) for (const d1 of optOf[names[a]].keys()) { if (d1 === S[names[a]]) continue; for (const d2 of optOf[names[b]].keys()) if (d2 !== S[names[b]]) tryM([[names[a], d1], [names[b], d2]]); }
        if (!bm) break; for (const [n, dd] of bm) S[n] = dd; v = bv;
      }
      if (v > -Infinity) outs.push(Object.assign({}, S));
    }
    return outs;
  }
  // 한 버프 조합에서: ① 가지치기 탐색으로 모델 1등과 그 아래 E(0.15%) 안쪽 조합을 모두 모음 ② 모델 값 높은 순으로 계산기 실투력(마법석 다시 맞춤)을 재서 1등.
  // 아직 안 잰 조합이 이길 수 없을 때(모델 값 + 오차 여유 < 지금 1등) 멈춤. 오차가 커서 모은 범위 밖도 이길 수 있으면 범위를 넓혀 한 번 더.
  // o.thr: 다른 버프 조합에서 이미 찾은 1등(이 모델 기준). 그보다 확실히 낮은 갈래는 처음부터 건너뜀
  function xBest(Mo, SL, worn, o) {
    const t0 = performance.now();
    const cur = {}; for (const s of SL.slots) cur[s.name] = s.name === '한벌' ? (worn['한벌'] || '') : s.name === '하의악세' ? (o.bNow || '') : (worn[s.name] || '');
    const E = o.E ?? 0.001, seeds = [cur];
    let nodes = 0, leaves = 0, capped = false, best = null, err = 0, n = 0, floor = Infinity;
    const slack = () => Math.max(2 * err, 0.0005);
    const evalList = (list) => {
      for (const c of list) {
        if (c.lr !== undefined) continue;
        if (best && c.v + slack() < best.lr) break;
        const r = Mo.real(c.x); n++; Object.assign(c, r, { lr: r.cp > 0 ? Math.log(r.cp) - Mo.L0 : -50 });
        if (r.cp > 0) err = Math.max(err, Math.abs(c.lr - c.v));
        if (r.cp > 0 && (!best || c.cp > best.cp + 0.5 || (Math.abs(c.cp - best.cp) <= 0.5 && c.ch < best.ch))) best = c;
      }
    };
    let passes = 0;
    const pass = (thr, margin) => { passes++;
      const r = xSearch(Mo, SL, worn, Object.assign({}, o, { thr, margin, max: 120, seeds, lagD: 3, lagR: 2, lagRIt: 30, tight: false }));
      nodes += r.nodes; leaves += r.leaves; capped = capped || !!r.capped;
      if (r.list.length) floor = Math.min(floor, r.list.reduce((a, c) => Math.max(a, c.v), -Infinity) - margin);
      return r.list;
    };
    let list = pass(o.thr, E);
    if (!list.length) return null;
    evalList(list);
    // 모은 범위(floor) 밑에서도 이길 수 있으면(오차가 큼) 그 밑까지 다시
    for (let k = 0; k < 2 && best && best.lr - slack() < floor - 1e-9; k++) {
      const top0 = list[0].v, m2 = top0 - (best.lr - slack());
      const more = pass(o.thr, m2).filter(c => !list.some(d => d.key === c.key));
      list = list.concat(more).sort((a, b) => b.v - a.v); floor = top0 - m2; evalList(list);
    }
    if (!best) return null;
    return { best, evaluated: n, err, E, nodes, leaves, capped, passes, ms: Math.round(performance.now() - t0) };
  }

  // 추천 실행: 버프 조합(최대 3개) × 하의 악세마다 최고 보장 탐색 → 가장 높은 것. o: { owned, fixed, fiveFixed, cool, atLeast }
  function suitsFor(worn, o) {
    const now = worn['한벌'] || ''; if ((o.fixed || {})['한벌']) return [now];
    const own = o.owned; const list = Object.keys(SUITS).filter(n => n === now || ((!own || own.has(n)) && (!SUITS[n].limited || (own && own.has(n)))));
    return list.length ? list : [now];
  }
  function bottomsFor(o) {
    const now = prof().bottom || ''; if ((o.fixed || {})['하의악세'] || !now) return [now];
    const own = o.owned; return [...new Set([now].concat(Object.keys(BOTTOMS).filter(n => n !== now && (!own || own.has(n)))))];
  }
  function sockMoves(nc, nm, Mo) {
    const out = [], sk = Mo.sk; let h2 = sk.counted ? sk.n.boss2 : 0;
    for (const [k, t, n] of [['crit', '크리티컬', nc], ['max', '극대화', nm]]) {
      if (!n) continue;
      let from = `힘트마 ${Math.abs(n)}칸`;
      if (n > 0 && h2 > 0) { const a = Math.min(n, h2); h2 -= a; from = n - a > 0 ? `사냥석 ${a}칸 + 힘트마 ${n - a}칸` : `사냥석 ${a}칸`; }
      out.push({ k, t, n, from });
    }
    return out;
  }
  function runExact(o) {
    const t0 = performance.now(), p = prof(), worn = p.worn || {}, cs = curStats(), cap = APP.coolCap ? APP.coolCap() : 35;
    const bareCool = (Number(cs['쿨감']) || 0) - (R.wornContribution(db, worn).sums['쿨감'] || 0);
    let T = 0; const want = Number(o.cool) || 0;
    if (want > 0 && Number(cs['쿨감']) > 0) { const L = coolSteps(bareCool, cap); T = want <= bareCool ? bareCool : (L.find(t => t >= want - 1e-9) ?? cap); if (T > cap) T = cap; }
    const coolC = T > 0 ? { T, atLeast: o.atLeast !== false } : null;
    const suits = suitsFor(worn, o), bottoms = bottomsFor(o), bNow = p.bottom || '';
    const runs = [], bases = buffBases(3), models = [];
    let GL = -Infinity;
    const doRun = (b, Mo, bns, useGL) => {
      const SL = xSlots(worn, { fixed: o.fixed, fiveFixed: o.fiveFixed, owned: o.owned, suits, bottoms: bns });
      const r = xBest(Mo, SL, worn, { cool: coolC, bNow, thr: useGL && GL > -Infinity ? GL - Mo.L0 - 0.002 : undefined });
      if (r) { runs.push(Object.assign(r, { base: b, bn: r.best.S['하의악세'] || '', Mo })); GL = Math.max(GL, Math.log(r.best.cp)); }
      return r;
    };
    // 첫 버프 조합: 하의 악세마다 따로(비교 표용). 다른 버프 조합: 하의 악세를 함께 넣고, 지금까지 1등보다 낮은 갈래는 건너뜀
    const M0 = xModel(bases[0], worn, worn['한벌'] || '', bNow); models.push(M0);
    for (const bn of bottoms) doRun(bases[0], M0, [bn], false);
    for (const b of bases.slice(1)) { const Mo = xModel(b, worn, worn['한벌'] || '', bNow); models.push(Mo); doRun(b, Mo, bottoms, true); }
    const r = { cpNow: APP.cpWith({}), coolTarget: T, bare: { baseCooldownBare: bareCool }, cur: { score: 0 }, mode: '최고 보장 탐색', gain: 0, cands: [], best: null };
    if (!runs.length) return r;
    const better = (a, b) => (b.best.cp > a.best.cp + 0.5 || (Math.abs(b.best.cp - a.best.cp) <= 0.5 && b.best.ch < a.best.ch)) ? b : a;
    let top = runs.reduce(better);
    // 1등이 다른 버프 조합이면 그 조합으로 하의 악세마다 다시(비교 표용)
    if (top.base !== bases[0] && bNow && bottoms.length > 1) { for (const bn of bottoms) if (bn !== top.bn) doRun(top.base, top.Mo, [bn], false); top = runs.reduce(better); }
    for (const M of models) M.free();
    const toCand = (run) => {
      const c = run.best, S = c.S, pd = {}; for (const pt of R.ALL_PARTS) if (S[pt]) pd[pt] = S[pt];
      const W2 = Object.assign({ '아바타5셋': S['아바타5셋'] || '' }, pd), wc = R.wornContribution(db, W2), cnt = new Map();
      for (const pt of R.ALL_PARTS) { const sn = db.displayToSet.get(S[pt]); if (sn) cnt.set(sn, (cnt.get(sn) || 0) + 1); }
      return { fiveSetDisplay: S['아바타5셋'] || '', partToDisplay: pd, suit: S['한벌'], bottom: S['하의악세'], cp: c.cp, coolReal: Math.min(bareCool + (wc.sums['쿨감'] || 0), cap),
        buffs: Object.assign({}, run.base), polished: true, mode: '최고 보장 탐색', setLabels: (wc.sets || []).map(sn => `${sn}(${cnt.get(sn) || 0})`),
        sock: { moves: sockMoves(c.nc, c.nm, run.Mo), over: c.over, skip: null, short: false }, over: c.over, crit: Number(c.over.C17 ?? APP.inputs().C17) || 0, max: Number(c.over.C19 ?? APP.inputs().C19) || 0 };
    };
    r.best = toCand(top);
    r.gain = r.cpNow > 0 ? r.best.cp / r.cpNow - 1 : 0;
    r.stats = { runs: runs.length, passes: runs.reduce((a, x) => a + (x.passes || 0), 0), evaluated: runs.reduce((a, x) => a + x.evaluated, 0), nodes: runs.reduce((a, x) => a + x.nodes, 0), leaves: runs.reduce((a, x) => a + x.leaves, 0), capped: runs.some(x => x.capped), err: Math.max(...runs.map(x => x.err)), ms: Math.round(performance.now() - t0) };
    r.cands = runs.map(toCand);
    // 하의 악세 비교: 고른 버프 조합에서 하의 악세마다 가장 높은 세팅
    if (bNow && bottoms.length > 1) {
      const byBn = new Map(); for (const x of runs) if (x.base === top.base) { const e = byBn.get(x.bn); if (!e || better(e, x) === x) byBn.set(x.bn, x); }
      const rows = [...byBn.values()].map(x => {
        const c = toCand(x), row = { n: x.bn, cp: c.cp, suit: c.suit, cand: c, crit: c.crit, max: c.max, sock: c.sock, o: c.over };
        try {
          const base1 = c.over, a1 = Number('C14' in base1 ? base1.C14 : APP.inputs().C14) || 0, cp1 = APP.cpWith(base1);
          let k = 0, prev = cp1;
          while (k < 20) { const v = APP.cpWith(Object.assign({}, base1, { C14: a1 + (k + 1) * 0.005 })); if (!(v > prev + 0.5)) break; prev = v; k++; }
          if (k > 0) { row.adaptShort = k * 0.005; row.adaptGain = (prev - cp1) / cp1; }
        } catch (e) { console.error(e); }
        return row;
      });
      if (rows.length > 1) r.best.rivals = { modes: { opt: rows }, order: ['opt'], critT: Number(APP.inputs().C17) || 0, maxT: Number(APP.inputs().C19) || 0, byCap: false };
    }
    return r;
  }
  function runRec() {
    const btn = $('#btnAvRun');
    if (!APP.cls()) { result = { err: '계산기 탭에서 전직을 먼저 골라 주세요' }; renderResult(); return; }
    if (!(num('C11') > 0)) { result = { err: '계산기 탭에 지금 스탯이 없어요. 상세 스탯 창 스크린샷을 먼저 읽어 주세요' }; renderResult(); return; }
    btn.disabled = true; btn.textContent = '계산 중…';
    if (window.SilTrack) window.SilTrack('avatar');
    setTimeout(() => {
      try {
        const p = prof(), cur = curStats();
        const owned = st.ownOn ? new Set([...(st.own || []), ...PARTS.map(x => p.worn[x]).filter(Boolean)]) : null;
        const fx = p.fixed || {}, f5 = !!p.fiveFixed, anyFix = f5 || Object.values(fx).some(Boolean);
        const cool = Number(st.o.cool) || 0, atLeast = st.o.coolAtLeast !== false;
        const go = (o) => runExact(Object.assign({ owned, fixed: fx, fiveFixed: f5, cool, atLeast }, o));
        const r = go({});
        result = { r };
        if (!r.best) {
          // 어떤 조건 때문에 막혔는지 하나씩 풀어 보며 찾음
          const why = [];
          const r2c = (x) => Math.round(x * 100) / 100, need = r2c(r.coolTarget - r.bare.baseCooldownBare);
          const coolMsg = () => cur['쿨감'] > 0
            ? `목표 쿨감 ${r.coolTarget}%를 ${atLeast ? '채우는' : '딱 맞추는'} 조합이 없어요. 아바타·악세를 뺀 쿨감이 ${r2c(r.bare.baseCooldownBare)}%라서 아바타로 ${atLeast ? `${need}% 이상` : `딱 ${need}%`}를 채워야 해요(부위 쿨감 5%, 세트 효과 3%·5%를 더해서)`
            : '계산기 탭의 \'초월한 스킬 재사용 시간 감소\'가 비어 있어서 쿨감을 맞출 수 없어요';
          // 무엇 때문에 막혔는지 먼저 짚음: 보유·고정을 풀면 되는지 → 그렇다면 그게 원인(보유에 없는 아이템 이름까지)
          let cause = null;
          if (cool > 0 && cur['쿨감'] > 0 && (owned || anyFix)) {
            const rOwn = owned ? go({ owned: null }) : null;
            if (rOwn && rOwn.best) {
              // 보유에 없는 것 중 쿨감에 쓰인 것만(쿨감 아이템, 또는 쿨감 세트 효과가 켜진 세트의 부위)
              const b = rOwn.best, used = [b.fiveSetDisplay, ...Object.values(b.partToDisplay || {})].filter(Boolean);
              const coolSetNames = new Set(A.items.filter(it => it[0] === '세트효과' && it[4] === '쿨감').map(it => it[1]));
              const active = new Set((b.setLabels || []).map(l => String(l).replace(/\(\d+\)$/, '')));
              const info = new Map(); for (const it of A.items) if (it[0] !== '세트효과') { const e = info.get(it[3]) || { cool: false, set: it[1] }; if (it[4] === '쿨감') e.cool = true; info.set(it[3], e); }
              const miss = used.filter(d => !owned.has(d) && (info.get(d) || {}).cool || (!owned.has(d) && coolSetNames.has((info.get(d) || {}).set) && active.has((info.get(d) || {}).set)));
              cause = `보유 체크한 아이템만으로는 쿨감 ${r.coolTarget}%를 ${atLeast ? '채울' : '딱 맞출'} 수 없어요${miss.length ? `. 쿨감을 맞추려면 보유에 없는 이 아이템이 필요해요: ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? ' 등' : ''}` : ''}`;
            } else if (anyFix) { const rFix = go({ fixed: {}, fiveFixed: false, owned: null }); if (rFix.best) cause = `고정한 부위 때문에 쿨감 ${r.coolTarget}%를 ${atLeast ? '채울' : '딱 맞출'} 수 없어요. 고정을 풀어 보세요`; }
          }
          if (cause) why.push(cause);
          if (cool > 0 && !atLeast && cur['쿨감'] > 0) why.push(`'이상이면 됨'을 켜면 ${r.coolTarget}% 이상인 조합까지 볼 수 있어요`);
          const tries = [];
          if (cool > 0) {
            // 쿨감은 맞출 수 있는 값을 하나씩 낮춰 가며 가장 높은 목표를 찾음
            if (cur['쿨감'] > 0) { const cap = APP.coolCap ? APP.coolCap() : 35, bc = Number(r.bare.baseCooldownBare) || 0; for (const t of coolSteps(bc, cap).filter(t => t < cool - 1e-9).reverse()) tries.push([{ cool: t }, 'cool:' + t]); }
            tries.push([{ cool: 0 }, 'cool']);
          }
          if (owned) tries.push([{ owned: null }, 'own']);
          if (anyFix) tries.push([{ fixed: {}, fiveFixed: false }, 'fixed']);
          tries.push([{ owned: null, cool: 0, fixed: {}, fiveFixed: false }, 'all']);
          for (const [o, k] of tries) {
            const r2 = go(o);
            if (!r2.best) continue;
            if (!cause) {
              if (k.startsWith('cool') || k === 'all') { if (cool > 0) why.unshift(coolMsg()); }
              if (k === 'own' || (k === 'all' && owned)) why.unshift('보유 체크한 아이템만으로는 목표를 채우는 조합을 만들 수 없어요. 보유 아바타에서 더 체크하거나 필터를 꺼 주세요');
              if (k === 'fixed' || (k === 'all' && anyFix)) why.unshift('고정한 부위끼리 맞는 조합이 없어요');
            }
            const what = k.startsWith('cool:') ? `목표 쿨감을 ${r2.coolTarget}%로 낮춰` : { cool: '쿨감 조건을 빼고', own: '보유 필터를 끄고', fixed: '고정을 풀고', all: '쿨감·보유·고정 조건을 모두 빼고' }[k];
            result = { r: r2, warn: why, relaxed: what };
            break;
          }
          if (!result.relaxed) result = { r, warn: cause ? why : [coolMsg(), ...why] };
        }
      } catch (e) { console.error(e); result = { err: '계산하다 문제가 생겼어요: ' + (e.message || e) }; }
      btn.disabled = false; btn.textContent = '추천 받기'; renderResult();
      if (window.innerWidth < 1024) { const rc = $('.av-res-card'); if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }, 30);
  }
  // 머리말 보기 전환(계산기·아바타). 랭킹은 rank.js가 맡음 — 랭킹이 없는 판에서는 랭킹 버튼을 숨김
  function setAvView(on) {
    document.body.classList.toggle('view-avatar', on);
    $('#avView').hidden = !on;
    if (on) {
      document.body.classList.remove('view-rank', 'view-admin', 'view-optchg');
      for (const id of ['#rankView', '#adminView', '#ocView']) { const x = $(id); if (x) x.hidden = true; }
      render(); window.scrollTo(0, 0);
    }
    const views = $('#views');
    if (views) for (const x of views.querySelectorAll('button[data-view]')) if (x.dataset.view === 'calc' || x.dataset.view === 'avatar') x.setAttribute('aria-current', (x.dataset.view === 'avatar') === on ? 'page' : 'false');
  }
  function wireViews() {
    const views = $('#views'); if (!views || !$('#avView')) return;
    if (!window.SIL_CDN) { const rb = views.querySelector('[data-view="rank"]'); if (rb) rb.hidden = true; }
    views.hidden = false;
    views.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b && (b.dataset.view === 'calc' || b.dataset.view === 'avatar')) setAvView(b.dataset.view === 'avatar'); });
    if (new URLSearchParams(location.search).has('avatar')) setAvView(true);
  }
  function wire() {
    const card = $('#avCard'); if (!card) return;
    wireViews();
    $('#btnAvRun').onclick = runRec;
    const fin = $('#avShotIn');
    if (fin) fin.onchange = () => { const f = fin.files && fin.files[0]; fin.value = ''; if (f) readShot(f); };
    document.addEventListener('paste', (e) => {
      if (!document.body.classList.contains('view-avatar')) return;
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (it) { e.preventDefault(); readShot(it.getAsFile()); }
    });
    const drop = $('#avCard');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drop-on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop-on'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drop-on'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) readShot(f); });
    if (matchMedia('(pointer: coarse)').matches) $('#avDropMain').textContent = 'PC에서 캐릭터 장비창을 띄우고 찍은 스크린샷을 골라 주세요';
    let lastKey = APP.key();
    APP.onRefresh(() => { const k = APP.key(); if (k !== lastKey) { lastKey = k; lastRec = null; result = null; render(); } else if (result) { result = null; renderResult(); } });
    render();
  }
  window.SilAvatar = { fromShot, recognize, render, curStats, calcOpts, buildScorer, rerank, overridesFor };
  wire();
})();
