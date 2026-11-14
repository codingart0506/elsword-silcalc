/* 실투력 계산기 화면 로직 */
(function () {
  'use strict';
  const E = window.SilEngine, O = window.SilOCR, M = window.SIL_MODEL;
  const SH = '<Main>';
  // 원본 시트의 'Items Simulator'(상세스펙 시뮬레이터)에만 있던 피시방 버프·지애 버프를 메인 입력처럼 쓰게 함
  // 피시방 버프·에너지드링크·지애 버프는 켜고 끄는 체크칸: <Main>!ZB1(피방벞), ZB3(에너지드링크), ZB2(지애벞)
  // <교체 정보>의 '메인기준' 체크칸(HE14~HE17, HM14·HM21)이 이 값을 보게 연결. 랜미벞(HM15~HM20)은 안 씀
  const EXTRA_BUFF = { ZB1: '피시방 버프', ZB3: '에너지드링크', ZB2: '지애 버프' };
  if (!M.sheets[SH].ZB1) {
    const S = M.sheets['<교체 정보>'], Z = (c) => `'<Main>'!$ZB$${c.slice(2)}`;
    for (const c of Object.keys(EXTRA_BUFF)) M.sheets[SH][c] = { v: false };
    S.HE14 = { f: `AND(${Z('ZB1')}=TRUE,${Z('ZB3')}<>TRUE)` };
    S.HE15 = { f: `AND(${Z('ZB1')}<>TRUE,${Z('ZB3')}=TRUE)` };
    S.HE16 = { f: `AND(${Z('ZB1')}=TRUE,${Z('ZB3')}=TRUE)` };
    S.HE17 = { f: `AND(${Z('ZB1')}<>TRUE,${Z('ZB3')}<>TRUE)` };
    S.HM14 = { f: `${Z('ZB2')}=TRUE` };
    S.HM21 = { f: `${Z('ZB2')}<>TRUE` };
  }
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
    ZB1: '최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    ZB3: '피시방 에너지드링크(가동 중일 때): 크리·극대 5%, 최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    ZB2: '최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    L15: '스피릿 챌린저는 "미사용" 선택',
    J21: '적용1-녹테네: 팟모스뎀·팟크뎀 10% / 적용2-녹엑사: 팟모스뎀·팟물마 10% / 적용3-적청엑사: 팟크뎀 10%. 녹힐 직업(디우스 아에르, 일천, 오버마인드, 데메르시오, 블루헨, 라디언트 소울, 닉스 피에타, 애버리스)은 직업을 고르면 적용3-적청엑사로 바뀌어요.',
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
    { id: 'buff', name: '버프·아이템', groups: [
      { bar: '파티 버프', note: '파티원 것 말고 본인이 입은 아이템 효과만', fields: [{ c: 'H11', lab: 'D11' }, { c: 'H12', lab: 'D12' }, { c: 'H13', lab: 'D13' }] },
      { bar: '펫', note: '포만도 80% 이상, 친밀도 100%일 때 특별한 격려 효과', fields: [{ c: 'H15', lab: 'D15' }, { c: 'H16', lab: 'D16' }] },
      { bar: '비전의 원석', fields: [[{ c: 'F17' }, { c: 'H17' }], [{ c: 'F18' }, { c: 'H18' }]] },
      { bar: '금빛 각인석', fields: [[{ c: 'D20' }, { c: 'H20' }], [{ c: 'D21' }, { c: 'H21' }], [{ c: 'D22' }, { c: 'H22' }]] },
      { bar: '칭호', fields: [{ c: 'G24', lab: 'D24' }, { c: 'G25', lab: 'D25' }] },
      { bar: '일반 악세서리', note: '버프형 아이템', fields: [{ c: 'G27', t: '얼굴 상단' }, { c: 'G28', t: '얼굴 하단' }, { c: 'G29', t: '반지' }, { c: 'G30', t: '귀걸이' }] },
      { bar: '카트리지', fields: [{ c: 'H31', lab: 'D31' }, { c: 'H32', lab: 'D32' }, { c: 'H33', lab: 'D33' }] },
      { bar: '아티팩트', fields: [[{ c: 'D35' }, { c: 'G35' }]] },
    ] },
    { id: 'gear', name: '스킬·장비', groups: [
      { bar: '캐릭터 버프 스킬', fields: [{ c: 'L11', lab: 'I11' }, { c: 'L12', lab: 'I12' }, { c: 'L13', lab: 'I13' }, { c: 'L14', lab: 'I14' }, { c: 'L15', lab: 'I15' }] },
      { bar: '도핑', fields: [{ c: 'J17', lab: 'I17' }, { c: 'J18', lab: 'I18' }, { c: 'J19', lab: 'I19' }, { c: 'J20', lab: 'I20' }, { c: 'J21', lab: 'I21' }, { c: 'J22', lab: 'I22' }, { c: 'J23', lab: 'I23' },
        { c: 'ZB1', t: '피시방 버프' }, { c: 'ZB3', t: '에너지드링크' }, { c: 'ZB2', t: '지애 버프' }] },
      { bar: '장비 종류와 강화', fields: [[{ c: 'J26', lab: 'I26' }, { c: 'L26' }], [{ c: 'J27', lab: 'I27' }, { c: 'L27' }], [{ c: 'J28', lab: 'I28' }, { c: 'L28' }], [{ c: 'J29', lab: 'I29' }, { c: 'L29' }],
        [{ c: 'J31', lab: 'I31' }, { c: 'L31' }], [{ c: 'J32', lab: 'I32' }, { c: 'L32' }], { c: 'J30', t: '방어구 세트 효과' }] },
      { bar: '전투력 출력 기준 필드', fields: [{ c: 'I34', t: '필드' }], extra: 'field' },
      { bar: '강렬:초월 스킬 점유율', note: '끄면 강렬·초월 스킬 데미지 중 높은 쪽을 주력으로 자동 계산해요. 켜면 아래 비율로 계산하고, 비율만 맞으면 돼요.',
        fields: [{ c: 'L42', t: '기준 변경하기' }, { c: 'M46', t: '기준' }, { c: 'I46', t: '강렬 스킬 점유율' }, { c: 'K46', t: '초월 스킬 점유율' }] },
    ] },
  ];

  // 검증 목록
  const DV = {};
  for (const d of M.validations) for (const a of d.cells) DV[a] = d;
  const g = (a) => { const v = wb.get(SH, a); return E.isErr(v) ? v.code : v; };
  const LABEL_FALLBACK = { B11: '공격력', B12: '공격력 극대화 범위 내 최댓값', B13: '무기 공격력 (스탯창 X)' };
  const label = (a) => { const v = g(a); if (v == null || v === '' || String(v).startsWith('#')) return LABEL_FALLBACK[a] || ''; return String(v).trim(); };
  const defaultOf = (a) => { const d = M.sheets[SH][a]; return d && 'v' in d ? d.v : null; };
  function optionsOf(a) {
    const d = DV[a]; if (!d || d.type !== 'list') return null;
    if (d.options) return d.options;
    const r = wb.makeRange(d.source[0], d.source[1]); const m = wb.rangeValue(r);
    const vals = (m instanceof E.Matrix ? m.flat() : [m]).filter(v => v !== null && v !== '' && !E.isErr(v));
    return [...new Set(vals)];
  }
  const kindOf = (a, f) => f && f.k ? f.k : DV[a] && DV[a].type === 'list' ? 'select' : PCT.has(a) ? 'pct' : typeof defaultOf(a) === 'boolean' ? 'check' : 'num';

  const CAN_LINK = !!window.SIL_CDN; // 링크 공유는 직접 호스팅판에서만 (Claude 링크는 주소 뒤 값을 못 넘김)
  // ---------- 처음 상태: 시트 예시 값 대신 빈 세팅 ----------
  const STAT_CELLS = 'C11 C12 C13 C14 C15 C17 C18 C19 C20 C21 C22 C24 C25 C26 C27 C29 C30 C31 C32 C33 C34 C35'.split(' ');
  const BLANK = Object.assign({ C6: '' }, Object.fromEntries(STAT_CELLS.map(a => [a, null])), {
    H11: 0.1, H12: 0, H13: 0, ZB1: false, ZB2: false, ZB3: false, H15: '사용', H16: '이상', F17: '격려 재사용 시간 감소', F18: '격려 재사용 시간 감소', H17: 0.15, H18: 0.15,
    D20: '물리 공격력 증가 (%)', D21: '크리티컬 데미지 증가 (%)', D22: '스킬 데미지 증가 (%)', H20: 0.05, H21: 0.05, H22: 0.05,
    G24: '미착용', G25: '미착용', G27: '해당사항 없음', G28: '해당사항 없음', G29: '해당사항 없음', G30: '해당사항 없음',
    H31: 0, H32: 0, H33: 0, D35: '황색', G35: '5세트',
    L11: '미사용', L12: '미사용', L13: '미사용', L14: '미사용', L15: '미사용',
    J17: '엘 하우스(강화)', J18: '천상의 디저트파티', J19: '사용', J20: '투지의 물약', J21: '적용2-녹엑사 (팟모스뎀, 팟물마 10%)', J22: '미적용', J23: '아리엘의 스페셜 기프트 마크',
    J26: '네블론', J27: '네블론', J28: '네블론', J29: '네블론', L26: 11, L27: 11, L28: 11, L29: 11, J30: '엑사&네블론 - 연산', J31: '사룡무', L31: 12, J32: '유수의 아트마', L32: '유니크',
  });
  const blank = () => Object.assign({}, BLANK);
  const isEmptySetting = (inp) => !inp.C6 || !(Number(inp.C11) > 0);

  // ---------- 상태 / 저장 ----------
  const LS = 'silcalc.v1';
  let store = { current: '내 캐릭터', profiles: { '내 캐릭터': blank() } };
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.profiles) store = s; } catch (e) { /* 저장소 없음 */ }
  // 예전 버전에서 손대지 않은 캐릭터(시트 예시 값)는 빈 세팅으로
  for (const [k, v] of Object.entries(store.profiles)) if (!v || !Object.keys(v).length) { store.profiles[k] = blank(); if (store.bases) delete store.bases[k]; }
  // 예전 기본값(각인 없음)이던 캐릭터는 기본 각인으로
  for (const v of Object.values(store.profiles)) if (v && v.D20 === '해당사항 없음' && v.D21 === '해당사항 없음' && v.D22 === '해당사항 없음' && v.H20 === '해당사항 없음') Object.assign(v, { D20: BLANK.D20, D21: BLANK.D21, D22: BLANK.D22, H20: 0.05, H21: 0.05, H22: 0.05 });
  if (!store.bases) store.bases = {};
  // 방어구 세트 효과 기본값을 '연산'으로 바꾼 뒤: 예전 기본값(해당사항 없음)이던 캐릭터도 한 번만 맞춰 줌
  if (!store.mig) store.mig = {};
  if (!store.mig.setFx) {
    for (const v of Object.values(store.profiles)) if (v && v.J30 === '해당사항 없음') v.J30 = BLANK.J30;
    for (const v of Object.values(store.bases)) if (v && v.J30 === '해당사항 없음') v.J30 = BLANK.J30;
    store.mig.setFx = 1;
  }
  // 녹힐 장비 버프 기본값을 '적용2(녹엑사)'로 바꾼 뒤: 예전 기본값(미적용)이던 캐릭터도 한 번만 맞춰 줌
  if (!store.mig.healFx) {
    for (const v of Object.values(store.profiles)) if (v && v.J21 === '미적용') v.J21 = BLANK.J21;
    for (const v of Object.values(store.bases)) if (v && v.J21 === '미적용') v.J21 = BLANK.J21;
    store.mig.healFx = 1;
  }
  // 녹힐 직업은 녹힐 장비 버프가 적용3(적청엑사), 나머지(딜러)는 적용2(녹엑사)
  const HEALERS = new Set(['디우스 아에르', '일천', '오버마인드', '데메르시오', '블루헨', '라디언트 소울', '닉스 피에타', '애버리스']);
  const HEAL_J21 = '적용3-적청엑사 (팟크뎀 10%)';
  if (!store.mig.sageFx) {
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) {
      if (!v || v.C6 !== '에테르 세이지') continue;
      if (v.J21 === '적용3-적청엑사 (팟크뎀 10%)') v.J21 = BLANK.J21;
      if (v.J30 === BLANK.J30) v.J30 = '엑사&네블론 - 순환';
    }
    store.mig.sageFx = 1;
  }
  // 기본값을 엔드 세팅(도핑·펫·원석·아티팩트·장비·아트마)으로 바꾼 뒤: 예전 기본값 그대로인 칸만 한 번 맞춰 줌
  if (!store.mig.preset1) {
    const OLD = { J17: '미사용', J18: '미사용', J19: '미사용', J20: '미사용', J23: '해당사항 없음', H15: '미사용' };
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) {
      if (!v) continue;
      for (const [c, o] of Object.entries(OLD)) if (v[c] === o || v[c] == null) v[c] = BLANK[c];
      if (v.H16 == null) v.H16 = BLANK.H16;
      for (const [f, h] of [['F17', 'H17'], ['F18', 'H18']]) if ((v[f] == null || v[f] === '해당사항 없음') && !(Number(v[h]) > 0)) { v[f] = BLANK[f]; v[h] = BLANK[h]; }
      if (v.D35 == null) { v.D35 = BLANK.D35; if (v.G35 == null || v.G35 === '1세트 또는 미착용') v.G35 = BLANK.G35; }
      for (const [t, l] of [['J26', 'L26'], ['J27', 'L27'], ['J28', 'L28'], ['J29', 'L29'], ['J31', 'L31']]) if (v[t] == null) { v[t] = BLANK[t]; if (!(Number(v[l]) > 0)) v[l] = BLANK[l]; }
      if ((v.J32 == null || v.J32 === '미적용') && (v.L32 == null || v.L32 === '미착용')) { v.J32 = BLANK.J32; v.L32 = BLANK.L32; }
      if (HEALERS.has(v.C6) && v.J21 === BLANK.J21) v.J21 = HEAL_J21;
    }
    store.mig.preset1 = 1;
  }
  // 에테르 세이지는 방어구 세트 기본값이 순환, 녹힐 직업은 복원
  const SAGE = '에테르 세이지', SET_CYCLE = '엑사&네블론 - 순환', SET_HEAL = '엑사&네블론 - 복원';
  const AZOTH = '로드 아조트';
  const setDefault = (cls) => HEALERS.has(cls) ? SET_HEAL : cls === SAGE ? SET_CYCLE : BLANK.J30;
  if (!store.mig.sage2) {
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) if (v && v.C6 === SAGE && v.J30 === BLANK.J30) v.J30 = SET_CYCLE;
    store.mig.sage2 = 1;
  }
  // 파티원 크뎀증: 엑사 연산·순환 세트를 입으면 10%가 기본(복원 등은 0)
  const partyCrit = (set) => /연산|순환/.test(String(set || '')) ? 0.1 : 0;
  if (!store.mig.pcrit10) {
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) if (v && !(Number(v.H11) > 0) && partyCrit(v.J30 ?? BLANK.J30) > 0) v.H11 = 0.1;
    store.mig.pcrit10 = 1;
  }
  // 예전 선택 상자 값(글자) → 체크칸(true/false): '피방 + 에너지드링크'는 두 칸 다, '지애 + 랜미'는 지애만
  for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) {
    if (!v) continue;
    if (typeof v.ZB1 === 'string') { const t = v.ZB1; v.ZB1 = /피방/.test(t); v.ZB3 = /에너지/.test(t); }
    if (typeof v.ZB2 === 'string') v.ZB2 = /지애/.test(v.ZB2);
  }
  if (!store.mig.azoth1) {
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) if (v && v.C6 === AZOTH && v.L11 !== '사용') v.L11 = '사용';
    store.mig.azoth1 = 1;
  }
  if (!store.mig.heal3) {
    for (const src of [store.profiles, store.bases]) for (const v of Object.values(src)) if (v && HEALERS.has(v.C6) && v.J30 === BLANK.J30) { v.J30 = SET_HEAL; if (Number(v.H11) === 0.1) v.H11 = 0; }
    store.mig.heal3 = 1;
  }
  // 강역강 체크가 잠깐 강렬·초월 스킬 데미지를 같게 만들던 버전의 흔적: 기준 세팅에 원래 값이 있으면 되돌리고, 강배·역강배를 같게
  if (!store.mig.eqFix) {
    for (const [k, v] of Object.entries(store.profiles)) {
      if (!v || !v._eq) continue;
      const b = store.bases[k];
      if (v.C29 != null && v.C29 === v.C30 && b && b.C29 != null && b.C30 != null && b.C29 !== b.C30 && Math.max(b.C29, b.C30) === v.C29) { v.C29 = b.C29; v.C30 = b.C30; }
      const m = Math.max(Number(v.C24) || 0, Number(v.C25) || 0); if (m > 0) v.C24 = v.C25 = m;
    }
    store.mig.eqFix = 1;
  }
  if (!store.names) store.names = {}; // 캐릭터별 닉네임(선택)
  const nickOf = (key) => (store.names[key] || '').trim();
  let inputs = Object.assign({}, store.profiles[store.current] || {});
  if (!store.bases[store.current]) store.bases[store.current] = Object.assign({}, inputs);
  // 기준 세팅을 따로 계산해서 지금 값과 비교 (공유 링크를 볼 때는 내 세팅이 기준)
  const baseWb = new E.Workbook(M);
  let shared = null; // { n: 이름, i: 입력값 }
  function applyBase() {
    const src = shared ? (store.profiles[store.current] || {}) : (store.bases[store.current] || {});
    baseWb.inputs = {}; for (const [a, v] of Object.entries(src)) baseWb.inputs[SH + '!' + a] = v; baseWb.invalidate();
  }
  applyBase();
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
        oninput: () => { if (node.value.trim() === '') { node.classList.remove('bad'); setVal(a, null); return; } const v = parseNum(node.value, k); if (v !== null) { node.classList.remove('bad'); setVal(a, v); } else node.classList.add('bad'); },
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
    // 직업에 따라 바뀌는 이름(I11 등)은 처음에 비어 있어도 자리를 둬야 나중에 이름이 채워짐
    if (labText || f0.lab) row.append(lab);
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
        if (gr.bar || gr.sub) g.append(el('p', { class: 'gtitle', text: gr.bar || gr.sub }));
        if (gr.note) g.append(el('p', { class: 'gnote', text: gr.note }));
        const list = el('div', { class: 'rows' });
        for (const f of gr.fields) list.append(fieldRow(f));
        g.append(list);
        if (gr.extra === 'field') g.append(el('div', { class: 'extra', id: 'fieldInfo' }));
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
  // 보기 글자를 짧게(값은 시트 그대로): 금빛 각인석 '물리 공격력 증가 (%)' → '물리 공격력 증가'
  function optText(a, o) {
    const s = String(o);
    if (/^D2[0-2]$/.test(a)) return s.replace(/\s*\(%\)$/, '').replace('보스에게 입히는 피해 증가', '보스 피해 증가');
    if (a === 'J21') return s.replace(/\s*\(.*\)$/, '');          // 효과는 ? 도움말에
    if (a === 'J32') return s.replace(/의\s*아트마$/, '');          // '유수의 아트마' → '유수'
    if (a === 'J30') return s.replace(/^엑사&네블론\s*-\s*/, '');    // '엑사&네블론 - 연산' → '연산'
    if (a === 'G35' && s === '1세트 또는 미착용') return '1세트·미착용';
    return s;
  }
  function fillSelect(node, a) {
    const opts = optionsOf(a) || [];
    const cur = g(a);
    const key = opts.join('\u0001');
    if (node._key !== key) {
      node.innerHTML = '';
      for (const o of opts) node.append(el('option', { value: String(o), text: typeof o === 'number' && PCT.has(a) ? fmtPct(o, 0) : optText(a, o) }));
      node._key = key;
    }
    if (!opts.some(o => String(o) === String(cur))) {
      const ex = node.querySelector('option[data-extra]'); if (ex) ex.remove();
      const empty = cur === null || cur === '' || E.isErr(cur);
      const o = el('option', { value: empty ? '' : String(cur), text: empty ? (a === 'C6' ? '전직을 고르세요' : '') : String(cur), 'data-extra': '1' });
      if (empty) node.prepend(o); else node.append(o);
      if (empty) { node.value = ''; return; }
    }
    node.value = String(cur);
  }
  function syncControl(a) {
    const c = controls[a]; if (!c) return;
    const v = g(a);
    if (c.kind === 'select') fillSelect(c.node, a);
    else if (c.kind === 'check') c.node.checked = v === true;
    else if (document.activeElement !== c.node) { const empty = v === null || (a in inputs && inputs[a] === null); c.node.value = empty ? '' : c.kind === 'pct' ? pctIn(v) : (typeof v === 'number' ? String(v) : ''); c.node.placeholder = c.kind === 'pct' ? '0.00' : '0'; c.node.classList.remove('bad'); }
    if (c.row) { const b = baseWb.get(SH, a); c.row.classList.toggle('changed', String(v) !== String(E.isErr(b) ? b.code : b)); }
  }
  function syncLabels() {
    document.querySelectorAll('[data-labcell]').forEach(n => { const t = label(n.getAttribute('data-labcell')); if (n.textContent !== t) n.textContent = t; });
    for (const [a, c] of Object.entries(controls)) {
      if (c.row && /^L1[1-4]$/.test(a)) { const t = label('I' + a.slice(1)); c.row.classList.toggle('muted', !t || t === '관련스킬 없음'); }
    }
  }

  // ---------- 값 변경 / 재계산 ----------
  let raf = 0;
  const ATK = ['물리 공격력 증가 (%)', '마법 공격력 증가 (%)'];
  function syncEngraveType() {
    const t = g('AC67'); if (t !== '물리' && t !== '마법') return false;
    const want = t === '마법' ? ATK[1] : ATK[0]; let ch = false;
    for (const a of ['D20', 'D21', 'D22']) if (ATK.includes(inputs[a]) && inputs[a] !== want) { inputs[a] = want; wb.setInput(SH, a, want); ch = true; }
    return ch;
  }
  // 직업이 바뀔 때 직업별 기본값으로 (다른 값을 직접 골라 둔 경우는 그대로)
  //  - 녹힐 직업: 녹힐 장비 버프 적용3, 딜러: 적용2
  //  - 에테르 세이지: 방어구 세트 순환, 나머지: 연산
  function syncClassDefault(prev) {
    const now = inputs.C6; if (now === prev) return false;
    let ch = false;
    const swap = (c, on, val, base) => { const want = on ? val : base, other = on ? base : val; if (inputs[c] === other) { inputs[c] = want; wb.setInput(SH, c, want); ch = true; } };
    if (HEALERS.has(now) !== HEALERS.has(prev) || !prev) swap('J21', HEALERS.has(now), HEAL_J21, BLANK.J21);
    // 방어구 세트: 지금 값이 이전 직업의 기본값일 때만 새 직업 기본값으로
    const wantSet = setDefault(now);
    if (inputs.J30 !== wantSet && (inputs.J30 === setDefault(prev) || inputs.J30 == null)) { const old = inputs.J30; inputs.J30 = wantSet; wb.setInput(SH, 'J30', wantSet); syncPartyCrit(old); ch = true; }
    // 로드 아조트는 미스틱 플라스크(첫 번째 버프 스킬)를 기본으로 사용, 다른 직업으로 바꾸면 다시 미사용
    const put = (c, v) => { if (inputs[c] !== v) { inputs[c] = v; wb.setInput(SH, c, v); ch = true; } };
    if (now === AZOTH) put('L11', '사용');
    else if (prev === AZOTH && inputs.L11 === '사용') put('L11', '미사용');
    return ch;
  }
  // 강배·역강배 바지: 강배(체력 50% 초과인 적 공격시 데미지 증가)와 역강배(체력 50% 이하인 적 공격시 데미지 증가)를 높은 쪽으로 같게
  function syncEq() {
    if (!inputs._eq) return false;
    const a = Number(inputs.C24) || 0, b = Number(inputs.C25) || 0, m = Math.max(a, b);
    if (!(m > 0) || (a === m && b === m)) return false;
    inputs.C24 = inputs.C25 = m; wb.setInput(SH, 'C24', m); wb.setInput(SH, 'C25', m); return true;
  }
  // 세트를 바꾸면 파티원 크뎀증도 그 세트 기본값으로(이전 세트 기본값 그대로일 때만)
  function syncPartyCrit(oldSet) {
    const want = partyCrit(inputs.J30), was = partyCrit(oldSet);
    if (want === was) return;
    const cur = inputs.H11 == null ? 0 : Number(inputs.H11);
    if (cur === was) { inputs.H11 = want; wb.setInput(SH, 'H11', want); }
  }
  function setVal(a, v) {
    const prev = inputs[a];
    inputs[a] = v; wb.setInput(SH, a, v);
    if (a === 'J30') syncPartyCrit(prev);
    if (a === 'C6') { syncEngraveType(); syncClassDefault(prev); setTimeout(renderProfiles, 0); }
    if (inputs._eq && (a === 'C24' || a === 'C25')) { const o = a === 'C24' ? 'C25' : 'C24'; inputs[o] = v; wb.setInput(SH, o, v); }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    scheduleAutosave();
  }
  let saveT = 0;
  function scheduleAutosave() { if (shared) return; clearTimeout(saveT); saveT = setTimeout(() => { store.profiles[store.current] = Object.assign({}, inputs); persist(); }, 400); }
  const hooks = []; // 다시 계산할 때마다 부를 함수(랭킹 표시 등)
  function refresh() {
    let err = null;
    try {
      syncLabels();
      for (const a of Object.keys(controls)) syncControl(a);
      renderResults();
    } catch (e) { err = e; console.error(e); }
    $('#rCP').classList.toggle('err', !!err);
    if (err) $('#rCP').textContent = '계산 오류';
    for (const f of hooks) { try { f(); } catch (e) { console.error(e); } }
    syncMini();
  }
  // 실투력 카드가 화면 밖으로 나갔을 때만 위에 작은 줄로 보여 줌(카드 자체는 움직이지 않음)
  let heroVisible = true;
  function syncMini() {
    const bar = $('#miniBar'); if (!bar) return;
    const show = !heroVisible && !isEmptySetting(inputs) && !$('#rCP').classList.contains('err');
    bar.classList.toggle('on', show);
    bar.setAttribute('aria-hidden', String(!show)); bar.tabIndex = show ? 0 : -1;
    if (!show) return;
    $('#mbCP').textContent = $('#rCP').textContent;
    const dt = $('#deltaText'), md = $('#mbDelta');
    const changed = /[▲▼]/.test(dt.textContent);
    md.textContent = changed ? dt.textContent.replace(/^.*?([▲▼].*)$/, '$1') : '';
    md.className = 'mb-delta' + (dt.classList.contains('up') ? ' up' : dt.classList.contains('down') ? ' down' : '');
  }
  if (window.IntersectionObserver) {
    new IntersectionObserver((es) => { heroVisible = es[0].isIntersecting; syncMini(); }, { threshold: 0 }).observe($('.hero'));
  }
  $('#miniBar').onclick = () => $('.hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
  function setText(id, t) { const n = $(id); if (n && n.textContent !== t) n.textContent = t; }
  function renderResults() {
    const hero = $('.hero');
    $('#btnLink').hidden = !CAN_LINK || isEmptySetting(inputs);
    $('#btnClear').hidden = (isEmptySetting(inputs) && !nickOf(store.current)) || !!shared;
    $('#delta').hidden = isEmptySetting(inputs);
    if (isEmptySetting(inputs)) {
      hero.classList.add('empty');
      setText('#rCP', '—'); setText('#rCPk', inputs.C6 ? '스크린샷을 넣거나 공격력부터 입력해 주세요' : '스크린샷을 넣거나 전직부터 골라 주세요');
      setText('#rClass', inputs.C6 || ''); setText('#deltaText', ''); $('#btnPin').hidden = true; $('#btnRevert').hidden = true;
      const fi = $('#fieldInfo'); if (fi) fi.textContent = '';
      return;
    }
    hero.classList.remove('empty');
    const cp = g('C36');
    const noRange = !(Number(g('C12')) > 0); // 극대화 범위가 없으면 계산값이 의미 없음(음수 등)
    setText('#rCP', noRange ? '—' : typeof cp === 'number' ? fmtInt(cp) : String(cp));
    const missing = ['C12', 'C13'].filter(a => !(Number(g(a)) > 0));
    $('#rCPk').classList.toggle('warn', missing.length > 0);
    setText('#rCPk', missing.length ? `${missing.map(a => a === 'C12' ? '극대화 범위 최댓값' : '무기 공격력').join('·')}을 넣어야 정확해요` : korUnit(cp));
    const nk = shared ? (shared.nk || '') : nickOf(store.current);
    setText('#rClass', nk ? `${nk} (${label('C6')})` : label('C6'));
    const fi = $('#fieldInfo'); if (fi) fi.textContent = `${label('K34')} ${fmtPct(g('L34'), 0)}, ${label('K35')} ${fmtPct(g('L35'), 0)} 적용 중`;
    // 기준 대비
    const base = baseWb.get(SH, 'C36');
    const dt = $('#deltaText');
    let same = true;
    if (!noRange && typeof cp === 'number' && typeof base === 'number') {
      const d = cp - base; same = Math.abs(d) < 0.5;
      const pct = base ? d / base * 100 : 0;
      dt.className = 'delta-text' + (same ? '' : d > 0 ? ' up' : ' down');
      const ref = shared ? '내 세팅' : '기준';
      dt.textContent = same ? `${ref}${shared ? '과' : ' 세팅과'} 같아요` : `${ref}보다 ${d > 0 ? '▲' : '▼'} ${fmtInt(Math.abs(d))} (${d > 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%)`;
    } else { dt.className = 'delta-text'; dt.textContent = shared ? '' : '비교할 기준 세팅이 아직 없어요'; }
    const noBase = typeof base !== 'number';
    const changed = Object.keys(controls).some(a => controls[a].row && controls[a].row.classList.contains('changed')) || !same;
    $('#btnPin').hidden = (!changed && !noBase) || !!shared; $('#btnRevert').hidden = !changed || noBase || !!shared;
  }

  // ---------- 프로필 ----------
  // 닉네임을 적었으면 닉네임으로, 아니면 전직으로 보여줌
  function profileLabel(key) {
    const p = key === store.current ? inputs : (store.profiles[key] || {});
    const keys = Object.keys(store.profiles);
    const cls = p.C6 || '새 캐릭터';
    if (nickOf(key)) return p.C6 ? `${nickOf(key)} (${p.C6})` : nickOf(key);
    const same = keys.filter(k => ((k === store.current ? inputs : store.profiles[k]) || {}).C6 === p.C6 || (!p.C6 && !((k === store.current ? inputs : store.profiles[k]) || {}).C6));
    return same.length > 1 ? `${cls} ${same.indexOf(key) + 1}` : cls;
  }
  function renderProfiles() {
    const s = $('#profileSel'); s.innerHTML = '';
    for (const name of Object.keys(store.profiles)) s.append(el('option', { value: name, text: profileLabel(name) }));
    s.value = store.current;
    $('#btnDelete').hidden = Object.keys(store.profiles).length <= 1;
  }
  function loadProfile(name) {
    store.current = name; inputs = Object.assign({}, store.profiles[name] || {});
    syncNick();
    if (!store.bases[name]) store.bases[name] = Object.assign({}, inputs);
    persist(); applyInputs(); applyBase(); renderProfiles(); refresh();
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
    $('#profileSel').onchange = (e) => { if (shared) { shared = null; $('#sharedBar').hidden = true; history.replaceState(null, '', location.pathname); } loadProfile(e.target.value); };
    $('#nickIn').oninput = (e) => {
      if (shared) return;
      const v = e.target.value.trim();
      if (v) store.names[store.current] = v.slice(0, 20); else delete store.names[store.current];
      persist(); renderProfiles(); refresh();
    };
    $('#btnNew').onclick = () => {
      const name = 'c' + Date.now().toString(36);
      store.profiles[name] = blank(); loadProfile(name);
    };
    $('#btnDelete').onclick = async () => {
      if (!(await dialog({ title: '캐릭터 삭제', text: `"${profileLabel(store.current)}" 세팅을 지울까요?`, ok: '삭제', danger: true }))) return;
      delete store.profiles[store.current]; delete store.bases[store.current]; delete store.names[store.current]; if (store.rank) delete store.rank[store.current]; loadProfile(Object.keys(store.profiles)[0]);
    };
    $('#btnClear').onclick = async () => {
      if (!(await dialog({ title: '세팅 비우기', text: '이 캐릭터의 입력값을 모두 지우고 처음 상태로 돌아가요.', ok: '비우기', danger: true }))) return;
      inputs = blank(); store.profiles[store.current] = blank(); store.bases[store.current] = blank(); delete store.names[store.current]; syncNick();
      persist(); applyInputs(); applyBase(); renderProfiles(); refresh();
      clearShot();
    };
    $('#btnPin').onclick = () => { store.bases[store.current] = Object.assign({}, inputs); persist(); applyBase(); refresh(); };
    $('#btnRevert').onclick = () => { inputs = Object.assign({}, store.bases[store.current] || {}); store.profiles[store.current] = Object.assign({}, inputs); persist(); applyInputs(); refresh(); };
  }

  // ---------- 화면인식 ----------
  let shot = null, selRect = null, drawSel = () => {};
  const canvas = $('#shot');
  // 사진을 넣으면 안내 칸 자리에 사진을 보여 주고, ×로 지우면 다시 안내 칸으로
  let ocrBusy = false;
  function showShot(c) {
    if (ocrBusy) { toast('사진을 읽는 중이에요. 다 읽은 뒤에 바꿔 주세요'); return; }
    shot = c; selRect = null;
    canvas.width = c.width; canvas.height = c.height; canvas.getContext('2d').drawImage(c, 0, 0);
    $('#dropZone').hidden = true;
    $('#stage').hidden = false; $('#sel').hidden = true; $('#ocrResult').hidden = true; $('#ocrProg').hidden = true;
    $('#btnOcr').textContent = '읽기';
    $('#stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function clearShot() {
    if (ocrBusy) { toast('사진을 읽는 중이에요. 다 읽은 뒤에 지워 주세요'); return; }
    shot = null; selRect = null;
    $('#stage').hidden = true; $('#ocrResult').hidden = true; $('#ocrProg').hidden = true;
    $('#dropZone').hidden = false;
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
  function wireCapture() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (mobile) {
      $('.drop-main').textContent = '상세 스탯 창 스크린샷을 골라주세요';
      $('.drop-sub').textContent = 'PC에서 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 찍은 사진이면 한 장으로 다 채워요';
      document.querySelector('label[for=fileIn]').textContent = '사진 고르기';
    }
    $('#fileIn').onchange = async (e) => { const f = e.target.files[0]; if (f) showShot(await O.imageFromBlob(f)); e.target.value = ''; };
    document.addEventListener('paste', async (e) => {
      if (document.body.classList.contains('view-avatar')) return; // 아바타 탭에서는 아바타 인식으로
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (it) { e.preventDefault(); showShot(await O.imageFromBlob(it.getAsFile())); }
    });
    const card = $('#ocrCard');
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-on'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-on'));
    card.addEventListener('drop', async (e) => { e.preventDefault(); card.classList.remove('drop-on'); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) showShot(await O.imageFromBlob(f)); });
    $('#btnOcr').onclick = runOcr;
    $('#btnShotX').onclick = clearShot;
    $('#btnApply').onclick = applyOcr;
    $('#btnOcrAll').onclick = () => { const boxes = [...document.querySelectorAll('#ocrBody input[type=checkbox]')]; const all = boxes.every(b => b.checked); boxes.forEach(b => { b.checked = !all; }); };
  }
  const STEP = { 'loading tesseract core': '엔진 불러오는 중', 'initializing tesseract': '엔진 준비 중', 'loading language traineddata': '글자 데이터 불러오는 중', 'initializing api': '준비 중', 'recognizing text': '글자 읽는 중' };
  let pendingExtras = null; // 적용 버튼을 누른 뒤에 물어볼 값
  async function runOcr() {
    if (!shot) return;
    askExtras({ weapon: true, during: true });
    const prog = $('#ocrProg'), bar = prog.querySelector('.bar'), pt = prog.querySelector('.ptext');
    prog.hidden = false; $('#btnOcr').disabled = true; ocrBusy = true; $('#btnShotX').hidden = true; bar.style.width = '5%'; pt.textContent = '이미지 준비 중';
    try {
      const res = await O.recognize(shot, selRect, (m) => {
        if (m.status) pt.textContent = (STEP[m.status] || m.status) + (m.tag === 'eng' ? ' (숫자)' : '');
        if (typeof m.progress === 'number' && m.tag === 'kor') bar.style.width = Math.round(5 + m.progress * 95) + '%';
      });
      if (res.auto && res.rect) { selRect = res.rect; drawSel(); }
      let gear = null;
      try { if (window.SilGear) { pt.textContent = '악세서리 아이콘 보는 중'; gear = window.SilGear.recognize(shot); } } catch (e) { console.error(e); }
      try { if (window.SilAvatar) { pt.textContent = '아바타 아이콘 보는 중'; await window.SilAvatar.fromShot(shot, gear); } } catch (e) { console.error(e); }
      try { if (gear && gear.cls) { pt.textContent = '칭호 읽는 중'; res.title = await O.readTitle(shot, gear.cls); } } catch (e) { console.error(e); }
      try { if (gear && gear.cls && !shared) { pt.textContent = '캐릭터 이름 읽는 중'; res.name = await O.readName(shot, gear.cls); } } catch (e) { console.error(e); }
      pendingExtras = { gotRange: !!(res.found && res.found.C12) };
      showOcrResult(res, gear);
      prog.hidden = true;
      // 읽은 값은 바로 적용(못 읽었으면 결과 안내만 남김)
      if (document.querySelector('#ocrBody input[type=checkbox]:checked')) applyOcr();
    } catch (e) {
      console.error(e); pt.textContent = '인식 실패: ' + (e.message || e);
      return;
    } finally { $('#btnOcr').disabled = false; ocrBusy = false; $('#btnShotX').hidden = false; $('#btnOcr').textContent = '다시 읽기'; }
    prog.hidden = true;
  }
  const LABEL_OF = {}; for (const t of TABS) for (const gr of t.groups) for (const f of gr.fields.flat()) if (f.t && f.c) LABEL_OF[f.c] = f.t;
  function showOcrResult(res, gear) {
    const body = $('#ocrBody'); body.innerHTML = '';
    const found = res.found; const cells = O.FIELDS.map(f => f.cell).filter(c => found[c]);
    $('#ocrCount').textContent = cells.length ? `${cells.length}개 항목을 읽었어요` : '항목을 못 찾았어요. 상세 스탯 창 부분만 드래그로 골라서 다시 읽어 보세요.';
    // 사진이 작거나 읽은 항목이 적으면 찍는 조건 안내
    const small = shot && (shot.width < 1600 || shot.height < 900);
    const tip = $('#ocrTip');
    tip.textContent = small ? `사진이 작아요(${shot.width}×${shot.height}). 글자가 작으면 잘못 읽을 수 있어요. 게임 해상도 1920×1080 이상, 전체 화면으로 찍어 주세요.`
      : (cells.length && cells.length < 12) ? '덜 읽힌 항목이 있어요. 다른 창이 상세 스탯 창을 가리지 않게, 게임을 전체 화면으로 두고 다시 찍어 보세요.' : '';
    tip.hidden = !tip.textContent;
    for (const c of cells) {
      const f = found[c], kind = PCT.has(c) ? 'pct' : 'num';
      const cur = g(c);
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: kind === 'pct' ? pctIn(f.value) : String(f.value), 'data-cell': c, class: kind });
      const same = typeof cur === 'number' && Math.abs(cur - f.value) < 1e-9;
      const low = f.score < 0.8 || f.guessed; // 커서에 가려 옆 칸 위치로 추정한 값도 확인 필요로 표시
      body.append(el('tr', { class: (same ? 'same' : '') + (low ? ' low' : '') },
        el('td', {}, el('input', { type: 'checkbox', checked: same ? null : 'checked', 'aria-label': '적용' })),
        el('td', { text: LABEL_OF[c] || label('B' + c.slice(1)) }, low ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null),
        el('td', { class: 'num dim', text: kind === 'pct' ? fmtPct(cur) : fmtInt(cur) }),
        el('td', {}, kind === 'pct' ? el('span', { class: 'pctwrap' }, inp, el('span', { class: 'suffix', text: '%' })) : inp)));
    }
    // 칭호: 캐릭터 창 칭호 띠의 이름 (상시 칭호)
    const titleText = (res.title || '').replace(/[^\uAC00-\uD7A3A-Za-z0-9 ]/g, '').trim();
    const titles = (optionsOf('G24') || []).filter(t => t !== '미착용');
    const tHit = titleText ? O.findName([{ text: titleText }], titles) : null;
    if (tHit || (titleText.match(/[\uAC00-\uD7A3]/g) || []).length >= 2) {
      res.title = titleText;
      const cur = g('G24'), val = tHit ? tHit.name : '미착용';
      const same = String(cur) === val;
      const sel = el('select', { 'data-cell': 'G24', 'aria-label': '상시 칭호' });
      for (const o of optionsOf('G24') || []) sel.append(el('option', { value: String(o), text: String(o) }));
      sel.value = val;
      const cb = el('input', { type: 'checkbox', checked: same ? null : 'checked', 'aria-label': '적용' });
      sel.addEventListener('change', () => { cb.checked = String(g('G24')) !== sel.value; });
      body.append(el('tr', { class: 'title-row' + (same ? ' same' : '') },
        el('td', {}, cb),
        el('td', {}, '상시 칭호', tHit ? null : el('small', { class: 'mutetag', text: ` "${res.title.slice(0, 12)}" · 계산에 안 쓰는 칭호` })),
        el('td', { class: 'dim', text: String(cur ?? '') }),
        el('td', { class: 'gear-pick' }, sel)));
    }
    // 상세 스탯 창에 없는 값: 비어 있으면 여기서 바로 입력
    // 캐릭터 이름(캐릭터 창 맨 위) → 닉네임
    if (res.name) {
      const cur = nickOf(store.current), same = cur === res.name;
      const inp = el('input', { type: 'text', class: 'nick-in', 'data-nick': '1', maxlength: '20', value: res.name, 'aria-label': '닉네임' });
      const cb = el('input', { type: 'checkbox', checked: same ? null : 'checked', 'aria-label': '적용' });
      inp.addEventListener('input', () => { cb.checked = inp.value.trim() !== cur; });
      body.prepend(el('tr', { class: 'nick-row' + (same ? ' same' : '') },
        el('td', {}, cb), el('td', { text: '닉네임' }), el('td', { class: 'dim', text: cur }), el('td', {}, inp)));
    }
    if (gear) showGearRows(gear);
    else lastGear = null;
    const gearN = body.querySelectorAll('tr.gear-row:not(.none):not(.cls-row)').length;
    if (gear && gear.cls && gear.cls.match) $('#ocrCount').textContent += ', 전직';
    if (gearN) $('#ocrCount').textContent += `, 악세서리 ${gearN}개`;
    $('#ocrResult').hidden = false;
  }

  // ---------- 사진에 안 나오는 값: 인식 뒤 바로 묻기 ----------
  // weapon: 무기 공격력을 물을지(사진에 안 나와서 읽기를 누를 때마다 물음), range: 극대화 범위 최댓값을 못 읽었을 때
  const numIn = (c, ph) => { const v = g(c); return el('input', { type: 'text', inputmode: 'numeric', class: 'num', 'data-cell': c, placeholder: ph, value: Number(v) > 0 ? String(v) : '' }); };
  function rangeRow() {
    const atk = label('AC67') === '마법' ? '마법' : '물리';
    const inp = numIn('C12', '예: 205000');
    return [el('label', { class: 'ex-row' }, el('span', {}, `${atk} 공격력 극대화 범위 최댓값`, el('small', { text: `이번 사진에서 못 찾았어요. 다음엔 ${atk} 공격력에 마우스를 올린 채로 찍으면 자동으로 들어가요` })), inp), inp];
  }
  // 아트마 액세서리: 사진으로는 못 읽고 실투력에 크게 들어가는 값(종류·등급)
  function atmaRow() {
    const sel = (c) => {
      const s = el('select', { 'data-cell': c });
      // 종류는 '유수의 아트마' → '유수'처럼 짧게(값은 시트 그대로)
      for (const o of optionsOf(c) || []) s.append(el('option', { value: String(o), text: String(o).replace(/의\s*아트마$/, '') }));
      s.value = String(inputs[c] ?? defaultOf(c) ?? '');
      return s;
    };
    return el('div', { class: 'ex-row atma-row' }, el('span', {}, '아트마 액세서리'),
      el('div', { class: 'atma-sel' }, sel('J32'), sel('L32')));
  }
  const pickSel = (c, opts, cur) => {
    const s = el('select', { 'data-cell': c });
    for (const o of opts) s.append(el('option', { value: String(o.v ?? o), text: String(o.t ?? o) }));
    s.value = String(cur);
    return s;
  };
  function setRow() {
    return el('div', { class: 'ex-row atma-row' }, el('span', {}, '방어구 세트 효과'),
      // 보기는 짧게(연산·순환·복원), 값은 시트 그대로
      // 보통 연산·순환·복원 중 하나라 그 셋만(다른 값이 들어 있으면 그 값도 남김)
      el('div', { class: 'atma-sel set-sel' }, pickSel('J30', (optionsOf('J30') || []).filter(o => /^엑사&네블론/.test(o) || o === inputs.J30).map(o => ({ v: o, t: String(o).replace(/^엑사&네블론\s*-\s*/, '') })), inputs.J30 ?? setDefault(inputs.C6))));
  }
  // 초월:강렬 비율(직접 입력으로 계산). 직접 넣은 적이 없으면 기본 초월 100 : 강렬 0
  function shareRow() {
    const custom = inputs.L42 === true;
    const num = (c, d) => el('input', { type: 'text', inputmode: 'numeric', class: 'num share', 'data-cell': c, value: String(custom ? (g(c) ?? d) : d) });
    const bravery = num('K46', 100), strength = num('I46', 0);
    const box = el('div', { class: 'share-in' }, el('span', { text: '초월' }), bravery, el('span', { text: ':' }), strength, el('span', { text: '강렬' }));
    return el('div', { class: 'ex-row atma-row share-row' }, el('span', {}, '초월:강렬 비율'), box);
  }
  function eqRow() {
    const cb = el('input', { type: 'checkbox', id: 'exEq' }); cb.checked = !!inputs._eq;
    return el('label', { class: 'chk-row ex-eq' }, cb, el('span', {}, '강배 역강배 수치 동일', el('small', { text: '둘 중 높은 쪽 수치로 같게 맞춰요' })));
  }
  function askExtras({ weapon = true, range = false, during = false } = {}) {
    const open = $('#extraDlg');
    if (open && !during) {
      // 읽는 동안 띄운 창이 아직 열려 있으면 닫지 않고, 빠진 칸만 붙임. 사진으로 바뀐 값(직업에 따른 세트 효과 등)은 안 건드린 칸에 반영
      for (const sl of open.querySelectorAll('select[data-cell]:not([data-touched])')) { const c = sl.getAttribute('data-cell'); if (inputs[c] != null) sl.value = String(inputs[c]); }
      if (range && !open.querySelector('[data-cell=C12]')) open.querySelector('.dlg-actions').before(rangeRow()[0]);
      const note = open.querySelector('#exNote'); if (note) note.textContent = '사진은 다 읽어서 적용했어요. 사진에 안 나오는 아래 값만 확인해 주세요.';
      return;
    }
    if (open) open.remove();
    if (!weapon && !range) return;
    const iC13 = weapon ? numIn('C13', '예: 60000') : null;
    const r12 = range ? rangeRow() : null;
    const save = () => {
      // 비율은 0도 올바른 값(초월 100 : 강렬 0). 단 둘 다 0이면 무시. 넣으면 그 비율로 계산(L42 켬)
      const shareIn = [...wrap.querySelectorAll('input[data-cell=I46], input[data-cell=K46]')];
      const shareOk = shareIn.length === 2 && shareIn.every(i => { const t = i.value.replace(/[,\s]/g, ''); return t !== '' && Number(t) >= 0; }) && shareIn.some(i => Number(i.value.replace(/[,\s]/g, '')) > 0);
      if (shareOk && inputs.L42 !== true) setVal('L42', true);
      for (const inp of wrap.querySelectorAll('input[data-cell]')) {
        const c = inp.getAttribute('data-cell'), t = inp.value.replace(/[,\s]/g, ''), n = Number(t);
        if (!t || !Number.isFinite(n)) continue;
        if (c === 'I46' || c === 'K46') { if (shareOk && n >= 0 && n !== Number(g(c))) setVal(c, n); continue; }
        if (n > 0) setVal(c, n);
      }
      for (const sl of wrap.querySelectorAll('select[data-cell][data-touched]')) {
        const c = sl.getAttribute('data-cell');
        if (sl.value !== String(inputs[c] ?? '')) setVal(c, parseOpt(c, sl.value));
      }
      const eq = wrap.querySelector('#exEq');
      if (eq) {
        const b24 = inputs.C24, b25 = inputs.C25;
        if (eq.checked) inputs._eq = true; else delete inputs._eq;
        if (syncEq() && ocrSnap && ocrSnap._key === store.current && String(ocrSnap.C24) === String(b24) && String(ocrSnap.C25) === String(b25)) { ocrSnap.C24 = inputs.C24; ocrSnap.C25 = inputs.C25; }
      }
      refresh(); scheduleAutosave(); wrap.remove();
    };
    const card = el('div', { class: 'dialog-card extra-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'exTitle' },
      el('h3', { id: 'exTitle', text: iC13 ? '남은 수치를 직접 기입해 주세요' : '극대화 범위 최댓값을 기입해 주세요' }),
      el('p', { id: 'exNote', text: iC13 ? `사진에 안 나오는 값이에요.${during ? ' 그동안 사진을 읽고 있어요.' : ''}` : '이번 사진에서 못 찾은 값이에요.' }),
      iC13 ? el('label', { class: 'ex-row' }, el('span', {}, '무기 공격력', el('small', { text: '무기에 마우스를 올리면 나오는 무기 자체 수치' })), iC13) : null,
      r12 ? r12[0] : null,
      iC13 ? setRow() : null,
      iC13 ? atmaRow() : null,
      iC13 ? shareRow() : null,
      iC13 ? eqRow() : null,
      el('div', { class: 'dlg-actions' },
        el('button', { class: 'btn', onclick: () => wrap.remove(), text: '나중에' }),
        el('button', { class: 'btn primary', text: '확인', onclick: save })));
    const wrap = el('div', { class: 'dialog', id: 'extraDlg' }, card);
    wrap.addEventListener('change', (e) => { if (e.target.matches('select[data-cell]')) e.target.setAttribute('data-touched', '1'); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); } });
    document.body.append(wrap);
    setTimeout(() => (iC13 || r12[1]).focus(), 50);
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
    const body = $('#ocrBody'); body.querySelectorAll('.gear-row, .gear-head:not(.sec-head), .gear-unknown').forEach(n => n.remove());
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
      // 확실하면 적용. '확인 필요'(비슷한 후보)라도 지금 전직이 비어 있으면 일단 적용(전직이 없으면 계산이 안 됨)
      cb.checked = !!(c.match && !same && (!c.match.guess || !cur));
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
    if (!gear.grid) return;
    body.append(el('tr', { class: 'gear-head' }, el('td', { colspan: '4' }, '일반 악세서리 (장비창 아이콘)')));
    for (const k of GEAR_CELLS) {
      const c = pick[k], cur = g(k);
      const sel = el('select', { 'data-cell': k, 'aria-label': GEAR_NAME[k] });
      for (const o of optionsOf(k) || []) sel.append(el('option', { value: String(o), text: String(o) }));
      sel.value = c ? c.match.name : '해당사항 없음';
      const same = String(cur) === sel.value;
      const guess = c && c.match.guess;
      const thumb = c ? el('img', { class: 'gear-ico', src: c.thumb, alt: '', width: '28', height: '28' }) : el('span', { class: 'gear-ico none' });
      const cb = el('input', { type: 'checkbox', checked: !same && c && !guess ? 'checked' : null, 'aria-label': '적용' });
      sel.addEventListener('change', () => { cb.checked = String(g(k)) !== sel.value; });
      body.append(el('tr', { class: 'gear-row' + (same ? ' same' : '') + (c ? '' : ' none') + (guess ? ' low' : '') },
        el('td', {}, cb),
        el('td', {}, GEAR_NAME[k], c ? (guess ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null) : el('small', { class: 'mutetag', text: ' 안 보임 · 직접 선택' })),
        el('td', { class: 'dim', text: String(cur ?? '') }),
        el('td', { class: 'gear-pick' }, thumb, sel)));
    }
  }
  let ocrSnap = null, ocrShot = null; // 마지막으로 스크린샷을 적용한 세팅과 그 사진(랭킹 갱신용)
  function applyOcr() {
    let n = 0; const prevCls = inputs.C6;
    document.querySelectorAll('#ocrBody tr').forEach(tr => {
      const cb = tr.querySelector('input[type=checkbox]');
      if (!cb || !cb.checked) return;
      const nk = tr.querySelector('input[data-nick]');
      if (nk) { const v = nk.value.trim().slice(0, 20); if (v && v !== nickOf(store.current)) { store.names[store.current] = v; persist(); syncNick(); n++; } }
      tr.querySelectorAll('[data-cell]').forEach(inp => {
        const c = inp.getAttribute('data-cell');
        if (inp.tagName === 'SELECT') { if (inp.value) { inputs[c] = parseOpt(c, inp.value); n++; } return; }
        const v = parseNum(inp.value, PCT.has(c) ? 'pct' : 'num');
        if (v !== null) { inputs[c] = v; n++; }
      });
    });
    applyInputs(); syncEngraveType(); syncClassDefault(prevCls); syncEq();
    let autoBase = false;
    if (!shared && isEmptySetting(store.bases[store.current] || {}) && !isEmptySetting(inputs)) { store.bases[store.current] = Object.assign({}, inputs); applyBase(); autoBase = true; }
    applyInputs(); refresh(); scheduleAutosave(); renderProfiles();
    ocrSnap = Object.assign({}, inputs); ocrShot = shot; ocrSnap._key = store.current;
    // 적용이 끝나면 인식 결과 목록만 접고, 사진은 ×로 지울 때까지 남겨 둠
    $('#ocrResult').hidden = true;
    toast(autoBase ? `${n}개 값을 채우고 기준 세팅으로 잡았어요` : `${n}개 값을 채웠어요`);
    // 적용 뒤: 무기 공격력을 아직 안 넣었거나 극대화 범위를 못 읽었으면 그것만 다시 물음
    if (pendingExtras) {
      const p = pendingExtras; pendingExtras = null;
      askExtras({ weapon: !(Number(g('C13')) > 0), range: !p.gotRange && !(Number(g('C12')) > 0) });
    }
  }

  // ---------- 링크 공유 (주소 #s= 뒤에 세팅을 압축해 담음) ----------
  const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function pipe(u8, Stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer()); }
  async function packShare(name, inp, nick) {
    const i = {};
    for (const [a, v] of Object.entries(inp)) if (String(v) !== String(defaultOf(a))) i[a] = v;
    const raw = new TextEncoder().encode(JSON.stringify(nick ? { v: 1, n: name, k: nick, i } : { v: 1, n: name, i }));
    if (window.CompressionStream) return 'z' + b64u(await pipe(raw, CompressionStream));
    return 'j' + b64u(raw);
  }
  async function unpackShare(t) {
    const kind = t[0], body = unb64u(t.slice(1));
    const raw = kind === 'z' ? await pipe(body, DecompressionStream) : body;
    const o = JSON.parse(new TextDecoder().decode(raw));
    if (!o || o.v !== 1 || typeof o.i !== 'object') throw new Error('형식 오류');
    return o;
  }
  function toast(t) { const n = $('#toast'); n.textContent = t; n.hidden = false; clearTimeout(n._t); n._t = setTimeout(() => { n.hidden = true; }, 2200); }
  function enterShared(o) {
    shared = { n: String(o.n || '공유된 세팅').slice(0, 30), nk: String(o.k || '').slice(0, 20), i: o.i };
    inputs = Object.assign({}, shared.i);
    $('#sharedBar').hidden = false;
    $('#sharedText').textContent = shared.nk ? `${shared.nk} 님의 ${shared.n} 세팅을 보고 있어요` : `${shared.n} 세팅을 보고 있어요`;
    syncNick();
    applyInputs(); applyBase(); refresh();
  }
  function leaveShared() {
    shared = null; $('#sharedBar').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
    inputs = Object.assign({}, store.profiles[store.current] || {}); syncNick();
    applyInputs(); applyBase(); refresh();
  }
  function wireShare() {
    if (!CAN_LINK) return;
    $('#btnLink').onclick = async () => {
      const nm = inputs.C6 || '공유된';
      const code = await packShare(nm, inputs, nickOf(store.current));
      const url = location.origin + location.pathname + '#s=' + code;
      try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요. 받은 사람은 이 세팅 그대로 보게 돼요'); }
      catch (e) { await dialog({ title: '링크', text: '아래 주소를 복사해서 보내세요.', area: url, ok: '닫기' }); }
    };
    $('#btnLeaveShared').onclick = leaveShared;
    $('#btnSaveShared').onclick = () => {
      const name = 'c' + Date.now().toString(36);
      store.profiles[name] = Object.assign({}, inputs); store.bases[name] = Object.assign({}, inputs);
      if (shared && shared.nk) store.names[name] = shared.nk;
      shared = null; $('#sharedBar').hidden = true; history.replaceState(null, '', location.pathname + location.search);
      loadProfile(name); toast('내 캐릭터 목록에 저장했어요');
    };
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#s=')) openHash(); });
  }
  async function openHash() {
    if (!CAN_LINK || !location.hash.startsWith('#s=')) return;
    try { enterShared(await unpackShare(location.hash.slice(3))); }
    catch (e) { console.error(e); toast('링크를 열 수 없어요. 주소가 잘렸는지 확인해 주세요'); }
  }

  // ---------- 랭킹 화면(rank.js)과 연결 ----------
  const SKIP_EDIT = new Set(['ZB1', 'ZB2', 'ZB3', 'C12', 'C13', 'J32', 'L32', 'L42', 'I46', 'K46', 'M46', '_key', '_eq']); // 사진에 없는 값(직접 넣는 값)은 '손으로 고침'으로 치지 않음
  window.SilApp = {
    inputs: () => Object.assign({}, inputs),
    cp: () => { const v = g('C36'); return typeof v === 'number' ? Math.round(v) : NaN; },
    // 랭킹도 계산기에 넣은 그대로(강렬:초월 점유율을 직접 넣었으면 그 비율로) 반영
    rankInputs: () => Object.assign({}, inputs),
    rankCp: () => { const v = g('C36'); return typeof v === 'number' ? Math.round(v) : NaN; },
    customShare: () => inputs.L42 === true,
    // 랭킹에 못 올리는 버프(피시방·에너지드링크·지애)를 켰으면 그 이름들
    rankBuffs: () => Object.keys(EXTRA_BUFF).filter(a => inputs[a] === true).map(a => EXTRA_BUFF[a]),
    missing: () => isEmptySetting(inputs) ? ['세팅'] : ['C12', 'C13'].filter(a => !(Number(g(a)) > 0)).map(a => a === 'C12' ? '극대화 범위 최댓값' : '무기 공격력'),
    cls: () => inputs.C6 || '',
    val: (c) => g(c),
    key: () => store.current,
    nick: () => nickOf(store.current),
    setNick: (v) => { if (v) store.names[store.current] = v; else delete store.names[store.current]; persist(); syncNick(); renderProfiles(); refresh(); },
    rank: (k) => ((store.rank || {})[k || store.current]) || null,
    ranks: () => Object.assign({}, store.rank || {}),
    setRank: (o, k) => { store.rank = store.rank || {}; const key = k || store.current; if (o) store.rank[key] = o; else delete store.rank[key]; persist(); },
    // 이번에 넣은 스크린샷으로 채운 세팅인지(같은 캐릭터) + 그 뒤에 손으로 고친 값이 있는지
    shot: () => (ocrShot && ocrSnap && ocrSnap._key === store.current) ? ocrShot : null,
    edited: () => !!ocrSnap && Object.keys(Object.assign({}, inputs, ocrSnap)).some(a => !SKIP_EDIT.has(a) && String(inputs[a] ?? '') !== String(ocrSnap[a] ?? '')),
    isShared: () => !!shared,
    openShared: (o) => { history.replaceState(null, '', location.pathname + location.search); enterShared(o); },
    classes: () => (optionsOf('C6') || []).filter(Boolean),
    onRefresh: (f) => { hooks.push(f); },
    refresh: () => refresh(),
    toast, el, fmtInt, korUnit, dialog,
  };

  // ---------- 크극 최적화 (엑셀 "크극 최적화 계산") ----------
  const OPT = window.SilOpt;
  function optCfg() { if (!store.opt) store.opt = { base: 'atma', min: 25 }; return store.opt; }
  function wireOpt() {
    if (!OPT || !$('#optCard')) return;
    const sel = $('#optBase'), mn = $('#optMin'), cfg = optCfg();
    for (const b of OPT.BASES) sel.append(el('option', { value: b.v, text: b.t }));
    sel.value = cfg.base || 'atma'; mn.value = cfg.min ?? 25;
    sel.onchange = () => { cfg.base = sel.value; persist(); renderOpt(); };
    mn.onchange = () => {
      let v = Number(String(mn.value).replace(',', '.'));
      if (!isFinite(v) || v < 0 || mn.value === '') v = 25;
      v = Math.min(100, Math.round(v * 10) / 10); mn.value = v; cfg.min = v; persist(); renderOpt();
    };
  }
  let optT = 0;
  hooks.push(() => { clearTimeout(optT); optT = setTimeout(renderOpt, 120); });
  function optDelta(x) {
    const d = Math.round(x * 1000) / 10;
    if (Math.abs(d) < 0.05) return { t: '그대로', c: 'same' };
    return { t: (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) + '%', c: d > 0 ? 'up' : 'down' };
  }
  function renderOpt() {
    const card = $('#optCard'); if (!card || !OPT) return;
    const cp = g('C36');
    const bad = isEmptySetting(inputs) || $('#rCP').classList.contains('err') || typeof cp !== 'number' ||
      !(Number(g('C11')) > 0) || !(Number(g('C12')) > 0) || !(Number(g('C13')) > 0);
    let r = null;
    if (!bad) { try { const cfg = optCfg(); r = OPT.run(wb, { base: cfg.base, minCrit: (cfg.min ?? 25) / 100 }); } catch (e) { console.error(e); } }
    if (!r || !isFinite(r.dps) || !isFinite(r.cpOpt)) { card.hidden = true; return; }
    card.hidden = false;
    const body = $('#optBody'); body.textContent = '';
    const rows = [['크리티컬 확률', 'crit'], ['극대화', 'max'], ['보스 데미지', 'boss']];
    if (r.short) {
      setText('#optGain', '바꿀 수 없는 크리·극대·보뎀만으로 지금 수치를 넘어서 계산할 수 없어요. 계산 기준의 크리 최소 수치를 낮춰 보세요');
      $('#optGain').className = 'opt-gain warn';
      for (const [t, k] of rows) body.append(el('tr', null, el('th', { scope: 'row', text: t }), el('td', { text: fmtPct(r.cur[k]) }), el('td', { text: '-' }), el('td', { class: 'same', text: '-' })));
      return;
    }
    for (const [t, k] of rows) {
      const d = optDelta(r.change[k]);
      body.append(el('tr', null, el('th', { scope: 'row', text: t }), el('td', { text: fmtPct(r.cur[k]) }),
        el('td', { class: 'opt-best', text: fmtPct(r.opt[k]) }), el('td', { class: d.c, text: d.t })));
    }
    const gain = $('#optGain');
    if (r.dps < 0.00005) { gain.className = 'opt-gain'; gain.textContent = '지금 배분이 이미 최적이에요'; return; }
    gain.className = 'opt-gain';
    gain.textContent = '';
    gain.append('최적으로 바꾸면 DPS ', el('b', { class: 'up', text: '+' + (r.dps * 100).toFixed(2) + '%' }),
      el('br'), '실질 전투력 ' + fmtInt(r.cpOpt) + ' ', el('span', { class: 'up', text: '(▲ ' + fmtInt(r.cpOpt - cp) + ')' }));
  }

  // ---------- 시작 ----------
  function selfTest() {
    const t = new E.Workbook(M); const v = t.get(SH, 'C36'); const exp = M.check['<Main>!C36'];
    const ok = typeof v === 'number' && Math.abs(v - exp) < 1e-6 * Math.abs(exp);
    $('#selfTest').textContent = ok ? `시트 ${M.meta.version} 기준이며, 시트 예시 값과 같은 결과가 나오는 것을 확인했습니다.` : '시트 예시 값과 계산 결과가 다릅니다. 제보 부탁드립니다.';
  }
  persist();
  applyInputs();
  function syncNick() {
    const n = $('#nickIn'); if (!n) return;
    n.readOnly = !!shared;
    n.value = shared ? (shared.nk || '') : nickOf(store.current);
  }
  renderForms(); renderProfiles(); wireProfiles(); syncNick(); wireSelection(); wireCapture(); wireShare(); wireOpt();
  refresh();
  openHash();
  selfTest();
})();
