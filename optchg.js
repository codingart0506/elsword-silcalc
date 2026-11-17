/* 옵션 변환 점수 — 사룡무기(4줄)·네블론 방어구(3줄) 옵션 변환 창을 읽어
   옵변 점수(옵션 없음 0점 ~ 나올 수 있는 최고 옵션 100점, 실투력 기준), 바꿨을 때 실투력, 목표 점수까지 기대 횟수를 보여 줌.
   계산은 시트 3.0.19 '옵션변환 계산'의 식과 같음. 같은 옵션을 Main 스탯창 입력에 넣고 계산기 전체로 다시 잰 값과
   10개 직업 상태 × 2400건 비교에서 일치(최대 오차 1e-15)함을 확인함.
   옵션 목록·수치 단계·등장 확률은 넥슨 확률 공개 페이지(사룡의 유언 필멸의 무기 / 네블론 슈트 옵션 변환 확률)와 같음. */
(function (root) {
  'use strict';
  const CAT = [{"k":"w","n":"강수 물마공 %","s":"attack","e":1,"w":0.008,"t":[0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5],"u":"%","a":["무기 강화 수치 1당 물리/마법 공격력"]},{"k":"w","n":"강수 물마공 Lv","s":"level","e":1,"w":0.008,"t":[0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5],"u":"Lv","a":["무기 강화 수치 1당 물리/마법 공격력","무기 강화 수치 1당 물리, 마법 공격력"]},{"k":"w","n":"강수 크리티컬 데미지","s":"criticalDamage","e":1,"w":0.008,"t":[0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5],"u":"%","a":["무기 강화 수치 1당 크리티컬 데미지"]},{"k":"w","n":"강수 모든 스킬 데미지","s":"allSkill","e":1,"w":0.008,"t":[0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5],"u":"%","a":["무기 강화 수치 1당 모든 스킬 데미지"]},{"k":"w","n":"강수 물마방","s":"","e":1,"w":0.008,"t":[0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5],"u":"%","a":["무기 강화 수치 1당 물리/마법 방어력","무기 강화 수치 1당 물리 방어력 마법 방어력"]},{"k":"w","n":"추가 지속 피해","s":"dot","e":0,"w":0.064,"t":[5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0],"u":"%","a":["공격시 입힌 피해량의 만큼 3초간 추가 지속 피해"]},{"k":"w","n":"방어력 무시","s":"","e":0,"w":0.064,"t":[4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0],"u":"%","a":["적 물리/마법 방어력 무시 (최대 20%)","적 물리/마법 방어력 무시"]},{"k":"w","n":"물마공 %","s":"attack","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["물리 공격력 마법 공격력","물리/마법 공격력"]},{"k":"w","n":"양극화","s":"polarization","e":0,"w":0.064,"t":[5.0,6.0,7.0,8.0,9.0,10.0,11.0,12.0],"u":"%","a":["양극화 : 타격/피격 데미지 (최대 60%)","양극화 : 타격/피격 데미지"]},{"k":"w","n":"크리티컬 데미지","s":"criticalDamage","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["크리티컬 데미지"]},{"k":"w","n":"물마공 Lv","s":"level","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"Lv","a":["물리, 마법 공격력","물리/마법 공격력"]},{"k":"w","n":"물마방","s":"","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["물리 방어력 마법 방어력","물리/마법 방어력"]},{"k":"w","n":"데미지 감소","s":"","e":0,"w":0.064,"t":[8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0],"u":"%","a":["데미지 감소"]},{"k":"w","n":"보스에게 주는 피해","s":"boss","e":0,"w":0.064,"t":[8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0],"u":"%","a":["보스에게 주는 피해","보스에게 주는 피해 증가"]},{"k":"w","n":"보스에게 받는 피해 감소","s":"","e":0,"w":0.064,"t":[8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0],"u":"%","a":["보스에게 받는 피해 감소"]},{"k":"w","n":"강인한 스킬 데미지","s":"","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["강인한 스킬 데미지","강인한 스킬 데미지 증가"]},{"k":"w","n":"강렬한 스킬 데미지","s":"strong","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["강렬한 스킬 데미지","강렬한 스킬 데미지 증가"]},{"k":"w","n":"초월한 스킬 데미지","s":"transcend","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["초월한 스킬 데미지","초월한 스킬 데미지 증가"]},{"k":"w","n":"모든 스킬 데미지","s":"allSkill","e":0,"w":0.064,"t":[6.0,7.0,8.0,9.0,10.0,11.0,12.0,13.0],"u":"%","a":["모든 스킬 데미지","모든 스킬 데미지 증가"]},{"k":"w","n":"동작속도","s":"","e":0,"w":0.064,"t":[8.0,9.0,10.0,11.0,12.0,13.0,14.0,15.0],"u":"%","a":["동작속도","동작 속도"]},{"k":"a","n":"강수 물마공 %","s":"attack","e":1,"w":0.00833,"t":[0.02,0.04,0.06,0.08,0.1,0.12,0.14,0.16,0.18,0.2],"u":"%","a":["방어구 강화 수치 1당 물리/마법 공격력"]},{"k":"a","n":"강수 크리티컬 데미지","s":"criticalDamage","e":1,"w":0.00833,"t":[0.02,0.04,0.06,0.08,0.1,0.12,0.14,0.16,0.18,0.2],"u":"%","a":["방어구 강화 수치 1당 크리티컬 데미지"]},{"k":"a","n":"강수 모든 스킬 데미지","s":"allSkill","e":1,"w":0.00833,"t":[0.02,0.04,0.06,0.08,0.1,0.12,0.14,0.16,0.18,0.2],"u":"%","a":["방어구 강화 수치 1당 모든 스킬 데미지"]},{"k":"a","n":"추가 지속 피해","s":"dot","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["공격시 입힌 피해량의 만큼 3초간 추가 지속 피해"]},{"k":"a","n":"물마공 %","s":"attack","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["물리 공격력 마법 공격력","물리/마법 공격력"]},{"k":"a","n":"체력 100% 이하 적 피해","s":"hp","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["체력 100% 이하인 적 공격 시 데미지","체력 100% 이하인 적 공격시 데미지 증가"]},{"k":"a","n":"양극화","s":"polarization","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["양극화 : 타격/피격 데미지 (최대 60%)","양극화 : 타격/피격 데미지"]},{"k":"a","n":"크리티컬 데미지","s":"criticalDamage","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["크리티컬 데미지"]},{"k":"a","n":"보스에게 주는 피해","s":"boss","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["보스에게 주는 피해","보스에게 주는 피해 증가"]},{"k":"a","n":"강인한 스킬 데미지","s":"","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["강인한 스킬 데미지","강인한 스킬 데미지 증가"]},{"k":"a","n":"강렬한 스킬 데미지","s":"strong","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["강렬한 스킬 데미지","강렬한 스킬 데미지 증가"]},{"k":"a","n":"초월한 스킬 데미지","s":"transcend","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["초월한 스킬 데미지","초월한 스킬 데미지 증가"]},{"k":"a","n":"모든 스킬 데미지","s":"allSkill","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["모든 스킬 데미지","모든 스킬 데미지 증가"]},{"k":"a","n":"크리티컬","s":"critical","e":0,"w":0.065,"t":[0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2],"u":"%","a":["크리티컬"]},{"k":"a","n":"극대화","s":"maximize","e":0,"w":0.065,"t":[0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2],"u":"%","a":["극대화"]},{"k":"a","n":"방어력 무시","s":"","e":0,"w":0.065,"t":[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0],"u":"%","a":["적 물리/마법 방어력 무시 (최대 20%)","적 물리/마법 방어력 무시"]},{"k":"a","n":"일반 몬스터 피해","s":"","e":0,"w":0.065,"t":[0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2],"u":"%","a":["일반 몬스터에게 주는 피해 증가","일반 몬스터에게 주는 피해"]},{"k":"a","n":"지원 회복 버프 증폭","s":"","e":0,"w":0.065,"t":[0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2],"u":"%","a":["지원 포지션이 스킬로 파티원에게 주는 공용 HP/MP 회복 버프 증폭"]}];
const ENH_MULT = {"1": 1.03, "2": 1.06, "3": 1.09, "4": 1.16, "5": 1.23, "6": 1.3, "7": 1.45, "8": 1.6, "9": 1.75, "10": 2.15, "11": 2.55, "12": 2.95, "13": 3.35};
const ATK_COEF = {"1": 79.5, "2": 78.0, "0": 51.0};
const CLASS_TIER = {"나이트 엠퍼러":2.0,"룬 마스터":1.0,"임모탈":1.0,"제네시스":1.0,"에테르 세이지":2.0,"오즈 소서러":1.0,"메타모르피":1.0,"로드 아조트":2.0,"아네모스":1.0,"데이브레이커":2.0,"트와일라잇":1.0,"프로피티스":2.0,"퓨리어스 블레이드":1.0,"레이지 하츠":2.0,"노바 임퍼레이터":1.0,"레버넌트":2.0,"코드:얼티메이트":1.0,"코드:에센시아":1.0,"코드:사리엘":1.0,"코드:안티테제":1.0,"코멧 크루세이더":2.0,"페이탈 팬텀":2.0,"센츄리온":2.0,"디우스 아에르":2.0,"비천":2.0,"범황":1.0,"대라":1.0,"일천":2.0,"엠파이어 소드":2.0,"플레임 로드":1.0,"블러디 퀸":1.0,"아드레스티아":1.0,"둠 브링어":1.0,"도미네이터":1.0,"매드 패러독스":1.0,"오버마인드":2.0,"카타스트로피":2.0,"이노센트":2.0,"디앙겔리온":1.0,"데메르시오":2.0,"템페스트 버스터":2.0,"블랙 매서커":2.0,"미네르바":2.0,"프라임 오퍼레이터":2.0,"리히터":1.0,"블루헨":2.0,"헤르셔":1.0,"비고트":2.0,"이터니티 위너":1.0,"라디언트 소울":2.0,"니샤 라비린스":1.0,"트윈즈 피카로":1.0,"리버레이터":1.0,"셀레스티아":1.0,"닉스 피에타":2.0,"모르페우스":1.0,"젬블리스":1.0,"애버리스":2.0,"아클리스":1.0,"미스치프":1.0};

  // 시트 '계산 기준·던전' M81(사룡무 1회 ED)·M82(네블론 1회 변환석)
  const COST = { w: { n: 20000000, unit: 'ED' }, a: { n: 1, unit: '변환석' } };
  const LINES = { w: 4, a: 3 };
  const KEYS = ['attack', 'level', 'maximize', 'criticalDamage', 'critical', 'strong', 'transcend', 'allSkill', 'boss', 'polarization', 'dot', 'hp'];
  const KI = Object.fromEntries(KEYS.map((k, i) => [k, i]));
  const EQS = [
    { k: 'w', kind: 'w', name: '무기', type: 'J26', enh: 'L26', need: '사룡무', item: '사룡무기' },
    { k: 'a1', kind: 'a', name: '상의', type: 'J27', enh: 'L27', need: '네블론', item: '네블론 상의' },
    { k: 'a2', kind: 'a', name: '하의', type: 'J28', enh: 'L28', need: '네블론', item: '네블론 하의' },
    { k: 'a3', kind: 'a', name: '장갑', type: 'J29', enh: 'L29', need: '네블론', item: '네블론 장갑' },
    { k: 'a4', kind: 'a', name: '신발', type: 'J30', enh: 'L30', need: '네블론', item: '네블론 신발' },
  ];
  const CALC = '현재·교체 후 계산', ADV = '고급사용자모드', RULE = '계산 기준·던전';

  // ---------- 계산 ----------
  // 크리·극대: 스탯창 값(w) ↔ 원래 수치(x). 계산 기준·던전 M71:O74, M76:O79
  const CRIT = [[0.4, 0.4, 0.8], [0.75, 0.68, 0.6], [1.05, 0.86, 0.4]], MAXI = [[0.4, 0.4, 0.75], [0.8, 0.7, 0.5], [1.2, 0.9, 0.25]];
  const dim = (t, cap) => (x) => { if (x >= cap) return 1; for (let i = t.length - 1; i >= 0; i--) if (x >= t[i][0]) return t[i][1] + (x - t[i][0]) * t[i][2]; return x; };
  const undim = (t, cap) => (w) => { if (w >= 1) return cap; for (let i = t.length - 1; i >= 0; i--) if (w >= t[i][1]) return t[i][0] + (w - t[i][1]) / t[i][2]; return w; };
  const critW = dim(CRIT, 1.4), critX = undim(CRIT, 1.4), maxW = dim(MAXI, 1.6), maxX = undim(MAXI, 1.6);

  // 옵션 줄 → 증감 배열(시트 단위: % 옵션은 비율, 레벨은 그대로). lines: [{ i: 1~38, v: 게임 표기 수치 }]
  function vecOf(lines, enh) {
    const d = new Float64Array(KEYS.length);
    for (const ln of lines || []) {
      const c = CAT[ln.i - 1]; if (!c || !c.s || typeof ln.v !== 'number') continue;
      d[KI[c.s]] += ln.v * (c.e ? enh : 1) / (c.s === 'level' ? 1 : 100);
    }
    return d;
  }
  const NEED = 'C11 C413 C414 C415 C419 C421 C422 C424 C438 C439 C441 C443 C445 C202 C226 C224 C192 C453 C455 C714 C457 C83 C203 C24 C25 C462 C463 C491 C492 C464 C493 C459 C461 C17 C381 C252 C466 C468 C427 C408 C406 C5'.split(' ');
  function snapshot(get) {
    const s = {}; for (const a of NEED) s[a] = get(CALC, a);
    s.P58 = get(RULE, 'P58'); s.M53 = get(RULE, 'M53'); s.M54 = get(RULE, 'M54'); s.E6 = get(ADV, 'E6');
    s.M50 = 3 / 6; s.M51 = 2.5 / 6; // 크리·극대 대비 보뎀(아트마석·사냥석). 계산기 모델에는 없는 칸이라 시트 값을 그대로 씀
    for (const [k, v] of Object.entries(s)) if (k !== 'C5' && k !== 'C83' && !(typeof v === 'number' && isFinite(v))) return null;
    return s;
  }
  // 치환(크리·극대 → 보뎀, 양극화 초과량 → 물마공/추피)까지 반영한 '지금 대비 바뀌는 양'
  function deltaOf(s, cur, nxt, o, out) {
    for (let k = 0; k < KEYS.length; k++) out[k] = nxt[k] - cur[k];
    if (o.sub > 0) { out[8] += o.sub * (nxt[4] + nxt[2]) - o.sub * (cur[4] + cur[2]); out[4] = 0; out[2] = 0; }
    if (o.excess) {
      const room = Math.max(0, s.C252 - s.C17 - s.C381 + cur[9]);
      const ex = Math.max(0, nxt[9] - room) - Math.max(0, cur[9] - room);
      out[9] -= ex; if (o.excess === 1) out[0] += ex; else out[10] += ex;
    }
    return out;
  }
  // 시트 '옵션변환 계산' B9과 같은 식: 지금(현재 옵션이 스탯창에 들어 있는 상태) 대비 DPS 배율
  const TMP = new Float64Array(KEYS.length);
  function ratio(s, cur, nxt, o) {
    const d = deltaOf(s, cur, nxt, o, TMP);
    const oldW = s.C11;
    const weapon = Math.abs(d[1]) < 1e-12 ? oldW : Math.round(oldW / o.mult + o.coef * d[1]) * o.mult;
    const fm = Math.min(1, maxW(s.C419 + d[2]) * s.C421 + s.C422);
    let f = (((s.C413 + weapon - oldW) * (1 + s.C415) + (s.P58 / 2) * weapon * fm) * (1 + s.C414 + d[0] + s.C438)) / (s.C424 * s.C439);
    const ca = critW(s.C441 + d[4]) * s.C443;
    const bp = Math.max(0, Math.min(1, ca + s.C445 - s.C202));
    const pc = bp + Math.min(ca * s.C226, 1 - bp) * s.C224;
    const ch = pc + (1 - pc) * s.C192;
    f *= (1 + ch * ((s.C453 + d[3]) * s.C455 * (1 + s.C714) - 1)) / s.C457;
    const share = s.C83 ? s.C203 : (s.C24 + d[5] > s.C25 + d[6] ? s.M53 : s.M54);
    f *= (share * (1 + s.C462 + d[5]) + (1 - share) * (1 + s.C463 + d[6])) * (share * s.C491 + (1 - share) * s.C492) / (s.C464 * s.C493);
    f *= 1 + d[7] / s.C459;
    f *= 1 + d[8] / s.C461;
    f *= (1 + Math.min(s.C17 + s.C381 + d[9], s.C252)) / s.C466;
    f *= 1 + d[10] * s.E6 / s.C468;
    f *= 1 + d[11] / (1 + s.C427);
    return f;
  }
  // 옵션을 바꾼 뒤의 Main 스탯창 입력(시트 단위: % 칸은 86.4 같은 숫자). main = 지금 Main 값
  function mainEdits(s, main, cur, nxt, o) {
    const d = deltaOf(s, cur, nxt, o, new Float64Array(KEYS.length)), out = {};
    const a0 = s.C408, b0 = s.C406, W = s.C11;
    const w = Math.abs(d[1]) < 1e-12 ? 0 : Math.round(W / o.mult + o.coef * d[1]) * o.mult - W;
    if (w || d[0]) {
      const base = main.C11 / ((1 + a0) * (1 + b0)), a1 = a0 + d[0];
      out.C11 = (base + w) * (1 + a1) * (1 + b0);
      out.C12 = out.C11 + (s.P58 / 2) * (W + w) * (1 + a1);
      out.C13 = main.C13 + w;
    }
    const r9 = (x) => Math.round(x * 1e9) / 1e9;
    if (d[4]) out.C17 = r9(100 * Math.min(1, critW(critX(main.C17 / 100) + d[4])));
    if (d[2]) out.C19 = r9(100 * Math.min(1, maxW(maxX(main.C19 / 100) + d[2])));
    for (const [a, k] of [['C18', 3], ['C20', 9], ['C21', 8], ['C22', 10], ['C26', 11], ['C29', 5], ['C30', 6], ['C33', 7]]) if (d[k]) out[a] = r9(main[a] + 100 * d[k]);
    return out;
  }

  // ---------- 등장 확률: 줄마다 옵션을 등장 확률대로 하나씩(같은 옵션 중복 없이), 수치 단계는 고르게 ----------
  const probCache = {};
  function setProbs(kind) {
    if (probCache[kind]) return probCache[kind];
    const ids = []; CAT.forEach((c, i) => { if (c.k === kind) ids.push(i + 1); });
    const tot = ids.reduce((a, i) => a + CAT[i - 1].w, 0), n = LINES[kind], map = new Map(), pick = [];
    (function rec(depth, p, used) {
      if (depth === n) { const key = pick.filter((i) => CAT[i - 1].s).sort((a, b) => a - b).join(','); map.set(key, (map.get(key) || 0) + p); return; }
      for (const i of ids) {
        if (pick.includes(i)) continue;
        const w = CAT[i - 1].w / tot; pick.push(i); rec(depth + 1, p * w / (1 - used), used + w); pick.pop();
      }
    })(0, 1, 0);
    return (probCache[kind] = [...map].map(([k, p]) => ({ ids: k ? k.split(',').map(Number) : [], p })));
  }
  const topOf = (i) => { const t = CAT[i - 1].t; return t[t.length - 1]; };
  // 점수 분포(0.01점 단위 누적). tick: 가끔 쉬어 가기(화면 멈춤 방지), alive: 그사이 입력이 바뀌면 그만둠
  // 배율은 공격력·레벨·극대 / 크리·크뎀 / 강렬·초월 / 모스뎀 / 보뎀 / 양극화 / 추피 / HP 묶음끼리 곱으로 나뉨(치환을 쓰면 엮인 묶음을 합침)
  // → 묶음마다 단계 조합 배율을 따로 구한 뒤 곱하기만 해서 모든 조합을 셈
  function groupOf(key, o) {
    if (o.sub > 0 && (key === 2 || key === 4)) return 4;
    if (key <= 2) return 0;
    if (key <= 4) return 1;
    if (key <= 6) return 2;
    if (key === 7) return 3;
    if (key === 8) return 4;
    if (key === 9) return o.excess === 1 ? 0 : 5;
    if (key === 10) return o.excess === 2 ? 5 : 6;
    return 7;
  }
  async function analyze(s, kind, enh, cur, o, tick, alive) {
    tick = tick || (async () => {}); alive = alive || (() => true);
    const zero = new Float64Array(KEYS.length);
    const r0 = ratio(s, cur, zero, o);
    const groups = setProbs(kind);
    let rB = -Infinity, bestIds = [];
    const tops = groups.map((g) => ratio(s, cur, vecOf(g.ids.map((i) => ({ i, v: topOf(i) })), enh), o));
    tops.forEach((r, j) => { if (r > rB) { rB = r; bestIds = groups[j].ids; } });
    const span = rB - r0;
    if (!(span > 0)) return null;
    const hist = new Float64Array(10001), histTop = new Float64Array(10001);
    const K = 10000 / span;
    const bin = (r) => { const b = Math.floor((r - r0) * K + 1e-7); return b < 0 ? 0 : b > 10000 ? 10000 : b; };
    let work = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      histTop[bin(tops[gi])] += g.p;
      if (!g.ids.length) { hist[bin(r0)] += g.p; continue; }
      const parts = new Map();
      for (const i of g.ids) { const gid = groupOf(KI[CAT[i - 1].s], o); if (!parts.has(gid)) parts.set(gid, []); parts.get(gid).push(i); }
      const arrs = [];
      for (const ids of parts.values()) {
        const sizes = ids.map((i) => CAT[i - 1].t.length), n = sizes.reduce((a, b) => a * b, 1), idx = new Array(ids.length).fill(0);
        const arr = new Float64Array(n);
        for (let m = 0; m < n; m++) {
          arr[m] = ratio(s, cur, vecOf(ids.map((i, j) => ({ i, v: CAT[i - 1].t[idx[j]] })), enh), o) / r0;
          for (let j = 0; j < ids.length; j++) { if (++idx[j] < sizes[j]) break; idx[j] = 0; }
        }
        arrs.push(arr);
      }
      const total = arrs.reduce((a, x) => a * x.length, 1), pe = g.p / total;
      // 묶음 배율 곱하기(재귀)
      const L = arrs.length;
      const walk = (j, acc) => {
        const a = arrs[j];
        if (j === L - 1) { for (let m = 0; m < a.length; m++) hist[bin(r0 * acc * a[m])] += pe; return; }
        for (let m = 0; m < a.length; m++) walk(j + 1, acc * a[m]);
      };
      walk(0, 1);
      work += total;
      if (work > 400000) { work = 0; await tick(); if (!alive()) return null; }
    }
    // 뒤에서부터 누적: atLeast[b] = b/100점 이상일 확률
    for (const h of [hist, histTop]) for (let b = 9999; b >= 0; b--) h[b] += h[b + 1];
    return { r0, rB, bestIds, atLeast: hist, atLeastTop: histTop, score: (r) => 100 * (r - r0) / span };
  }

  // ---------- 화면 인식 ----------
  // 옵션 줄은 흰 상자 3~4개가 같은 폭으로 세로로 붙어 있음 → 그 묶음을 찾음
  function canvasOf(src) {
    if (src && src.getContext) return src;
    const c = document.createElement('canvas'); c.width = src.naturalWidth || src.width; c.height = src.naturalHeight || src.height;
    c.getContext('2d').drawImage(src, 0, 0); return c;
  }
  function findBoxes(src) {
    const cv = canvasOf(src), W = cv.width, H = cv.height;
    if (W < 200 || H < 150) return null;
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const wh = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < wh.length; i++, p += 4) wh[i] = d[p] > 222 && d[p + 1] > 222 && d[p + 2] > 222 ? 1 : 0;
    // 줄마다 가장 긴 흰 구간 → 같은 (시작, 끝)이 많이 나오는 폭이 상자 폭 후보
    const minRun = Math.max(150, W * 0.1), votes = new Map();
    for (let y = 0; y < H; y++) {
      let best = 0, bs = 0, run = 0, st = 0; const o = y * W;
      for (let x = 0; x < W; x++) { if (wh[o + x]) { if (!run) st = x; run++; if (run > best) { best = run; bs = st; } } else run = 0; }
      if (best >= minRun) { const key = (bs >> 2) * 100000 + ((bs + best) >> 2); votes.set(key, (votes.get(key) || 0) + 1); }
    }
    const cands = [];
    for (const [key, n] of [...votes].sort((a, b) => b[1] - a[1])) {
      const x0 = Math.floor(key / 100000) * 4, x1 = (key % 100000) * 4;
      if (n < 6 || cands.some((c) => Math.abs(c.x0 - x0) < 10 && Math.abs(c.x1 - x1) < 10)) continue;
      cands.push({ x0, x1 }); if (cands.length >= 8) break;
    }
    // 장비 이름 띠: 상자 위쪽(높이의 1.5~2.2배 위)이 거의 검은색. 사진이 그 위에서 잘렸으면 검사 안 함
    const titleOk = (x0, x1, top, h) => {
      const ya = Math.round(top - 2.1 * h), yb = Math.round(top - 1.55 * h);
      if (ya < 0) return true;
      let dark = 0, n = 0;
      for (let y = ya; y < yb; y += 2) for (let x = x0 + 4; x < x1 - 4; x += 3) { const p = (y * W + x) * 4; n++; if (Math.max(d[p], d[p + 1], d[p + 2]) < 70) dark++; }
      return n > 0 && dark / n > 0.45;
    };
    let found = null;
    for (const { x0, x1 } of cands) {
      const w = x1 - x0, a = x0 + 3, b = x1 - 3, ivs = [];
      let y0 = -1;
      for (let y = 0; y <= H; y++) {
        let n = 0;
        if (y < H) { const o = y * W; for (let x = a; x < b; x++) n += wh[o + x]; }
        const on = y < H && n >= (b - a) * 0.45;
        if (on && y0 < 0) y0 = y;
        if (!on && y0 >= 0) { ivs.push({ y0, y1: y }); y0 = -1; }
      }
      // 옵션 줄 상자인지: 가로세로 비, 글자가 가운데 정렬, 색 수치(초록·노랑·보라)가 있음 → 친구 목록·다른 흰 창과 구분
      const okBox = (y0, y1) => {
        const h = y1 - y0; if (h < w * 0.08 || h > w * 0.2) return false;
        const cols = new Uint16Array(w); let col = 0, ink = 0;
        for (let y = y0 + 2; y < y1 - 2; y++) for (let x = a; x < b; x++) {
          const p = (y * W + x) * 4, R = d[p], G = d[p + 1], B = d[p + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const dark = mx < 120, colored = mx - mn > 80 && mn < 140 && !(R > 140 && G < R * 0.55 && B < R * 0.55);
          if (dark || colored) { ink++; cols[x - x0]++; }
          if (colored) col++;
        }
        if (ink < w * h * 0.004 || col < w * h * 0.001) return false;
        // 글자 줄(가장 넓은 덩어리)이 상자 가운데에 있는지. 왼쪽 반짝이 같은 건 떨어져 있어서 빠짐
        let best = null, c0 = -1, last = -1;
        const gapMax = w * 0.06;
        for (let x = 0; x <= w; x++) {
          const on = x < w && cols[x] >= 2;
          if (on) { if (c0 < 0) c0 = x; else if (x - last > gapMax) { if (!best || last - c0 > best[1] - best[0]) best = [c0, last]; c0 = x; } last = x; }
        }
        if (c0 >= 0 && (!best || last - c0 > best[1] - best[0])) best = [c0, last];
        if (!best) return false;
        const cx = (best[0] + best[1]) / 2;
        return Math.abs(cx - w / 2) < w * 0.1 && best[1] - best[0] < w * 0.92 && best[1] - best[0] > w * 0.15;
      };
      const boxes = ivs.filter((v) => okBox(v.y0, v.y1));
      // 높이가 비슷하고 틈이 좁게 이어진 묶음
      for (let i = 0; i < boxes.length; i++) {
        const h0 = boxes[i].y1 - boxes[i].y0, run = [boxes[i]];
        for (let j = i + 1; j < boxes.length && run.length < 4; j++) {
          const p = run[run.length - 1], q = boxes[j], h = q.y1 - q.y0;
          if (Math.abs(h - h0) > h0 * 0.2 || q.y0 - p.y1 > h0 * 0.6) break;
          run.push(q);
        }
        if (run.length >= 3 && (!found || run.length > found.boxes.length) && titleOk(x0, x1, run[0].y0, run[0].y1 - run[0].y0)) found = { x0, x1, boxes: run.map((r) => ({ x: x0, y: r.y0, w, h: r.y1 - r.y0 })) };
      }
      if (found && found.boxes.length === 4) break;
    }
    if (!found) return null;
    const b0 = found.boxes[0], h = b0.h;
    const ty0 = Math.max(0, Math.round(b0.y - 2.3 * h)), ty1 = Math.max(0, Math.round(b0.y - 1.35 * h));
    found.title = ty1 - ty0 > 8 ? { x: found.x0, y: ty0, w: found.x1 - found.x0, h: ty1 - ty0 } : null;
    found.kind = found.boxes.length === 4 ? 'w' : 'a';
    return found;
  }
  // 줄 상자 → 글자 그림 1장 + 수치 그림 여러 장. 수치는 초록·노랑·보라 글씨, (던전)은 빨강.
  // 색 글씨가 모인 세로 구간을 찾아 그 구간은 글자 그림에서 지우고, 수치 구간만 따로 잘라 숫자 인식에 넘김(JPG 번짐에도 버티게)
  function linePics(cv, r) {
    const pad = 3, sx = r.x + pad, sy = r.y + pad, sw = r.w - pad * 2, sh = r.h - pad * 2;
    const k = Math.max(1.5, Math.min(4, 170 / sh));
    const W = Math.round(sw * k), H = Math.round(sh * k);
    const big = document.createElement('canvas'); big.width = W; big.height = H;
    const g = big.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cv, sx, sy, sw, sh, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const cls = new Uint8Array(W * H), colV = new Uint16Array(W), colR = new Uint16Array(W);
    for (let i = 0, p = 0; i < cls.length; i++, p += 4) {
      const R = d[p], G = d[p + 1], B = d[p + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (mx - mn > 80 && mn < 140) {
        const red = R > 140 && G < R * 0.55 && B < R * 0.55;
        cls[i] = red ? 2 : 1; if (red) colR[i % W]++; else colV[i % W]++;
      }
    }
    const minCol = Math.max(2, Math.round(H * 0.012)), gap = Math.round(H * 0.2), minW = Math.round(H * 0.05);
    const runs = (col) => {
      const out = []; let x0 = -1, last = -1;
      for (let x = 0; x < W; x++) {
        if (col[x] >= minCol) { if (x0 < 0) x0 = x; else if (x - last > gap) { out.push([x0, last]); x0 = x; } last = x; }
      }
      if (x0 >= 0) out.push([x0, last]);
      return out.filter(([a, b]) => b - a + 1 >= minW);
    };
    const vr = runs(colV), rr = runs(colR);
    // 글자 그림: 밝기만, 색 구간은 흰색으로
    const lab = document.createElement('canvas'); lab.width = W; lab.height = H;
    const lg = lab.getContext('2d'), L = lg.createImageData(W, H);
    const m = Math.round(H * 0.03), blank = new Uint8Array(W);
    for (const [a0, b0] of vr.concat(rr)) for (let x = Math.max(0, a0 - m); x <= Math.min(W - 1, b0 + m); x++) blank[x] = 1;
    for (let i = 0, p = 0; i < cls.length; i++, p += 4) {
      const v = blank[i % W] || cls[i] ? 255 : (d[p] + d[p + 1] + d[p + 2]) / 3;
      L.data[p] = L.data[p + 1] = L.data[p + 2] = v; L.data[p + 3] = 255;
    }
    lg.putImageData(L, 0, 0);
    // 수치 그림: 구간마다 잘라 두 가지로 — 색 글씨 칸만 검게(이진) / 가장 어두운 채널(번진 JPG용)
    const vals = [];
    for (const [a0, b0] of vr.slice(0, 3)) {
      let y0 = H, y1 = -1;
      for (let y = 0; y < H; y++) { const o = y * W; for (let x = a0; x <= b0; x++) if (cls[o + x] === 1) { if (y < y0) y0 = y; y1 = y; break; } }
      if (y1 < 0) continue;
      const mm = Math.round(H * 0.12), x0 = Math.max(0, a0 - mm), x1 = Math.min(W, b0 + mm + 1), yy0 = Math.max(0, y0 - mm), yy1 = Math.min(H, y1 + mm + 1);
      const cw = x1 - x0, ch = yy1 - yy0;
      const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
      const cb = mk(), cgr = mk(), IB = cb.getContext('2d').createImageData(cw, ch), IG = cgr.getContext('2d').createImageData(cw, ch);
      let lo = 255, hi = 0; const tmp = new Uint8Array(cw * ch);
      for (let y = yy0, q = 0; y < yy1; y++) for (let x = x0; x < x1; x++, q++) {
        const p = (y * W + x) * 4, i = y * W + x, mn = Math.min(d[p], d[p + 1], d[p + 2]), lum = (d[p] + d[p + 1] + d[p + 2]) / 3;
        // 수치 구간 안의 검은 글자·빨간 글자는 지움
        const v = cls[i] === 1 ? mn : cls[i] === 2 || lum < 150 ? 255 : mn;
        tmp[q] = v; if (v < lo) lo = v; if (v > hi) hi = v;
        const bv = cls[i] === 1 ? 0 : 255;
        IB.data[q * 4] = IB.data[q * 4 + 1] = IB.data[q * 4 + 2] = bv; IB.data[q * 4 + 3] = 255;
      }
      const span = Math.max(1, hi - lo);
      for (let q = 0; q < tmp.length; q++) { const v = Math.max(0, Math.min(255, (tmp[q] - lo) / span * 255)); IG.data[q * 4] = IG.data[q * 4 + 1] = IG.data[q * 4 + 2] = v; IG.data[q * 4 + 3] = 255; }
      cb.getContext('2d').putImageData(IB, 0, 0); cgr.getContext('2d').putImageData(IG, 0, 0);
      vals.push({ bin: cb, gray: cgr });
    }
    return { lab, vals };
  }
  function titlePic(cv, r) {
    const k = Math.max(1.5, Math.min(4, 110 / r.h)), W = Math.round(r.w * k), H = Math.round(r.h * k);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, W, H);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let p = 0; p < d.length; p += 4) { const v = 255 - Math.max(d[p], d[p + 1], d[p + 2]); d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
    g.putImageData(im, 0, 0); return c;
  }

  // 글자 비교: 한글·영문만 남기고(숫자·기호 빼고) 편집 거리
  const normK = (s) => String(s || '').replace(/대미지/g, '데미지').replace(/[^가-힣A-Za-z]/g, '').toUpperCase();
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  const ALIAS = CAT.map((c) => c.a.map(normK));
  // 수치 읽기: 줄마다 색 글씨 묶음별로 두 가지 그림을 읽은 글자들(texts: [[묶음1 이진, 묶음1 회색], [묶음2 …]])
  // 숫자·점만 남긴 글자와 단계 수치 표기("1.5", "0.12", "12")의 편집 거리가 가장 작은 단계를 고름. 0이면 확실
  const fmtT = (t) => String(+t.toFixed(3));
  const digitsOf = (t) => String(t || '').replace(/,/g, '.').replace(/[^0-9.]/g, '').replace(/^\.+|\.+$/g, '');
  function pickTier(c, groups) {
    let best = null;
    groups.forEach((vs, gi) => vs.forEach((t, vi) => {
      const D = digitsOf(t); if (!D) return;
      const unitless = !vs.some((x) => /%|L\s*[vV]|LV/.test(String(x))); // % · Lv가 안 보이는 묶음(반짝이 등)은 뒤로
      for (const tier of c.t) {
        const dd = lev(D, fmtT(tier)) + (unitless ? 0.6 : 0) + gi * 0.01 + vi * 0.001; // 같으면 앞 묶음·이진 그림 우선
        if (!best || dd < best.d) best = { v: tier, d: dd };
      }
    }));
    return best;
  }
  function matchLine(kind, labText, valGroups) {
    const groups = (valGroups || []).filter((g) => g && g.length);
    const L = normK(labText);
    const allText = groups.flat().join(' ');
    const hasLv = /L\s*[vV]|LV/.test(allText) || /L\s*[vV]\b|LV/.test(String(labText)), hasPct = /%/.test(allText);
    const unit = hasLv && !hasPct ? 'Lv' : hasPct && !hasLv ? '%' : '';
    let best = null;
    CAT.forEach((c, k) => {
      if (c.k !== kind) return;
      let sim = Math.max(...ALIAS[k].map((A) => 1 - lev(L, A) / Math.max(L.length, A.length, 1)));
      if (unit && unit !== c.u) sim -= 0.35;
      if (!best || sim > best.sim) best = { i: k + 1, sim };
    });
    const raw = (String(labText || '').trim() + ' / ' + groups.map((g) => g.map((t) => String(t).trim()).join(' · ')).join(' | ')).slice(0, 200);
    if (!best || best.sim < 0.45) return { i: 0, v: null, ok: false, raw };
    const c = CAT[best.i - 1];
    // 색 글씨를 못 찾았으면 줄 글자 전체에서 숫자를 찾음
    const pk = pickTier(c, groups.length ? groups : [[String(labText || '').replace(/\d+\s*당|\d+\s*초|100\s*%|최대\s*\d+\s*%/g, '')]]);
    return { i: best.i, v: pk ? pk.v : null, ok: !!pk && pk.d < 0.5 && best.sim >= 0.7, sim: best.sim, raw };
  }
  function parseTitle(t) {
    const s = String(t || '');
    const m = /\+\s*(\d{1,2})/.exec(s) || /(?:^|\s)(\d{1,2})\s*(?=[가-힣])/.exec(s);
    const enh = m ? Number(m[1]) : null;
    const n = normK(s);
    const part = /상의/.test(n) ? 'a1' : /하의/.test(n) ? 'a2' : /장갑/.test(n) ? 'a3' : /신발/.test(n) ? 'a4' : null;
    const weapon = /사룡|유언|필멸/.test(n), armor = /네블|블론|슈트/.test(n);
    return { enh: enh != null && enh >= 0 && enh <= 15 ? enh : null, part, weapon, armor, text: s.trim() };
  }
  let busy = false;
  async function readShot(src, onProg) {
    const cv = canvasOf(src), loc = findBoxes(cv);
    if (!loc) return null;
    const O = root.SilOCR; if (!O) throw new Error('글자 인식 모듈이 없어요');
    if (busy) throw new Error('다른 사진을 읽는 중이에요');
    busy = true;
    try {
      const [A, B] = await O.getWorkers(onProg);
      const out = { kind: loc.kind, lines: [], title: null, loc }, raws = [];
      await A.setParameters({ tessedit_pageseg_mode: '7' });
      await B.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.+%Lv' });
      try {
        if (loc.title) { onProg && onProg({ status: '장비 이름 읽는 중' }); out.title = parseTitle((await A.recognize(titlePic(cv, loc.title))).data.text); }
        for (let i = 0; i < loc.boxes.length; i++) {
          onProg && onProg({ status: `옵션 ${i + 1}줄 읽는 중`, progress: (i + 1) / loc.boxes.length });
          const p = linePics(cv, loc.boxes[i]);
          const lt = (await A.recognize(p.lab)).data.text;
          const vg = [];
          for (const c of p.vals) vg.push([(await B.recognize(c.bin)).data.text.trim(), (await B.recognize(c.gray)).data.text.trim()]);
          raws.push([lt, vg]);
        }
      } finally {
        await A.setParameters({ tessedit_pageseg_mode: '6' });
        await B.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789.,%~' });
      }
      // 무기/방어구: 장비 이름을 읽었으면 그걸로, 아니면 두 쪽 옵션 글자와 더 닮은 쪽(사진이 잘려 줄 수가 모자랄 때 대비)
      const t = out.title;
      let kind = t && t.weapon && !t.armor ? 'w' : t && t.armor && !t.weapon ? 'a' : null;
      if (!kind) {
        const sum = (k) => raws.reduce((acc, [lt, vg]) => acc + (matchLine(k, lt, vg).sim || 0), 0);
        const sw = sum('w'), sa = sum('a');
        kind = Math.abs(sw - sa) > 0.15 ? (sw > sa ? 'w' : 'a') : loc.kind;
      }
      out.kind = kind;
      out.lines = raws.map(([lt, vg]) => matchLine(kind, lt, vg));
      return out;
    } finally { busy = false; }
  }

  const api = { CAT, KEYS, LINES, EQS, COST, ENH_MULT, ATK_COEF, CLASS_TIER, vecOf, snapshot, ratio, mainEdits, setProbs, analyze, findBoxes, readShot, matchLine, parseTitle, linePics, titlePic, critW, critX, maxW, maxX };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.SilOptChg = api;
    // ---------- 화면(계산기 카드) ----------
  const APP = root.SilApp, card = typeof document !== 'undefined' && document.getElementById('ocCard');
  if (!APP || !card) return;
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  const toast = (t) => (APP.toast ? APP.toast(t) : null);
  // 시험 중: 관리자로 로그인했을 때만 켬(rank.js가 enable을 부름). 미리보기판은 SIL_OC_ON으로 처음부터 켬
  let enabled = !!root.SIL_OC_ON;

  // 저장: 캐릭터(프로필)별 장비마다 지금 옵션·새 옵션·강화
  const LS = 'silcalc.optchg';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { store = {}; }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* 저장 못 해도 계산은 됨 */ } };
  const prof = () => {
    const k = (APP.key && APP.key()) || '기본';
    if (!store[k]) store[k] = { eq: 'w', s: {}, target: 90, sub: '', excess: 0 };
    return store[k];
  };
  const EQ = (k) => EQS.find((e) => e.k === k) || EQS[0];
  const slot = (k) => { const p = prof(); if (!p.s[k]) p.s[k] = { cur: [], nxt: [], enh: null }; return p.s[k]; };
  const inp = (a) => { const v = APP.val(a); return v; };
  const enhOf = (e) => { const s = slot(e.k); if (Number.isFinite(s.enh)) return s.enh; const raw = inp(e.enh), v = raw === '' || raw == null ? NaN : Number(raw); return Number.isFinite(v) && v >= 0 ? v : (e.kind === 'w' ? 12 : 11); };
  const optsOf = (e) => {
    const p = prof(), sub = e.kind === 'a' ? (p.sub === 'atma' ? 3 / 6 : p.sub === 'hunt' ? 2.5 / 6 : 0) : 0;
    const enh = enhOf(e), tier = CLASS_TIER[APP.cls()] || 0;
    return { mult: e.kind === 'w' ? (ENH_MULT[enh] || 1) : 1, coef: ATK_COEF[tier === 1 ? 1 : tier === 2 ? 2 : 0], sub, excess: Number(p.excess) || 0 };
  };
  const fmtNum = (t) => String(+(+t).toFixed(3));
  const valText = (c, t) => c.u === 'Lv' ? `+${fmtNum(t)}Lv` : `+${fmtNum(t)}%`;
  const linesOk = (ls) => (ls || []).some((l) => l && l.i);

  // ---------- 틀 (옵션 변환 탭: 왼쪽 읽기·옵션, 오른쪽 확률·기준) ----------
  const side = document.getElementById('ocSide'), view = document.getElementById('ocView') || card;
  const visible = () => !document.getElementById('ocView') || document.body.classList.contains('view-optchg');
  card.append(
    h('h2', { id: 'ocTitle', text: '옵션 변환 점수' }),
    h('div', { class: 'oc-drop' },
      h('p', {}, '옵션 변환 창을 띄우고 ', h('span', { class: 'nw' }, h('kbd', { text: 'PrtSc' }), ' →'), ' ', h('span', { class: 'nw' }, '여기서 ', h('kbd', { text: 'Ctrl' }), ' + ', h('kbd', { text: 'V' }))),
      h('button', { type: 'button', class: 'btn sm', text: '이미지 열기', onclick: () => { fileFor = 'auto'; document.getElementById('ocFile').click(); } })),
    h('p', { class: 'opt-sub', text: '사룡무기(4줄)·네블론 방어구(3줄) 옵션을 읽어요. 처음 넣은 건 지금 옵션, 옵션 변환을 돌린 뒤 넣은 건 새로 뜬 옵션으로 들어가요' }),
    h('div', { class: 'seg seg-sm oc-eq', role: 'tablist', id: 'ocEq' }),
    h('div', { class: 'oc-item', id: 'ocItem' }),
    h('div', { class: 'oc-slot', id: 'ocCur' }),
    h('div', { class: 'oc-slot oc-new', id: 'ocNew' }),
    h('p', { class: 'oc-msg', id: 'ocMsg', hidden: true }),
    h('input', { type: 'file', accept: 'image/*', id: 'ocFile', hidden: true }),
  );
  (side || card).append(
    side ? h('h2', { id: 'ocSideTitle', text: '한 번 돌릴 때' }) : null,
    h('p', { class: 'oc-now', id: 'ocNow' }),
    h('div', { class: 'oc-goal', id: 'ocGoal' }),
    h('details', { class: 'opt-set' },
      h('summary', { text: '계산 기준' }),
      h('div', { class: 'opt-set-row' }, h('label', { for: 'ocSub', text: '크리·극대 → 보뎀 치환 (방어구)' }),
        h('select', { id: 'ocSub' }, h('option', { value: '', text: '안 함' }), h('option', { value: 'atma', text: '아트마석 (크극 6 = 보뎀 3)' }), h('option', { value: 'hunt', text: '사냥석 (크극 6 = 보뎀 2.5)' }))),
      h('div', { class: 'opt-set-row' }, h('label', { for: 'ocEx', text: '양극화 상한(60%) 넘는 몫' }),
        h('select', { id: 'ocEx' }, h('option', { value: '0', text: '버림' }), h('option', { value: '1', text: '물마공 %로 바꿔서 셈' }), h('option', { value: '2', text: '추가 지속 피해로 바꿔서 셈' }))),
      h('p', { class: 'opt-hint', text: '점수는 옵션이 없을 때 0점, 이 장비에서 나올 수 있는 가장 좋은 옵션(모두 최대 수치)일 때 100점이에요. 실투력 기준이라 직업·스탯마다 달라요. 치환은 다른 장비 소켓을 바꿔 맞출 수 있다고 보고 세는 방식이에요 (시트 3.0.19 옵션변환 계산과 같음).' })),
  );
  const $ = (id) => document.getElementById(id);
  let fileFor = 'auto';
  $('ocFile').addEventListener('change', async (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f && root.SilOCR) take(await root.SilOCR.imageFromBlob(f), fileFor); });
  $('ocSub').value = prof().sub || ''; $('ocEx').value = String(prof().excess || 0);
  $('ocSub').onchange = () => { prof().sub = $('ocSub').value; persist(); schedule(); };
  $('ocEx').onchange = () => { prof().excess = Number($('ocEx').value) || 0; persist(); schedule(); };
  view.addEventListener('dragover', (ev) => { ev.preventDefault(); view.classList.add('drop-on'); });
  view.addEventListener('dragleave', () => view.classList.remove('drop-on'));
  view.addEventListener('drop', async (ev) => {
    ev.preventDefault(); view.classList.remove('drop-on');
    const f = [...ev.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f && root.SilOCR) take(await root.SilOCR.imageFromBlob(f), 'auto');
  });

  // ---------- 그리기 ----------
  function renderEq() {
    const box = $('ocEq'); box.textContent = '';
    const cur = prof().eq;
    for (const e of EQS) {
      box.append(h('button', { type: 'button', class: 'tab' + (e.k === cur ? ' on' : ''), role: 'tab', 'aria-selected': String(e.k === cur), text: e.name,
        onclick: () => { prof().eq = e.k; persist(); renderAll(); schedule(); } }));
    }
  }
  function lineRow(e, which, j) {
    const s = slot(e.k), arr = s[which], ln = arr[j] || { i: 0, v: null };
    const opt = h('select', { class: 'oc-opt', 'aria-label': `${j + 1}번째 줄 옵션` }, h('option', { value: '0', text: '—' }));
    CAT.forEach((c, k) => { if (c.k === e.kind) opt.append(h('option', { value: String(k + 1), text: c.n + (c.s ? '' : ' (실투력 무관)') })); });
    opt.value = String(ln.i || 0);
    const c = ln.i ? CAT[ln.i - 1] : null;
    const val = h('select', { class: 'oc-val', 'aria-label': `${j + 1}번째 줄 수치`, disabled: !c });
    if (c) c.t.forEach((t, k) => val.append(h('option', { value: String(t), text: valText(c, t) + (k === c.t.length - 1 ? ' 최대' : '') })));
    if (c) val.value = String(ln.v != null ? ln.v : c.t[0]);
    const set = (patch) => {
      const a = slot(e.k)[which]; while (a.length < LINES[e.kind]) a.push({ i: 0, v: null });
      a[j] = Object.assign({}, a[j], patch, { chk: false }); persist(); renderSlots(); schedule();
    };
    opt.onchange = () => { const i = Number(opt.value) || 0; set({ i, v: i ? (CAT[i - 1].t.includes(ln.v) ? ln.v : CAT[i - 1].t[0]) : null }); };
    val.onchange = () => set({ v: Number(val.value) });
    const enh = enhOf(e);
    const eff = c && c.e && ln.v != null ? `× ${enh} = ${fmtNum(ln.v * enh)}${c.u === 'Lv' ? 'Lv' : '%'}` : '';
    const dup = c && arr.some((x, k) => k !== j && x && x.i === ln.i);
    return h('div', { class: 'oc-row' + (ln.chk ? ' chk' : '') + (dup ? ' dup' : ''), title: ln.raw ? '읽은 글자: ' + ln.raw : null },
      h('span', { class: 'oc-no', text: String(j + 1) }), opt, val,
      h('span', { class: 'oc-eff', text: dup ? '같은 옵션은 두 줄에 안 나와요' : ln.chk ? '확인해 주세요' : eff }));
  }
  function slotBox(e, which) {
    const s = slot(e.k), isCur = which === 'cur';
    const box = h('div', {});
    const shotBtn = h('button', { type: 'button', class: 'txt sm', text: '사진 열기', onclick: () => { fileFor = which; $('ocFile').click(); } });
    const clr = linesOk(s[which]) ? h('button', { type: 'button', class: 'txt sm mute', text: '비우기', onclick: () => { slot(e.k)[which] = []; persist(); renderSlots(); schedule(); } }) : null;
    box.append(h('div', { class: 'oc-slot-h' },
      h('h3', { text: isCur ? '지금 옵션' : '새로 뜬 옵션' }),
      h('span', { class: 'oc-slot-sub', text: isCur ? '계산기 스탯에 이미 들어 있는 옵션' : '옵션 변환을 돌린 뒤 창을 다시 찍어 넣어요' }),
      h('span', { class: 'oc-slot-btns' }, clr, shotBtn)));
    for (let j = 0; j < LINES[e.kind]; j++) box.append(lineRow(e, which, j));
    box.append(h('div', { class: 'oc-score', id: isCur ? 'ocScoreCur' : 'ocScoreNew' }));
    return box;
  }
  function renderItem() {
    const e = EQ(prof().eq), box = $('ocItem'); box.textContent = '';
    const enhIn = h('input', { type: 'text', inputmode: 'numeric', class: 'num oc-enh', value: String(enhOf(e)), 'aria-label': '강화 수치' });
    enhIn.onchange = () => {
      const v = Math.round(Number(enhIn.value));
      const calcV = Number(inp(e.enh));
      slot(e.k).enh = Number.isFinite(v) && v >= 0 && v <= 13 && v !== calcV ? v : null;
      persist(); renderAll(); schedule();
    };
    const type = inp(e.type), bad = type !== e.need;
    box.append(h('span', { class: 'oc-item-name', text: e.item }), h('span', { class: 'oc-enh-w' }, h('span', { text: '강화 +' }), enhIn));
    if (bad) box.append(h('p', { class: 'oc-warn', text: `계산기 장비에서 ${e.name}가 ${type || '비어 있'}${type ? '(으)로 되어 있어요' : '어요'}. ${e.need}일 때만 계산해요` }));
    else if (Number.isFinite(slot(e.k).enh) && slot(e.k).enh !== Number(inp(e.enh))) box.append(h('p', { class: 'oc-note', text: `계산기 장비 강화는 +${inp(e.enh)}인데, 옵션은 사진에서 읽은 +${slot(e.k).enh} 기준으로 계산해요` }));
  }
  function renderSlots() {
    const e = EQ(prof().eq);
    const a = $('ocCur'), b = $('ocNew');
    a.textContent = ''; b.textContent = '';
    a.append(slotBox(e, 'cur')); b.append(slotBox(e, 'nxt'));
    paintResult();
  }
  function renderAll() { renderEq(); renderItem(); renderSlots(); }

  // ---------- 계산 ----------
  let last = null, seq = 0, timer = 0;
  let dirty = true;
  function schedule() { clearTimeout(timer); if (!visible()) { dirty = true; return; } dirty = false; timer = setTimeout(compute, 250); }
  const fmtKor = (n) => {
    if (!Number.isFinite(n)) return '';
    if (n >= 1e12) return `${+(n / 1e12).toFixed(n >= 1e13 ? 0 : 1)}조`;
    if (n >= 1e8) return `${+(n / 1e8).toFixed(n >= 1e10 ? 0 : 1)}억`;
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
    return Math.round(n).toLocaleString('ko-KR');
  };
  const cpText = (n) => (APP.korUnit ? APP.korUnit(Math.round(n)) : fmtKor(n));
  const fmtTries = (p) => {
    if (!(p > 0)) return null;
    const n = 1 / p;
    if (n < 10) return `${+n.toFixed(1)}번`;
    if (n >= 1e8) return `${fmtKor(n)} 번`;
    if (n >= 1e4) return `${fmtKor(n)} 번`;
    return `${Math.round(n).toLocaleString('ko-KR')}번`;
  };
  const fmtP = (p) => {
    if (!(p > 0)) return '0%';
    const x = p * 100;
    if (x >= 10) return `${x.toFixed(0)}%`;
    if (x >= 1) return `${x.toFixed(1)}%`;
    if (x >= 0.01) return `${x.toFixed(2)}%`;
    return '0.01% 미만';
  };
  const costText = (kind, p) => {
    if (!(p > 0)) return '';
    const n = 1 / p, c = COST[kind];
    return kind === 'w' ? `약 ${fmtKor(n * c.n)} ED` : `변환석 약 ${n < 1e4 ? Math.ceil(n * c.n).toLocaleString('ko-KR') : fmtKor(n * c.n)}개`;
  };
  async function compute() {
    const my = ++seq, e = EQ(prof().eq), s = slot(e.k);
    const get = APP.sheetGet;
    const snap = get && !(APP.empty && APP.empty()) ? snapshot(get) : null;
    if (!snap || inp(e.type) !== e.need) { last = { e, err: !snap ? 'stat' : 'type' }; paintResult(); return; }
    const o = optsOf(e), enh = enhOf(e);
    const cur = vecOf(s.cur, enh), nxt = linesOk(s.nxt) ? vecOf(s.nxt, enh) : null;
    const cp = APP.cp ? APP.cp() : NaN;
    const key = JSON.stringify([NEED.map((a) => snap[a]), e.kind, enh, o, s.cur]);
    let an = last && last.key === key ? last.an : null;
    last = { e, key, an, snap, o, enh, cur, nxt, cp, busy: !an };
    paintResult();
    if (!an) {
      an = await analyze(snap, e.kind, enh, cur, o, () => new Promise((r) => setTimeout(r, 0)), () => my === seq);
      if (my !== seq) return;
      last.an = an; last.busy = false;
    }
    paintResult();
  }
  function paintResult() {
    const sc = $('ocScoreCur'), sn = $('ocScoreNew'), goal = $('ocGoal');
    if (!sc || !sn || !goal) return;
    sc.textContent = ''; sn.textContent = ''; goal.textContent = '';
    const now = $('ocNow'), cpNow = APP.cp ? APP.cp() : NaN;
    if (now) { now.textContent = ''; if (Number.isFinite(cpNow) && !(APP.empty && APP.empty())) now.append('지금 실투력', h('b', { text: cpText(cpNow) })); }
    const L = last;
    if (!L) return;
    if (L.err === 'stat') {
      const go = h('button', { type: 'button', class: 'txt sm', text: '계산기 탭으로', onclick: () => { const b = document.querySelector('#views [data-view="calc"]'); if (b) b.click(); } });
      sc.append(h('p', { class: 'oc-hint' }, '계산기 탭에서 스탯을 먼저 채우면 점수를 계산해요. ', go));
      goal.append(h('p', { class: 'oc-hint', text: '스탯을 채우면 여기에 한 번 돌릴 때 좋은 옵션이 뜰 확률과 평균 횟수가 나와요' }));
      return;
    }
    if (L.err === 'type') return;
    const s = slot(L.e.k);
    if (!L.an) { sc.append(h('p', { class: 'oc-hint', text: L.busy ? '점수 계산 중…' : '계산할 수 없어요' })); return; }
    const an = L.an, kind = L.e.kind;
    const score = (r) => Math.max(0, Math.min(100, an.score(r)));
    const cpNoOpt = L.cp * an.r0;
    // 지금 옵션
    if (linesOk(s.cur)) {
      const sCur = score(1);
      sc.append(h('p', { class: 'oc-big' }, h('b', { text: `${sCur.toFixed(1)}점` }),
        h('span', { text: Number.isFinite(L.cp) ? ` 이 옵션이 실투력을 ${cpText(L.cp - cpNoOpt)} (${((1 / an.r0 - 1) * 100).toFixed(1)}%) 올려 줘요` : '' })));
    } else sc.append(h('p', { class: 'oc-hint', text: '지금 붙은 옵션을 넣어야 점수를 매길 수 있어요. 옵션 변환 창을 찍어 붙여넣거나 직접 골라 주세요' }));
    // 새 옵션
    if (L.nxt && linesOk(s.cur)) {
      const rN = ratio(L.snap, L.cur, L.nxt, L.o), sN = score(rN), d = (rN - 1) * 100;
      const cls = Math.abs(d) < 0.005 ? 'same' : d > 0 ? 'up' : 'down';
      sn.append(h('p', { class: 'oc-big' }, h('b', { text: `${sN.toFixed(1)}점` }),
        h('span', { class: 'oc-cmp ' + cls, text: cls === 'same' ? ' 지금과 같아요' : ` 지금보다 ${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(2)}%` })));
      if (Number.isFinite(L.cp)) sn.append(h('p', { class: 'oc-cp' }, h('span', { text: '바꾸면 실투력 ' }), h('b', { text: cpText(L.cp) }), ' → ', h('b', { class: cls, 'data-cp': String(Math.round(L.cp * rN)), text: cpText(L.cp * rN) })));
      sn.append(h('button', { type: 'button', class: 'btn ' + (d > 0 ? 'primary' : '') + ' wide oc-apply', text: d > 0 ? '새 옵션으로 바꾸기' : '그래도 새 옵션으로 바꾸기', onclick: applyNew }),
        h('p', { class: 'oc-hint', text: '누르면 계산기 스탯(공격력·크뎀 등)을 새 옵션 기준으로 고치고, 새 옵션을 지금 옵션으로 옮겨요' }));
    } else if (L.nxt) sn.append(h('p', { class: 'oc-hint', text: '지금 옵션을 먼저 넣어 주세요' }));
    // 목표까지
    const tIn = h('input', { type: 'text', inputmode: 'decimal', class: 'num oc-target', value: String(prof().target), 'aria-label': '목표 점수' });
    tIn.onchange = () => { let v = Number(tIn.value); if (!Number.isFinite(v)) v = 90; v = Math.max(0, Math.min(100, Math.round(v * 10) / 10)); prof().target = v; persist(); paintResult(); };
    const T = prof().target, pT = an.atLeast[Math.min(10000, Math.ceil(T * 100 - 1e-7))], pTop = an.atLeastTop[Math.min(10000, Math.ceil(T * 100 - 1e-7))];
    const line = (lead, p) => h('p', { class: 'oc-p' }, lead, h('b', { text: fmtP(p) }),
      p > 0 ? h('span', { text: ` · 평균 ${fmtTries(p)} · ${costText(kind, p)}` }) : h('span', { text: ' · 나올 수 없어요' }));
    if (!side) goal.append(h('h3', { text: '한 번 돌릴 때' }));
    if (linesOk(s.cur)) {
      const sCur = score(1), pB = an.atLeast[Math.min(10000, Math.floor(sCur * 100 + 1e-7) + 1)];
      goal.append(line('지금보다 좋은 옵션 ', pB));
    }
    goal.append(h('p', { class: 'oc-p' }, h('span', { class: 'oc-t' }, tIn, h('span', { text: '점 이상' })), ' ', h('b', { text: fmtP(pT) }),
      pT > 0 ? h('span', { text: ` · 평균 ${fmtTries(pT)} · ${costText(kind, pT)}` }) : h('span', { text: ' · 나올 수 없어요' })));
    goal.append(h('p', { class: 'oc-hint', text: `옵션 종류만 맞으면(수치가 모두 최대라면) ${T}점 이상: ${fmtP(pTop)}${pTop > 0 ? ` · 평균 ${fmtTries(pTop)}` : ''}. 100점은 ${an.bestIds.map((i) => CAT[i - 1].n).join(' + ')} 모두 최대예요. 수치 단계는 고르게, 옵션은 넥슨 공개 확률대로 뽑아요` }));
  }
  function applyNew() {
    const L = last; if (!L || !L.nxt || !L.an) return;
    const e = L.e, s = slot(e.k);
    const main = {};
    for (const a of ['C11', 'C12', 'C13']) main[a] = Number(inp(a));
    for (const a of ['C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C26', 'C29', 'C30', 'C33']) main[a] = Number(inp(a)) * 100;
    const ed = mainEdits(L.snap, main, L.cur, L.nxt, L.o), out = {};
    for (const [a, v] of Object.entries(ed)) out[a] = a === 'C11' || a === 'C12' || a === 'C13' ? Math.round(v) : Math.round(v / 100 * 1e9) / 1e9;
    APP.setVals(out);
    s.cur = s.nxt.map((x) => Object.assign({}, x, { chk: false })); s.nxt = [];
    persist(); renderSlots(); schedule();
    toast(`새 옵션으로 바꿨어요 · 스탯 ${Object.keys(out).length}칸 고침`);
  }

  // ---------- 사진 받기 ----------
  let reading = false;
  async function take(img, which) {
    const loc = findBoxes(img);
    if (!loc) { toast('옵션 변환 창을 못 찾았어요. 옵션 줄 상자가 다 보이게 찍어 주세요'); return false; }
    if (reading) { toast('앞 사진을 읽는 중이에요'); return true; }
    reading = true;
    if (!visible()) setOcView(true);
    const msg = $('ocMsg'); msg.hidden = false; msg.textContent = '옵션 변환 창 읽는 중…';
    if (window.innerWidth < 1024) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const r = await readShot(img, (m) => { if (m && m.status && /줄|이름/.test(m.status)) msg.textContent = m.status; });
      if (!r) { toast('옵션 변환 창을 못 찾았어요'); return true; }
      const p = prof();
      let eqk = r.kind === 'w' ? 'w' : (r.title && r.title.part) || (EQ(p.eq).kind === 'a' ? p.eq : null);
      let note = '';
      if (!eqk) { eqk = 'a1'; note = ' · 부위를 못 읽어서 상의로 넣었어요. 맞는 부위를 골라 주세요'; }
      p.eq = eqk;
      const e = EQ(eqk), s = slot(eqk);
      if (r.title && r.title.enh != null) s.enh = r.title.enh !== Number(inp(e.enh)) ? r.title.enh : null;
      const lines = r.lines.map((l) => ({ i: l.i, v: l.v, chk: !l.ok, raw: l.raw }));
      if (lines.length < LINES[e.kind]) note += ` · 옵션 줄이 ${lines.length}개만 보여요. 나머지 줄은 직접 골라 주세요`;
      const same = (a, b) => a.length === b.length && a.every((x, k) => b[k] && x.i === b[k].i && x.v === b[k].v);
      let to = which === 'cur' || which === 'nxt' ? which : (!linesOk(s.cur) ? 'cur' : 'nxt');
      if (to === 'nxt' && same(lines, s.cur)) { toast('지금 옵션과 같아요'); to = 'cur'; }
      s[to] = lines; persist();
      renderAll(); schedule();
      const nChk = lines.filter((l) => l.chk).length;
      toast(`${e.item} 옵션을 ${to === 'cur' ? '지금 옵션' : '새로 뜬 옵션'}에 넣었어요${nChk ? ` · ${nChk}줄은 확인해 주세요` : ''}${note}`);
      return true;
    } catch (err) {
      console.error(err); toast('옵션을 읽지 못했어요: ' + (err.message || err)); return true;
    } finally { reading = false; msg.hidden = true; }
  }
  // 붙여넣은 사진이 옵션 변환 창이면 여기서 가져감(app.js 붙여넣기에서 부름)
  api.claim = (img) => { if (!enabled) return false; try { if (!findBoxes(img)) return false; } catch (e) { return false; } take(img, 'auto'); return true; };
  api.take = (img, which) => (enabled ? take(img, which) : false);

  api.show = () => { renderAll(); if (dirty || !last) schedule(); else paintResult(); };
  // 머리말 탭: 옵션 변환 화면 열고 닫기(랭킹이 없는 판에서도 되게 여기서 직접 처리)
  function setOcView(on) {
    const v = document.getElementById('ocView'); if (!v) return;
    document.body.classList.toggle('view-optchg', on); v.hidden = !on;
    if (on) {
      document.body.classList.remove('view-avatar', 'view-rank', 'view-admin');
      for (const id of ['avView', 'rankView', 'adminView']) { const x = document.getElementById(id); if (x) x.hidden = true; }
      for (const b of document.querySelectorAll('#views button[data-view]')) b.setAttribute('aria-current', b.dataset.view === 'optchg' ? 'page' : 'false');
      api.show(); window.scrollTo(0, 0);
    }
  }
  const nav = document.getElementById('views');
  const wantOpen = new URLSearchParams(location.search).has('optchg');
  if (nav && document.getElementById('ocView')) {
    nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setOcView(b.dataset.view === 'optchg' && enabled); });
  }
  api.enable = () => {
    const first = !enabled || !api._shown; enabled = true; api._shown = true;
    const b = document.querySelector('#views button[data-view="optchg"]'); if (b) b.hidden = false;
    if (first && wantOpen) setOcView(true);
  };
  if (enabled) api.enable();
  APP.onRefresh(() => { if (visible()) renderItem(); schedule(); });
  renderAll(); schedule();

})(typeof window !== 'undefined' ? window : globalThis);
