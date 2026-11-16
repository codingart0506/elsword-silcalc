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
  const SUIT_CELL = { crit: 'C17', max: 'C19', mos: 'C33', pol: 'C20', adapt: 'C14', dot: 'C22' };
  const db = R.prepareDb(A.items);
  const optionsOf = (part) => part === '아바타5셋' ? db.fiveSetList.map(s => db.fiveSetDisplay.get(s)) : part === '한벌' ? Object.keys(SUITS) : [...(db.partCandidates.get(part) || [])];
  const short = (d) => { const t = String(d || ''); const m = t.match(/^(.+?) : (.+)$/); return m ? m[2] + ' · ' + m[1] : t; };

  // ---------- 저장 (세팅별 착용·고정, 공용 계산 조건·보유 목록) ----------
  const KEY = 'silcalc.av.v1';
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  st.p = st.p || {}; st.o = Object.assign({ guild: '2.5% (5레벨)', elixir: false, adaptEtc: 0, bossEtc: 0, medal: '없음', critAdd: 0, critMul: 1, cool: 35, coolAtLeast: true }, st.o || {});
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
      const s = document.createElement('script'); s.src = `av/g${k}.js?v=${A.ver || 1}2`;
      s.onload = () => (window.SIL_GEAR2 && window.SIL_GEAR2[k]) ? res(window.SIL_GEAR2[k]) : rej(new Error('아이콘 없음'));
      s.onerror = () => { loaded2[k] = null; rej(new Error('아이콘을 못 불러왔어요')); };
      document.head.appendChild(s);
    });
    return loaded2[k];
  }
  // 방어구 칸은 왼쪽 위 S·자물쇠 표시와 오른쪽 아래 회로 표시를 빼고 비교
  const MASK_ARM = new Uint8Array(F * F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) MASK_ARM[y * F + x] = ((x < 6 && y < 6) || (x >= 10 && y >= 10)) ? 0 : 1;
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
      const r = scan(canvas, avx, top, S, [0.94, 1.0, 1.06, 1.12], sp, MASK);
      const best = r[0], gap = r[1] ? r[1].d - best.d : 99;
      suit = { name: best.n, d: Math.round(best.d * 10) / 10, gap: Math.round(gap * 10) / 10, ok: (best.d <= 21 && gap >= 4) || (best.d <= 25 && gap >= 8) };
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
      let best = null, second = Infinity;
      const byName = {};
      for (let dy = -R; dy <= R; dy += stp) for (let dx = -R; dx <= R; dx += stp) {
        const x = b.x + ins + dx, y = b.y + ins + dy, s = b.s - 2 * ins;
        if (x < 0 || y < 0 || x + s > canvas.width || y + s > canvas.height) continue;
        const f = feat(canvas, x, y, s);
        for (const e of pool) { const d = dist(f, e.fb); if (!(e.n in byName) || d < byName[e.n].d) byName[e.n] = { d, e }; }
      }
      const ranked = Object.values(byName).sort((a, b2) => a.d - b2.d);
      if (!ranked.length) continue;
      best = ranked[0]; second = ranked[1] ? ranked[1].d : Infinity;
      // 충분히 가깝거나, 조금 멀어도 2등과 차이가 아주 크면 인정(염색·별 표시·화질 차이로 거리가 조금 커지는 경우)
      const ok = (best.d <= MATCH && second - best.d >= 3) || (best.d <= 18 && second - best.d >= 8);
      detail.push({ part: b.part, piece: b.piece, name: best.e.n, d: best.d, gap: second - best.d, ok });
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
      const fx = el('input', { type: 'checkbox', 'aria-label': (PART_LABEL[part] || part) + ' 고정' });
      fx.checked = part === '아바타5셋' ? !!p.fiveFixed : !!p.fixed[part];
      fx.onchange = () => { if (part === '아바타5셋') p.fiveFixed = fx.checked; else p.fixed[part] = fx.checked; save(); result = null; renderResult(); };
      const tag = el('span', { class: 'av-tag' });
      const renderTag = () => {
        const h = p.how[part] || '';
        tag.className = 'av-tag'; tag.textContent = '';
        if (h === 'shot' && p.worn[part]) { tag.textContent = '인식'; tag.classList.add('ok'); }
        else if (h.startsWith('other:')) { tag.textContent = '시트 밖'; tag.title = h.slice(6); }
      };
      renderTag();
      body.append(el('div', { class: 'av-row' }, el('span', { class: 'av-part', text: PART_LABEL[part] || part }), tag, sel, el('label', { class: 'av-fix' }, fx, el('span', { text: '고정' }))));
    }
    {
      const sel = el('select', { 'aria-label': '일반 악세 하의 지금 착용' });
      sel.append(el('option', { value: '', text: '모름·그 밖의 것 (추천 안 함)' }));
      for (const d of Object.keys(BOTTOMS)) sel.append(el('option', { value: d, text: d }));
      sel.value = p.bottom || '';
      sel.onchange = () => { p.bottom = sel.value; save(); result = null; renderResult(); };
      const fx = el('input', { type: 'checkbox', 'aria-label': '일반 악세 하의 고정' });
      fx.checked = !!p.fixed['하의악세'];
      fx.onchange = () => { p.fixed['하의악세'] = fx.checked; save(); result = null; renderResult(); };
      body.append(el('div', { class: 'av-row' }, el('span', { class: 'av-part', text: '일반 악세 하의' }), el('span', { class: 'av-tag' }), sel, el('label', { class: 'av-fix' }, fx, el('span', { text: '고정' }))));
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
    const cool = el('span', { class: 'av-inline' }, numIn('cool', '56px'), el('span', { text: '%' }), el('label', { class: 'av-fix' }, chk('coolAtLeast'), el('span', { text: '이상이면 됨' })));
    row('목표 쿨감', cool, `0이면 쿨감 조건 없이 계산해요. ${APP.cls() || '이 직업'} 쿨감 상한은 ${APP.coolCap ? APP.coolCap() : 35}%라서 그 위는 상한까지만 맞춰요`);
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
          const all = (APP.optionsOf(c) || []).filter(x => x !== '');
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
        box.append(el('p', { class: 'av-hint', text: '파티 버프와 이벤트 버프는 계산기 탭에 넣은 그대로 써요' }));
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
  function renderResult() {
    const box = $('#avResult'); if (!box) return; box.textContent = '';
    if (!result) return;
    if (result.err) { box.append(el('p', { class: 'av-hint warn', text: result.err })); return; }
    const r = result.r, p = prof();
    if (result.warn && result.warn.length) {
      box.append(el('div', { class: 'av-warn' }, el('b', { text: '조건에 맞는 세팅이 없어요' }), ...result.warn.map(w => el('p', { text: w })),
        result.relaxed ? el('p', { class: 'av-relax', text: `아래는 ${result.relaxed} 계산한 결과예요. 조건은 '계산 조건'·'보유 아바타'·고정 칸에서 바꿀 수 있어요` }) : ''));
    }
    if (!r.best) return;
    const g = r.gain * 100, fmt = (n) => Math.round(n).toLocaleString('ko-KR');
    const rec = Object.assign({ '아바타5셋': r.best.fiveSetDisplay, '한벌': r.best.suit != null ? r.best.suit : (p.worn['한벌'] || '') }, r.best.partToDisplay);
    const showBottom = r.best.bottom != null && !!(p.bottom || r.best.bottom), buffs = Object.entries(r.best.buffs || {});
    const changed = PARTS.some(part => (p.worn[part] || '') !== (rec[part] || '')) || (showBottom && (p.bottom || '') !== r.best.bottom) || buffs.some(([c, v]) => String(APP.val(c) ?? '') !== String(v));
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
      const lead = `목표 쿨감 ${T}%를 맞추는 조합 중에서는 이 세팅이 가장 높아요. 지금 세팅(쿨감 ${Math.round(curCool * 100) / 100}%)과 비교하면 `;
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
    box.append(el('table', { class: 'av-table' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'sr', text: '부위' })), el('th', { scope: 'col', text: '지금' }), el('th', { scope: 'col', text: '추천' }))), tb));
    if (keepNow) { box.append(el('p', { class: 'av-hint', text: '조건에 맞는 다른 조합은 모두 지금 세팅보다 낮았어요' })); return; }
    box.append(el('p', { class: 'av-hint', text: `3세트: ${r.best.setLabels.join(' · ')} | ${r.mode}${r.best.coolReal != null ? ` | 쿨감 ${r.best.coolReal}%` : ''}${changed ? ` | 시트(룰루) 점수로는 실뎀 ${g >= 0 ? '+' : ''}${g.toFixed(2)}%` : ''}` }));
    if (r.cands && r.cands.length > 1 && r.best.cp > 0) box.append(el('p', { class: 'av-hint', text: `계산기 실투력 기준으로 모든 조합을 비교해서 고른 결과예요. 마지막에 후보 ${r.cands.length}개를 계산기로 정확히 다시 쟀어요` }));
  }
  // 아바타 점수 상위 조합을 계산기 본체(시트와 같은 실투력 계산)에 넣어 실투력으로 다시 줄 세움
  const STAT_CELL = { '적응력': ['C14'], '초적응력': ['C15'], '강배': ['C24'], '역강배': ['C25'], '100이하': ['C26'], '추피': ['C22'], '양극화': ['C20'], '모스댐': ['C33'], '초댐증': ['C30'], '크댐증': ['C18'], '보댐증': ['C21'], '쿨감': ['C31', 'C32'], '강렬댐증': ['C29'] };
  // 후보 세팅과 지금 낀 것의 차이만큼 계산기 칸을 바꾼 값.
  // 후보도 지금 낀 것과 같은 셈법(실제로 켜지는 세트 효과 전부)으로 셈 — 탐색 점수는 고른 3세트 효과만 치지만,
  // 실투력은 남는 부위가 우연히 켜는 2세트 효과까지 쳐야 맞음(지금과 똑같은 조합이면 차이가 정확히 0)
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
    const over = (stat, d) => {
      if (stat === '물마퍼') { const k = (100 + mp + d) / (100 + mp); return { C11: Math.round(num('C11') * k), C12: Math.round(num('C12') * k) }; }
      const o = {}; for (const c of STAT_CELL[stat]) o[c] = Math.round(((Number(inp[c]) || 0) + d / 100) * 1e6) / 1e6; return o;
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
      o[c] = APP.addRaw ? APP.addRaw(c, val(c), d / 100) : Math.round((val(c) + d / 100) * 1e6) / 1e6;
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
  const buffLabel = (c) => { const v = APP.val('I' + c.slice(1)); return v && !String(v).startsWith('#') ? String(v).trim() : c; };
  function buffOptions(c) {
    const now = String(APP.val(c) ?? '');
    const ok = (st.buffOk || {})[c];
    const all = (APP.optionsOf ? APP.optionsOf(c) : []) || [];
    const list = ok && ok.length ? all.filter(x => ok.includes(x)) : [];
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
  function suitChoices(worn) {
    const p = prof(), now = worn['한벌'] || '';
    if (p.fixed['한벌']) return [now];
    const own = st.ownOn ? new Set(st.own || []) : null;
    const list = Object.keys(SUITS).filter(n => n === now || ((!own || own.has(n)) && (!SUITS[n].limited || (own && own.has(n)))));
    return list.length ? list : [now];
  }
  function rerank(r, worn, base) {
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
    for (const c of r.cands) {
      const ov = overridesFor(r, worn, c);
      let best = null;
      for (const sName of suits) for (const bName of bottoms) {
        const o = Object.assign({}, base, ov);
        suitOver(o, now, sName); bottomOver(o, bNow, bName);
        const v = APP.cpWith(o);
        if (!best || v > best.cp) best = { cp: v, suit: sName, bottom: bName, over: o };
      }
      Object.assign(c, best);
    }
    let top = r.cands.slice().sort((a, b) => b.cp - a.cp)[0];
    if (!(top.cp > 0)) return r;
    top.buffs = Object.assign({}, base);
    r.scoreRank = r.cands.indexOf(top) + 1;
    r.best = top; r.mode = top.mode || r.mode;
    r.gain = (100 + (top.rScore != null ? top.rScore : top.score)) / (100 + r.cur.score) - 1;
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
        const p = prof(), c = calcOpts(), cur = curStats();
        const owned = st.ownOn ? new Set([...(st.own || []), ...PARTS.map(x => p.worn[x]).filter(Boolean)]) : null;
        const db = R.prepareDb(A.items);
        let base = {}, scorer = null;
        const go = (o, fixed, fiveFixed) => rerank(R.run({ items: A.items, chars: A.chars, cls: sheetClass(APP.cls()), cur, worn: p.worn, fixed, fiveFixed, opt: Object.assign({ topK: 50, scorer, coolCap: APP.coolCap ? APP.coolCap() : 35 }, st.o, c, o) }), p.worn, base);
        const fx = p.fixed || {}, f5 = !!p.fiveFixed, anyFix = f5 || Object.values(fx).some(Boolean);
        // 바깥: 버프·영약 조합(위에서 3개) · 안쪽: 아바타 탐색 + 한벌·하의 악세. 실투력이 가장 높은 것을 고름
        let r = null, keep = null;
        for (const b of buffBases(3)) {
          base = b; scorer = buildScorer(db, p.worn, b);
          const r1 = go({ owned }, fx, f5);
          if (!r || (r1.best && (!r.best || (r1.best.cp || 0) > (r.best.cp || 0)))) { r = r1; keep = [b, scorer]; }
        }
        [base, scorer] = keep;
        result = { r };
        if (!r.best) {
          // 어떤 조건 때문에 막혔는지 하나씩 풀어 보며 찾음
          const why = [];
          const coolMsg = () => cur['쿨감'] > 0
            ? `목표 쿨감 ${r.coolTarget}%를 채우는 조합이 없어요. 지금 아바타·악세를 뺀 쿨감이 ${Math.round(r.bare.baseCooldownBare * 100) / 100}%라서 아바타로 ${Math.round((r.coolTarget - r.bare.baseCooldownBare) * 100) / 100}%를 더 채워야 해요`
            : '계산기 탭의 \'초월한 스킬 재사용 시간 감소\'가 비어 있어서 쿨감을 맞출 수 없어요';
          const tries = [];
          if (Number(st.o.cool) > 0) {
            // 쿨감은 5%씩 낮춰 가며 맞출 수 있는 가장 높은 목표를 찾음
            if (cur['쿨감'] > 0) for (let t = Number(st.o.cool) - 5; t > 0; t -= 5) tries.push([{ owned, cool: t }, fx, f5, 'cool:' + t]);
            tries.push([{ owned, cool: 0 }, fx, f5, 'cool']);
          }
          if (owned) tries.push([{ owned: null }, fx, f5, 'own']);
          if (anyFix) tries.push([{ owned }, {}, false, 'fixed']);
          tries.push([{ owned: null, cool: 0 }, {}, false, 'all']);
          for (const [o, f, f5b, k] of tries) {
            const r2 = go(o, f, f5b);
            if (!r2.best) continue;
            if (k.startsWith('cool') || k === 'all') { if (Number(st.o.cool) > 0) why.push(coolMsg()); }
            if (k === 'own' || (k === 'all' && owned)) why.push('보유 체크한 아이템만으로는 3세트 조합을 만들 수 없어요. 보유 아바타에서 더 체크하거나 필터를 꺼 주세요');
            if (k === 'fixed' || (k === 'all' && anyFix)) why.push('고정한 부위끼리 맞는 조합이 없어요');
            const what = k.startsWith('cool:') ? `목표 쿨감을 ${r2.coolTarget}%로 낮춰` : { cool: '쿨감 조건을 빼고', own: '보유 필터를 끄고', fixed: '고정을 풀고', all: '쿨감·보유·고정 조건을 모두 빼고' }[k];
            result = { r: r2, warn: why, relaxed: what };
            break;
          }
          if (!result.relaxed) result = { r, warn: [coolMsg()] };
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
      document.body.classList.remove('view-rank', 'view-admin');
      for (const id of ['#rankView', '#adminView']) { const x = $(id); if (x) x.hidden = true; }
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
  window.SilAvatar = { fromShot, recognize, render, curStats, calcOpts, buildScorer, rerank };
  wire();
})();
