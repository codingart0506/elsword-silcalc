/* 가열기 아바타 추천 카드: 장비창 스크린샷에서 지금 입은 아바타·레어 악세 인식 + 룰루님 시트 방식 추천 */
(function () {
  'use strict';
  const A = window.SIL_AV, R = window.SilAvRec, APP = window.SilApp;
  if (!A || !R || !APP) return;
  const $ = (s) => document.querySelector(s);
  const el = APP.el;
  const PARTS = ['아바타5셋', '무기', '웨폰가드', '서포트유닛', '얼굴(상)', '얼굴(중)', '얼굴(하)', '상의', '하의', '팔', '귀걸이', '목걸이', '반지'];
  const PART_LABEL = { '아바타5셋': '아바타 5셋', '무기': '무기 아바타' };
  const db = R.prepareDb(A.items);
  const optionsOf = (part) => part === '아바타5셋' ? db.fiveSetList.map(s => db.fiveSetDisplay.get(s)) : [...(db.partCandidates.get(part) || [])];
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
      '물마퍼': mp, '모스댐': pct('C33'), '초댐증': pct('C30'), '크댐증': pct('C18'), '보댐증': pct('C21'), '쿨감': pct('C32') || pct('C31') };
  }
  const IMPRINT_OF = { 0.04: '4% (찬란석 하옵)', 0.05: '5% (찬란석 상옵)', 0.055: '5.5% (강수, 11강)', 0.06: '6% (강수, 12강)', 0.065: '6.5% (강수, 13강)' };
  function calcOpts() {
    const inp = APP.inputs();
    let env = num('L34'); if (env > 0 && env <= 1.5) env *= 100; if (!(env > 0)) env = 95;
    let imprint = '없음';
    for (const [k, v] of [['D20', 'H20'], ['D21', 'H21'], ['D22', 'H22']]) if (String(inp[k] || '').startsWith('크리티컬 데미지')) imprint = IMPRINT_OF[Math.round(Number(inp[v]) * 1000) / 1000] || imprint;
    const atma = inp.J32 === '초목의 아트마' ? ({ '일반': '일반', '레어': '레어', '엘리트': '엘리트', '유니크': '유니크' }[inp.L32] || '없음') : '없음';
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
    return { ok: true, char: A.charNames[k], found, detail };
  }
  // 앱에서 스크린샷을 읽은 뒤 부름
  async function fromShot(canvas, gear) {
    const r = await recognize(canvas, gear);
    if (!r.ok) { lastRec = r; render(); return r; }
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
    const allFixed = !!p.fiveFixed && PARTS.slice(1).every(x => p.fixed[x]);
    body.append(el('div', { class: 'av-fix-acts' },
      el('button', { type: 'button', class: 'txt sm', text: '전체 고정', onclick: () => { p.fiveFixed = true; for (const x of PARTS.slice(1)) p.fixed[x] = true; save(); result = null; render(); } }),
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
    row('목표 쿨감', cool, '0이면 쿨감 조건 없이 계산해요');
    row('길드 사냥꾼의 본능', selIn('guild', OPT_SEL.guild));
    row('적응의 영약', chk('elixir'));
    row('글리터의 훈장 카트리지 세트', selIn('medal', OPT_SEL.medal));
    row('기타 적응력', numIn('adaptEtc', '56px'));
    row('기타 보댐증(합)', numIn('bossEtc', '56px'));
    row('기타 크댐증(합)', numIn('critAdd', '56px'));
    row('기타 크댐증 곱 배율', numIn('critMul', '56px'));
    box.append(el('p', { class: 'av-hint', text: `계산기에서 가져온 값: 환경 디버프 ${c.env}, 집결지 ${c.rally}, 파티 크뎀증 ${c.party ? '켬' : '끔'}, 마에스트로 헤일로 ${c.maestro ? '있음' : '없음'}, 초목의 아트마 ${c.atma}, 각인석 크뎀 ${c.imprint}` }));
  }
  function renderOwn() {
    const box = $('#avOwnBody'); if (!box) return; box.textContent = '';
    const on = el('input', { type: 'checkbox' }); on.checked = !!st.ownOn;
    on.onchange = () => { st.ownOn = on.checked; if (on.checked && !st.own) st.own = []; save(); result = null; renderOwn(); renderResult(); };
    box.append(el('label', { class: 'av-fix av-own-on' }, on, el('span', { text: '가진 것만으로 추천 (체크한 아이템만 써요)' })));
    if (!st.ownOn) return;
    const own = new Set(st.own || []);
    const p = prof(); for (const part of PARTS) if (p.worn[part]) own.add(p.worn[part]);
    const sets = A.sets.filter(s => db.fiveSetStats.has(s) || db.setToParts.has(s));
    const itemsOf = (s) => {
      const items = [];
      if (db.fiveSetDisplay.has(s)) items.push(db.fiveSetDisplay.get(s));
      for (const part of (db.setToParts.get(s) || [])) { const d = db.displayBySetPart.get(s + '||' + part); if (d) items.push(d); }
      return items;
    };
    const setOwn = (list) => { st.own = [...new Set(list)]; save(); result = null; renderOwn(); renderResult(); };
    const all = sets.flatMap(itemsOf);
    box.append(el('div', { class: 'av-own-acts' },
      el('button', { type: 'button', class: 'txt sm', text: '전체 선택', onclick: () => setOwn(all) }),
      el('button', { type: 'button', class: 'txt sm mute', text: '전체 취소', onclick: () => setOwn([]) }),
      el('span', { class: 'av-hint', text: '지금 낀 아이템은 늘 가진 것으로 쳐요. 세트 이름을 누르면 그 세트를 한꺼번에 골라요' })));
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
    const g = r.gain * 100;
    box.append(el('p', { class: 'av-gain' }, g > 0.0005 ? el('span', null, '추천대로 바꾸면 실뎀 ', el('b', { class: 'up', text: '+' + g.toFixed(2) + '%' })) : el('span', { text: '지금 세팅이 이미 가장 좋아요' })));
    const tb = el('tbody');
    const rec = Object.assign({ '아바타5셋': r.best.fiveSetDisplay }, r.best.partToDisplay);
    for (const part of PARTS) {
      const now = p.worn[part] || '', want = rec[part] || '';
      const same = now === want;
      tb.append(el('tr', { class: same ? '' : 'chg' }, el('th', { scope: 'row', text: PART_LABEL[part] || part }), el('td', { text: short(now) || '-' }), el('td', { class: same ? 'same' : 'to', text: same ? '그대로' : short(want) })));
    }
    box.append(el('table', { class: 'av-table' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'sr', text: '부위' })), el('th', { scope: 'col', text: '지금' }), el('th', { scope: 'col', text: '추천' }))), tb));
    box.append(el('p', { class: 'av-hint', text: `3세트: ${r.best.setLabels.join(' · ')} | ${r.mode}${r.coolTarget ? ` | 쿨감 ${r.best.coolReal}%` : ''} | 시트 기준 맨몸 대비 점수 ${r.cur.score.toFixed(2)} → ${r.best.score.toFixed(2)}` }));
  }
  function runRec() {
    const btn = $('#btnAvRun');
    if (!APP.cls()) { result = { err: '계산기 탭에서 전직을 먼저 골라 주세요' }; renderResult(); return; }
    if (!(num('C11') > 0)) { result = { err: '계산기 탭에 지금 스탯이 없어요. 상세 스탯 창 스크린샷을 먼저 읽어 주세요' }; renderResult(); return; }
    btn.disabled = true; btn.textContent = '계산 중…';
    setTimeout(() => {
      try {
        const p = prof(), c = calcOpts(), cur = curStats();
        const owned = st.ownOn ? new Set([...(st.own || []), ...PARTS.map(x => p.worn[x]).filter(Boolean)]) : null;
        const go = (o, fixed, fiveFixed) => R.run({ items: A.items, chars: A.chars, cls: sheetClass(APP.cls()), cur, worn: p.worn, fixed, fiveFixed, opt: Object.assign({}, st.o, c, o) });
        const fx = p.fixed || {}, f5 = !!p.fiveFixed, anyFix = f5 || Object.values(fx).some(Boolean);
        const r = go({ owned }, fx, f5);
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
  window.SilAvatar = { fromShot, recognize, render, curStats, calcOpts };
  wire();
})();
