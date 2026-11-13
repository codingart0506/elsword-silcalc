/* 실투력 계산기 화면 로직 */
(function () {
  'use strict';
  const E = window.SilEngine, O = window.SilOCR, M = window.SIL_MODEL;
  const SH = '<Main>';
  const wb = new E.Workbook(M);
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };

  // ---------- 입력 항목 구성 (시트 <Main> 배치 그대로) ----------
  const PCT = new Set('C14 C15 C17 C18 C19 C20 C21 C22 C24 C25 C26 C27 C29 C30 C31 C32 C33 C34 C35 H11 H12 H13 H17 H18 H20 H21 H22 H31 H32 H33'.split(' '));
  const HELP = {
    C12: '능력치 창의 물리/마법 공격력에 마우스를 올리면 나오는 극대화 범위 "12345 ~ 67890" 중 오른쪽 최댓값. 무기 공격력이 아님.',
    C13: '상세 능력치 창이 아니라 무기 자체의 물리/마법 공격력 (극대화 범위 X).',
    C27: '테네브로스 장비의 세 번째 그림자 옵션 효과.',
    C34: '순환 엑사 세트효과 8%를 더하지 말고 능력치 창 그대로 입력.',
    H11: '1. 테네브로스 상의 두 번째 그림자 옵션 / 2. 홍예항마 4세트 10% / 3. 엑사스케일 연산·순환 세트효과 10%',
    H12: '1. 테네브로스 장갑 두 번째 그림자 옵션 / 2. 홍예항마 2세트 10% / 3. 엑사스케일 복원 세트효과 (유강강초 회로 × 0.8%)',
    H13: '1. 테네브로스 상의 두 번째 그림자 옵션 / 2. 엑사스케일 복원 세트효과 10%',
    H15: '캐시샵 20000 캐시 업그레이드 이용권',
    L15: '스피릿 챌린저는 "미사용" 선택',
    J21: '녹힐 캐릭터는 적용3-적청엑사 선택 (디아, 일천, 데메, 오마, 블루헨, 라소, 닉스, 에버리스)',
    J26: '미착용이면 종류는 아무거나, 강화 수치를 0으로.',
  };
  // 상세 스탯 탭은 게임의 상세 스탯 창과 같은 순서·이름
  const TABS = [
    { id: 'stat', name: '상세 스탯', pairs: true, groups: [
      { bar: '기본 능력치', fields: [{ c: 'C11', lab: 'B11' }, { spacer: true }, { c: 'C14', t: '적응력' }, { c: 'C15', t: '초적응력' }] },
      { bar: '공격', red: true, fields: [{ c: 'C17', t: '크리티컬 확률' }, { c: 'C18', t: '크리티컬 데미지' }, { c: 'C19', t: '극대화' },
        { c: 'C20', t: '양극화 : 타격/피격 데미지 증가' }, { c: 'C21', t: '보스에게 주는 피해 증가' }, { c: 'C22', t: '공격시 추가 지속 피해' }] },
      { sub: '체력 조건 데미지 증가', single: true, fields: [{ c: 'C24', t: '체력 50% 초과인 적 공격시 데미지 증가', plain: true },
        { c: 'C25', t: '체력 50% 이하인 적 공격시 데미지 증가', plain: true }, { c: 'C26', t: '체력 100% 이하인 적 공격시 데미지 증가', plain: true }] },
      { bar: '스킬', red: true, fields: [{ c: 'C29', t: '강렬한 스킬 데미지 증가' }, { c: 'C30', t: '초월한 스킬 데미지 증가' },
        { c: 'C31', t: '강렬한 스킬 재사용 시간 감소' }, { c: 'C32', t: '초월한 스킬 재사용 시간 감소' },
        { c: 'C33', t: '모든 스킬 데미지 증가' }, { c: 'C34', t: '스킬 사용시 재사용 시간 초기화 확률' }] },
      { bar: '보조', fields: [{ c: 'C35', t: '동작속도' }] },
      { bar: '창에 없는 값', note: '상세 스탯 창에 안 나와서 직접 입력해요', single: true, fields: [{ c: 'C12', lab: 'B12' }, { c: 'C13', lab: 'B13' }, { c: 'C27', t: '테네브로스 3옵 (HP n% 이하 적에게 n% 데미지)' }] },
    ] },
    { id: 'buff', name: '버프와 아이템', groups: [
      { bar: '파티 버프', note: '파티원 것 말고 본인이 입은 아이템 효과만', fields: [{ c: 'H11', lab: 'D11' }, { c: 'H12', lab: 'D12' }, { c: 'H13', lab: 'D13' }] },
      { bar: '펫', note: '포만도 80% 이상, 친밀도 100%일 때 특별한 격려 효과', fields: [{ c: 'H15', lab: 'D15' }, { c: 'H16', lab: 'D16' }] },
      { bar: '비전의 원석', fields: [[{ c: 'F17' }, { c: 'H17' }], [{ c: 'F18' }, { c: 'H18' }]] },
      { bar: '금빛 각인석', fields: [[{ c: 'D20' }, { c: 'H20' }], [{ c: 'D21' }, { c: 'H21' }], [{ c: 'D22' }, { c: 'H22' }]] },
      { bar: '칭호', fields: [{ c: 'G24', lab: 'D24' }, { c: 'G25', lab: 'D25' }] },
      { bar: '일반 악세서리', note: '버프형 아이템', fields: [{ c: 'G27', t: '얼굴 상단' }, { c: 'G28', t: '얼굴 하단' }, { c: 'G29', t: '반지' }, { c: 'G30', t: '귀걸이' }] },
      { bar: '카트리지', fields: [{ c: 'H31', lab: 'D31' }, { c: 'H32', lab: 'D32' }, { c: 'H33', lab: 'D33' }] },
      { bar: '아티팩트', fields: [[{ c: 'D35' }, { c: 'G35' }]] },
    ] },
    { id: 'gear', name: '스킬과 장비', groups: [
      { bar: '캐릭터 버프 스킬', fields: [{ c: 'L11', lab: 'I11' }, { c: 'L12', lab: 'I12' }, { c: 'L13', lab: 'I13' }, { c: 'L14', lab: 'I14' }, { c: 'L15', lab: 'I15' }] },
      { bar: '도핑', fields: [{ c: 'J17', lab: 'I17' }, { c: 'J18', lab: 'I18' }, { c: 'J19', lab: 'I19' }, { c: 'J20', lab: 'I20' }, { c: 'J21', lab: 'I21' }, { c: 'J22', lab: 'I22' }, { c: 'J23', lab: 'I23' }] },
      { bar: '장비 종류와 강화', fields: [[{ c: 'J26', lab: 'I26' }, { c: 'L26' }], [{ c: 'J27', lab: 'I27' }, { c: 'L27' }], [{ c: 'J28', lab: 'I28' }, { c: 'L28' }], [{ c: 'J29', lab: 'I29' }, { c: 'L29' }],
        [{ c: 'J31', lab: 'I31' }, { c: 'L31' }], [{ c: 'J32', lab: 'I32' }, { c: 'L32' }], { c: 'J30', t: '방어구 세트 효과' }] },
      { bar: '전투력 출력 기준 필드', fields: [{ c: 'I34', t: '필드' }], extra: 'field' },
    ] },
    { id: 'share', name: '점유율', groups: [
      { bar: '강렬 : 초월 스킬 점유율', note: '기본값을 쓰려면 체크를 끄세요. 비율만 맞춰도 돼요.', fields: [{ c: 'L42', lab: 'J42', k: 'check' }, { c: 'I46', t: '강렬 스킬 점유율', k: 'num' }, { c: 'K46', t: '초월 스킬 점유율', k: 'num' }, { c: 'M46', t: '기준' }], extra: 'share' },
    ] },
  ];

  // 검증 목록
  const DV = {};
  for (const d of M.validations) for (const a of d.cells) DV[a] = d;
  const g = (a) => { const v = wb.get(SH, a); return E.isErr(v) ? v.code : v; };
  const label = (a) => { const v = g(a); return v == null ? '' : String(v).trim(); };
  const defaultOf = (a) => { const d = M.sheets[SH][a]; return d && 'v' in d ? d.v : null; };
  function optionsOf(a) {
    const d = DV[a]; if (!d || d.type !== 'list') return null;
    if (d.options) return d.options;
    const r = wb.makeRange(d.source[0], d.source[1]); const m = wb.rangeValue(r);
    const vals = (m instanceof E.Matrix ? m.flat() : [m]).filter(v => v !== null && v !== '' && !E.isErr(v));
    return [...new Set(vals)];
  }
  const kindOf = (a, f) => f && f.k ? f.k : DV[a] && DV[a].type === 'list' ? 'select' : PCT.has(a) ? 'pct' : typeof defaultOf(a) === 'boolean' ? 'check' : 'num';

  // ---------- 상태 / 저장 ----------
  const LS = 'silcalc.v1';
  let store = { current: '내 캐릭터', profiles: { '내 캐릭터': {} } };
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.profiles) store = s; } catch (e) { /* 저장소 없음 */ }
  let inputs = Object.assign({}, store.profiles[store.current] || {});
  let dirty = false;
  function persist() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* 무시 */ } }
  function applyInputs() { wb.inputs = {}; for (const [a, v] of Object.entries(inputs)) wb.inputs[SH + '!' + a] = v; wb.invalidate(); }

  // ---------- 숫자 표시 ----------
  const fmtInt = (n) => typeof n === 'number' ? Math.round(n).toLocaleString('ko-KR') : String(n ?? '-');
  const fmtPct = (n, d = 2) => typeof n === 'number' ? (n * 100).toFixed(d) + '%' : String(n ?? '-');
  const pctIn = (n) => { if (typeof n !== 'number') return ''; const v = n * 100; return Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? v.toFixed(2) : String(+v.toFixed(4)); };
  function korUnit(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4);
    if (n < 1e4) return fmtInt(n);
    return ((eok ? eok.toLocaleString('ko-KR') + '억 ' : '') + (man ? man.toLocaleString('ko-KR') + '만' : '')).trim();
  }

  // ---------- 폼 렌더 ----------
  const controls = {}; // cell -> {node, kind, labelNode, labelCell}
  function makeControl(a, f) {
    const k = kindOf(a, f);
    let node;
    if (k === 'select') {
      node = el('select', { 'data-cell': a, onchange: () => setVal(a, parseOpt(a, node.value)) });
    } else if (k === 'check') {
      node = el('input', { type: 'checkbox', 'data-cell': a, onchange: () => setVal(a, node.checked) });
    } else {
      node = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-cell': a, class: k === 'pct' ? 'pct' : 'num',
        oninput: () => { const v = parseNum(node.value, k); if (v !== null) { node.classList.remove('bad'); setVal(a, v); } else node.classList.add('bad'); },
        onblur: () => syncControl(a) });
    }
    const wrap = k === 'pct' ? el('span', { class: 'pctwrap' }, node, el('span', { class: 'suffix', text: '%' })) : node;
    controls[a] = { node, kind: k };
    return wrap;
  }
  function parseNum(s, k) {
    const t = String(s).replace(/[,\s%]/g, '');
    if (t === '' || t === '-' || t === '.') return null;
    const n = Number(t); if (!isFinite(n)) return null;
    return k === 'pct' ? +(n / 100).toFixed(8) : n;
  }
  function parseOpt(a, s) {
    const opts = optionsOf(a) || [];
    const hit = opts.find(o => String(o) === s);
    if (hit !== undefined) {
      if (typeof hit === 'string' && /^\d+$/.test(hit) && typeof defaultOf(a) === 'number') return Number(hit);
      return hit;
    }
    return s;
  }
  let activeTab = 'stat';
  try { activeTab = localStorage.getItem(LS + '.tab') || 'stat'; } catch (e) { /* 무시 */ }
  function fieldRow(spec) {
    if (spec.spacer) return el('div', { class: 'srow spacer', 'aria-hidden': 'true' });
    const fields = Array.isArray(spec) ? spec : [spec];
    const f0 = fields[0];
    const row = el('div', { class: 'srow' + (fields.length > 1 ? ' multi' : '') + (f0.plain ? ' plain' : '') });
    const labText = f0.t || (f0.lab ? label(f0.lab) : '');
    const lab = el('label', { class: 'lab', for: 'in-' + f0.c, 'data-labcell': f0.t ? null : (f0.lab || null) }, labText);
    if (labText) row.append(lab);
    const help = HELP[f0.c];
    if (help) row.append(el('details', { class: 'help' }, el('summary', { 'aria-label': '도움말', text: '?' }), el('p', { text: help })));
    const ctl = el('div', { class: 'ctl' });
    for (const f of fields) { ctl.append(makeControl(f.c, f)); controls[f.c].node.id = 'in-' + f.c; controls[f.c].row = row; }
    row.append(ctl);
    return row;
  }
  function renderForms() {
    const tabs = $('#tabs'), root = $('#forms');
    tabs.innerHTML = ''; root.innerHTML = '';
    // 전직 선택은 창 제목줄에
    const slot = $('#classSlot'); slot.innerHTML = ''; slot.append(makeControl('C6', {})); controls.C6.node.id = 'in-C6';
    for (const tab of TABS) {
      const btn = el('button', { class: 'tab', role: 'tab', id: 'tab-' + tab.id, 'aria-controls': 'pane-' + tab.id, text: tab.name,
        onclick: () => showTab(tab.id) });
      tabs.append(btn);
      const pane = el('div', { class: 'pane' + (tab.pairs ? ' pairs' : ' blocks'), role: 'tabpanel', id: 'pane-' + tab.id, 'aria-labelledby': 'tab-' + tab.id });
      for (const gr of tab.groups) {
        const g = el('div', { class: 'grp' + (gr.single ? ' single' : '') });
        if (gr.bar) g.append(el('div', { class: 'sbar' + (gr.red ? ' red' : '') }, gr.bar));
        if (gr.sub) g.append(el('div', { class: 'ssub' }, el('span', { class: 'star', 'aria-hidden': 'true', text: '★' }), gr.sub));
        if (gr.note) g.append(el('p', { class: 'gnote', text: gr.note }));
        const list = el('div', { class: 'rows' });
        for (const f of gr.fields) list.append(fieldRow(f));
        g.append(list);
        if (gr.extra === 'field') g.append(el('div', { class: 'extra', id: 'fieldInfo' }));
        if (gr.extra === 'share') g.append(el('div', { class: 'extra', id: 'shareInfo' }));
        pane.append(g);
      }
      root.append(pane);
    }
    showTab(TABS.some(t => t.id === activeTab) ? activeTab : 'stat');
  }
  function showTab(id) {
    activeTab = id; try { localStorage.setItem(LS + '.tab', id); } catch (e) { /* 무시 */ }
    for (const t of TABS) {
      const on = t.id === id;
      $('#tab-' + t.id).setAttribute('aria-selected', String(on)); $('#tab-' + t.id).tabIndex = on ? 0 : -1;
      $('#pane-' + t.id).hidden = !on;
    }
  }
  function fillSelect(node, a) {
    const opts = optionsOf(a) || [];
    const cur = g(a);
    const key = opts.join('\u0001');
    if (node._key !== key) {
      node.innerHTML = '';
      for (const o of opts) node.append(el('option', { value: String(o), text: typeof o === 'number' && PCT.has(a) ? fmtPct(o, 0) : String(o) }));
      node._key = key;
    }
    if (!opts.some(o => String(o) === String(cur))) {
      const ex = node.querySelector('option[data-extra]'); if (ex) ex.remove();
      node.append(el('option', { value: String(cur), text: String(cur ?? ''), 'data-extra': '1' }));
    }
    node.value = String(cur);
  }
  function syncControl(a) {
    const c = controls[a]; if (!c) return;
    const v = g(a);
    if (c.kind === 'select') fillSelect(c.node, a);
    else if (c.kind === 'check') c.node.checked = v === true;
    else if (document.activeElement !== c.node) { c.node.value = c.kind === 'pct' ? pctIn(v) : (typeof v === 'number' ? String(v) : ''); c.node.classList.remove('bad'); }
    if (c.row) c.row.classList.toggle('changed', a in inputs && String(inputs[a]) !== String(defaultOf(a)));
  }
  function syncLabels() {
    document.querySelectorAll('[data-labcell]').forEach(n => { const t = label(n.getAttribute('data-labcell')); if (n.textContent !== t) n.textContent = t; });
    for (const [a, c] of Object.entries(controls)) {
      if (c.row && /^L1[1-4]$/.test(a)) c.row.classList.toggle('muted', label('I' + a.slice(1)) === '관련스킬 없음');
    }
  }

  // ---------- 값 변경 / 재계산 ----------
  let raf = 0;
  function setVal(a, v) {
    inputs[a] = v; dirty = true; wb.setInput(SH, a, v);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    scheduleAutosave();
  }
  let saveT = 0;
  function scheduleAutosave() { clearTimeout(saveT); saveT = setTimeout(() => { store.profiles[store.current] = Object.assign({}, inputs); persist(); dirty = false; updateSaveBtn(); }, 600); updateSaveBtn(); }
  function updateSaveBtn() { $('#btnSave').textContent = dirty ? '저장 중' : '저장됨'; }
  function refresh() {
    let err = null;
    try {
      syncLabels();
      for (const a of Object.keys(controls)) syncControl(a);
      renderResults();
    } catch (e) { err = e; console.error(e); }
    $('#rCP').classList.toggle('err', !!err);
    if (err) $('#rCP').textContent = '계산 오류';
  }
  function setText(id, t) { const n = $(id); if (n && n.textContent !== t) n.textContent = t; }
  function renderResults() {
    const cp = g('C36');
    setText('#rCP', typeof cp === 'number' ? fmtInt(cp) : String(cp));
    setText('#rCPk', korUnit(cp));
    setText('#rClass', label('C6') + ' (' + label('AC67') + ')');
    fillSelect($('#selP12'), 'P12'); fillSelect($('#selQ15'), 'Q15');
    const y = g('Y12'), z = g('Z15');
    setText('#rY12', typeof y === 'number' ? y.toFixed(2) : String(y));
    setText('#rZ15', typeof z === 'number' ? fmtPct(z) : String(z));
    setText('#rAJ28', fmtPct(g('AJ28'))); setText('#rAJ29', fmtPct(g('AJ29')));
    setText('#rAG30', label('AG30')); setText('#rAJ30', fmtPct(g('AJ30'), 1));
    $('#rAG30').className = 'val ' + (label('AG30') === '가능' ? 'ok' : 'no');
    const fi = $('#fieldInfo'); if (fi) fi.textContent = `${label('K34')} ${fmtPct(g('L34'), 0)}, ${label('K35')} ${fmtPct(g('L35'), 0)} 적용 중`;
    const si = $('#shareInfo'); if (si) si.textContent = `기본값은 강렬 ${fmtPct(g('I45'), 0)}, 초월 ${fmtPct(g('K45'), 0)} (${label('M45')})`;
    renderRaid();
  }
  function renderRaid() {
    const root = $('#raid');
    const blocks = [['S', 18], ['V', 18], ['Y', 18], ['S', 25], ['V', 25], ['Y', 25]];
    if (!root._built) {
      root.innerHTML = '';
      for (const [c, r] of blocks) {
        const sel = el('select', { 'data-cell': c + r, 'aria-label': '던전 선택', onchange: (e) => setVal(c + r, e.target.value) });
        root.append(el('div', { class: 'raid-item' }, sel,
          el('div', { class: 'raid-vals' },
            el('span', {}, '실질 체력 ', el('b', { 'data-out': c + (r + 1) }), '억'),
            el('span', {}, '10분컷 ', el('b', { 'data-out': c + (r + 3) })),
            el('span', { class: 'time' }, el('b', { 'data-out': c + (r + 5) })))));
      }
      root._built = true;
    }
    root.querySelectorAll('select[data-cell]').forEach(s => fillSelect(s, s.getAttribute('data-cell')));
    const cp = g('C36');
    root.querySelectorAll('[data-out]').forEach(n => {
      const a = n.getAttribute('data-out'), v = g(a), row = +a.slice(1);
      let t;
      if (row === 19 || row === 26) t = typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : String(v ?? '-');
      else if (row === 21 || row === 28) { t = typeof v === 'number' ? korUnit(v) || fmtInt(v) : String(v ?? '-'); n.classList.toggle('ok', typeof cp === 'number' && typeof v === 'number' && cp >= v); n.classList.toggle('no', typeof cp === 'number' && typeof v === 'number' && cp < v); }
      else t = String(v ?? '-').replace('분 소요 예상', '분 예상');
      if (n.textContent !== t) n.textContent = t;
    });
  }

  // ---------- 프로필 ----------
  function renderProfiles() {
    const s = $('#profileSel'); s.innerHTML = '';
    for (const name of Object.keys(store.profiles)) s.append(el('option', { value: name, text: name }));
    s.value = store.current;
  }
  function loadProfile(name) {
    store.current = name; inputs = Object.assign({}, store.profiles[name] || {}); persist();
    applyInputs(); renderProfiles(); refresh(); dirty = false; updateSaveBtn();
  }
  function dialog({ title, text, input, area, ok = '확인', danger }) {
    return new Promise((resolve) => {
      const d = $('#dialog'); d.hidden = false;
      $('#dlgTitle').textContent = title; $('#dlgText').textContent = text || '';
      const inp = $('#dlgInput'), ar = $('#dlgArea');
      inp.hidden = input === undefined; ar.hidden = area === undefined;
      if (input !== undefined) { inp.value = input; setTimeout(() => inp.focus(), 0); }
      if (area !== undefined) { ar.value = area; ar.readOnly = false; }
      const okB = $('#dlgOk'); okB.textContent = ok; okB.classList.toggle('danger', !!danger);
      const done = (v) => { d.hidden = true; okB.onclick = null; $('#dlgCancel').onclick = null; resolve(v); };
      okB.onclick = () => done(input !== undefined ? inp.value : area !== undefined ? ar.value : true);
      $('#dlgCancel').onclick = () => done(null);
    });
  }
  function wireProfiles() {
    $('#profileSel').onchange = (e) => loadProfile(e.target.value);
    $('#btnSave').onclick = () => { store.profiles[store.current] = Object.assign({}, inputs); persist(); dirty = false; updateSaveBtn(); };
    $('#btnNew').onclick = async () => {
      const name = (await dialog({ title: '새 캐릭터', text: '이름을 입력하세요. 예시 값에서 시작해요.', input: '' }) || '').trim();
      if (!name) return; if (!store.profiles[name]) store.profiles[name] = {}; loadProfile(name);
    };
    const menu = $('#moreMenu');
    $('#btnMore').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#btnMore').setAttribute('aria-expanded', String(!menu.hidden)); };
    document.addEventListener('click', () => { menu.hidden = true; });
    $('#btnRename').onclick = async () => {
      const name = (await dialog({ title: '이름 바꾸기', input: store.current }) || '').trim();
      if (!name || name === store.current) return;
      store.profiles[name] = store.profiles[store.current]; delete store.profiles[store.current]; loadProfile(name);
    };
    $('#btnExport').onclick = async () => {
      const txt = JSON.stringify({ app: 'silcalc', version: M.meta.version, name: store.current, inputs });
      let copied = false; try { await navigator.clipboard.writeText(txt); copied = true; } catch (e) { /* 막힘 */ }
      await dialog({ title: '설정 내보내기', text: copied ? '클립보드에 복사했어요. 아래 내용을 저장해 두거나 다른 기기에 붙여넣으세요.' : '아래 내용을 복사해 두세요.', area: txt, ok: '닫기' });
    };
    $('#btnImport').onclick = async () => {
      const txt = await dialog({ title: '설정 가져오기', text: '내보내기로 복사한 내용을 붙여넣으세요. 현재 캐릭터에 덮어써요.', area: '' });
      if (!txt) return;
      try { const o = JSON.parse(txt); if (!o.inputs) throw 0; inputs = o.inputs; store.profiles[store.current] = Object.assign({}, inputs); persist(); applyInputs(); refresh(); }
      catch (e) { await dialog({ title: '가져오기 실패', text: '형식이 올바르지 않아요.', ok: '닫기' }); }
    };
    $('#btnReset').onclick = async () => {
      if (!(await dialog({ title: '예시 값으로 되돌리기', text: '현재 캐릭터의 입력을 모두 지우고 시트 예시 값으로 돌아가요.', ok: '되돌리기', danger: true }))) return;
      inputs = {}; store.profiles[store.current] = {}; persist(); applyInputs(); refresh();
    };
    $('#btnDelete').onclick = async () => {
      if (Object.keys(store.profiles).length <= 1) { await dialog({ title: '삭제할 수 없어요', text: '캐릭터가 하나뿐이에요.', ok: '닫기' }); return; }
      if (!(await dialog({ title: '캐릭터 삭제', text: `"${store.current}"을(를) 삭제할까요?`, ok: '삭제', danger: true }))) return;
      delete store.profiles[store.current]; loadProfile(Object.keys(store.profiles)[0]);
    };
  }

  // ---------- 화면인식 ----------
  let shot = null, selRect = null, drawSel = () => {};
  const canvas = $('#shot');
  function showShot(c) {
    shot = c; selRect = null;
    canvas.width = c.width; canvas.height = c.height; canvas.getContext('2d').drawImage(c, 0, 0);
    $('#stage').hidden = false; $('#sel').hidden = true; $('#ocrResult').hidden = true;
    $('#stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function wireSelection() {
    const sel = $('#sel'); let start = null;
    drawSel = () => draw();
    const toImg = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height, r }; };
    const draw = () => {
      if (!selRect) { sel.hidden = true; return; }
      const r = canvas.getBoundingClientRect(), k = r.width / canvas.width;
      Object.assign(sel.style, { left: selRect.x * k + 'px', top: selRect.y * k + 'px', width: selRect.w * k + 'px', height: selRect.h * k + 'px' });
      sel.hidden = false;
    };
    canvas.addEventListener('pointerdown', (e) => { start = toImg(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!start) return; const p = toImg(e);
      selRect = { x: Math.max(0, Math.min(start.x, p.x)), y: Math.max(0, Math.min(start.y, p.y)), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      draw();
    });
    canvas.addEventListener('pointerup', () => { start = null; if (selRect && (selRect.w < 20 || selRect.h < 20)) selRect = null; draw(); });
    window.addEventListener('resize', draw);
    $('#btnSelAll').onclick = () => { selRect = null; draw(); };
  }
  function shareMsg(t) { const n = $('#shareMsg'); n.hidden = !t; n.textContent = t || ''; }
  function wireCapture() {
    const canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (!canShare) $('#btnShare').hidden = true;
    const setSharing = (on) => { $('#btnShare').hidden = on || !canShare; $('#btnGrab').hidden = !on; $('#btnStop').hidden = !on; };
    $('#btnShare').onclick = async () => {
      shareMsg('');
      try { await O.startShare(); setSharing(true); showShot(await O.grabFrame()); shareMsg('공유 중이에요. 게임에서 상세 스탯 창을 열고 "지금 캡처"를 누르세요.'); }
      catch (e) {
        setSharing(false);
        if (e && e.name === 'NotAllowedError' && !/denied by user|Permission denied$/i.test(e.message || '')) shareMsg('이 주소에서는 화면 공유가 막혀 있어요. PrtSc로 찍은 스크린샷을 Ctrl+V로 붙여넣어 주세요.');
        else shareMsg(e && e.name === 'NotAllowedError' ? '화면 공유가 취소됐어요.' : '화면 공유를 시작할 수 없어요: ' + (e.message || e));
      }
    };
    $('#btnGrab').onclick = async () => { try { showShot(await O.grabFrame()); } catch (e) { shareMsg(e.message); setSharing(false); } };
    $('#btnStop').onclick = () => { O.stopShare(); setSharing(false); shareMsg(''); };
    window.addEventListener('sil-share-ended', () => { setSharing(false); });
    $('#fileIn').onchange = async (e) => { const f = e.target.files[0]; if (f) showShot(await O.imageFromBlob(f)); e.target.value = ''; };
    document.addEventListener('paste', async (e) => {
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (it) { e.preventDefault(); showShot(await O.imageFromBlob(it.getAsFile())); }
    });
    const card = $('#ocrCard');
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop'));
    card.addEventListener('drop', async (e) => { e.preventDefault(); card.classList.remove('drop'); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) showShot(await O.imageFromBlob(f)); });
    $('#btnOcr').onclick = runOcr;
    $('#btnApply').onclick = applyOcr;
    $('#btnOcrAll').onclick = () => { const boxes = [...document.querySelectorAll('#ocrBody input[type=checkbox]')]; const all = boxes.every(b => b.checked); boxes.forEach(b => { b.checked = !all; }); };
  }
  const STEP = { 'loading tesseract core': '엔진 불러오는 중', 'initializing tesseract': '엔진 준비 중', 'loading language traineddata': '글자 데이터 불러오는 중', 'initializing api': '준비 중', 'recognizing text': '글자 읽는 중' };
  async function runOcr() {
    if (!shot) return;
    const prog = $('#ocrProg'), bar = prog.querySelector('.bar'), pt = prog.querySelector('.ptext');
    prog.hidden = false; $('#btnOcr').disabled = true; bar.style.width = '5%'; pt.textContent = '이미지 다듬는 중';
    try {
      const res = await O.recognize(shot, selRect, (m) => {
        if (m.status) pt.textContent = (STEP[m.status] || m.status) + (m.tag === 'eng' ? ' (숫자)' : '');
        if (typeof m.progress === 'number' && m.tag === 'kor') bar.style.width = Math.round(5 + m.progress * 95) + '%';
      });
      if (res.auto && res.rect) { selRect = res.rect; drawSel(); }
      let gear = null;
      try { if (window.SilGear) { pt.textContent = '악세서리 아이콘 보는 중'; gear = window.SilGear.recognize(shot); } } catch (e) { console.error(e); }
      showOcrResult(res, gear);
    } catch (e) {
      console.error(e); pt.textContent = '인식 실패: ' + (e.message || e);
      return;
    } finally { $('#btnOcr').disabled = false; }
    prog.hidden = true;
  }
  const LABEL_OF = {}; for (const t of TABS) for (const gr of t.groups) for (const f of gr.fields.flat()) if (f.t && f.c) LABEL_OF[f.c] = f.t;
  function showOcrResult(res, gear) {
    const body = $('#ocrBody'); body.innerHTML = '';
    const found = res.found; const cells = O.FIELDS.map(f => f.cell).filter(c => found[c]);
    $('#ocrCount').textContent = cells.length ? `${cells.length}개 항목을 읽었어요` + (res.auto ? ' (노란 틀이 찾은 창)' : '') : '항목을 못 찾았어요. 상세 스탯 창만 드래그로 골라서 다시 해 보세요.';
    for (const c of cells) {
      const f = found[c], kind = PCT.has(c) ? 'pct' : 'num';
      const cur = g(c);
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: kind === 'pct' ? pctIn(f.value) : String(f.value), 'data-cell': c, class: kind });
      const same = typeof cur === 'number' && Math.abs(cur - f.value) < 1e-9;
      const low = f.score < 0.8;
      body.append(el('tr', { class: (same ? 'same' : '') + (low ? ' low' : '') },
        el('td', {}, el('input', { type: 'checkbox', checked: same ? null : 'checked', 'aria-label': '적용' })),
        el('td', { text: LABEL_OF[c] || label('B' + c.slice(1)) }, low ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null),
        el('td', { class: 'num dim', text: kind === 'pct' ? fmtPct(cur) : fmtInt(cur) }),
        el('td', {}, kind === 'pct' ? el('span', { class: 'pctwrap' }, inp, el('span', { class: 'suffix', text: '%' })) : inp)));
    }
    if (gear) showGearRows(gear);
    else lastGear = null;
    const gearN = body.querySelectorAll('tr.gear-row:not(.none):not(.cls-row)').length;
    if (gear && gear.cls && gear.cls.match) $('#ocrCount').textContent += ', 전직';
    if (gearN) $('#ocrCount').textContent += `, 악세서리 ${gearN}개`;
    $('#ocrRaw').textContent = res.rows.map(r => r.text).join('\n');
    $('#ocrResult').hidden = false;
  }

  // ---------- 일반 악세서리(아이콘) ----------
  const GEAR_CELLS = ['G27', 'G28', 'G29', 'G30'];
  const GEAR_NAME = { G27: '얼굴 상단', G28: '얼굴 하단', G29: '반지', G30: '귀걸이' };
  const IRRELEVANT = '(계산에 안 쓰는 아이템)';
  function gearOptions() {
    const m = {}; for (const c of GEAR_CELLS) for (const o of optionsOf(c) || []) if (o !== '해당사항 없음') m[o] = c;
    return m;
  }
  let lastGear = null;
  function showGearRows(gear) {
    lastGear = gear;
    const body = $('#ocrBody'); body.querySelectorAll('.gear-row, .gear-head, .gear-unknown').forEach(n => n.remove());
    const cat = gearOptions();
    const pick = {};
    for (const c of gear.cells) {
      if (!c.match || !cat[c.match.name]) continue;
      const k = cat[c.match.name];
      if (!pick[k] || c.match.d < pick[k].match.d) pick[k] = c;
    }
    if (gear.cls) {
      const c = gear.cls, cur = g('C6');
      body.append(el('tr', { class: 'gear-head' }, el('td', { colspan: '4' }, '전직 (장비창 초상화)')));
      const sel = el('select', { 'data-cell': 'C6', 'aria-label': '전직' });
      sel.append(el('option', { value: '', text: c.match ? '' : '이 캐릭터의 전직은?' }));
      for (const o of optionsOf('C6') || []) sel.append(el('option', { value: String(o), text: String(o) }));
      sel.value = c.match ? c.match.name : '';
      const cb = el('input', { type: 'checkbox', 'aria-label': '적용' });
      const same = c.match && String(cur) === c.match.name;
      cb.checked = !!(c.match && !c.match.guess && !same);
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        if (!c.match || c.match.name !== sel.value) { window.SilGear.teachFrom(shot, c, sel.value, 'cls'); c.match = { name: sel.value, d: 0 }; }
        cb.checked = String(g('C6')) !== sel.value;
      });
      const tag = !c.match ? el('small', { class: 'lowtag', text: ' 처음 보는 초상화' }) : c.match.guess ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null;
      body.append(el('tr', { class: 'gear-row cls-row' + (same ? ' same' : '') },
        el('td', {}, cb),
        el('td', {}, '전직', tag),
        el('td', { class: 'dim', text: String(cur ?? '') }),
        el('td', { class: 'gear-pick' }, el('img', { class: 'gear-ico cls', src: c.thumb, alt: '', width: '36', height: '36' }), sel)));
      if (!c.match) body.append(el('tr', { class: 'gear-unknown' }, el('td', { colspan: '4' },
        el('p', { class: 'hint', text: '처음 보는 초상화예요. 전직을 한 번 골라주면 이 브라우저가 다음부터 알아봐요.' }))));
    }
    body.append(el('tr', { class: 'gear-head' }, el('td', { colspan: '4' }, '일반 악세서리 (장비창 아이콘)')));
    for (const k of GEAR_CELLS) {
      const c = pick[k], cur = g(k);
      const sel = el('select', { 'data-cell': k, 'aria-label': GEAR_NAME[k] });
      for (const o of optionsOf(k) || []) sel.append(el('option', { value: String(o), text: String(o) }));
      sel.value = c ? c.match.name : '해당사항 없음';
      const same = String(cur) === sel.value;
      const guess = c && c.match.guess;
      const thumb = c ? el('img', { class: 'gear-ico', src: c.thumb, alt: '', width: '28', height: '28' }) : el('span', { class: 'gear-ico none' });
      body.append(el('tr', { class: 'gear-row' + (same ? ' same' : '') + (c ? '' : ' none') + (guess ? ' low' : '') },
        el('td', {}, el('input', { type: 'checkbox', checked: !same && c && !guess ? 'checked' : null, 'aria-label': '적용' })),
        el('td', {}, GEAR_NAME[k], c ? (guess ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null) : el('small', { class: 'lowtag', text: ' 못 찾음' })),
        el('td', { class: 'dim', text: String(cur ?? '') }),
        el('td', { class: 'gear-pick' }, thumb, sel)));
    }
    const unknown = gear.cells.filter(c => !c.match);
    if (unknown.length) {
      const opts = [''].concat(Object.keys(cat), [IRRELEVANT]);
      const wrap = el('div', { class: 'unk-list' });
      for (const c of unknown) {
        const sel = el('select', { 'aria-label': '이 아이콘은?', onchange: (e) => {
          const v = e.target.value; if (!v) return;
          window.SilGear.teachFrom(shot, c, v, 'acc'); c.match = { name: v, d: 0 };
          showGearRows(lastGear);
        } });
        for (const o of opts) sel.append(el('option', { value: o, text: o || '이 아이콘은?' }));
        wrap.append(el('div', { class: 'unk' }, el('img', { src: c.thumb, alt: c.slot + ' 칸 아이콘', width: '36', height: '36' }), sel));
      }
      body.append(el('tr', { class: 'gear-unknown' }, el('td', { colspan: '4' },
        el('p', { class: 'hint', text: `모르는 아이콘 ${unknown.length}개. 알려주면 이 브라우저가 기억해요. 계산에 쓰는 아이템이 아니면 그냥 두세요.` }), wrap)));
    }
  }
  function applyOcr() {
    let n = 0;
    document.querySelectorAll('#ocrBody tr').forEach(tr => {
      const cb = tr.querySelector('input[type=checkbox]'), inp = tr.querySelector('[data-cell]');
      if (!cb || !inp || !cb.checked) return;
      const c = inp.getAttribute('data-cell');
      if (inp.tagName === 'SELECT') { if (inp.value) { inputs[c] = inp.value; n++; } return; }
      const v = parseNum(inp.value, PCT.has(c) ? 'pct' : 'num');
      if (v !== null) { inputs[c] = v; n++; }
    });
    applyInputs(); refresh(); scheduleAutosave(); dirty = true;
    $('#ocrCount').textContent = `${n}개 값을 적용했어요`;
    document.querySelectorAll('#ocrBody tr').forEach(tr => tr.classList.add('applied'));
  }

  // ---------- 시작 ----------
  function selfTest() {
    const t = new E.Workbook(M); const v = t.get(SH, 'C36'); const exp = M.check['<Main>!C36'];
    const ok = typeof v === 'number' && Math.abs(v - exp) < 1e-6 * Math.abs(exp);
    $('#selfTest').textContent = ok ? `시트 ${M.meta.version}의 수식 ${M.meta.formulas.toLocaleString()}개를 쓰고, 시트 예시 값과 같은 결과가 나오는 걸 확인했어요.` : '시트 예시 값과 계산 결과가 달라요. 제보해 주세요.';
  }
  $('#ver').textContent = M.meta.version;
  applyInputs();
  renderForms(); renderProfiles(); wireProfiles(); wireSelection(); wireCapture();
  ['#selP12', '#selQ15'].forEach(s => $(s).addEventListener('change', (e) => setVal(e.target.getAttribute('data-cell'), e.target.value)));
  refresh(); dirty = false; updateSaveBtn();
  selfTest();
})();
