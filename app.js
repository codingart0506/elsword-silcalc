/* 실투력 계산기 화면 로직 */
(function () {
  'use strict';
  const E = window.SilEngine, O = window.SilOCR, M = window.SIL_MODEL;
  // 실질전투력 시트 ver.3: 입력은 <Main>과 고급사용자모드, 실투력은 '현재·교체 후 계산'!C498
  const SH = '<Main>', ADV = '고급사용자모드', CALC = '현재·교체 후 계산';
  // 시트에 없는 버프(피시방·에너지드링크·지애)는 켜고 끄는 체크칸. 시트의 '피시방 버프 미연결' 칸(최종뎀·크리·극대)에 넣어 계산
  const EXTRA_BUFF = { ZB1: '피시방 버프', ZB3: '에너지드링크', ZB2: '지애 버프' };
  let wb = new E.Workbook(M); // 하의 스위칭 계산식을 더하면 새로 만듦
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
  // 계산기 안에서는 퍼센트 값을 소수(86.4% → 0.864)로 들고 있고, 시트에 넣을 때 ×100 (ver.3 시트는 86.4로 받음)
  const PCT = new Set('C14 C15 C17 C18 C19 C20 C21 C22 C24 C25 C26 C27 C29 C30 C31 C32 C33 C34 H11 H12 H13 H17 H18 H20 H21 H22'.split(' '));
  // 고급사용자모드 칸은 'A_B4'처럼 씀
  const sheetOf = (a) => a.startsWith('A_') ? [ADV, a.slice(2)] : [SH, a];
  const HELP = {
    C12: '능력치 창의 물리/마법 공격력에 마우스를 올리면 나오는 극대화 범위 "12345 ~ 67890" 중 오른쪽 최댓값. 무기 공격력이 아님.',
    C13: '상세 능력치 창이 아니라 무기 자체의 물리/마법 공격력 (극대화 범위 X).',
    C34: '순환 엑사 세트효과 8%를 더하지 말고 능력치 창 그대로 입력.',
    H11: '1. 테네브로스 상의 두 번째 그림자 옵션 / 2. 홍예항마 4세트 10% / 3. 엑사스케일 연산·순환 세트효과 10%',
    H12: '1. 테네브로스 장갑 두 번째 그림자 옵션 / 2. 홍예항마 2세트 10% / 3. 엑사스케일 복원 세트효과 (유강강초 회로 × 0.8%)',
    H13: '1. 테네브로스 상의 두 번째 그림자 옵션 / 2. 엑사스케일 복원 세트효과 10%',
    H15: '캐시샵 20000 캐시 업그레이드 이용권',
    L11: '직업마다 고를 수 있는 스킬 효과예요. 직업 고유 패시브·버프는 따로 고르지 않아도 직업에 맞게 자동으로 들어가요.',
    ZB1: '최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    ZB3: '피시방 에너지드링크(가동 중일 때): 크리·극대 5%, 최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    ZB2: '최종 데미지 5%. 켜면 랭킹에 올릴 수 없어요.',
    J22: '이벤트 기간에만 받는 버프예요. 미적용이 아니면 랭킹에 올릴 수 없어요.',
    J21: '적용1-녹테네: 팟모스뎀·팟크뎀 10% / 적용2-녹엑사: 팟모스뎀·팟물마 10% / 적용3-적청엑사: 팟크뎀 10%. 녹힐 직업(디우스 아에르, 일천, 오버마인드, 데메르시오, 블루헨, 라디언트 소울, 닉스 피에타, 애버리스)은 직업을 고르면 적용3-적청엑사로 바뀌어요.',
    J27: '미착용이면 종류는 아무거나, 강화 수치를 0으로.',
    A_B5: '대충 감으로 넣는 비율 (시트: 강초뎀 적용 이전)\n가이드에서 본 비율이나 대충 감으로 넣을 때. 잘 모르면 이걸 고르세요.\n\n딜 미터로 잰 비율 (시트: 강초뎀 적용 이후)\n딜 미터로 실제 딜을 재서 넣을 때. 잰 딜에는 내 강렬·초월 스킬 데미지가 이미 들어 있어서 계산기가 그만큼 빼고 계산해요.\n\n어느 쪽이든 강렬·초월 스킬 데미지 수치를 바꾸면 실투력에 반영돼요.',
    A_E4: '추가 지속 피해(추피)는 맞힌 뒤 0.6초·1.6초·2.6초에 세 번 나눠 들어가요. 싸움이 짧으면 마지막 틱이 덜 들어가서, 평균 딜타임을 넣으면 그만큼 추피 효과를 줄여서 계산해요. 끄면 추피가 다 들어간다고 봐요.',
    A_H4: '쿨타임 감소·쿨초기화로 스킬을 더 자주 쓰는 효과 중 얼마를 실투력에 넣을지예요. 끄면 기본값으로 계산해요.',
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
      { bar: '창에 없는 값', note: '상세 스탯 창에 안 나와서 직접 입력해요', single: true, fields: [{ c: 'C12', lab: 'B12' }, { c: 'C13', lab: 'B13' }] },
    ] },
    { id: 'buff', name: '버프·아이템', groups: [
      { bar: '파티 버프', note: '파티원 것 말고 본인이 입은 아이템 효과만', fields: [{ c: 'H11', lab: 'D11' }, { c: 'H12', lab: 'D12' }, { c: 'H13', lab: 'D13' }] },
      { bar: '펫', note: '포만도 80% 이상, 친밀도 100%일 때 특별한 격려 효과', fields: [{ c: 'H15', lab: 'D15' }, { c: 'H16', lab: 'D16' }] },
      { bar: '비전의 원석', fields: [[{ c: 'F17' }, { c: 'H17' }], [{ c: 'F18' }, { c: 'H18' }]] },
      { bar: '금빛 각인석', fields: [[{ c: 'D20' }, { c: 'H20' }], [{ c: 'D21' }, { c: 'H21' }], [{ c: 'D22' }, { c: 'H22' }]] },
      { bar: '칭호', fields: [{ c: 'G24', lab: 'D24' }, { c: 'G25', lab: 'D25' }] },
      { bar: '일반 악세서리', note: '버프형 아이템', fields: [{ c: 'G27', t: '얼굴 상단' }, { c: 'G28', t: '얼굴 하단' }, { c: 'G29', t: '반지' }, { c: 'G30', t: '귀걸이' }] },
      { bar: '아티팩트', fields: [{ c: 'G32', t: '아티팩트' }] },
    ] },
    { id: 'gear', name: '스킬·장비', groups: [
      { bar: '캐릭터 버프 스킬', note: '직업 고유 패시브·버프는 직업에 맞게 자동으로 들어가요', fields: [{ c: 'L11', lab: 'I11' }] },
      { bar: '도핑', fields: [{ c: 'J17', lab: 'I17' }, { c: 'J18', lab: 'I18' }, { c: 'J19', lab: 'I19' }, { c: 'J20', lab: 'I20' }, { c: 'J21', lab: 'I21' }, { c: 'J22', lab: 'I22' }, { c: 'J23', lab: 'I23' },
        { c: 'ZB1', t: '피시방 버프' }, { c: 'ZB3', t: '에너지드링크' }, { c: 'ZB2', t: '지애 버프' }] },
      // PC 두 칸 배치: 무기 한 줄, 그 아래 상의·하의 / 장갑·신발 / 세트 효과·아트마
      { bar: '장비 종류와 강화', fields: [[{ c: 'J26', lab: 'I26' }, { c: 'L26' }], { spacer: 'pc' }, [{ c: 'J27', lab: 'I27' }, { c: 'L27' }], [{ c: 'J28', lab: 'I28' }, { c: 'L28' }], [{ c: 'J29', lab: 'I29' }, { c: 'L29' }], [{ c: 'J30', lab: 'I30' }, { c: 'L30' }],
        { c: 'G33', t: '세트 효과' }, [{ c: 'G34', t: '아트마' }, { c: 'H34' }]] },
      { bar: '카트리지', note: '종류와 수치(단계)', wide: true, fields: [[{ c: 'J31', lab: 'I31' }, { c: 'L31' }], [{ c: 'J32', lab: 'I32' }, { c: 'L32' }], [{ c: 'J33', lab: 'I33' }, { c: 'L33' }], [{ c: 'J34', lab: 'I34' }, { c: 'L34' }]] },
      { bar: '전투력 출력 기준 필드', note: '랭킹은 네블론 레이드 : 글리터 보스 기준으로만 올릴 수 있어요', fields: [{ c: 'I8', t: '필드' }], extra: 'field' },
      { bar: '강렬:초월 스킬 비율', note: '강렬 스킬과 초월 스킬을 얼마나 쓰는지예요.\n기본은 강렬 35 : 초월 65예요. 내 비율을 알면 고쳐 주세요. 비율만 맞으면 되고, 합이 100이 아니어도 돼요.\n끄면 시트의 자동 비율로 계산해요.', noteCell: 'A_A9',
        fields: [{ c: 'A_B4', t: '직접 넣기' }, { c: 'A_B5', t: '입력 기준' }, { c: 'A_B6', t: '강렬 스킬' }, { c: 'A_B7', t: '초월 스킬' }] },
      { bar: '추피 보정', note: '싸움이 짧아 추가 지속 피해가 다 안 들어갈 때. 켜면 랭킹에 올릴 수 없어요', fields: [{ c: 'A_E4', t: '켜기' }, { c: 'A_E5', t: '평균 딜타임 (초)' }] },
      { bar: '가동률 DPS 전환', note: '스킬을 더 자주 쓰는 효과를 실투력에 넣는 비율. 켜면 랭킹에 올릴 수 없어요', noteCell: 'A_G7', fields: [{ c: 'A_H4', t: '직접 넣기' }, { c: 'A_H5', t: '전환 계수' }] },
      { bar: '쿨타임 감소 상한', note: '쿨감 상한을 직업 기본값보다 낮게 정해 두고, 그 상한에 맞춘 세팅을 볼 때. 켜면 랭킹에 올릴 수 없어요', noteCell: 'A_J7', fields: [{ c: 'A_K4', t: '켜기' }, { c: 'A_K5', t: '상한 (%)' }] },
      { bar: 'HP 구간별 하의 스위칭', note: '보스 체력 50%를 기준으로 다른 하의로 갈아입을 때. 켜면 랭킹에 올릴 수 없어요', wide: true, fields: [], extra: 'sw' },
    ] },
  ];

  // 검증 목록(드롭다운): 고급사용자모드 칸은 'A_' 붙여서
  const DV = {};
  for (const d of M.validations) for (const a of d.cells) DV[(d.sheet === ADV ? 'A_' : '') + a] = d;
  // 크리·극대화는 스탯창에서 100%가 끝이라(넘으면 시트가 계산을 못 함) 100%로 자름. 아바타·소켓 추천에서 더한 값이 넘을 때도
  const CAP100 = new Set(['C17', 'C19']);
  const toSheet = (a, v) => PCT.has(a) && typeof v === 'number' ? Math.round((CAP100.has(a) ? Math.min(Math.max(v, 0), 1) : v) * 100 * 1e9) / 1e9 : v;
  const fromSheet = (a, v) => PCT.has(a) && typeof v === 'number' ? Math.round(v / 100 * 1e12) / 1e12 : v;
  // 피시방·에너지드링크·지애 → 시트의 '피시방 버프 미연결' 칸
  function extraCells(inp, put) {
    const pc = inp.ZB1 === true, en = inp.ZB3 === true, ja = inp.ZB2 === true;
    put(CALC, 'C614', pc ? 1.05 : 1); put(CALC, 'C615', en ? 0.05 : 0); put(CALC, 'C616', en ? 0.05 : 0); put(CALC, 'C617', en ? 1.05 : 1); put(CALC, 'C621', ja ? 1.05 : 1);
  }
  // 계산기 입력 → 시트 칸 { '<Main>!C17': 86.4, ... }
  function sheetInputs(inp) {
    const o = {};
    for (const [a, v] of Object.entries(inp || {})) {
      if (a.startsWith('_') || a === 'C27' || !/^(A_)?[A-Z]{1,2}\d+$/.test(a)) continue; // 피시방 등 체크칸(ZB1~3)도 <Main> 빈 칸에 적어 둠(계산은 extraCells)
      const [sh, c] = sheetOf(a); o[sh + '!' + c] = toSheet(a, v);
    }
    o['<Main>!L15'] = '미사용'; // 포스스킬 육참골단은 칸을 없애고 늘 미사용으로 계산
    if (M.meta.sw && swOn(inp || {})) { const p = swPack(inp); for (const [c, v] of Object.entries(p.cells)) o[ADV + '!' + c] = v; } // 하의 스위칭 바지 칸 → 옵션 줄
    extraCells(inp || {}, (sh, c, v) => { o[sh + '!' + c] = v; });
    return o;
  }
  const gx = (w, a) => { const [sh, c] = sheetOf(a); const v = w.get(sh, c); return E.isErr(v) ? v.code : fromSheet(a, v); };
  const g = (a) => gx(wb, a);
  // 실투력 칸: 기본은 '현재·교체 후 계산'!C498, 하의 스위칭 계산식을 더하면 <Main>!C35(스위칭을 끄면 C498과 같음)
  const cpOf = (w) => { const at = (M.meta && M.meta.cp) || [CALC, 'C498']; return w.get(at[0], at[1]); };
  const atkType = (w) => { const v = (w || wb).get(CALC, 'C193'); return v === '물리' || v === '마법' ? v : null; };
  const LABEL_FALLBACK = { B11: '공격력', B12: '공격력 극대화 범위 내 최댓값', B13: '무기 공격력 (스탯창 X)' };
  const label = (a) => { const v = g(a); if (v == null || v === '' || String(v).startsWith('#')) return LABEL_FALLBACK[a] || ''; return String(v).trim(); };
  const labelOf = label;
  const defaultOf = (a) => { if (a in EXTRA_BUFF) return false; const [sh, c] = sheetOf(a); const d = (M.sheets[sh] || {})[c]; return d && 'v' in d ? fromSheet(a, d.v) : null; };
  function optionsOf(a, w) {
    const d = DV[a]; if (!d || d.type !== 'list') return null;
    if (d.options) return d.options;
    const ww = w || wb, r = ww.makeRange(d.source[0], d.source[1]); const m = ww.rangeValue(r);
    const vals = (m instanceof E.Matrix ? m.flat() : [m]).filter(v => v !== null && v !== '' && !E.isErr(v)).map(v => fromSheet(a, v));
    return [...new Set(vals)];
  }
  // 쿨타임 감소 상한 안내: 시트 '기본값 · 35%' → 이 직업 기본 상한. 켰는데 상한 칸이 0~100이 아니면 시트 안내 문구
  const capNote = () => { const w = label('A_J6'); if (w) return w; const m = /([\d.]+)\s*%/.exec(label('A_J7')); return m ? `이 직업의 기본 상한은 ${+m[1]}%예요` : ''; };
  const kindOf = (a, f) => f && f.k ? f.k : DV[a] && DV[a].type === 'list' ? 'select' : PCT.has(a) ? 'pct' : typeof defaultOf(a) === 'boolean' ? 'check' : 'num';

  const CAN_LINK = !!window.SIL_CDN; // 링크 공유는 직접 호스팅판에서만 (Claude 링크는 주소 뒤 값을 못 넘김)
  // ---------- 처음 상태: 시트 예시 값 대신 빈 세팅 ----------
  const STAT_CELLS = 'C11 C12 C13 C14 C15 C17 C18 C19 C20 C21 C22 C24 C25 C26 C27 C29 C30 C31 C32 C33 C34'.split(' ');
  const NONE = '해당사항 없음';
  const BLANK = Object.assign({ _v: 3, C6: '' }, Object.fromEntries(STAT_CELLS.map(a => [a, null])), {
    H11: 0.1, H12: 0, H13: 0, ZB1: false, ZB2: false, ZB3: false, H15: '사용', H16: '이상', F17: '격려 재사용 시간 감소', F18: '격려 재사용 시간 감소', H17: 0.15, H18: 0.15,
    D20: '물리 공격력 (%)', D21: '크리티컬 데미지', D22: '스킬 데미지', H20: 0.05, H21: 0.05, H22: 0.05,
    G24: 'Dogma', G25: '압도', G27: NONE, G28: NONE, G29: NONE, G30: NONE, G32: '황색',
    L11: '', L15: '미사용',
    J17: '엘 하우스(강화)', J18: '천상의 디저트파티', J19: '사용', J20: '투지의 물약', J21: '적용2-녹엑사 (팟모스뎀, 팟물마 10)', J22: '미적용', J23: '아리엘의 스페셜 기프트 마크',
    J26: '사룡무', L26: 12, J27: '네블론', J28: '네블론', J29: '네블론', J30: '네블론', L27: 11, L28: 11, L29: 11, L30: 11,
    J31: NONE, J32: NONE, J33: NONE, J34: NONE, L31: NONE, L32: NONE, L33: NONE, L34: NONE,
    G33: '엑사&네블론 - 연산', G34: '유수', H34: '유니크', I8: '네블론 레이드 : 글리터 보스',
    A_B4: true, A_B5: '강초뎀 적용 이전', A_B6: 35, A_B7: 65, _s35: 1, A_E4: false, A_E5: 30, A_H4: false, A_H5: 0.24, A_K4: false, A_K5: 17,
  });
  const blank = () => Object.assign({}, BLANK);
  const isEmptySetting = (inp) => !inp.C6 || !(Number(inp.C11) > 0);

  // ---------- 예전(ver.2 시트) 세팅 → ver.3 ----------
  // 칸 위치: 무기 J31→J26, 방어구 J26~J29→J27~J30, 세트 J30→G33, 아트마 J32·L32→G34·H34, 필드 I34→I8, 아티팩트 D35→G32,
  // 강렬:초월 L42·M46·I46·K46→고급사용자모드 B4·B5·B6·B7. 보기 글자에서 '%'·'의 아트마'·'증가 (%)'가 빠짐
  const ENGRAVE_V3 = { '물리 공격력 증가 (%)': '물리 공격력 (%)', '마법 공격력 증가 (%)': '마법 공격력 (%)', '스킬 데미지 증가 (%)': '스킬 데미지', '크리티컬 데미지 증가 (%)': '크리티컬 데미지', '보스에게 입히는 피해 증가 (%)': '보스 피해' };
  function migrateV2(v) {
    if (!v || typeof v !== 'object' || v._v === 3) return v;
    const o = { _v: 3 };
    const copy = 'C6 C11 C12 C13 C14 C15 C17 C18 C19 C20 C21 C22 C24 C25 C26 C27 C29 C30 C31 C32 C33 C34 H11 H12 H13 H15 H16 F17 F18 H17 H18 H20 H21 H22 G24 G25 G27 G28 G29 G30 J17 J18 J19 J20 J22 J23 ZB1 ZB2 ZB3 _eq'.split(' ');
    for (const c of copy) if (c in v) o[c] = v[c];
    for (const c of ['H20', 'H21', 'H22']) if (typeof o[c] === 'string' && /강화수치/.test(o[c])) o[c] = '[0.5*강화수치]';
    for (const c of ['D20', 'D21', 'D22']) if (c in v) o[c] = ENGRAVE_V3[v[c]] || v[c];
    if ('J21' in v) o.J21 = String(v.J21).replace(/%\)/, ')');
    const mv = (from, to) => { if (from in v) o[to] = v[from]; };
    mv('J31', 'J26'); mv('L31', 'L26');
    mv('J26', 'J27'); mv('L26', 'L27'); mv('J27', 'J28'); mv('L27', 'L28'); mv('J28', 'J29'); mv('L28', 'L29'); mv('J29', 'J30'); mv('L29', 'L30');
    mv('J30', 'G33'); mv('L32', 'H34'); mv('D35', 'G32');
    if ('J32' in v) o.G34 = String(v.J32).replace(/의\s*아트마$/, '');
    if ('I34' in v) o.I8 = String(v.I34).replace(/%/g, '');
    mv('L42', 'A_B4'); mv('M46', 'A_B5'); mv('I46', 'A_B6'); mv('K46', 'A_B7');
    // 직업 선택 스킬(룬 마스터 크리티컬 소드, 페이탈 팬텀 샤프슈터 신드롬): 예전엔 (노첸)·(체인지) 두 줄
    if (v.L12 === '사용') o.L11 = '체인지'; else if (v.L11 === '사용') o.L11 = '일반';
    if (v.L15) o.L15 = v.L15;
    for (const c of ['J31', 'J32', 'J33', 'J34', 'L31', 'L32', 'L33', 'L34']) o[c] = NONE;
    return o;
  }

  // 강렬:초월 기본 35:65. 이 기본이 생기기 전 세팅(자동 비율 또는 예전 창 기본 초월 100:강렬 0)은 35:65로
  function shareFix(v) {
    if (!v || typeof v !== 'object' || v._s35) return v;
    const old100 = v.A_B4 === true && Number(v.A_B7) === 100 && Number(v.A_B6) === 0;
    if (v.A_B4 !== true || old100) { v.A_B4 = true; v.A_B6 = 35; v.A_B7 = 65; if (!v.A_B5) v.A_B5 = '강초뎀 적용 이전'; }
    v._s35 = 1;
    return v;
  }

  // 실투력 계산 방식 버전: 계산이 바뀔 때 올림. 랭킹에 올린 세팅에 같이 적어서, 예전 방식으로 올린 기록은 랭킹에 '업데이트 전 지표'로 표시
  const CALC_VER = '3.0.18'; // 시트 3.0.19·3.0.21·3.0.22도 그대로 둠(올리면 랭킹이 모두 '업데이트 전 지표'로 표시됨). 3.0.21은 딜러 직업의 서포트 1·2형 카트리지만 효과가 빠짐(서포터 직업만 적용), 3.0.22는 레이지 하츠 폭나헨 크뎀을 뺌, 3.0.23은 쿨감 상한 설정 추가와 강렬·초월 쿨감이 다를 때만 아주 조금 달라짐

  // ---------- 상태 / 저장 ----------
  const LS = 'silcalc.v1';
  let store = { current: '내 캐릭터', profiles: { '내 캐릭터': blank() } };
  let fresh = true;
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s && s.profiles) { store = s; fresh = false; } } catch (e) { /* 저장소 없음 */ }
  if (!store.bases) store.bases = {};
  if (!store.mig) store.mig = {};
  // 처음 쓰는 사람은 예전 버전 고침이 필요 없음
  if (fresh) Object.assign(store.mig, { setFx: 1, healFx: 1, sageFx: 1, preset1: 1, sage2: 1, pcrit10: 1, azoth1: 1, immortal1: 1, heal3: 1, eqFix: 1 });
  // 예전 버전에서 손대지 않은 캐릭터(시트 예시 값)는 빈 세팅으로
  for (const [k, v] of Object.entries(store.profiles)) if (!v || !Object.keys(v).length) { store.profiles[k] = blank(); if (store.bases) delete store.bases[k]; }
  // ---- ver.2 시절 세팅 고침(그때 칸 이름 기준). ver.3로 옮기기 전에 한 번씩만 ----
  const OLD_BLANK = { J30: '엑사&네블론 - 연산', J21: '적용2-녹엑사 (팟모스뎀, 팟물마 10%)', D20: '물리 공격력 증가 (%)', D21: '크리티컬 데미지 증가 (%)', D22: '스킬 데미지 증가 (%)', G24: 'Dogma', G25: '압도',
    J17: '엘 하우스(강화)', J18: '천상의 디저트파티', J19: '사용', J20: '투지의 물약', J23: '아리엘의 스페셜 기프트 마크', H15: '사용', H16: '이상', F17: '격려 재사용 시간 감소', F18: '격려 재사용 시간 감소', H17: 0.15, H18: 0.15,
    D35: '황색', G35: '5세트', J26: '네블론', J27: '네블론', J28: '네블론', J29: '네블론', L26: 11, L27: 11, L28: 11, L29: 11, J31: '사룡무', L31: 12, J32: '유수의 아트마', L32: '유니크' };
  const OLD_HEAL = '적용3-적청엑사 (팟크뎀 10%)';
  const old2 = () => [...Object.values(store.profiles), ...Object.values(store.bases)].filter(v => v && v._v !== 3);
  const HEALERS = new Set(['디우스 아에르', '일천', '오버마인드', '데메르시오', '블루헨', '라디언트 소울', '닉스 피에타', '애버리스']);
  for (const v of old2()) if (v.D20 === '해당사항 없음' && v.D21 === '해당사항 없음' && v.D22 === '해당사항 없음' && v.H20 === '해당사항 없음') Object.assign(v, { D20: OLD_BLANK.D20, D21: OLD_BLANK.D21, D22: OLD_BLANK.D22, H20: 0.05, H21: 0.05, H22: 0.05 });
  for (const v of old2()) if (!v.C6 || !(Number(v.C11) > 0)) { if (v.G24 === '미착용') v.G24 = OLD_BLANK.G24; if (v.G25 === '미착용') v.G25 = OLD_BLANK.G25; }
  if (!store.mig.setFx) { for (const v of old2()) if (v.J30 === '해당사항 없음') v.J30 = OLD_BLANK.J30; store.mig.setFx = 1; }
  if (!store.mig.healFx) { for (const v of old2()) if (v.J21 === '미적용') v.J21 = OLD_BLANK.J21; store.mig.healFx = 1; }
  if (!store.mig.sageFx) {
    for (const v of old2()) { if (v.C6 !== '에테르 세이지') continue; if (v.J21 === OLD_HEAL) v.J21 = OLD_BLANK.J21; if (v.J30 === OLD_BLANK.J30) v.J30 = '엑사&네블론 - 순환'; }
    store.mig.sageFx = 1;
  }
  if (!store.mig.preset1) {
    const OLD = { J17: '미사용', J18: '미사용', J19: '미사용', J20: '미사용', J23: '해당사항 없음', H15: '미사용' };
    for (const v of old2()) {
      for (const [c, o] of Object.entries(OLD)) if (v[c] === o || v[c] == null) v[c] = OLD_BLANK[c];
      if (v.H16 == null) v.H16 = OLD_BLANK.H16;
      for (const [f, h] of [['F17', 'H17'], ['F18', 'H18']]) if ((v[f] == null || v[f] === '해당사항 없음') && !(Number(v[h]) > 0)) { v[f] = OLD_BLANK[f]; v[h] = OLD_BLANK[h]; }
      if (v.D35 == null) v.D35 = OLD_BLANK.D35;
      for (const [t, l] of [['J26', 'L26'], ['J27', 'L27'], ['J28', 'L28'], ['J29', 'L29'], ['J31', 'L31']]) if (v[t] == null) { v[t] = OLD_BLANK[t]; if (!(Number(v[l]) > 0)) v[l] = OLD_BLANK[l]; }
      if ((v.J32 == null || v.J32 === '미적용') && (v.L32 == null || v.L32 === '미착용')) { v.J32 = OLD_BLANK.J32; v.L32 = OLD_BLANK.L32; }
      if (HEALERS.has(v.C6) && v.J21 === OLD_BLANK.J21) v.J21 = OLD_HEAL;
    }
    store.mig.preset1 = 1;
  }
  if (!store.mig.sage2) { for (const v of old2()) if (v.C6 === '에테르 세이지' && v.J30 === OLD_BLANK.J30) v.J30 = '엑사&네블론 - 순환'; store.mig.sage2 = 1; }
  if (!store.mig.pcrit10) { for (const v of old2()) if (!(Number(v.H11) > 0) && /연산|순환/.test(String(v.J30 ?? OLD_BLANK.J30))) v.H11 = 0.1; store.mig.pcrit10 = 1; }
  for (const v of old2()) {
    if (typeof v.ZB1 === 'string') { const t = v.ZB1; v.ZB1 = /피방/.test(t); v.ZB3 = /에너지/.test(t); }
    if (typeof v.ZB2 === 'string') v.ZB2 = /지애/.test(v.ZB2);
  }
  if (!store.mig.heal3) { for (const v of old2()) if (HEALERS.has(v.C6) && v.J30 === OLD_BLANK.J30) { v.J30 = '엑사&네블론 - 복원'; if (Number(v.H11) === 0.1) v.H11 = 0; } store.mig.heal3 = 1; }
  if (!store.mig.eqFix) {
    for (const [k, v] of Object.entries(store.profiles)) {
      if (!v || v._v === 3 || !v._eq) continue;
      const b = store.bases[k];
      if (v.C29 != null && v.C29 === v.C30 && b && b.C29 != null && b.C30 != null && b.C29 !== b.C30 && Math.max(b.C29, b.C30) === v.C29) { v.C29 = b.C29; v.C30 = b.C30; }
      const m = Math.max(Number(v.C24) || 0, Number(v.C25) || 0); if (m > 0) v.C24 = v.C25 = m;
    }
    store.mig.eqFix = 1;
  }
  store.mig.azoth1 = store.mig.immortal1 = 1; // 로드 아조트·임모탈 버프는 ver.3에서 직업 패시브로 자동
  // ver.3로 옮김
  for (const src of [store.profiles, store.bases]) for (const k of Object.keys(src)) if (src[k] && src[k]._v !== 3) src[k] = migrateV2(src[k]);
  store.mig.v3 = 1;
  for (const src of [store.profiles, store.bases]) for (const k of Object.keys(src)) if (src[k] && Object.keys(src[k]).length > 2) shareFix(src[k]);
  // 에테르 세이지는 방어구 세트 기본값이 순환, 녹힐 직업은 복원
  const SAGE = '에테르 세이지', SET_CYCLE = '엑사&네블론 - 순환', SET_HEAL = '엑사&네블론 - 복원';
  const HEAL_J21 = '적용3-적청엑사 (팟크뎀 10)';
  const setDefault = (cls) => HEALERS.has(cls) ? SET_HEAL : cls === SAGE ? SET_CYCLE : BLANK.G33;
  // 파티원 크뎀증: 엑사 연산·순환 세트를 입으면 10%가 기본(복원 등은 0)
  const partyCrit = (set) => /연산|순환/.test(String(set || '')) ? 0.1 : 0;
  if (!store.names) store.names = {}; // 캐릭터별 닉네임(선택)
  const nickOf = (key) => (store.names[key] || '').trim();
  let inputs = Object.assign({}, store.profiles[store.current] || {});
  if (!store.bases[store.current]) store.bases[store.current] = Object.assign({}, inputs);
  // 기준 세팅을 따로 계산해서 지금 값과 비교 (공유 링크를 볼 때는 내 세팅이 기준)
  let baseWb = new E.Workbook(M);
  let shared = null; // { n: 이름, i: 입력값 }
  function applyBase() {
    const src = shared ? (store.profiles[store.current] || {}) : (store.bases[store.current] || {});
    baseWb.assign(sheetInputs(src));
  }
  applyBase();
  function persist() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* 무시 */ } }
  // 테네브로스 3옵(C27)은 입력란을 없앴으니 예전에 넣은 값이 있어도 계산에 안 씀(시트 기본값 0). 바뀐 칸에 걸린 계산만 다시 함
  function applyInputs() { wb.assign(sheetInputs(inputs)); }
  // 한 칸 바꾸기(계산기 입력 이름 기준)
  function setIn(a, v) {
    inputs[a] = v;
    if (!a.startsWith('_sw')) { const [sh, c] = sheetOf(a); wb.setInput(sh, c, toSheet(a, v)); }
    if (a in EXTRA_BUFF) extraCells(inputs, (s2, c2, x) => wb.setInput(s2, c2, x));
    // 하의 스위칭: 바지 칸·바지 종류가 바뀌면 시트 옵션 줄을 다시 채움
    if ((a.startsWith('_sw') || a === 'J28' || a === 'A_E68' || a === 'A_B65') && swOn() && M.meta.sw) for (const [c, x] of Object.entries(swPack(inputs).cells)) wb.setInput(ADV, c, x);
  }

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
      node = el('select', { 'data-cell': a, onchange: () => { const v = parseOpt(a, node.value); if (/^[JL]3[1-4]$/.test(a)) cartChange(a, v); else setVal(a, v); } });
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
    if (spec.spacer) return el('div', { class: 'srow spacer' + (spec.spacer === 'pc' ? ' pc' : ''), 'aria-hidden': 'true' });
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
        const g = el('div', { class: 'grp' + (gr.single ? ' single' : '') + (gr.wide ? ' wide' : '') });
        if (gr.bar || gr.sub) g.append(el('p', { class: 'gtitle', text: gr.bar || gr.sub }));
        if (gr.note) g.append(el('p', { class: 'gnote', text: gr.note }));
        if (gr.noteCell) g.append(el('p', { class: 'gnote sub', 'data-notecell': gr.noteCell }));
        if (gr.fields.length) {
          const list = el('div', { class: 'rows' });
          for (const f of gr.fields) list.append(fieldRow(f));
          g.append(list);
        }
        if (gr.extra === 'field') g.append(el('div', { class: 'extra', id: 'fieldInfo' }));
        if (gr.extra === 'sw') { g.append(el('div', { class: 'sw-box', id: 'swBox' })); swSig = ''; }
        for (const c of ['J31', 'J32', 'J33', 'J34']) if (controls[c] && controls[c].node && controls[c].node.tagName === 'SELECT' && !controls[c].node._picker && g.contains(controls[c].node)) makePicker(controls[c].node); // 카트리지: 글자로 찾기
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
  // 카트리지 단계 → 게임에 보이는 수치(시트 '미표시 효과' 카트리지·레벨 표). 수치가 단계에 따라 안 바뀌는 종류는 단계만
  const fmtP = (x) => +(x).toFixed(2) + '%';
  function cartLevelText(type, lv) {
    const t = String(type || ''), i = lv - 1;
    if (!(lv >= 1 && lv <= 6)) return null;
    if (/오버플로우/.test(t)) return `투지 모스뎀 ${fmtP(0.5 * lv)}`;
    if (/엑셀레이션/.test(t)) return `쿨감 ${fmtP([1, 1.5, 2, 2.5, 3, 5][i])} · ${[10, 9, 8, 7, 5, 4][i]}초`;
    if (/서플라이/.test(t)) return `${[40, 35, 30, 25, 20, 12][i]}초마다`;
    if (/^서포트 (1형|카트리지 Type - 1)$/.test(t)) return `공용 물마공 ${fmtP(0.5 * lv)}`;
    if (/^서포트 (2형|카트리지 Type - 2)$/.test(t)) return `공용 모스뎀 ${fmtP(0.5 * lv)}`;
    // 스탯창에 바로 들어가는 카트리지(시트 '카트리지 표시 스탯')
    const BC = { '배틀 카트리지 Type - 1': '추피', '배틀 카트리지 Type - 2': '모스뎀', '배틀 카트리지 Type - 3': '강렬·초월 스뎀', '배틀 카트리지 Type - 4': '크뎀', '배틀 카트리지 Type - 5': '보뎀',
      '클래식 카트리지 Type - 1': '양극화', '클래식 카트리지 Type - 2': '쿨감' };
    if (BC[t]) return `${BC[t]} ${fmtP(0.5 * lv)}`;
    if (/뮤테이션/.test(t)) return `초적응력 ${fmtP([0.5, 1, 1.5, 2, 3, 4][i])} · 양극화 -10%`;
    return null;
  }
  // 카트리지 종류: 게임 이름(Type - 1 등) 대신 효과를 앞에 씀('카트리지' 줄 안이라 '카트리지'는 뺌. 좁은 칸에서도 효과가 먼저 보이게). 값은 시트 이름 그대로라 계산·저장·공유 링크는 안 바뀜.
  // 효과 이름은 실투력 시트에 적힌 대로. 세 번째 값: 목록 묶음(스탯 창에 바로 / 조건부·지원 / 실투력과 상관없음)
  const CART_NAME = {
    '배틀 카트리지 Type - 1': ['추피', '배틀 1', 0], '배틀 카트리지 Type - 2': ['모스뎀', '배틀 2', 0],
    '배틀 카트리지 Type - 3': ['강렬·초월 스뎀', '배틀 3', 0], '배틀 카트리지 Type - 4': ['크뎀', '배틀 4', 0],
    '배틀 카트리지 Type - 5': ['보뎀', '배틀 5', 0], '클래식 카트리지 Type - 1': ['양극화', '클래식 1', 0],
    '클래식 카트리지 Type - 2': ['쿨감', '클래식 2', 0], '하이퍼 카트리지 [뮤테이션]': ['하이퍼 뮤테이션', null, 0],
    // 하이퍼는 이름 자체로 알아볼 수 있어서 효과 없이 이름만
    '하이퍼 [오버플로우]': ['하이퍼 오버플로우', null, 1], '하이퍼 [엑셀레이션]': ['하이퍼 엑셀레이션', null, 1],
    // 아래는 게임 이름이 잘 알려져 있어서 이름은 그대로(묶음만 나눔)
    '하이퍼 카트리지 [택티컬]': [null, null, 1], '하이퍼 카트리지 [앰플리파이어]': [null, null, 1], '하이퍼 [서플라이]': [null, null, 1],
    '서포트 1형': [null, null, 1], '서포트 2형': [null, null, 1], '서포트 카트리지 Type - 3': [null, null, 1],
    '클래식 카트리지 Type - 3': [null, null, 2], '클래식 카트리지 Type - 4': [null, null, 2], '클래식 카트리지 Type - 5': [null, null, 2],
  };
  const CART_GROUP = ['상세 스탯에 바로 들어가요', '조건부·지원 효과', '실투력과 상관없어요'];
  // 카트리지 종류 목록: 없음을 맨 위에, 나머지는 묶음별로
  function fillCartOptions(node, opts, a) {
    const groups = CART_GROUP.map(t => el('optgroup', { label: t })), rest = [], order = Object.keys(CART_NAME);
    const rank = (o) => { const k = order.indexOf(String(o)); return k < 0 ? 1e9 : k; };
    for (const o of [...opts].sort((x, y) => rank(x) - rank(y))) {
      const op = el('option', { value: String(o), text: optText(a, o) }), m = CART_NAME[String(o)];
      if (String(o) === NONE) node.prepend(op); else if (m) groups[m[2]].append(op); else rest.push(op);
    }
    for (const gr of groups) if (gr.childElementCount) node.append(gr);
    for (const op of rest) node.append(op);
  }
  // 보기 글자를 짧게(값은 시트 그대로): 금빛 각인석 '물리 공격력 (%)' → '물리 공격력'
  function optText(a, o, type) {
    const s = String(o);
    if (/^J3[1-4]$/.test(a)) { if (s === NONE) return '없음'; const m = CART_NAME[s]; return !m || !m[0] ? s : m[1] ? `${m[0]} (${m[1]})` : m[0]; }
    if (/^D2[0-2]$/.test(a)) return s.replace(/\s*\(%\)$/, '');
    if (a === 'J21') return s.replace(/\s*\(.*\)$/, '');          // 효과는 ? 도움말에
    // 강렬:초월 비율 기준: 시트 용어(강초뎀 적용 이전/이후) 대신 무엇을 넣는지로
    if (a === 'A_B5') return /이후/.test(s) ? '딜 미터로 잰 비율 (강초뎀 적용 이후)' : /이전/.test(s) ? '대충 감으로 넣는 비율 (강초뎀 적용 이전)' : s;
    if (a === 'G33') return s.replace(/^엑사&네블론\s*-\s*/, '');    // '엑사&네블론 - 연산' → '연산'
    if (/^L3[1-4]$/.test(a)) {
      if (s === NONE) return '-';
      const lv = Number(o); if (!(lv > 0)) return s;
      const v = cartLevelText(type !== undefined ? type : g('J' + a.slice(1)), lv);
      return v ? `${v} (${lv}단계)` : lv + '단계';
    }
    if (/^L(2[6-9]|30)$/.test(a) && typeof o === 'number') return '+' + o;
    if (a === 'A_E69' && typeof o === 'number') return '+' + o;          // 하의 스위칭: 강화·재련
    if ((a === 'A_B70' || a === 'A_E70') && typeof o === 'number') return o + '단계';
    if (a === 'I8') return s.replace(/\s*\n\s*/g, ' ');
    if (/^H2[0-2]$/.test(a) && /강화수치/.test(s)) return '0.5% × 강화 수치';
    return s;
  }
  // ---------- 글자로 찾아 고르기(보기가 많은 칸: 카트리지, 하의 스위칭 옵션) ----------
  // 원래 <select>는 값 보관용으로 숨겨 두고(다른 코드가 그대로 씀) 그 자리에 글자 칸을 둠.
  // 누르면 전체 목록, 글자를 치면 그 글자가 들어간 것만(띄어쓰기 무시, 'ㅋㄷ'처럼 초성도 됨). 고르면 <select>의 change를 그대로 일으킴
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const choOf = (s) => [...s].map(ch => { const k = ch.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : ch; }).join('');
  const qNorm = (s) => String(s).toLowerCase().replace(/[\s()[\]·.,_-]+/g, '');
  const pickHit = (o, q) => {
    if (!q) return true;
    const t = qNorm(o.textContent + ' ' + o.value), qq = qNorm(q);
    return t.includes(qq) || (/^[ㄱ-ㅎ]+$/.test(qq) && choOf(t).includes(qq));
  };
  const pickers = new Set();
  function makePicker(sel) {
    if (sel._picker) return sel._picker.wrap;
    const wrap = el('span', { class: 'pick' });
    const inp = el('input', { type: 'text', class: 'pick-in', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const list = el('div', { class: 'pick-list', role: 'listbox', hidden: '' });
    if (sel.parentNode) sel.parentNode.insertBefore(wrap, sel);
    for (const c of sel.classList) if (c !== 'pick-src') wrap.classList.add('pk-' + c);
    wrap.append(sel, inp, list); sel.classList.add('pick-src'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    let items = [], act = -1;
    const text = () => { const o = sel.selectedOptions[0]; return o ? o.textContent : ''; };
    const sync = () => {
      inp.disabled = sel.disabled;
      if (document.activeElement === inp) return;
      inp.value = text();
      const o0 = sel.querySelector('option[value=""]'); inp.placeholder = o0 ? o0.textContent : '';
    };
    const mark = (i) => { items.forEach((it, j) => it.node.classList.toggle('on', j === i)); act = i; if (items[i]) items[i].node.scrollIntoView({ block: 'nearest' }); };
    const build = (q) => {
      list.innerHTML = ''; items = [];
      const add = (o, sub) => {
        const n = el('div', { class: 'pick-it' + (sub ? ' sub' : '') + (o.value === sel.value ? ' cur' : ''), role: 'option', text: o.textContent });
        n.addEventListener('mousedown', (e) => { e.preventDefault(); choose(o.value); });
        items.push({ node: n, o }); list.append(n);
      };
      for (const node of sel.children) {
        if (node.tagName === 'OPTGROUP') {
          const os = [...node.children].filter(o => pickHit(o, q)); if (!os.length) continue;
          list.append(el('div', { class: 'pick-grp', text: node.label })); os.forEach(o => add(o, true));
        } else if (node.tagName === 'OPTION' && (!q || (node.value !== '' && pickHit(node, q)))) add(node, false);
      }
      if (!items.length) list.append(el('div', { class: 'pick-none', text: '맞는 게 없어요' }));
      const cur = items.findIndex(it => it.o.value === sel.value);
      mark(q ? (items.length ? 0 : -1) : cur);
    };
    const show = () => { list.hidden = false; wrap.classList.add('open'); };
    const hide = () => { list.hidden = true; wrap.classList.remove('open'); };
    const choose = (v) => {
      hide();
      if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      inp.blur(); sync();
    };
    // 누르면 글자 칸을 비우고(지금 값은 흐린 글자로) 바로 칠 수 있게
    inp.addEventListener('focus', () => { inp.placeholder = text() || inp.placeholder; inp.value = ''; build(''); show(); });
    inp.addEventListener('input', () => { build(inp.value.trim()); show(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) { build(''); show(); } const n = items.length; if (n) mark(((act < 0 ? (e.key === 'ArrowDown' ? -1 : 0) : act) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[act]) choose(items[act].o.value); else if (items.length === 1) choose(items[0].o.value); }
      else if (e.key === 'Escape') { hide(); inp.blur(); sync(); }
    });
    // 다른 곳을 누르면 닫음. 친 글자가 보기 하나와 딱 맞으면 그걸로
    inp.addEventListener('blur', () => {
      const q = qNorm(inp.value), hit = q && [...sel.options].find(o => qNorm(o.textContent) === q);
      hide();
      if (hit && hit.value !== sel.value) choose(hit.value); else sync();
    });
    sel._picker = { wrap, sync };
    pickers.add(sel._picker); sync();
    return wrap;
  }
  function syncPickers() { for (const p of pickers) { if (!p.wrap.isConnected) { pickers.delete(p); continue; } p.sync(); } }

  function fillSelect(node, a) {
    const opts = optionsOf(a) || [];
    const cur = g(a);
    const key = opts.join('\u0001') + (/^L3[1-4]$/.test(a) ? '\u0002' + g('J' + a.slice(1)) : ''); // 카트리지 단계 글자는 종류에 따라 다름
    if (node._key !== key) {
      node.innerHTML = '';
      if (/^J3[1-4]$/.test(a)) fillCartOptions(node, opts, a);
      else for (const o of opts) node.append(el('option', { value: String(o), text: typeof o === 'number' && PCT.has(a) ? +(o * 100).toFixed(2) + '%' : optText(a, o) }));
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
    if (c.row) { const b = gx(baseWb, a); c.row.classList.toggle('changed', String(v) !== String(b)); }
  }
  function syncLabels() {
    document.querySelectorAll('[data-labcell]').forEach(n => { const t = label(n.getAttribute('data-labcell')); if (n.textContent !== t) n.textContent = t; });
    // 고를 스킬이 없는 직업은 그 줄을 숨김
    if (controls.L11 && controls.L11.row) controls.L11.row.hidden = !label('I11');
    // 카트리지는 그 부위 방어구가 네블론일 때만 있어서, 아닌 부위 줄은 숨김(골라 둔 카트리지가 있으면 보여 줌)
    for (const [arm, jc] of [['J27', 'J31'], ['J28', 'J32'], ['J29', 'J33'], ['J30', 'J34']]) {
      const c = controls[jc]; if (!c || !c.row) continue;
      c.row.hidden = String(g(arm)) !== '네블론' && String(g(jc) ?? NONE) === NONE;
    }
    // 기본 강렬:초월 비율 안내(직업·스탯마다 다름)
    document.querySelectorAll('[data-notecell]').forEach(n => { const c = n.getAttribute('data-notecell'); const t = c === 'A_A9' && inputs.A_B4 === true ? '' : c === 'A_J7' ? capNote() : label(c); if (n.textContent !== t) n.textContent = t; n.hidden = !t; });
  }

  // ---------- 카트리지 → 상세 스탯 ----------
  // 배틀·클래식·뮤테이션 카트리지는 게임 상세 스탯 창 숫자에 바로 들어감(단계마다 0.5%, 뮤테이션 초적응력은 0.5/1/1.5/2/3/4%와 양극화 -10%).
  // 계산기 탭에서 카트리지를 바꾸거나 빼면 상세 스탯도 그만큼 바꿀지 물어봄. 스크린샷을 읽은 뒤 지금 낀 카트리지를 처음 맞출 때는
  // 이미 스탯에 들어 있으니 '카트리지만 바꾸기'를 고르면 됨. 카트리지는 그 부위가 네블론일 때만 낄 수 있음
  const CART_STAT = {
    '배틀 카트리지 Type - 1': (lv) => ({ C22: 0.005 * lv }),
    '배틀 카트리지 Type - 2': (lv) => ({ C33: 0.005 * lv }),
    '배틀 카트리지 Type - 3': (lv) => ({ C29: 0.005 * lv, C30: 0.005 * lv }),
    '배틀 카트리지 Type - 4': (lv) => ({ C18: 0.005 * lv }),
    '배틀 카트리지 Type - 5': (lv) => ({ C21: 0.005 * lv }),
    '클래식 카트리지 Type - 1': (lv) => ({ C20: 0.005 * lv }),
    '클래식 카트리지 Type - 2': (lv) => ({ C31: 0.005 * lv, C32: 0.005 * lv }),
    '하이퍼 카트리지 [뮤테이션]': (lv) => ({ C15: [0.005, 0.01, 0.015, 0.02, 0.03, 0.04][lv - 1], C20: -0.1 }),
  };
  const CART_ARM = { 31: 'J27', 32: 'J28', 33: 'J29', 34: 'J30' };
  function cartStats(v) {
    const sum = {};
    for (const n of [31, 32, 33, 34]) {
      const f = CART_STAT[String(v['J' + n] ?? '')], lv = Number(v['L' + n]);
      if (!f || !(lv >= 1 && lv <= 6) || String(v[CART_ARM[n]] ?? '') !== '네블론') continue;
      for (const [c, x] of Object.entries(f(lv))) sum[c] = (sum[c] || 0) + x;
    }
    return sum;
  }
  async function cartChange(a, v) {
    const before = cartStats(inputs), after = cartStats(Object.assign({}, inputs, { [a]: v }));
    setVal(a, v);
    const ch = [];
    for (const c of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const d = +((after[c] || 0) - (before[c] || 0)).toFixed(6); if (!d) continue;
      const cur = inputs[c]; if (typeof cur !== 'number') continue; // 상세 스탯을 아직 안 넣었으면 물을 게 없음
      let nv = Math.max(0, +(cur + d).toFixed(6)); if (c === 'C20') nv = Math.min(0.6, nv); // 양극화는 60%가 상한
      if (nv !== cur) ch.push([c, cur, nv]);
    }
    if (!ch.length) return;
    const name = (c) => LABEL_OF[c] || label('B' + c.slice(1));
    const lines = ch.map(([c, cur, nv]) => `${name(c)}: ${fmtPct(cur)} → ${fmtPct(nv)}`).join('\n');
    const capped = ch.some(([c, cur]) => c === 'C20' && cur >= 0.6) ? '\n양극화가 상한(60%)이라 실제로는 덜 빠질 수 있어요.' : '';
    const ok = await dialog({ title: '상세 스탯도 같이 바꿀까요?',
      text: `${lines}${capped}\n\n지금 낀 카트리지를 처음 맞추는 거라면 '카트리지만 바꾸기'를 눌러 주세요. 스크린샷으로 읽은 상세 스탯에 이미 들어 있어요.`,
      ok: '상세 스탯도 바꾸기', cancel: '카트리지만 바꾸기' });
    if (!ok) return;
    for (const [c, , nv] of ch) setVal(c, nv);
    toast('상세 스탯도 카트리지만큼 바꿨어요');
  }

  // ---------- HP 구간별 하의 스위칭 (시트 고급사용자모드 64~83행) ----------
  // 체력 50% 초과일 때는 지금 스탯창의 하의(강배 바지 = 장비 종류와 강화의 하의), 50% 이하일 때는 갈아입는 하의(역강배 바지)로 계산.
  // 실투력은 <Main>!C35. 화면은 바지 칸(소켓 5 · 칩 · 카트리지(네블론) · 옵션변환 3줄(네블론) · 추가 효과(엑사스케일))으로 받고,
  // 계산할 때 두 바지에서 다른 칸만 골라 시트 옵션 줄 10개(72~81행, 강배 A~C열 · 역강배 D~F열)에 차례로 채움(swPack).
  //   시트 계산은 '지금 스탯창 − 강배 줄 + 역강배 줄'이라 줄 순서는 상관없음. 역강배 쪽이 빈 줄은 시트가 '강배와 같음'으로 보므로
  //   강배 줄만 있는 자리에는 역강배 쪽에 '해당사항 없음'을 적음. 칸이 많아도 한쪽이 10개를 넘지 않음(네블론 5+1+1+3).
  // 강배 바지 카트리지는 위 '카트리지'의 하의 값(J32)으로 계산. 역강배가 엑사스케일이면 시트가 카트리지를 알아서 뺌.
  // 칩·회로의 HP 50% 초과·이하 피해(강배·역강배)는 시트도 줄에서 안 쓰고 상세 스탯의 강배·역강배 칸 값을 그대로 씀 → 보기에서 뺌. 회로는 칸을 안 둠.
  // 옵션 보기는 model_sw.js에 미리 뽑아 둔 목록(M.meta.swCatalog)을 씀. 계산식이 커서(압축 약 180KB) 켤 때만 받아 model.js에 더함
  const SW_ROW0 = 72, SW_ROWS = 10;
  const SW_SOCK = '소켓 효과 (마법석)', SW_CHIP = '칩 (엑사&네블론)', SW_CART = '카트리지 (네블론)', SW_OV = '옵션변환 (네블론)', SW_EX = '추가 효과 (시줌)';
  const SW_EXA = '엑사스케일', SW_NEB = '네블론', SW_BOTH = [SW_EXA, SW_NEB];
  const SW_SLOTS = [1, 2, 3, 4, 5].map(i => ({ id: 's' + i, name: '소켓 ' + i, cat: SW_SOCK, types: SW_BOTH }))
    .concat([{ id: 'chip', name: '칩', cat: SW_CHIP, types: SW_BOTH }, { id: 'cart', name: '카트리지', cat: SW_CART, types: [SW_NEB], cart: true }])
    .concat([1, 2, 3].map(i => ({ id: 'ov' + i, name: '옵션변환 ' + i, cat: SW_OV, types: [SW_NEB] })))
    .concat([1, 2, 3].map(i => ({ id: 'ex' + i, name: '추가 효과 ' + i, cat: SW_EX, types: [SW_EXA] })));
  const SW_CELLS = ['A_B65', 'A_B70', 'A_E68', 'A_E69', 'A_E70'];
  function swOn(inp) { return (inp || inputs).A_B65 === '사용'; } // 함수 선언: 시작할 때 sheetInputs에서도 부름
  let swState = M.meta && M.meta.sw ? 'ready' : 'none'; // none · loading · ready · error
  let swWait = null, swSig = '';
  const swK = (side, s, v) => '_sw' + side + s.id + (v ? 'v' : '');
  const swRaw = (inp, k) => { const v = inp[k]; return v === null || v === undefined ? '' : v; };
  const swHP = (o) => /^HP[>≤]50%/.test(String(o)); // 강배·역강배: 상세 스탯 칸으로 계산
  const swOpt = (cat, o) => ((M.meta.swCatalog || {})[cat] || []).find(x => x.o === o) || null;
  const swNoVal = (cat, o) => { const x = swOpt(cat, o); return !o || o === NONE || o === '미장착' || (x && x.t === 'none'); };
  // 두 바지 칸 → 시트 옵션 줄. 줄마다 어느 칸인지도 돌려줌(시트 안내 문구를 칸 이름으로 바꾸는 데 씀)
  function swPack(inp) {
    const lt = String(inp.J28 ?? ''), rt = String(inp.A_E68 ?? '');
    const L = [], R = [];
    for (const s of SW_SLOTS) {
      const lOn = !s.cart && s.types.includes(lt), rOn = s.types.includes(rt);
      const lo = lOn ? swRaw(inp, swK('L', s)) : '', lv = lOn ? swRaw(inp, swK('L', s, 1)) : '';
      let ro = rOn ? swRaw(inp, swK('R', s)) : '', rv = rOn ? swRaw(inp, swK('R', s, 1)) : '';
      if (rOn && ro === '' && lOn) { ro = lo; rv = lv; } // 강배와 같음
      if (lo !== '' && lo === ro && String(lv) === String(rv)) continue; // 같으면 빼고 더할 것이 없음
      if (lo !== '' && lo !== NONE) L.push({ cat: s.cat, o: lo, v: lv, name: s.name });
      if (ro !== '' && ro !== NONE) R.push({ cat: s.cat, o: ro, v: rv, name: s.name });
    }
    const cells = {};
    for (let i = 0; i < SW_ROWS; i++) {
      const r = SW_ROW0 + i, l = L[i], q = R[i] || (l ? { cat: l.cat, o: l.cat === SW_CART ? '미장착' : NONE, v: '' } : null);
      const put = (c, v) => { cells[c + r] = v === '' || v === undefined ? null : v; };
      put('A', l ? l.cat : ''); put('B', l ? l.o : ''); put('C', l && !swNoVal(l.cat, l.o) ? l.v : '');
      put('D', q ? q.cat : ''); put('E', q ? q.o : ''); put('F', q && !swNoVal(q.cat, q.o) ? q.v : '');
    }
    return { cells, L: L.map(x => x.name), R: R.map(x => x.name) };
  }
  // 처음 만든 두 방식(줄마다 범주를 고르던 값 A_A72~A_F81)을 바지 칸 값으로 옮김. 회로 줄은 뺌
  function swMigrate(v) {
    if (!v || typeof v !== 'object' || !Object.keys(v).some(k => /^A_[A-F](7[2-9]|8[01])$/.test(k))) return v;
    const o = Object.assign({}, v), take = (side, cat) => SW_SLOTS.find(s => s.cat === cat && (side === 'R' || !s.cart) && swRaw(o, swK(side, s)) === '');
    for (let r = SW_ROW0; r < SW_ROW0 + SW_ROWS; r++) {
      const g1 = (c) => swRaw(v, 'A_' + c + r);
      const a = g1('A'), b = g1('B'), c = g1('C'), d = g1('D') || a, e = g1('E'), f = g1('F');
      let ls = null;
      if (a && b && a !== SW_CART) { ls = take('L', a); if (ls) { o[swK('L', ls)] = b; o[swK('L', ls, 1)] = c === '' ? null : c; } }
      if (d && (e || f !== '')) {
        const rs = ls && d === a ? ls : take('R', d);
        if (rs) { o[swK('R', rs)] = e || b || null; o[swK('R', rs, 1)] = f === '' ? null : f; }
      }
    }
    for (const k of Object.keys(o)) if (/^A_[A-F](7[2-9]|8[01])$/.test(k)) delete o[k];
    return o;
  }
  function mergeSw(D) {
    try {
      if (!D || !D.sheets || !D.meta || D.meta.base !== (M.meta && M.meta.version)) return false;
      for (const [sh, cells] of Object.entries(D.sheets)) Object.assign(M.sheets[sh] || (M.sheets[sh] = {}), cells);
      for (const d of D.validations || []) { M.validations.push(d); for (const c of d.cells) DV[(d.sheet === ADV ? 'A_' : '') + c] = d; }
      Object.assign(M.meta, D.meta.over || {});
      return true;
    } catch (e) { console.error(e); return false; } finally { try { delete window.SIL_MODEL_SW; } catch (e) { /* 무시 */ } }
  }
  function ensureSw() {
    if (swState === 'ready') return Promise.resolve(true);
    if (swWait) return swWait;
    swState = 'loading';
    swWait = new Promise((res) => {
      const s = document.createElement('script'); s.src = window.SIL_SW_SRC || 'model_sw.js';
      s.onload = () => res(mergeSw(window.SIL_MODEL_SW));
      s.onerror = () => { s.remove(); res(false); };
      document.head.append(s);
    }).then((ok) => {
      swWait = null; swState = ok ? 'ready' : 'error';
      if (ok) { wb = new E.Workbook(M); baseWb = new E.Workbook(M); cpWb = simWb = labWb = null; applyInputs(); applyBase(); }
      refresh(); return ok;
    });
    return swWait;
  }
  const SW_MSG = { '양쪽 재련 단계와 이하용 하의 종류·강화를 확인하세요.': '두 하의의 재련 단계와 역강배 바지의 종류·강화를 골라 주세요',
    '하의 입력과 옵션을 확인하세요.': '하의 옵션 칸을 확인해 주세요',
    '테네브로스는 스위칭을 사용할 수 없습니다.': '테네브로스 하의는 스위칭을 쓸 수 없어요. 위 장비 종류와 강화에서 하의를 엑사스케일이나 네블론으로 골라 주세요' };
  // 시트 안내 'HP 50% 초과 · 옵션 1 · …'를 칸 이름으로 바꿔 보여 줌
  function swMsgText(v) {
    if (SW_MSG[v]) return SW_MSG[v];
    const m = /^HP 50% (초과|이하) · 옵션 (\d+) · (.+)$/.exec(v);
    if (!m) return v;
    const side = m[1] === '초과' ? 'L' : 'R', name = swPack(inputs)[side][Number(m[2]) - 1] || '옵션 ' + m[2];
    return `${side === 'L' ? '강배' : '역강배'} 바지 ${name}: ${m[3].replace('수치를 기호 없이 숫자로 입력하세요.', '수치를 숫자로 넣어 주세요').replace(/\.$/, '')}`;
  }
  function swMsg() {
    if (!swOn() || swState !== 'ready') return '';
    for (const a of ['A_C65', 'A_A83']) { const v = gx(wb, a); if (typeof v === 'string' && v && !v.startsWith('#')) return swMsgText(v); }
    return '';
  }
  function swToggle(on) {
    if (!on) { setVal('A_B65', '사용 안 함'); return; }
    // 처음 켤 때 역강배 바지는 강배 바지와 같게(같으면 실투력도 그대로). 다른 것만 고치면 됨
    const arm = String(inputs.J28 ?? '');
    if (inputs.A_E68 == null || inputs.A_E68 === '') setIn('A_E68', arm === SW_EXA ? SW_EXA : SW_NEB);
    if (inputs.A_E69 == null || inputs.A_E69 === '') setIn('A_E69', Number.isFinite(Number(inputs.L28)) && inputs.L28 !== null ? Number(inputs.L28) : 11);
    for (const a of ['A_B70', 'A_E70']) if (inputs[a] == null || inputs[a] === '') setIn(a, 0);
    setVal('A_B65', '사용');
  }
  function swSel(a) { return makeControl(a, {}); }
  const swOptLabel = (cat, o) => o === NONE ? '없음' : cat === SW_CART ? o.replace(/^하이퍼 카트리지 \[(.+)\]$/, '$1 (하이퍼)') : o;
  function swCartText() {
    const j = g('J32'), l = g('L32');
    if (String(inputs.J28 ?? '') !== SW_NEB) return '네블론이 아니라 없음';
    if (j === null || j === '' || j === NONE) return '없음';
    return `${optText('J32', j)}${Number(l) >= 1 ? ' ' + l + '단계' : ''}`;
  }
  // 바지 칸 하나의 고르기·수치 칸. 수치 칸 모양은 옵션의 입력 방식에 따라(직접 입력 %, 강수 수치, 카트리지 단계)
  const swNodes = {};
  function swHalf(side, s, lOn) {
    const k = swK(side, s), kv = swK(side, s, 1), cat = s.cat;
    const opts = ((M.meta.swCatalog || {})[cat] || []).filter(x => !swHP(x.o) && (side === 'R' ? lOn || x.o !== NONE : x.o !== NONE));
    const sel = el('select', { class: 'sw-opt', 'data-k': k });
    sel.append(el('option', { value: '', text: side === 'R' && lOn ? '강배와 같음' : '없음' }));
    for (const x of opts) sel.append(el('option', { value: x.o, text: swOptLabel(cat, x.o) }));
    sel.addEventListener('change', () => { const v = sel.value || null; if (String(inputs[k] ?? '') !== String(v ?? '')) setIn(kv, null); setVal(k, v); });
    swNodes[k] = sel;
    const cur = swRaw(inputs, k), x = cur ? swOpt(cat, cur) : null;
    let valNode;
    if (x && x.vals) {
      valNode = el('select', { class: 'sw-val', 'data-k': kv });
      valNode.append(el('option', { value: '', text: cat === SW_CART ? '단계' : '수치' }));
      for (const v of x.vals) if (v !== '미장착') valNode.append(el('option', { value: String(v), text: cat === SW_CART ? String(v).replace('레벨', '단계') : v + '%' }));
      valNode.addEventListener('change', () => setVal(kv, valNode.value || null));
    } else {
      const inp = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-k': kv });
      inp.addEventListener('input', () => { const t = inp.value.trim().replace(/,/g, ''); if (t === '') { setVal(kv, null); return; } const n = Number(t); if (Number.isFinite(n)) setVal(kv, n); });
      valNode = el('span', { class: 'pctwrap sw-val' }, inp, el('span', { class: 'suffix', text: '%' }));
      valNode._inp = inp;
    }
    swNodes[kv] = valNode._inp || valNode;
    const last = s.cat !== SW_SOCK || !SW_SLOTS.some(x => x.cat === SW_SOCK && SW_SLOTS.indexOf(x) > SW_SLOTS.indexOf(s));
    const fill = last ? el('span', { class: 'sw-fill-sp' }) : el('button', { type: 'button', class: 'sw-fill', 'data-fill': k, title: '아래 소켓도 똑같이', 'aria-label': `${s.name} 옵션을 아래 소켓에도 똑같이`, onclick: () => swFillDown(side, s) });
    return el('div', { class: 'sw-half', 'data-side': side === 'L' ? '강배 바지' : '역강배 바지' }, makePicker(sel), valNode, fill);
  }
  // 그 바지 종류에 없는 칸(네블론의 추가 효과, 엑사스케일의 카트리지·옵션변환)은 비워 둠. 모바일에서는 줄째 숨김
  const swNA = () => el('div', { class: 'sw-half sw-none' });
  // 칸 구성이 바뀔 때만 다시 그림(바지 종류·옵션마다 수치 칸 모양). 값은 syncSw가 맞춤
  function renderSw() {
    const box = $('#swBox'); if (!box) return;
    const on = swOn(), ready = on && swState === 'ready';
    const lt = String(inputs.J28 ?? ''), rt = String(inputs.A_E68 ?? '');
    let kinds = '';
    if (ready) for (const s of SW_SLOTS) for (const side of 'LR') { const o = swRaw(inputs, swK(side, s)), x = o ? swOpt(s.cat, o) : null; kinds += x && x.vals ? 's' + x.o : 'n'; }
    const sig = [on, swState, lt, rt, kinds].join('|');
    if (sig === swSig && box.childElementCount) return;
    swSig = sig;
    const foc = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') || document.activeElement.getAttribute('data-cell') : null;
    for (const a of SW_CELLS) delete controls[a];
    for (const k of Object.keys(swNodes)) delete swNodes[k];
    box.innerHTML = '';
    const cb = el('input', { type: 'checkbox', id: 'swOn' }); cb.checked = on;
    cb.addEventListener('change', () => swToggle(cb.checked));
    box.append(el('label', { class: 'chk-row' }, cb, el('span', {}, '하의 스위칭 계산하기', el('small', { text: '체력 50% 초과일 때는 지금 입은 강배 바지, 50% 이하일 때는 역강배 바지로 계산해요' }))));
    if (!on) return;
    if (!ready) {
      const p = el('p', { class: 'sw-msg' + (swState === 'error' ? ' warn' : ''), text: swState === 'error' ? '계산식을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. ' : '계산식을 불러오는 중이에요…' });
      if (swState === 'error') p.append(el('button', { class: 'txt sw-retry', type: 'button', text: '다시 불러오기', onclick: () => { swState = 'none'; refresh(); } }));
      box.append(p); return;
    }
    box.append(el('p', { class: 'sw-msg warn', id: 'swMsg', hidden: '' }));
    const fld = (t, ctl) => el('div', { class: 'sw-f' }, el('span', { text: t }), ctl);
    box.append(el('div', { class: 'sw-pants' },
      el('div', { class: 'sw-card' }, el('p', { class: 'sw-h' }, '강배 바지', el('small', { text: '체력 50% 초과 · 지금 입은 하의' })),
        fld('종류·강화', el('b', { id: 'swArm', class: 'sw-arm' })), fld('재련', swSel('A_B70'))),
      el('div', { class: 'sw-card' }, el('p', { class: 'sw-h' }, '역강배 바지', el('small', { text: '체력 50% 이하 · 갈아입는 하의' })),
        fld('종류', swSel('A_E68')), fld('강화', swSel('A_E69')), fld('재련', swSel('A_E70')))));
    box.append(el('p', { class: 'gnote sw-tip', text: '강배 바지의 종류·강화는 위 \'장비 종류와 강화\'의 하의 값이에요. 두 하의의 재련이 같으면 그대로 둬도 돼요.' }));
    box.append(el('p', { class: 'sw-sub', text: '바지 옵션' }),
      el('p', { class: 'gnote', text: '두 바지가 같은 칸은 비워 둬도 돼요(역강배 칸이 \'강배와 같음\'이면 강배 바지와 같다고 봐요). 다른 칸만 양쪽 다 넣어 주세요.\n칩·회로의 강배·역강배(HP 50% 초과·이하 피해)는 상세 스탯의 강배·역강배 칸 값으로 계산해서 여기엔 없어요.' }));
    const tbl = el('div', { class: 'sw-tbl' });
    tbl.append(el('div', { class: 'sw-srow sw-thead' }, el('span'),
      el('span', { class: 'sw-th' }, '강배 바지', el('small', { text: lt })), el('span', { class: 'sw-th' }, '역강배 바지', el('small', { text: rt }))));
    let grp = '';
    for (const s of SW_SLOTS) {
      const lOn = s.types.includes(lt), rOn = s.types.includes(rt);
      if (!lOn && !rOn) continue;
      const g0 = s.cat; if (g0 !== grp && grp) tbl.append(el('div', { class: 'sw-gap' })); grp = g0;
      const L = s.cart ? (lOn ? el('div', { class: 'sw-half', 'data-side': '강배 바지' }, el('span', { class: 'sw-ro' }, el('span', { id: 'swCart' }), el('small', { text: '위 카트리지 칸' }))) : swNA('L', lt))
        : lOn ? swHalf('L', s, true) : swNA('L', lt);
      const R = rOn ? swHalf('R', s, lOn) : swNA('R', rt);
      tbl.append(el('div', { class: 'sw-srow' }, el('span', { class: 'sw-slot', text: s.name }), L, R));
    }
    box.append(tbl);
    if (foc) { const n = box.querySelector(`[data-k="${foc}"], [data-cell="${foc}"]`); if (n) n.focus(); }
  }
  // 소켓 칸 옆 ↓: 이 소켓의 옵션·수치를 같은 바지의 아래 소켓에 모두 똑같이
  function swFillDown(side, s) {
    const o = swRaw(inputs, swK(side, s)), v = swRaw(inputs, swK(side, s, 1));
    const below = SW_SLOTS.filter(x => x.cat === SW_SOCK && SW_SLOTS.indexOf(x) > SW_SLOTS.indexOf(s));
    if (!below.length) return;
    let last = null;
    for (const x of below) { setIn(swK(side, x), o === '' ? null : o); setIn(last = swK(side, x, 1), v === '' ? null : v); }
    setVal(last, inputs[last]);
  }
  // 매번 맞추는 것: 값, 잠금, % 표시, 비어 있으면 안 되는 수치 칸 표시, 강배 바지 종류·강화·카트리지 글자, 안내 문구
  function syncSw() {
    if (!swOn() || swState !== 'ready' || !$('#swBox')) return;
    const arm = $('#swArm'); if (arm) arm.textContent = `${g('J28') ?? '-'} +${g('L28') ?? 0}`;
    const cart = $('#swCart'); if (cart) cart.textContent = swCartText();
    const msg = $('#swMsg'); if (msg) { const t = swMsg(); msg.textContent = t; msg.hidden = !t; }
    const lt = String(inputs.J28 ?? '');
    for (const s of SW_SLOTS) for (const side of 'LR') {
      const sel = swNodes[swK(side, s)], vn = swNodes[swK(side, s, 1)]; if (!sel || !vn) continue;
      const o = swRaw(inputs, swK(side, s)), v = swRaw(inputs, swK(side, s, 1));
      if (sel.value !== String(o)) sel.value = String(o);
      const same = side === 'R' && o === '' && s.types.includes(lt) && !s.cart;
      vn.disabled = swNoVal(s.cat, o);
      if (vn.tagName === 'SELECT') { if (vn.value !== String(v)) vn.value = String(v); }
      else if (document.activeElement !== vn) vn.value = v === '' ? '' : String(v);
      if (vn.tagName !== 'SELECT') { vn.placeholder = same ? '같음' : ''; const suf = vn.parentNode.querySelector('.suffix'); const x = swOpt(s.cat, o); if (suf) suf.hidden = vn.disabled || !(x && x.pct); }
      vn.classList.toggle('sw-need', !vn.disabled && v === '');
      const fb = sel.closest('.sw-half') && sel.closest('.sw-half').querySelector('.sw-fill'); if (fb) fb.classList.toggle('off', o === '');
    }
  }

  // ---------- 값 변경 / 재계산 ----------
  let raf = 0;
  const ATK = ['물리 공격력 (%)', '마법 공격력 (%)'];
  function syncEngraveType() {
    const t = atkType(); if (!t) return false;
    const want = t === '마법' ? ATK[1] : ATK[0]; let ch = false;
    for (const a of ['D20', 'D21', 'D22']) if (ATK.includes(inputs[a]) && inputs[a] !== want) { setIn(a, want); ch = true; }
    return ch;
  }
  // 직업마다 고르는 스킬(룬 마스터 크리티컬 소드 등): 지금 값이 그 직업 보기에 없으면 '체인지'(없으면 첫 보기)로, 고를 게 없는 직업은 비움
  // 직업 선택 스킬의 올바른 값(그 직업에 맞게)
  function skillFor(inp, w) {
    const lab = gx(w, 'I11');
    const opts = lab && !String(lab).startsWith('#') ? (optionsOf('L11', w) || []) : [];
    const cur = inp.L11 ?? '';
    return !opts.length ? '' : opts.includes(cur) ? cur : opts.includes('체인지') ? '체인지' : opts[0];
  }
  function syncClassSkill() {
    const want = skillFor(inputs, wb);
    if (want !== (inputs.L11 ?? '')) { setIn('L11', want); return true; }
    return false;
  }
  // 보기에 없는 값(예전 버전 글자 등)을 바로잡은 값들: { 칸: 새 값 }
  function badOptions(inp, w) {
    const fix = {};
    for (const a of Object.keys(DV)) {
      if (a === 'C6' || a === 'L11' || !(a in inp) || inp[a] === null || inp[a] === '' || !(a in BLANK)) continue;
      const opts = optionsOf(a, w); if (!opts || !opts.length) continue;
      if (opts.some(o => String(o) === String(inp[a]))) continue;
      fix[a] = opts.some(o => String(o) === String(BLANK[a])) ? BLANK[a] : opts[0];
    }
    return fix;
  }
  // 랭킹 등 저장된 세팅의 실투력(지금 시트 기준). 예전 버전 세팅은 옮긴 뒤, 직업 스킬·보기를 바로잡아 계산
  let cpWb = null;
  function cpOfInputs(raw) {
    const inp = migrateV2(Object.assign({}, raw || {}));
    if (!cpWb) cpWb = new E.Workbook(M);
    cpWb.assign(sheetInputs(inp));
    Object.assign(inp, badOptions(inp, cpWb));
    inp.L11 = skillFor(inp, cpWb);
    cpWb.assign(sheetInputs(inp));
    if (!(Number(inp.C11) > 0) || !(Number(inp.C12) > 0)) return NaN;
    const v = cpOf(cpWb); return typeof v === 'number' && isFinite(v) ? Math.round(v) : NaN;
  }
  // 직업이 바뀔 때 직업별 기본값으로 (다른 값을 직접 골라 둔 경우는 그대로)
  //  - 녹힐 직업: 녹힐 장비 버프 적용3, 딜러: 적용2
  //  - 에테르 세이지: 방어구 세트 순환, 나머지: 연산
  function syncClassDefault(prev) {
    const now = inputs.C6; if (now === prev) return false;
    let ch = false;
    const swap = (c, on, val, base) => { const want = on ? val : base, other = on ? base : val; if (inputs[c] === other) { setIn(c, want); ch = true; } };
    if (HEALERS.has(now) !== HEALERS.has(prev) || !prev) swap('J21', HEALERS.has(now), HEAL_J21, BLANK.J21);
    // 방어구 세트: 지금 값이 이전 직업의 기본값일 때만 새 직업 기본값으로
    const wantSet = setDefault(now);
    if (inputs.G33 !== wantSet && (inputs.G33 === setDefault(prev) || inputs.G33 == null)) { const old = inputs.G33; setIn('G33', wantSet); syncPartyCrit(old); ch = true; }
    if (syncClassSkill()) ch = true;
    return ch;
  }
  // 강배·역강배 바지: 강배(체력 50% 초과인 적 공격시 데미지 증가)와 역강배(체력 50% 이하인 적 공격시 데미지 증가)를 높은 쪽으로 같게
  function syncEq() {
    if (!inputs._eq) return false;
    const a = Number(inputs.C24) || 0, b = Number(inputs.C25) || 0, m = Math.max(a, b);
    if (!(m > 0) || (a === m && b === m)) return false;
    setIn('C24', m); setIn('C25', m); return true;
  }
  // 세트를 바꾸면 파티원 크뎀증도 그 세트 기본값으로(이전 세트 기본값 그대로일 때만)
  function syncPartyCrit(oldSet) {
    const want = partyCrit(inputs.G33), was = partyCrit(oldSet);
    if (want === was) return;
    const cur = inputs.H11 == null ? 0 : Number(inputs.H11);
    if (cur === was) setIn('H11', want);
  }
  // 보기에 없는 값(예전 버전 글자 등)은 기본값으로
  function fixOptions() {
    let ch = false;
    for (const [a, v] of Object.entries(badOptions(inputs, wb))) { setIn(a, v); ch = true; }
    if (syncClassSkill()) ch = true;
    return ch;
  }
  function setVal(a, v) {
    const prev = inputs[a];
    setIn(a, v);
    if (a === 'G33') syncPartyCrit(prev);
    if (a === 'C6') { syncEngraveType(); syncClassDefault(prev); setTimeout(renderProfiles, 0); }
    if (inputs._eq && (a === 'C24' || a === 'C25')) setIn(a === 'C24' ? 'C25' : 'C24', v);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    scheduleAutosave();
  }
  let saveT = 0;
  function scheduleAutosave() { if (shared) return; clearTimeout(saveT); saveT = setTimeout(() => { store.profiles[store.current] = Object.assign({}, inputs); persist(); }, 400); }
  const hooks = []; // 다시 계산할 때마다 부를 함수(랭킹 표시 등)
  function refresh() {
    let err = null;
    try {
      if (swOn() && swState === 'none') ensureSw(); // 하의 스위칭을 켠 세팅(저장·공유 링크 포함)이면 계산식을 받음
      syncLabels();
      renderSw();
      for (const a of Object.keys(controls)) syncControl(a);
      syncSw();
      syncPickers();
      renderResults();
      markOcrMiss();
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
    const cp = cpOf(wb);
    const noRange = !(Number(g('C12')) > 0); // 극대화 범위가 없으면 계산값이 의미 없음(음수 등)
    const missing = ['C12', 'C13'].filter(a => !(Number(g(a)) > 0));
    // 시트가 계산을 막는 입력(#N/A): 숫자 대신 이유를 보여 줌. 시트도 공격력 최댓값이 공격력보다 커야 계산함
    // 하의 스위칭: 계산식을 받는 동안은 숫자를 안 보여 줌(스위칭 없는 값이라). 계산이 막히면 시트 안내 문구를 보여 줌
    const swWaiting = swOn() && swState !== 'ready';
    const bad = !noRange && (typeof cp !== 'number' || swWaiting);
    const why = !bad ? '' : swWaiting ? (swState === 'error' ? '하의 스위칭 계산식을 불러오지 못했어요' : '하의 스위칭 계산식을 불러오는 중이에요…')
      : swMsg() ? '하의 스위칭: ' + swMsg()
      : Number(g('C12')) <= Number(g('C11')) ? '극대화 범위 최댓값이 공격력보다 커야 계산돼요' : '계산할 수 없는 값이 있어요. 넣은 값을 확인해 주세요';
    setText('#rCP', noRange || bad ? '—' : fmtInt(cp));
    $('#rCPk').classList.toggle('warn', missing.length > 0 || bad);
    setText('#rCPk', missing.length ? `${missing.map(a => a === 'C12' ? '극대화 범위 최댓값' : '무기 공격력').join('·')}을 넣어야 정확해요` : bad ? why : korUnit(cp));
    const nk = shared ? (shared.nk || '') : nickOf(store.current);
    setText('#rClass', nk ? `${nk} (${label('C6')})` : label('C6'));
    const fi = $('#fieldInfo'); if (fi) fi.textContent = `${label('K8')} ${fmtPct(g('L8'), 0)}, ${label('K9')} ${fmtPct(g('L9'), 0)} 적용 중`;
    // 기준 대비
    const base = cpOf(baseWb);
    const dt = $('#deltaText');
    let same = true;
    if (!noRange && !swWaiting && typeof cp === 'number' && typeof base === 'number') {
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
    persist(); applyInputs(); if (fixOptions()) scheduleAutosave(); applyBase(); renderProfiles(); refresh();
  }
  function dialog({ title, text, input, area, code, ok = '확인', cancel = '취소', danger }) {
    return new Promise((resolve) => {
      const d = $('#dialog'); d.hidden = false;
      $('#dlgTitle').textContent = title; $('#dlgText').textContent = text || '';
      const inp = $('#dlgInput'), ar = $('#dlgArea');
      inp.hidden = input === undefined; ar.hidden = area === undefined;
      if (input !== undefined) { inp.value = input; setTimeout(() => inp.focus(), 0); }
      if (area !== undefined) { ar.value = area; ar.readOnly = false; }
      // 코드(갱신 코드 등): 글상자 대신 크게 보여 주고 복사 버튼
      const cb = $('#dlgCode'); cb.hidden = code === undefined;
      if (code !== undefined) {
        // 하이픈 뒤에서만 줄이 바뀌게
        const ct = $('#dlgCodeText'); ct.textContent = '';
        String(code).split('-').forEach((part, i, all) => { ct.append(part + (i < all.length - 1 ? '-' : '')); if (i < all.length - 1) ct.append(document.createElement('wbr')); });
        const cp = $('#dlgCopy'); cp.textContent = '복사';
        cp.onclick = async () => {
          try { await navigator.clipboard.writeText(code); cp.textContent = '복사했어요'; }
          catch (e) { const r = document.createRange(); r.selectNodeContents($('#dlgCodeText')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); cp.textContent = '선택했어요'; }
        };
      }
      const okB = $('#dlgOk'); okB.textContent = ok; okB.classList.toggle('danger', !!danger); $('#dlgCancel').textContent = cancel;
      $('#dlgCancel').hidden = code !== undefined; // 코드만 보여 주는 창은 닫기 하나만
      const done = (v) => { d.hidden = true; okB.onclick = null; $('#dlgCancel').onclick = null; $('#dlgCancel').hidden = false; resolve(v); };
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
      if (shot && !ocrBusy) clearShot(); // 새 캐릭터는 이전 캐릭터 사진 없이 시작
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
    if (window.SilGear && window.SilGear.load) window.SilGear.load().catch(() => {}); // 글자 읽는 동안 아이콘 사전도 미리 받음
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
    // 옵션 변환 창 사진이면 옵션 변환 탭으로(붙여넣기·파일 열기·끌어놓기 모두)
    const takeShot = (img) => { const OC = window.SilOptChg; if (OC && OC.claim && OC.claim(img)) return; showShot(img); };
    $('#fileIn').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) takeShot(await O.imageFromBlob(f)); };
    document.addEventListener('paste', async (e) => {
      if (document.body.classList.contains('view-avatar')) return; // 아바타 탭에서는 아바타 인식으로
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (it) {
        e.preventDefault();
        const img = await O.imageFromBlob(it.getAsFile());
        const OC = window.SilOptChg;
        if (OC && document.body.classList.contains('view-optchg')) { OC.take(img, 'auto'); return; } // 옵션 변환 탭
        if (OC && OC.claim && OC.claim(img)) return; // 옵션 변환 창 사진이면 옵션 변환 탭으로
        showShot(img);
      }
    });
    const card = $('#ocrCard');
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-on'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-on'));
    card.addEventListener('drop', async (e) => { e.preventDefault(); card.classList.remove('drop-on'); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) takeShot(await O.imageFromBlob(f)); });
    $('#btnOcr').onclick = runOcr;
    $('#btnShotX').onclick = clearShot;
    $('#btnApply').onclick = applyOcr;
    $('#btnOcrAll').onclick = () => { const boxes = [...document.querySelectorAll('#ocrBody input[type=checkbox]')]; const all = boxes.every(b => b.checked); boxes.forEach(b => { b.checked = !all; }); };
  }
  const STEP = { 'loading tesseract core': '엔진 불러오는 중', 'initializing tesseract': '엔진 준비 중', 'loading language traineddata': '글자 데이터 불러오는 중', 'initializing api': '준비 중', 'recognizing text': '글자 읽는 중' };
  let pendingExtras = null; // 적용 버튼을 누른 뒤에 물어볼 값
  // 사진에서 아예 못 읽은 상세 스탯 칸: 적용한 뒤 그 칸을 빨갛게 표시. 값을 바꾸면(직접 입력 등) 표시가 사라짐
  // (흐리게 읽은 '확인 필요' 값은 대부분 맞게 읽혀서 빨갛게 하지 않음)
  // 글자가 작게 찍힌 사진: 읽어서 채운 칸을 노랗게 표시(비슷한 숫자로 잘못 읽기 쉬움). 그 칸을 눌러 보거나 값을 바꾸면 사라짐
  let pendingMiss = null, ocrMiss = null, pendingCheck = null, ocrCheck = null;
  function markOcrMiss() {
    const on = ocrMiss && ocrMiss.key === store.current, onC = ocrCheck && ocrCheck.key === store.current;
    const has = (o, c) => Object.prototype.hasOwnProperty.call(o.vals, c) && String(inputs[c] ?? '') === String(o.vals[c] ?? '');
    for (const [c, ctl] of Object.entries(controls)) {
      if (!ctl || !ctl.node) continue;
      const bad = !!on && has(ocrMiss, c);
      ctl.node.classList.toggle('ocr-miss', bad);
      ctl.node.classList.toggle('ocr-check', !bad && !!onC && has(ocrCheck, c));
    }
  }
  document.addEventListener('focusin', (e) => {
    const t = e.target; if (!t || !t.classList || !t.classList.contains('ocr-check') || !ocrCheck) return;
    const c = t.getAttribute('data-cell'); if (c) delete ocrCheck.vals[c];
    t.classList.remove('ocr-check');
  });
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
      try { if (window.SilGear) { pt.textContent = '악세서리 아이콘 보는 중'; await window.SilGear.load(); gear = window.SilGear.recognize(shot); } } catch (e) { console.error(e); }
      try { if (window.SilAvatar) { pt.textContent = '아바타 아이콘 보는 중'; await window.SilAvatar.fromShot(shot, gear); } } catch (e) { console.error(e); }
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
    const found = res.found; const cells = O.FIELDS.map(f => f.cell).filter(c => found[c] && c !== 'C35'); // 동작속도는 ver.3 시트에 없음
    pendingMiss = cells.length ? O.FIELDS.map(f => f.cell).filter(c => c && c !== 'C35' && !found[c]) : null;
    pendingCheck = res.small && cells.length ? cells.slice() : null; // 글자가 작은 사진: 채운 칸을 노랗게
    $('#ocrCount').textContent = cells.length ? `${cells.length}개 항목을 읽었어요` : '항목을 못 찾았어요. 상세 스탯 창 부분만 드래그로 골라서 다시 읽어 보세요.';
    // 사진이 작거나 읽은 항목이 적으면 찍는 조건 안내
    // 작은지는 사진 크기가 아니라 상세 스탯 글자 크기(줄 간격)로 봄: 큰 화면 스샷 안에 게임 창만 작게 찍힌 경우도 잡음
    const small = res.small || (res.pitch == null && shot && (shot.width < 1600 || shot.height < 900));
    const doubtN = (res.doubt || []).filter(c => c !== 'C35').length;
    const tip = $('#ocrTip');
    tip.textContent = small ? `글자가 작게 찍힌 사진이에요. 숫자를 비슷한 숫자로 잘못 읽을 수 있어서 읽은 칸을 모두 '확인 필요'로 표시했어요. 사진과 한 번씩 맞춰 봐 주세요.${doubtN ? ` 두 번 읽어서 값이 달랐던 ${doubtN}칸은 비워 뒀어요.` : ''} 게임 해상도를 1920×1080으로 두고 찍으면 정확하게 읽혀요.`
      : (cells.length && cells.length < 12) ? '덜 읽힌 항목이 있어요. 다른 창이나 마우스 설명 창 글자가 상세 스탯 글자와 겹치지 않게, 게임을 전체 화면으로 두고 다시 찍어 보세요.' : '';
    tip.hidden = !tip.textContent;
    for (const c of cells) {
      const f = found[c], kind = PCT.has(c) ? 'pct' : 'num';
      const cur = g(c);
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: kind === 'pct' ? pctIn(f.value) : String(f.value), 'data-cell': c, class: kind });
      const same = typeof cur === 'number' && Math.abs(cur - f.value) < 1e-9;
      const low = f.score < 0.8 || f.guessed || small; // 커서에 가려 옆 칸 위치로 추정한 값, 글자가 작은 사진의 값도 확인 필요로 표시
      body.append(el('tr', { class: (same ? 'same' : '') + (low ? ' low' : '') },
        el('td', {}, el('input', { type: 'checkbox', checked: same ? null : 'checked', 'aria-label': '적용' })),
        el('td', { text: LABEL_OF[c] || label('B' + c.slice(1)) }, low ? el('small', { class: 'lowtag', text: ' 확인 필요' }) : null),
        el('td', { class: 'num dim', text: kind === 'pct' ? fmtPct(cur) : fmtInt(cur) }),
        el('td', {}, kind === 'pct' ? el('span', { class: 'pctwrap' }, inp, el('span', { class: 'suffix', text: '%' })) : inp)));
    }
    // 칭호는 사진으로 고르지 않음(사용자 요청). 상시·스위칭 칭호 모두 '남은 수치' 창에서 직접 고름
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
    const gearN = body.querySelectorAll('tr.gear-row:not(.none):not(.cls-row):not(.arm-row)').length;
    const armN = body.querySelectorAll('tr.arm-row:not(.none)').length;
    if (gear && gear.cls && gear.cls.match) $('#ocrCount').textContent += ', 전직';
    if (gearN) $('#ocrCount').textContent += `, 악세서리 ${gearN}개`;
    if (armN) $('#ocrCount').textContent += `, 방어구 ${armN}개`;
    $('#ocrResult').hidden = false;
  }

  // ---------- 사진에 안 나오는 값: 인식 뒤 바로 묻기 ----------
  // weapon: 무기 공격력을 물을지(사진에 안 나와서 읽기를 누를 때마다 물음), range: 극대화 범위 최댓값을 못 읽었을 때
  const numIn = (c, ph) => { const v = g(c); return el('input', { type: 'text', inputmode: 'numeric', class: 'num', 'data-cell': c, placeholder: ph, value: Number(v) > 0 ? String(v) : '' }); };
  function rangeRow() {
    const atk = atkType() === '마법' ? '마법' : '물리';
    const inp = numIn('C12', '예: 205000');
    return [el('label', { class: 'ex-row' }, el('span', {}, `${atk} 공격력 극대화 범위 최댓값`, el('small', { text: `이번 사진에서 못 찾았어요. 다음엔 ${atk} 공격력에 마우스를 올린 채로 찍으면 자동으로 들어가요` })), inp), inp];
  }
  // 아트마 액세서리: 사진으로는 못 읽고 실투력에 크게 들어가는 값(종류·등급)
  function atmaRow() {
    const sel = (c) => {
      const s = el('select', { 'data-cell': c });
      for (const o of optionsOf(c) || []) s.append(el('option', { value: String(o), text: optText(c, o) }));
      s.value = String(inputs[c] ?? defaultOf(c) ?? '');
      return s;
    };
    return el('div', { class: 'ex-row atma-row' }, el('span', {}, '아트마 액세서리'),
      el('div', { class: 'atma-sel' }, sel('G34'), sel('H34')));
  }
  // 칭호(상시·스위칭)는 사진으로 고르지 않아서 무기 공격력과 같이 물어봄
  function titleRow(c = 'G25', name = '스위칭 칭호') {
    const s = el('select', { 'data-cell': c });
    for (const o of optionsOf(c) || []) s.append(el('option', { value: String(o), text: String(o) }));
    s.value = String(inputs[c] ?? defaultOf(c) ?? '');
    return el('label', { class: 'ex-row' }, el('span', {}, name), s);
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
      el('div', { class: 'atma-sel set-sel' }, pickSel('G33', (optionsOf('G33') || []).filter(o => /^엑사&네블론/.test(o) || o === inputs.G33).map(o => ({ v: o, t: String(o).replace(/^엑사&네블론\s*-\s*/, '') })), inputs.G33 ?? setDefault(inputs.C6))));
  }
  // 강렬:초월 비율(직접 입력으로 계산). 기본 강렬 35 : 초월 65. 입력 기준(감으로 넣은 비율·딜 미터로 잰 비율)도 여기서 고름
  const SHARE_DEF = { A_B6: 35, A_B7: 65 };
  function shareRow() {
    const custom = inputs.A_B4 === true;
    const num = (c, lab) => el('input', { type: 'text', inputmode: 'numeric', class: 'num share', 'data-cell': c, 'aria-label': lab, value: String(custom ? (g(c) ?? SHARE_DEF[c]) : SHARE_DEF[c]) });
    const strength = num('A_B6', '강렬 스킬 비율'), bravery = num('A_B7', '초월 스킬 비율');
    const basis = el('select', { 'data-cell': 'A_B5', 'aria-label': '비율 입력 기준' });
    for (const o of optionsOf('A_B5') || ['강초뎀 적용 이전', '강초뎀 적용 이후']) basis.append(el('option', { value: String(o), text: optText('A_B5', o) }));
    basis.value = String(inputs.A_B5 ?? BLANK.A_B5);
    const def = el('button', { type: 'button', class: 'share-def', 'aria-label': '기본값: 강렬 35 대 초월 65' }, el('span', { text: '기본값' }), el('small', { text: '강렬 35 : 초월 65' }));
    def.onclick = () => { strength.value = String(SHARE_DEF.A_B6); bravery.value = String(SHARE_DEF.A_B7); };
    const box = el('div', { class: 'share-in' }, el('span', { text: '강렬' }), strength, el('span', { text: ':' }), bravery, el('span', { text: '초월' }));
    return el('div', { class: 'share-block' },
      el('div', { class: 'ex-row atma-row share-row' }, el('span', {}, '강렬:초월 비율'), box),
      el('div', { class: 'share-sub' }, el('label', { class: 'share-basis' }, el('span', { text: '입력 기준' }), basis), def));
  }
  // 퍼센트 칸(창에서 % 그대로 입력, 저장할 때 /100)
  const exPctIn = (c, ph) => { const v = Number(g(c)); return el('input', { type: 'text', inputmode: 'decimal', class: 'num pct-in', 'data-pct': c, placeholder: ph || '0', value: Number.isFinite(v) ? String(+(v * 100).toFixed(2)) : '' }); };
  function eqRow() {
    const cb = el('input', { type: 'checkbox', id: 'exEq' }); cb.checked = !!inputs._eq;
    // 역강배(체력 50% 이하인 적 공격시 데미지 증가): 적으면 그 값 그대로, 안 건드리면 사진에서 읽은 값 그대로. '동일'을 켜면 안 씀
    const rev = exPctIn('C25'); rev.disabled = cb.checked;
    cb.addEventListener('change', () => { rev.disabled = cb.checked; });
    return el('div', { class: 'ex-eq-block' },
      el('label', { class: 'chk-row ex-eq' }, cb, el('span', {}, '강배 역강배 수치 동일', el('small', { text: '둘 중 높은 쪽 수치로 같게 맞춰요' }))),
      el('label', { class: 'ex-row ex-rev' }, el('span', {}, '역강배 수치', el('small', { text: '강배·역강배 수치가 다를 때 역강배 수치를 입력해요' })),
        el('span', { class: 'pct-box' }, rev, el('span', { text: '%' }))));
  }
  // 상의 카트리지(오버플로우 등): 종류와 단계
  // 카트리지: 시트에서 그 부위 방어구가 네블론일 때만 고를 수 있음. 네블론인 부위만 줄을 보여 주고, 모두 엑사 등이면 안 보여 줌
  const CART_PARTS = [['J27', 'J31', 'L31', '상의'], ['J28', 'J32', 'L32', '하의'], ['J29', 'J33', 'L33', '장갑'], ['J30', 'J34', 'L34', '신발']];
  function cartRows() {
    const box = el('div', { class: 'cart-rows' });
    for (const [arm, jc, lc, part] of CART_PARTS) {
      if (String(inputs[arm] ?? '') !== '네블론') continue;
      const sel = (c) => {
        const s = el('select', { 'data-cell': c, 'aria-label': `카트리지(${part}) ${c === jc ? '종류' : '수치'}` });
        if (c === jc) fillCartOptions(s, optionsOf(c) || [], c);
        else for (const o of optionsOf(c) || []) s.append(el('option', { value: String(o), text: optText(c, o) }));
        s.value = String(inputs[c] ?? defaultOf(c) ?? '');
        return s;
      };
      const sj = sel(jc), sl = sel(lc);
      // 종류를 골랐는데 단계가 비어 있으면 가장 높은 단계로(단계는 직접 바꿀 수 있음)
      const relabel = () => { for (const op of sl.options) op.textContent = optText(lc, /^\d+$/.test(op.value) ? Number(op.value) : op.value, sj.value); };
      relabel();
      sj.addEventListener('change', () => {
        relabel();
        if (sj.value === NONE) { sl.value = NONE; sl.setAttribute('data-touched', '1'); return; }
        if (sl.value === NONE) { const nums = [...sl.options].map(o => o.value).filter(v => Number(v) > 0); if (nums.length) { sl.value = nums[nums.length - 1]; sl.setAttribute('data-touched', '1'); } }
      });
      box.append(el('div', { class: 'ex-row atma-row cart-row' }, el('span', {}, `카트리지(${part})`), el('div', { class: 'atma-sel' }, sj, sl)));
    }
    box.hidden = !box.childElementCount;
    return box;
  }
  function askExtras({ weapon = true, range = false, during = false } = {}) {
    const open = $('#extraDlg');
    if (open && !during) {
      // 읽는 동안 띄운 창이 아직 열려 있으면 닫지 않고, 빠진 칸만 붙임. 사진으로 바뀐 값(직업에 따른 세트 효과 등)은 안 건드린 칸에 반영
      for (const sl of open.querySelectorAll('select[data-cell]:not([data-touched])')) { const c = sl.getAttribute('data-cell'); if (inputs[c] != null) sl.value = String(inputs[c]); }
      for (const ip of open.querySelectorAll('input[data-pct]:not([data-touched])')) { const v = Number(g(ip.getAttribute('data-pct'))); if (Number.isFinite(v)) ip.value = String(+(v * 100).toFixed(2)); }
      if (range && !open.querySelector('[data-cell=C12]')) open.querySelector('.dlg-actions').before(rangeRow()[0]);
      // 사진으로 방어구 종류가 바뀌면 카트리지 줄(네블론 부위만)도 바뀌므로 다시 만듦(손댄 칸이 있으면 그대로)
      const cr = open.querySelector('.cart-rows');
      if (cr && !cr.querySelector('[data-touched]')) cr.replaceWith(cartRows());
      const note = open.querySelector('#exNote'); if (note) note.textContent = '사진은 다 읽어서 적용했어요. 사진에 안 나오는 아래 값만 확인해 주세요.';
      return;
    }
    if (open) open.remove();
    if (!weapon && !range) return;
    const iC13 = weapon ? numIn('C13', '예: 60000') : null;
    const r12 = range ? rangeRow() : null;
    const save = () => {
      // 비율은 0도 올바른 값(예: 초월 100 : 강렬 0). 단 둘 다 0이면 무시. 넣으면 그 비율로 계산(직접 넣기 켬)
      const shareIn = [...wrap.querySelectorAll('input[data-cell=A_B6], input[data-cell=A_B7]')];
      const shareOk = shareIn.length === 2 && shareIn.every(i => { const t = i.value.replace(/[,\s]/g, ''); return t !== '' && Number(t) >= 0; }) && shareIn.some(i => Number(i.value.replace(/[,\s]/g, '')) > 0);
      if (shareOk && inputs.A_B4 !== true) setVal('A_B4', true);
      for (const inp of wrap.querySelectorAll('input[data-cell]')) {
        const c = inp.getAttribute('data-cell'), t = inp.value.replace(/[,\s]/g, ''), n = Number(t);
        if (!t || !Number.isFinite(n)) continue;
        if (c === 'A_B6' || c === 'A_B7') { if (shareOk && n >= 0 && n !== Number(g(c))) setVal(c, n); continue; }
        if (n > 0) setVal(c, n);
      }
      for (const sl of wrap.querySelectorAll('select[data-cell][data-touched]')) {
        const c = sl.getAttribute('data-cell');
        if (sl.value !== String(inputs[c] ?? '')) setVal(c, parseOpt(c, sl.value));
      }
      for (const inp of wrap.querySelectorAll('input[data-pct][data-touched]')) {
        const c = inp.getAttribute('data-pct'), t = inp.value.replace(/[,\s%]/g, ''), n = Number(t);
        if (t === '' || !Number.isFinite(n) || n < 0) continue;
        const v = Math.round(n * 100) / 10000;
        if (Math.abs(v - (Number(g(c)) || 0)) > 1e-9) setVal(c, v);
      }
      const eq = wrap.querySelector('#exEq');
      if (eq) {
        const b24 = inputs.C24, b25 = inputs.C25;
        if (eq.checked) inputs._eq = true; else delete inputs._eq;
        if (syncEq() && ocrSnap && ocrSnap._key === store.current && String(ocrSnap.C24) === String(b24) && String(ocrSnap.C25) === String(b25)) { ocrSnap.C24 = inputs.C24; ocrSnap.C25 = inputs.C25; }
      }
      // 사진으로 기준 세팅을 처음 잡은 직후라면, 방금 넣은 값까지 기준에 넣음(안 그러면 기준에 무기 공격력이 없어 비교가 안 됨)
      if (autoBaseKey && autoBaseKey === store.current && !shared) { store.bases[store.current] = Object.assign({}, inputs); applyBase(); }
      autoBaseKey = null;
      refresh(); scheduleAutosave(); wrap.remove();
    };
    const card = el('div', { class: 'dialog-card extra-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'exTitle' },
      el('h3', { id: 'exTitle', text: iC13 ? '남은 수치를 직접 기입해 주세요' : '극대화 범위 최댓값을 기입해 주세요' }),
      el('p', { id: 'exNote', text: iC13 ? `사진에 안 나오는 값이에요.${during ? ' 그동안 사진을 읽고 있어요.' : ''}` : '이번 사진에서 못 찾은 값이에요.' }),
      iC13 ? el('label', { class: 'ex-row' }, el('span', {}, '무기 공격력', el('small', { text: '무기에 마우스를 올리면 나오는 무기 자체 수치' })), iC13) : null,
      iC13 ? cartRows() : null,
      iC13 ? titleRow('G24', '상시 칭호') : null,
      iC13 ? titleRow() : null,
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
    wrap.addEventListener('input', (e) => { if (e.target.matches('input[data-pct]')) e.target.setAttribute('data-touched', '1'); });
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
    // 방어구 종류: 장비창 상의·하의·장갑·신발 아이콘(엑사스케일·네블론·테네브로스). 강화 수치는 아이콘에 안 나와서 그대로
    if (gear.armor) {
      body.append(el('tr', { class: 'gear-head' }, el('td', { colspan: '4' }, '방어구 종류 (장비창 아이콘)')));
      for (const [part, k] of [['상의', 'J27'], ['하의', 'J28'], ['장갑', 'J29'], ['신발', 'J30']]) {
        const a = gear.armor[part], cur = g(k), ok = !!(a && a.ok);
        const sel = el('select', { 'data-cell': k, 'aria-label': part + ' 방어구' });
        for (const o of optionsOf(k) || []) sel.append(el('option', { value: String(o), text: String(o) }));
        sel.value = ok ? a.set : String(cur ?? '');
        const same = String(cur) === sel.value;
        const cb = el('input', { type: 'checkbox', checked: ok && !same ? 'checked' : null, 'aria-label': '적용' });
        sel.addEventListener('change', () => { cb.checked = String(g(k)) !== sel.value; });
        body.append(el('tr', { class: 'gear-row arm-row' + (same ? ' same' : '') + (ok ? '' : ' none') },
          el('td', {}, cb),
          el('td', {}, part, ok ? null : el('small', { class: 'mutetag', text: ' 못 알아봄 · 직접 선택' })),
          el('td', { class: 'dim', text: String(cur ?? '') }),
          el('td', { class: 'gear-pick' }, sel)));
      }
    }
  }
  let ocrSnap = null, ocrShot = null; // 마지막으로 스크린샷을 적용한 세팅과 그 사진(랭킹 갱신용)
  let autoBaseKey = null; // 이번 사진으로 기준 세팅을 처음 잡은 캐릭터(이어서 창에서 넣는 무기 공격력 등도 기준에 넣으려고)
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
    autoBaseKey = autoBase ? store.current : null;
    applyInputs(); refresh(); scheduleAutosave(); renderProfiles();
    ocrSnap = Object.assign({}, inputs); ocrShot = shot; ocrSnap._key = store.current;
    if (pendingMiss) { ocrMiss = { key: store.current, vals: Object.fromEntries(pendingMiss.map(c => [c, inputs[c]])) }; pendingMiss = null; }
    ocrCheck = pendingCheck ? { key: store.current, vals: Object.fromEntries(pendingCheck.map(c => [c, inputs[c]])) } : null; pendingCheck = null;
    markOcrMiss();
    const missN = ocrMiss && ocrMiss.key === store.current ? Object.keys(ocrMiss.vals).length : 0;
    const checkN = ocrCheck ? Object.keys(ocrCheck.vals).length : 0;
    // 적용이 끝나면 인식 결과 목록만 접고, 사진은 ×로 지울 때까지 남겨 둠
    $('#ocrResult').hidden = true;
    toast((autoBase ? `${n}개 값을 채우고 기준 세팅으로 잡았어요` : `${n}개 값을 채웠어요`) + (missN ? `. 빨간 칸 ${missN}개는 사진에서 못 읽었어요` : '') + (checkN ? `. 글자가 작은 사진이라 노란 칸은 사진과 맞는지 확인해 주세요(칸을 누르면 표시가 사라져요)` : ''));
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
    shared = { n: String(o.n || '공유된 세팅').slice(0, 30), nk: String(o.k || '').slice(0, 20), i: swMigrate(migrateV2(Object.assign({}, o.i || {}))) }; // 남의 세팅은 올린 비율 그대로
    // 링크에는 기본값과 다른 칸만 담겨서, 빠진 칸은 기본값으로 채움(안 채우면 아바타 탭 등이 그 칸을 0으로 읽음)
    for (const a of new Set([...STAT_CELLS, ...Object.keys(controls)])) if (!(a in shared.i)) { const d = defaultOf(a); if (d != null) shared.i[a] = d; }
    inputs = Object.assign({}, shared.i);
    applyInputs(); syncClassSkill();
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
  const SKIP_EDIT = new Set(['ZB1', 'ZB2', 'ZB3', 'C12', 'C13', 'G34', 'H34', 'J31', 'L31', 'J32', 'L32', 'J33', 'L33', 'J34', 'L34', 'A_B4', 'A_B5', 'A_B6', 'A_B7', 'A_E4', 'A_E5', 'A_H4', 'A_H5', 'A_K4', 'A_K5', '_key', '_eq', '_v', '_s35', ...SW_CELLS]); // 사진에 없는 값(직접 넣는 값)은 '손으로 고침'으로 치지 않음
  // 지금 세팅에서 몇 칸만 바꿨을 때의 실투력(화면·저장값은 그대로). 아바타 추천을 실투력으로 다시 줄 세울 때 씀
  let simWb = null;
  function cpWith(over) {
    if (!simWb) simWb = new E.Workbook(M);
    simWb.assign(sheetInputs(Object.assign({}, inputs, over || {})));
    const v = cpOf(simWb); return typeof v === 'number' ? v : NaN;
  }
  // 관리자 화면용: 올린 계산기 값을 탭 순서대로 이름·보기 좋은 값으로(한 줄에 두 칸인 항목은 한 줄로 묶음)
  // 올린 세팅의 전직 기준으로 칸 이름을 읽음(마법 직업은 '마법 공격력', 버프 스킬 이름도 그 직업 것)
  let labWb = null;
  function labelsFor(inp) {
    if (!labWb) labWb = new E.Workbook(M);
    labWb.assign(sheetInputs(inp));
    return (a) => { let v; try { v = gx(labWb, a); } catch (e) { v = null; } if (v == null || v === '' || String(v).startsWith('#')) return LABEL_FALLBACK[a] || ''; return String(v).trim(); };
  }
  function describeInputs(inp) {
    inp = migrateV2(Object.assign({}, inp || {}));
    const label = inp.C6 ? labelsFor(inp) : (a) => labelOf(a);
    const out = [], has = (c) => inp[c] !== undefined && inp[c] !== null && inp[c] !== '';
    const fmtV = (c, v) => typeof v === 'boolean' ? (v ? '켬' : '끔') : (typeof v === 'number' ? (PCT.has(c) ? `${+(v * 100).toFixed(2)}%` : optText(c, v) !== String(v) ? optText(c, v) : fmtInt(v)) : optText(c, v));
    if (has('C6')) out.push({ tab: '전직', c: 'C6', name: '전직', txt: String(inp.C6) });
    for (const t of TABS) for (const gr of t.groups) gr.fields.forEach((item, i) => {
      const row = (Array.isArray(item) ? item : [item]).filter(f => f && f.c);
      const got = row.filter(f => has(f.c));
      if (!got.length) return;
      const f0 = row[0], many = gr.fields.length > 1;
      const name = f0.t || (f0.lab ? label(f0.lab) : '') || (gr.bar || gr.sub || f0.c) + (many ? ` ${i + 1}` : '');
      const parts = got.map(f => fmtV(f.c, inp[f.c]));
      const txt = /강화/.test(gr.bar || '') && got.length === 2 ? `${parts[0]} +${parts[1]}` : parts.join(' ');
      out.push({ tab: t.name, c: f0.c, name, txt });
    });
    return out;
  }
  window.SilApp = {
    inputs: () => Object.assign({}, inputs),
    describeInputs,
    cp: () => { const v = cpOf(wb); return typeof v === 'number' ? Math.round(v) : NaN; },
    cpWith,
    // 아이템 옵션을 스탯창 값에 더함: 크리·극대는 체감 전 원래 수치로 되돌려 더한 뒤 다시 스탯창 값으로(시트 Q38·V27과 같은 식)
    addRaw: (c, w, d) => {
      const r = (x) => Math.round(x * 1e6) / 1e6;
      if (c === 'C17') return r(SOCK_CW(SOCK_CI(w) + d));
      if (c === 'C19') return r(SOCK_MW(SOCK_MI(w) + d));
      return r(w + d);
    },
    optionsOf: (a) => (optionsOf(a) || []).slice(),
    // 직업별 쿨감 상한(%): 시트 '직업·패시브' 쿨감 상한(젬블리스 24%, 나머지 35%)
    coolCap: () => { const v = wb.get(CALC, 'C196'); return typeof v === 'number' && v > 0 ? Math.round(v * 1000) / 10 : 35; },
    // 랭킹도 계산기에 넣은 그대로(강렬:초월 점유율을 직접 넣었으면 그 비율로) 반영
    rankInputs: () => Object.assign({}, inputs, { _calc: CALC_VER }),
    // 이 세팅(전직)의 주 공격력이 물리인지 마법인지: 시트 계산('현재·교체 후 계산' C193)
    atkTypeOf: (inp) => { try { if (!inp || !inp.C6) return null; if (!labWb) labWb = new E.Workbook(M); labWb.assign(sheetInputs(migrateV2(Object.assign({}, inp)))); return atkType(labWb); } catch (e) { return null; } },
    calcVer: () => CALC_VER,
    rankCp: () => { const v = cpOf(wb); return typeof v === 'number' ? Math.round(v) : NaN; },
    customShare: () => inputs.A_B4 === true,
    migrate: (i) => migrateV2(Object.assign({}, i || {})),
    cpOfInputs,
    sheetVersion: () => (M.meta && M.meta.version) || '',
    // 랭킹에 못 올리는 버프(피시방·에너지드링크·지애)를 켰으면 그 이름들
    // 이벤트 버프(펀치킹·할로윈 등 기간 한정)도 '미적용'이 아니면 못 올림
    // 고급 설정의 추피 보정·가동률 DPS 전환도 랭킹에는 못 올림
    // 소켓 배분 최적화를 다른 세팅에서 돌림(계산기 탭에 바꿀 수 있는 소켓 칸을 넣었을 때만)
    sockMatch: (extra, tgt) => sockMatch(extra || {}, tgt || {}),
    sockSolve: (extra, opt) => { const r = sockSolve(extra || {}, opt); return r && !r.err ? { cp: r.cp, now: r.now, best: r.best.slice(), cur: r.cur.slice(), N: r.N, over: Object.assign({}, extra || {}, r.over), names: SOCK.map(o => o.t), critOk: r.critOk } : null; },
    rankBuffs: () => Object.keys(EXTRA_BUFF).filter(a => inputs[a] === true).map(a => EXTRA_BUFF[a])
      .concat((inputs.J22 ?? '미적용') !== '미적용' ? [`이벤트 버프(${inputs.J22})`] : [])
      .concat(inputs.A_E4 === true ? ['추피 보정'] : [], inputs.A_H4 === true ? ['가동률 DPS 전환'] : [], inputs.A_K4 === true ? ['쿨타임 감소 상한'] : [], swOn() ? ['하의 스위칭'] : []),
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
    edited: () => !!ocrSnap && Object.keys(Object.assign({}, inputs, ocrSnap)).some(a => !SKIP_EDIT.has(a) && !a.startsWith('_sw') && String(inputs[a] ?? '') !== String(ocrSnap[a] ?? '')),
    isShared: () => !!shared,
    openShared: (o) => { history.replaceState(null, '', location.pathname + location.search); enterShared(o); },
    classes: () => (optionsOf('C6') || []).filter(Boolean),
    onRefresh: (f) => { hooks.push(f); },
    refresh: () => refresh(),
    toast, el, fmtInt, korUnit, dialog,
    // 옵션 변환 점수(optchg.js): 계산 칸 읽기 · 스탯 여러 칸 한 번에 바꾸기
    sheetGet: (sh, a) => { const v = wb.get(sh, a); return E.isErr(v) ? NaN : v; },
    setVals: (o) => { for (const [a, v] of Object.entries(o || {})) setIn(a, v); refresh(); scheduleAutosave(); },
    empty: () => isEmptySetting(inputs),
  };

  // ---------- 크극 최적화: 스탯창의 크리·극대·보뎀을 합계 그대로 다시 나눠 실투력이 가장 높은 배분을 한눈에 보여 줌 ----------
  // 시트 3.0에는 이 계산 시트가 없어서(소켓 배분 계산으로 바뀜) 계산기 실투력을 직접 재 가며 찾음(opt.js)
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
  // 값을 고칠 때마다 바로 돌리면 입력이 버벅이니, 잠깐 멈춘 뒤에 계산함(그동안은 앞 결과를 그대로 둠)
  let optT = 0, optSeq = 0;
  hooks.push(() => { optSeq++; clearTimeout(optT); optT = setTimeout(renderOpt, 450); });
  function optDelta(x) {
    const d = Math.round(x * 1000) / 10;
    if (Math.abs(d) < 0.05) return { t: '그대로', c: 'same' };
    return { t: (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) + '%', c: d > 0 ? 'up' : 'down' };
  }
  async function renderOpt() {
    const card = $('#optCard'); if (!card || !OPT) return;
    const my = ++optSeq;
    const cp = cpOf(wb);
    const bad = isEmptySetting(inputs) || typeof cp !== 'number' || !(Number(g('C11')) > 0) || !(Number(g('C12')) > 0) || !(Number(g('C13')) > 0);
    if (bad || shared) { card.hidden = true; return; }
    const n = (a) => { const v = Number(inputs[a]); return isFinite(v) ? v : 0; };
    let r = null;
    try {
      const cfg = optCfg();
      r = await OPT.run((x) => cpWith({ C17: x.crit, C19: x.max, C21: x.boss }), { crit: n('C17'), max: n('C19'), boss: n('C21') },
        { base: cfg.base, minCrit: (cfg.min ?? 25) / 100, tick: () => new Promise(res => setTimeout(res, 0)), alive: () => my === optSeq });
    } catch (e) { console.error(e); }
    if (my !== optSeq) return; // 그사이 값이 바뀜: 새 계산이 그림
    if (!r || !isFinite(r.cpOpt) || !isFinite(r.gain)) { card.hidden = true; return; }
    card.hidden = false;
    const body = $('#optBody'); body.textContent = '';
    for (const [t, k] of [['크리티컬 확률', 'crit'], ['극대화', 'max'], ['보스 데미지', 'boss']]) {
      const d = optDelta(r.change[k]);
      body.append(el('tr', null, el('th', { scope: 'row', text: t }), el('td', { text: fmtPct(r.cur[k]) }),
        el('td', { class: 'opt-best', text: fmtPct(r.opt[k]) }), el('td', { class: d.c, text: d.t })));
    }
    const gain = $('#optGain'); gain.className = 'opt-gain'; gain.textContent = '';
    if (r.gain < 0.00005) { gain.textContent = '지금 배분이 이미 최적이에요'; return; }
    gain.append('최적으로 바꾸면 실투력 ', el('b', { class: 'up', text: '+' + (r.gain * 100).toFixed(2) + '%' }),
      el('br'), fmtInt(r.cp) + ' → ' + fmtInt(r.cpOpt) + ' ', el('span', { class: 'up', text: '(▲ ' + fmtInt(r.cpOpt - r.cp) + ')' }));
  }

  // ---------- 소켓 배분 최적화 (엑셀 "최적 소켓 배분 계산"): 바꿀 수 있는 소켓 칸을 옵션별로 다시 나눠 실투력이 가장 높은 배분을 찾음 ----------
  // 유강강초(유연·강인·강렬·초월 스킬 데미지)는 실투력에 들어가는 강렬·초월 스킬 데미지에 둘 다 반영
  const SOCK = [
    { k: 'crit', t: '크리티컬', cells: ['C17'], v: 6 }, { k: 'max', t: '극대화', cells: ['C19'], v: 6 }, { k: 'boss', t: '보스 데미지 (힘트마)', cells: ['C21'], v: 3 },
    { k: 'boss2', t: '보스 데미지 (사냥석)', cells: ['C21'], v: 2.5 },
    { k: 'all', t: '모든 스킬 데미지', cells: ['C33'], v: 2 }, { k: 'brv', t: '초월 스킬 데미지', cells: ['C30'], v: 2.5 }, { k: 'str', t: '강렬 스킬 데미지', cells: ['C29'], v: 2.5 },
    { k: 'both', t: '유강강초', cells: ['C29', 'C30'], v: 2 },
  ];
  // 스탯창 ↔ 원래 수치 (크리: <계산기> Q38·Q39, 극대: V27·V28. 스탯창 쪽은 100%에서 자르지 않음)
  const SOCK_CI = w => w >= .86 ? (w - .86) * 2.5 + 1.05 : w >= .68 ? (w - .68) * 5 / 3 + .75 : w >= .4 ? (w - .4) * 1.25 + .4 : w;
  const SOCK_CW = x => x <= .4 ? x : x <= .75 ? (x - .4) * .8 + .4 : x <= 1.05 ? (x - .75) * .6 + .68 : (x - 1.05) * .4 + .86;
  const SOCK_MI = w => w < .4 ? w : w < .7 ? (w - .4) * 4 / 3 + .4 : w < .9 ? (w - .7) * 2 + .8 : (w - .9) * 4 + 1.2;
  const SOCK_MW = x => x < .4 ? x : x < .8 ? (x - .4) * .75 + .4 : x < 1.2 ? (x - .8) * .5 + .7 : (x - 1.2) * .25 + .9;
  function sockCfg() {
    store.sock = store.sock || {};
    const c = store.sock[store.current] = store.sock[store.current] || { v: {}, n: {} };
    return c;
  }
  let sockRes = null;
  function wireSock() {
    if (!$('#sockCard')) return;
    $('#btnSock').onclick = () => {
      const b = $('#btnSock'); b.disabled = true; b.textContent = '계산 중…';
      setTimeout(() => { try { sockRes = Object.assign(runSock(), { key: store.current }); } catch (e) { console.error(e); sockRes = { err: '계산하다 문제가 생겼어요' }; } b.disabled = false; b.textContent = '최적 배분 계산하기'; renderSock(); }, 30);
    };
  }
  function runSock() { return sockSolve(null); }
  // extra: 다른 세팅(아바타 추천의 하의 악세 비교 등)을 계산기 칸에 덮어쓴 값. 그 세팅에서 소켓을 다시 나눔
  // opt.critMin: 크리를 이 값(스탯창 크리)에 맞춰 놓고 비교할 때. 크리 칸은 거기 닿는 가장 적은 칸 수로 묶고 나머지 칸만 나눔
  function sockSolve(extra, opt) {
    const cfg = sockCfg(), val = SOCK.map(o => Number(cfg.v[o.k] ?? o.v) || 0), cur = SOCK.map(o => Math.max(0, Math.round(Number(cfg.n[o.k]) || 0)));
    const src = Object.assign({}, inputs, extra || {});
    const N = cur.reduce((a, b) => a + b, 0);
    if (!N) return { err: '바꿀 수 있는 소켓 칸 수를 먼저 넣어 주세요' };
    // 지금 소켓을 뺀 값에서 시작. 크리·극대는 스탯창 값이 감소 효율을 거친 값이라 원래 수치로 바꿔서 더하고 다시 스탯창 값으로 돌림(시트 Q38·V27과 같은 식)
    const RAW = { C17: [SOCK_CI, SOCK_CW], C19: [SOCK_MI, SOCK_MW] };
    const base = {};
    SOCK.forEach((o, i) => { for (const c of o.cells) { const v0 = Number(src[c]) || 0; base[c] = (base[c] ?? (RAW[c] ? RAW[c][0](v0) : v0)) - cur[i] * val[i] / 100; } });
    const over = (alloc) => {
      const o = Object.assign({}, base);
      SOCK.forEach((s, i) => { for (const c of s.cells) o[c] += alloc[i] * val[i] / 100; });
      for (const c in o) o[c] = Math.round((RAW[c] ? RAW[c][1](Math.max(0, o[c])) : Math.max(0, o[c])) * 1e6) / 1e6;
      return o;
    };
    const memo = new Map(), cpOf = (alloc) => { const k = alloc.join(','); if (!memo.has(k)) memo.set(k, cpWith(extra ? Object.assign({}, extra, over(alloc)) : over(alloc))); return memo.get(k); };
    const now = cpOf(cur);
    const CI = SOCK.findIndex(o => o.k === 'crit');
    let lock = -1, critOk = true;
    if (opt && opt.critMin > 0 && CI >= 0 && val[CI] > 0) {
      const critAt = (k) => SOCK_CW(Math.max(0, base.C17 + k * val[CI] / 100));
      lock = 0; while (lock < N && critAt(lock) < opt.critMin - 1e-4) lock++;
      critOk = critAt(lock) >= opt.critMin - 1e-4;
    }
    const free = (i) => i !== CI || lock < 0;
    // 사냥석(보뎀 2.5): 지금 칸 수보다 늘리지 않음. 힘트마는 보뎀 칸 전체가 늘어난 만큼만 더함(사냥석을 힘트마로 바꾸는 건 업그레이드라 배분에서 안 셈)
    const BI = SOCK.findIndex(o => o.k === 'boss'), HI = SOCK.findIndex(o => o.k === 'boss2');
    const okA = (t) => HI < 0 || BI < 0 || (t[HI] <= cur[HI] && t[BI] <= cur[BI] + Math.max(0, t[BI] + t[HI] - cur[BI] - cur[HI]));
    // 한 칸씩 가장 많이 오르는 옵션에 넣고(탐욕), 한 칸 옮기기로 더 오르는 게 없을 때까지 다듬음
    let a = SOCK.map(() => 0);
    if (lock >= 0) a[CI] = lock;
    for (let s = a.reduce((x, y) => x + y, 0); s < N; s++) {
      let bi = -1, bv = -Infinity;
      SOCK.forEach((o, i) => { if (!val[i] || !free(i)) return; const t = a.slice(); t[i]++; if (!okA(t)) return; const v = cpOf(t); if (v > bv) { bv = v; bi = i; } });
      if (bi < 0) break;
      a[bi]++;
    }
    const polish = (start) => {
      let x = start.slice(), xv = cpOf(x), moved = true;
      while (moved) {
        moved = false;
        for (let i = 0; i < SOCK.length; i++) for (let j = 0; j < SOCK.length; j++) {
          if (i === j || !x[i] || !val[j] || !free(i) || !free(j)) continue;
          for (const d of [1, 2]) {
            if (x[i] < d) continue;
            const t = x.slice(); t[i] -= d; t[j] += d; if (!okA(t)) continue; const v = cpOf(t);
            if (v > xv + 1e-6) { x = t; xv = v; moved = true; }
          }
        }
      }
      return [x, xv];
    };
    let [best, bestV] = polish(a);
    if (lock < 0) { const [b2, v2] = polish(cur); if (v2 > bestV) { best = b2; bestV = v2; } }
    return { cur, best, now, cp: bestV, N, evals: memo.size, over: over(best), critOk };
  }
  // 크리·극대화를 목표값에 맞추기: 모자라면 힘트마(보스 데미지 마법석)를 빼고 그 옵션 마법석을 넣고, 넘치면 그만큼 힘트마로 되돌림.
  // 보통 크리·극대가 모자랄 때 힘트마를 빼서 맞추니 그 방식대로 잼. 소켓 배분 최적화에 칸 수를 넣었으면 그 칸 수 안에서만 바꿈
  // tgt.mode: 'ceil'(기본) = 지금 값 이상이 되게 / 'near' = 지금 값에 가장 가깝게(조금 모자라도 되고, 같으면 덜 바꿈)
  function sockMatch(extra, tgt) {
    const cfg = sockCfg(), val = (k) => Number(cfg.v[k] ?? (SOCK.find(o => o.k === k) || {}).v) || 0;
    const counted = SOCK.some(o => Number(cfg.n[o.k]) > 0), have = (k) => counted ? Math.max(0, Math.round(Number(cfg.n[k]) || 0)) : Infinity;
    const src = Object.assign({}, inputs, extra || {}), o = Object.assign({}, extra || {});
    // 옵션마다 맞추는 방식: ceil = 기준 이상 / near = 기준에 가장 가깝게 / floor = 기준보다 마법석 한 칸만큼 모자라게
    const r6 = (x) => Math.round(x * 1e6) / 1e6, bStep = val('boss') / 100, hStep = val('boss2') / 100;
    const modeOf = (c) => (tgt || {})[c === 'C17' ? 'modeC' : 'modeM'] || (tgt || {}).mode || 'ceil';
    // 칸 수를 넣었으면 사냥석 칸도 뺄 수 있는 보뎀 칸으로 셈. 뺄 때는 사냥석부터
    let h2Left = counted ? have('boss2') : 0;
    let boss = Number(src.C21) || 0, bossLeft = counted ? have('boss') + h2Left : Infinity, short = false, skip = null;
    const drop = (m) => { if (m <= 0) return m * bStep; const a = Math.min(m, h2Left); return a * hStep + (m - a) * bStep; };
    const moves = [];
    for (const [c, k, toRaw, toWin] of [['C17', 'crit', SOCK_CI, SOCK_CW], ['C19', 'max', SOCK_MI, SOCK_MW]]) {
      const T = Number((tgt || {})[c]) || 0, step = val(k) / 100;
      if (!(T > 0) || !(step > 0)) continue;
      // n > 0: 힘트마 n칸을 빼고 이 옵션 마법석으로 / n < 0: 이 옵션 마법석 -n칸을 힘트마로
      const raw0 = toRaw(Number(src[c]) || 0), haveK = have(k);
      const win = (n) => toWin(Math.max(0, raw0 + n * step)), ok = (n) => n >= 0 ? n <= bossLeft : -n <= haveK;
      let n = 0;
      if (win(0) < T - 1e-4) { while (win(n) < T - 1e-4 && ok(n + 1) && n < 30) n++; }
      else { while (ok(n - 1) && n > -30 && win(n - 1) >= T - 1e-4) n--; }
      const md = modeOf(c);
      // floor는 모자라서 힘트마를 뺀 쪽(n > 0)만 한 칸 덜 뺌. 이미 기준인 쪽은 그대로 둠(일부러 크리를 깎지 않음)
      if (md === 'floor' && n > 0) n--;
      else if (md === 'near' && win(n) >= T - 1e-4 && ok(n - 1)) {
        const alt = n - 1, dA = Math.abs(win(alt) - T), dN = Math.abs(win(n) - T);
        if (dA < dN - 1e-6 || (Math.abs(dA - dN) <= 1e-6 && Math.abs(alt) < Math.abs(n))) n = alt;
      }
      // best: 기준까지 채우는 것(n칸)과 덜 채우는 것(0~n−1칸)을 다 재서 실투력이 가장 높은 쪽. 기준에 조금 모자랄 때 힘트마를 빼면 손해일 수 있어서
      if (md === 'best' && n > 0) {
        const at = (m) => { const t = Object.assign({}, o, { [c]: r6(win(m)), C21: r6(Math.max(0, boss - drop(m))) }); return cpWith(t); };
        let bn = n, bv = at(n);
        for (let m = n - 1; m >= 0; m--) { const v = at(m); if (v > bv + 1e-6) { bv = v; bn = m; } }
        if (bn < n) skip = { k, t: (SOCK.find(x => x.k === k) || {}).t || k, need: n, used: bn, T, at: win(bn), cpFill: at(n), cpKeep: bv };
        n = bn;
      }
      if (win(n) < T - 1e-4 && md === 'ceil') short = true;
      boss -= drop(n);
      if (n > 0) { bossLeft -= n; h2Left -= Math.min(n, h2Left); }
      if (n) moves.push({ k, t: (SOCK.find(x => x.k === k) || {}).t || k, n });
      o[c] = r6(win(n));
    }
    o.C21 = r6(Math.max(0, boss));
    return { over: o, cp: cpWith(o), moves, short, counted, skip };
  }
  function renderSock() {
    const card = $('#sockCard'); if (!card) return;
    const bad = isEmptySetting(inputs) || !(Number(g('C11')) > 0) || !(Number(g('C12')) > 0) || !(Number(g('C13')) > 0) || typeof cpOf(wb) !== 'number';
    card.hidden = bad || !!shared; if (card.hidden) return;
    const cfg = sockCfg(), body = $('#sockBody'); body.textContent = '';
    const res = sockRes && !sockRes.err && sockRes.key === store.current ? sockRes : null;
    SOCK.forEach((o, i) => {
      const vIn = el('input', { type: 'text', inputmode: 'decimal', class: 'num', value: String(cfg.v[o.k] ?? o.v), 'aria-label': o.t + ' 한 칸 수치' });
      vIn.onchange = () => { const v = Number(String(vIn.value).replace(',', '.')); cfg.v[o.k] = isFinite(v) && v >= 0 ? v : o.v; vIn.value = cfg.v[o.k]; persist(); sockRes = null; renderSock(); };
      const nIn = el('input', { type: 'text', inputmode: 'numeric', class: 'num', value: String(cfg.n[o.k] || 0), 'aria-label': o.t + ' 지금 칸 수' });
      nIn.onchange = () => { const v = Math.max(0, Math.round(Number(nIn.value) || 0)); cfg.n[o.k] = v; nIn.value = v; persist(); sockRes = null; renderSock(); };
      const best = res ? res.best[i] : null, d = res ? best - res.cur[i] : 0;
      body.append(el('tr', null, el('th', { scope: 'row', text: o.t }),
        el('td', null, el('span', { class: 'sock-in' }, vIn, el('span', { text: '%' }))),
        el('td', null, el('span', { class: 'sock-in' }, nIn, el('span', { text: '칸' }))),
        el('td', { class: res ? (d > 0 ? 'up' : d < 0 ? 'down' : 'same') : 'same', text: res ? `${best}칸${d ? ` (${d > 0 ? '+' : '−'}${Math.abs(d)})` : ''}` : '-' })));
    });
    const gain = $('#sockGain'); gain.textContent = ''; gain.className = 'opt-gain';
    if (sockRes && sockRes.err) { gain.className = 'opt-gain warn'; gain.textContent = sockRes.err; return; }
    if (!res) return;
    if (res.cp - res.now < 1) { gain.textContent = '지금 배분이 이미 가장 좋아요'; return; }
    gain.append('최적으로 바꾸면 실투력 ', el('b', { text: fmtInt(res.now) }), ' → ', el('b', { class: 'up', text: fmtInt(res.cp) }), ` (+${((res.cp / res.now - 1) * 100).toFixed(2)}%)`);
  }
  hooks.push(() => { if (sockRes && sockRes.key !== store.current) sockRes = null; renderSock(); });

  // ---------- 만크·만극 계산: 크리티컬·극대화가 실제로 100%(만)인지, 모자라거나 넘친 게 얼마인지 ----------
  // 실제 확률은 시트 그대로: 크리 = MIN(1, 점감 뒤 크리 × 곱 배율 + 최종 가산 − 필드 크리 저항)(C446, 격려 전), 극대 = MIN(1, …)(C423)
  // 만까지 필요한 스탯창 값은 스탯창 크리(C17)·극대(C19)를 바꿔 가며 찾음. 마법석 칸 수는 소켓 배분 최적화의 한 칸 수치로 셈
  let capSeq = 0, capT = 0, capRes = null;
  function capEval(over) {
    if (!simWb) simWb = new E.Workbook(M);
    simWb.assign(sheetInputs(Object.assign({}, inputs, over || {})));
    const n = (a) => { const v = simWb.get(CALC, a); return typeof v === 'number' ? v : NaN; };
    return { crit: n('C444') + n('C445') - n('C202'), max: n('C420') * n('C421') + n('C422'), res: n('C202') };
  }
  // 스탯창 값 x에서 실제 확률이 1 이상이 되는 가장 작은 x(0.01% 단위)
  function capNeed(cell, key) {
    const at = (x) => capEval({ [cell]: x })[key];
    const cur = Number(inputs[cell]) || 0;
    let lo, hi;
    if (at(cur) >= 1 - 1e-9) { lo = 0; hi = cur; if (at(0) >= 1 - 1e-9) return 0; }
    else { lo = cur; hi = cur + 0.5; let k = 0; while (at(hi) < 1 - 1e-9 && k++ < 6) { lo = hi; hi += 0.5; } if (at(hi) < 1 - 1e-9) return null; }
    for (let i = 0; i < 24 && hi - lo > 5e-5; i++) { const m = (lo + hi) / 2; if (at(m) >= 1 - 1e-9) hi = m; else lo = m; }
    return Math.ceil(hi * 1e4 - 1e-6) / 1e4;
  }
  function capCalc() {
    const cfg = sockCfg(), sv = (k) => Number(cfg.v[k] ?? (SOCK.find(o => o.k === k) || {}).v) || 0;
    const now = capEval({});
    const rows = [];
    for (const [cell, key, toRaw, toWin, sk, name, cap] of [['C17', 'crit', SOCK_CI, SOCK_CW, 'crit', '크리티컬', '만크'], ['C19', 'max', SOCK_MI, SOCK_MW, 'max', '극대화', '만극']]) {
      const cur = Number(inputs[cell]) || 0, need = capNeed(cell, key), step = sv(sk) / 100;
      const r = { cell, name, cap, cur, real: Math.max(0, Math.min(1, now[key])), need, step };
      if (need !== null && step > 0) {
        const raw = toRaw(cur);
        if (cur < need) { let k = 0; while (toWin(raw + k * step) < need - 1e-6 && k < 40) k++; r.add = k; }
        else { let k = 0; while (toWin(Math.max(0, raw - (k + 1) * step)) >= need - 1e-6 && k < 40) k++; r.spare = k; }
      }
      rows.push(r);
    }
    // 만크극을 맞추면: 모자라면 힘트마(사냥석부터)를 빼서 크리·극대 마법석으로, 넘치면 남는 크리·극대 마법석을 힘트마로
    const tgt = {}; for (const r of rows) if (r.need !== null) tgt[r.cell] = r.need;
    const m = Object.keys(tgt).length ? sockMatch({}, Object.assign(tgt, { modeC: 'ceil', modeM: 'ceil' })) : null;
    return { rows, res: now.res, cp: cpOf(wb), m, key: store.current };
  }
  function renderCap() {
    const card = $('#capCard'); if (!card) return;
    const bad = isEmptySetting(inputs) || !(Number(g('C11')) > 0) || typeof cpOf(wb) !== 'number' || !!shared;
    card.hidden = bad; if (bad) return;
    // 값을 바꿀 때마다 바로 다시 재면 무거워서, 손을 멈추면 계산
    const my = ++capSeq; clearTimeout(capT);
    capT = setTimeout(() => { if (my !== capSeq) return; try { capRes = capCalc(); } catch (e) { console.error(e); capRes = null; } drawCap(); }, 450);
  }
  function drawCap() {
    const body = $('#capBody'); if (!body) return; body.textContent = '';
    const r0 = capRes; if (!r0 || r0.key !== store.current) return;
    const tb = el('table', { class: 'opt-table cap-table' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'sr', text: '항목' })), el('th', { scope: 'col', text: '현재 스탯' }), el('th', { scope: 'col', text: '만크극까지' }))));
    const tbody = el('tbody'); tb.append(tbody);
    for (const r of r0.rows) {
      let txt, cls = 'same';
      if (r.need === null) { txt = '스탯창으로는 못 닿아요'; cls = 'up'; }
      else if (r.cur < r.need) { txt = `+${fmtPct(r.need - r.cur)}${r.add != null ? ` (마법석 ${r.add}칸)` : ''}`; cls = 'up'; }
      else { txt = r.cur - r.need < 5e-5 ? `${r.cap}이에요` : `${r.cap}, ${fmtPct(r.cur - r.need)} 남아요${r.spare ? ` (마법석 ${r.spare}칸)` : ''}`; cls = 'down'; }
      tbody.append(el('tr', null, el('th', { scope: 'row', text: r.name }), el('td', { text: fmtPct(r.cur) }), el('td', { class: cls, text: txt })));
    }
    body.append(tb);
    const need = r0.rows.map(r => r.need === null ? '-' : `${r.name.slice(0, 2)} ${fmtPct(r.need)}`).join(', ');
    body.append(el('p', { class: 'opt-hint', text: `만크·만극에 딱 맞는 스탯창 값: ${need}. 고른 필드의 크리 저항(${fmtPct(r0.res, 0)})까지 넣고, 격려는 빼고 계산했어요` }));
    const m = r0.m, gain = el('p', { class: 'opt-gain' });
    if (m && m.moves && m.moves.length) {
      const mv = m.moves.map(x => x.n > 0 ? `힘트마 ${x.n}칸 → ${x.t}` : `${x.t} ${-x.n}칸 → 힘트마`).join(', ');
      const d = m.cp / r0.cp - 1;
      gain.append(`만크·만극에 맞추면(${mv}) 실투력 `, el('b', { text: fmtInt(r0.cp) }), ' → ', el('b', { class: d >= 0 ? 'up' : 'down', text: fmtInt(m.cp) }), ` (${d >= 0 ? '+' : ''}${(d * 100).toFixed(2)}%)`);
      if (m.short) gain.append(el('br'), '소켓 배분 최적화에 넣은 힘트마·사냥석 칸이 모자라서 다 못 맞췄어요');
      if (d < 0) gain.append(el('br'), '이 세팅은 만크·만극보다 지금이 실투력이 높아요. 가장 좋은 배분은 크극 최적화를 보세요');
    } else if (r0.rows.every(r => r.need !== null && r.cur >= r.need - 5e-5)) gain.textContent = '이미 만크·만극이에요';
    body.append(gain);
  }
  hooks.push(renderCap);

  // ---------- 시작 ----------
  function selfTest() {
    const t = new E.Workbook(M); const v = cpOf(t); const exp = M.meta && M.meta.cpCheck;
    const ok = typeof v === 'number' && typeof exp === 'number' && Math.abs(v - exp) < 1e-6 * Math.abs(exp);
    // 시트 예시 값과 다를 때만 알림(같으면 아무것도 안 띄움)
    const n = $('#selfTest'); n.textContent = ok ? '' : '시트 예시 값과 계산 결과가 다릅니다. 제보 부탁드립니다.'; n.hidden = ok;
  }
  // 하의 스위칭: 처음 만든 방식(옵션 줄 값)을 바지 칸 값으로 옮김(여기서 해야 칸 정의가 준비돼 있음)
  for (const src of [store.profiles, store.bases]) for (const k of Object.keys(src)) src[k] = swMigrate(src[k]);
  inputs = swMigrate(inputs);
  persist();
  applyInputs();
  if (fixOptions()) { store.profiles[store.current] = Object.assign({}, inputs); persist(); }
  function syncNick() {
    const n = $('#nickIn'); if (!n) return;
    n.readOnly = !!shared;
    n.value = shared ? (shared.nk || '') : nickOf(store.current);
  }
  // 실투력 시트 버전(제목 아래 회색 글씨)
  if ($('#sheetVer') && M.meta && M.meta.version) $('#sheetVer').textContent = `실질전투력 시트 ${M.meta.version} 기준`;
  renderForms(); renderProfiles(); wireProfiles(); syncNick(); wireSelection(); wireCapture(); wireShare(); wireOpt(); wireSock();
  refresh();
  openHash();
  selfTest();
})();
