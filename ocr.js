/* 화면인식: 캡처(화면 공유/붙여넣기/파일) → 전처리 → Tesseract → 스탯 매칭 */
(function (root) {
  'use strict';

  // 시트 C열 항목 ↔ 게임 상세 능력치 이름(별칭). kind: int(정수) / pct(퍼센트)
  const FIELDS = [
    { cell: 'C11', kind: 'int', names: ['마법 공격력', '물리 공격력'] },
    { cell: 'C12', kind: 'int', names: [], rangeMaxOf: 'C11' },
    { cell: 'C14', kind: 'pct', names: ['적응력'] },
    { cell: 'C15', kind: 'pct', names: ['초적응력'] },
    { cell: 'C17', kind: 'pct', names: ['크리티컬 확률'] },
    { cell: 'C18', kind: 'pct', names: ['크리티컬 데미지'] },
    { cell: 'C19', kind: 'pct', names: ['극대화'] },
    { cell: 'C20', kind: 'pct', names: ['양극화 : 타격/피격 데미지 증가', '양극화'] },
    { cell: 'C21', kind: 'pct', names: ['보스에게 주는 피해 증가'] },
    { cell: 'C22', kind: 'pct', names: ['공격시 추가 지속 피해'] },
    { cell: 'C24', kind: 'pct', names: ['체력 50% 초과인 적 공격시 데미지 증가', '체력 50% 초과 적 공격시 데미지'] },
    { cell: 'C25', kind: 'pct', names: ['체력 50% 이하인 적 공격시 데미지 증가', '체력 50% 이하 적 공격시 데미지'] },
    { cell: 'C26', kind: 'pct', names: ['체력 100% 이하인 적 공격시 데미지 증가', 'HP 100% 이하 적 공격시 데미지'] },
    { cell: 'C29', kind: 'pct', names: ['강렬한 스킬 데미지 증가'] },
    { cell: 'C30', kind: 'pct', names: ['초월한 스킬 데미지 증가'] },
    { cell: 'C31', kind: 'pct', names: ['강렬한 스킬 재사용 시간 감소'] },
    { cell: 'C32', kind: 'pct', names: ['초월한 스킬 재사용 시간 감소'] },
    { cell: 'C33', kind: 'pct', names: ['모든 스킬 데미지 증가'] },
    { cell: 'C34', kind: 'pct', names: ['스킬 사용시 재사용 시간 초기화 확률'] },
    { cell: 'C35', kind: 'pct', names: ['동작속도'] },
    // 계산에 안 쓰는 항목: 비슷한 이름으로 잘못 붙지 않도록 먼저 걸러냄
    { cell: null, names: ['HP', '경험치 획득량 증가', 'ED 획득량 증가', '아이템 드랍률 증가', '일반 몬스터에게 주는 피해 증가',
      '이동속도', '데미지 감소', '보스에게 받는 피해 감소', '전투력', '수비력', '공명도'] },
  ];

  // ---------- 문자열 정규화 / 유사도 ----------
  const NUMKO = { '10': '십', '20': '이십', '30': '삼십', '40': '사십', '50': '오십', '60': '육십', '70': '칠십', '80': '팔십', '90': '구십', '100': '백' };
  const hpTok = (t) => String(t).replace(/(체력|HP|hp)\s*(\d)\s*(\d)?\s*(\d)?\s*[%％]\s*(초\s*과|이\s*하)/g, (m, a, d1, d2, d3, w) => '체력' + (NUMKO[d1 + (d2 || '') + (d3 || '')] || (d1 + (d2 || '') + (d3 || ''))) + w.replace(/\s/g, ''));
  const HPRE = /체력(십|이십|삼십|사십|오십|육십|칠십|팔십|구십|백|\d+)(초과|이하)/;
  function norm(s) {
    return String(s)
      .replace(/대미지/g, '데미지')
      .replace(/(체력|HP|hp)\s*(\d)\s*(\d)?\s*(\d)?\s*[%％]\s*(초\s*과|이\s*하)/g, (m, a, d1, d2, d3, w) => '체력' + (NUMKO[d1 + (d2 || '') + (d3 || '')] || (d1 + (d2 || '') + (d3 || ''))) + w.replace(/\s/g, ''))
      .replace(/[\s:：·•.,'"`|_\-–—()\[\]{}<>]/g, '')
      .replace(/[^가-힣A-Za-z0-9/]/g, '')
      .toUpperCase();
  }
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // 라벨 후보 문자열 s 의 "끝부분"이 이름 name 과 얼마나 닮았는지 (0~1)
  function suffixScore(s, name) {
    if (!s || !name) return 0;
    if (s.endsWith(name)) return 1 + name.length / 100; // 긴 이름 우선(초적응력 > 적응력)
    let best = 0;
    for (let k = Math.max(1, name.length - 2); k <= name.length + 2; k++) {
      if (k > s.length) break;
      const tail = s.slice(s.length - k);
      const sc = 1 - lev(tail, name) / Math.max(tail.length, name.length);
      if (sc > best) best = sc;
    }
    return best;
  }
  const NORM_NAMES = FIELDS.map(f => ({ f, names: f.names.map(norm) }));
  function matchField(label) {
    const s = norm(label);
    const ls = HPRE.exec(s);
    let best = null;
    for (const { f, names } of NORM_NAMES) for (const nm of names) {
      const ns = HPRE.exec(nm);
      if ((ls || ns) && (!ls || !ns || ls[0] !== ns[0])) continue;
      const sc = suffixScore(s, nm);
      const need = nm.length <= 3 ? 0.99 : nm.length <= 5 ? 0.75 : 0.68;
      if (sc >= need && (!best || sc > best.score)) best = { field: f, score: sc };
    }
    return best;
  }

  // ---------- 숫자 ----------
  const NUM_RE = /(\d{1,3}(?:[,.]\d{3})+(?![\d])|\d+(?:[.,]\d+)?)\s*(%|％)?/g;
  function toValue(raw, pctSign, kind) {
    let s = raw;
    if (kind === 'int') {
      s = s.replace(/[,.](?=\d{3}(\D|$))/g, '');
      const n = parseInt(s.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    }
    s = s.replace(',', '.');
    // '%'를 '96'·'9'로 잘못 읽은 경우: 게임은 소수 둘째 자리까지만 표시
    if (!pctSign) { const m = /^(\d+)\.(\d{2})\d+$/.exec(s); if (m) s = m[1] + '.' + m[2]; }
    let n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return +(n / 100).toFixed(6);
  }

  // 한 줄 텍스트 → [{label, raw, pct, rangeMax}]
  function splitPairs(text) {
    // 라벨 내부 숫자(50%, 100%)는 미리 치환해 숫자로 오인하지 않게 함
    const t = hpTok(text);
    const out = []; let last = 0; let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(t))) {
      const label = t.slice(last, m.index);
      const item = { label, raw: m[1], pct: !!m[2], idx: m.index };
      // 범위 "12,345 ~ 67,890"
      const after = t.slice(NUM_RE.lastIndex);
      const rm = /^\s*[~∼〜\-–]\s*(\d{1,3}(?:[,.]\d{3})+|\d+)/.exec(after);
      if (rm) { item.rangeMax = rm[1]; NUM_RE.lastIndex += rm[0].length; }
      out.push(item);
      last = NUM_RE.lastIndex;
    }
    return out;
  }

  // 행 목록 → 항목별 인식값
  function parseRows(rows) {
    const found = {};
    const put = (cell, value, info) => {
      if (value === null) return;
      if (!found[cell] || info.score > found[cell].score) found[cell] = Object.assign({ cell, value }, info);
    };
    for (const row of rows) {
      let pending = '';
      for (const p of splitPairs(row.text)) {
        const label = (pending + p.label);
        const mf = matchField(label);
        if (mf && !mf.field.cell) { pending = ''; continue; }
        if (mf) {
          const f = mf.field;
          const conf = row.conf != null ? row.conf : 100;
          const v = toValue(p.raw, p.pct, f.kind);
          let score = mf.score * (0.5 + conf / 200);
          // 퍼센트 항목인데 % 가 없으면 신뢰도 낮춤
          if (f.kind === 'pct' && !p.pct) score *= 0.85;
          put(f.cell, v, { score, text: row.text.trim(), conf, label: f.names[0] || f.cell });
          if (p.rangeMax && f.cell === 'C11') put('C12', toValue(p.rangeMax, false, 'int'), { score, text: row.text.trim(), conf, label: '극대화 범위 최댓값' });
          pending = '';
        } else {
          // 숫자가 라벨 일부였을 수 있음(예: 오인식) → 다음 숫자 라벨에 이어붙임
          pending = label + p.raw;
          if (pending.length > 40) pending = pending.slice(-40);
        }
      }
    }
    return found;
  }

  // ---------- 단어 → 행 재구성 (라벨과 값이 멀리 떨어진 표 형태 대응) ----------
  function wordsToRows(words) {
    const ws = words.filter(w => w.text && w.text.trim()).map(w => ({
      text: w.text, conf: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1,
      cy: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0,
    })).sort((a, b) => a.cy - b.cy);
    // 글자 높이 중앙값 기준으로, 세로 중심이 가장 가까운 줄에 붙임(제목줄과 섞이지 않게)
    const hs = ws.map(w => w.h).sort((a, b) => a - b), H = hs.length ? hs[hs.length >> 1] : 10;
    const tol = H * 0.5;
    const rows = [];
    for (const w of ws) {
      let r = null, dmin = Infinity;
      for (const row of rows) { const d = Math.abs(row.cy - w.cy); if (d < dmin) { dmin = d; r = row; } }
      if (r && dmin < tol) { r.items.push(w); r.sum += w.cy; r.cy = r.sum / r.items.length; r.h = Math.max(r.h, w.h); }
      else rows.push({ cy: w.cy, sum: w.cy, h: w.h, items: [w] });
    }
    return rows.sort((a, b) => a.cy - b.cy).map(r => {
      r.items.sort((a, b) => a.x0 - b.x0);
      const conf = r.items.reduce((s, w) => s + w.conf, 0) / r.items.length;
      return { text: r.items.map(w => w.text).join(' '), conf, y: r.cy,
        x0: Math.min(...r.items.map(w => w.x0)), x1: Math.max(...r.items.map(w => w.x1)),
        y0: Math.min(...r.items.map(w => w.y0)), y1: Math.max(...r.items.map(w => w.y1)) };
    });
  }
  // 1차(한글) 인식 단어 중 숫자 단어를, 숫자 전용 2차 인식 결과로 교체/보충
  function boxOverlap(a, b) {
    const ix = Math.max(0, Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0));
    const iy = Math.max(0, Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0));
    const areaB = Math.max(1, (b.bbox.x1 - b.bbox.x0) * (b.bbox.y1 - b.bbox.y0));
    return ix * iy / areaB;
  }
  const HANGUL = /[\uAC00-\uD7A3\u3131-\u318E]/;
  function mergeDigitPass(w1, w2) {
    const digits = w2.filter(b => /\d/.test(b.text));
    const used = new Set(), out = [];
    for (const a of w1) {
      if (/\d/.test(a.text) && !HANGUL.test(a.text)) {
        const ov = [];
        digits.forEach((b, i) => { if (boxOverlap(a, b) > 0.5) { ov.push(b); used.add(i); } });
        if (ov.length) {
          ov.sort((x, y) => x.bbox.x0 - y.bbox.x0);
          const t2 = ov.map(b => b.text).join('');
          // 살펴보기 창의 ▲▼ 화살표를 숫자 전용 인식이 '4' 따위로 읽는 경우: 1차가 깔끔하면 1차를 믿음
          const d1 = a.text.replace(/\D/g, ''), d2 = t2.replace(/\D/g, '');
          if (/^[\d.,]+%?$/.test(a.text) && d2.length > d1.length && d2.startsWith(d1)) { out.push(a); continue; }
          out.push(Object.assign({}, a, { text: t2, confidence: Math.min(...ov.map(b => b.confidence)) }));
          continue;
        }
      }
      out.push(a);
    }
    digits.forEach((b, i) => {
      if (!used.has(i) && !w1.some(a => HANGUL.test(a.text) && boxOverlap(b, a) > 0.3)) out.push(b);
    });
    return out;
  }
  function collectWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) out.push(w);
    return out;
  }

  // ---------- 전체 화면에서 상세 스탯 창 위치 찾기 ----------
  const ANCHORS = ['크리티컬', '극대화', '양극화', '적응력', '강렬한', '초월한', '재사용', '데미지', '피해', '공격력', '스킬', '능력치', '체력', '확률', '동작속도', '획득량'].map(norm);
  function locatePanel(words) {
    const hits = words.filter(w => { const t = norm(w.text); return t.length >= 2 && ANCHORS.some(k => t.includes(k) || (k.length >= 3 && k.includes(t) && t.length >= 2)); })
      .map(w => ({ x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, cx: (w.bbox.x0 + w.bbox.x1) / 2, cy: (w.bbox.y0 + w.bbox.y1) / 2, h: w.bbox.y1 - w.bbox.y0 }));
    if (hits.length < 4) return null;
    const hs = hits.map(h => h.h).sort((a, b) => a - b), rowH = hs[hs.length >> 1] * 2.1;
    const R = rowH * 12;
    // 가장 빽빽한 단어에서 시작해 가까운 단어를 이어 붙임
    let seed = 0, best = -1;
    hits.forEach((h, i) => { const n = hits.filter(o => Math.hypot(o.cx - h.cx, o.cy - h.cy) < R).length; if (n > best) { best = n; seed = i; } });
    const inSet = new Set([seed]); let grew = true;
    while (grew) {
      grew = false;
      hits.forEach((h, i) => { if (!inSet.has(i) && [...inSet].some(j => Math.abs(hits[j].cx - h.cx) < R && Math.abs(hits[j].cy - h.cy) < rowH * 4)) { inSet.add(i); grew = true; } });
    }
    const set = [...inSet].map(i => hits[i]);
    if (set.length < 4) return null;
    const x0 = Math.min(...set.map(h => h.x0)), x1 = Math.max(...set.map(h => h.x1));
    const y0 = Math.min(...set.map(h => h.y0)), y1 = Math.max(...set.map(h => h.y1));
    const W = x1 - x0;
    return { x: x0 - W * 0.06 - rowH, y: y0 - rowH * 2.5, w: W * 1.45 + rowH, h: (y1 - y0) + rowH * 5 };
  }

  // ---------- 브라우저 전용 ----------
  const isBrowser = typeof document !== 'undefined';
  function preprocess(src, rect, opts) {
    opts = opts || {};
    const r = rect || { x: 0, y: 0, w: src.width, h: src.height };
    const scale = opts.scale || (r.h < 900 ? Math.min(3, 1800 / Math.max(r.h, 1)) : 1.5);
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * scale); c.height = Math.round(r.h * scale);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    let sum = 0; const n = d.length / 4; const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // 컬러 글자(노랑·초록 수치)도 살리도록 채널 최댓값 사용
      const v = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      lum[i] = v; sum += v;
    }
    const mean = sum / n, dark = mean < 128;
    // 밝기 분포로 대비 늘리기
    const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[lum[i] | 0]++;
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.01) { hi = i; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) {
      let v = (lum[i] - lo) / span * 255; v = v < 0 ? 0 : v > 255 ? 255 : v;
      if (dark) v = 255 - v; // 검은 바탕 흰 글씨 → 흰 바탕 검은 글씨
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // 1차: 한글 라벨(kor, PSM 6) / 2차: 숫자 전용(eng + 화이트리스트, PSM 11)
  let workersP = null;
  function baseUrl(p) { return new URL(p, document.baseURI).href; }
  function getWorkers(onProgress) {
    if (!workersP) {
      const T = root.Tesseract;
      if (!T) return Promise.reject(new Error('OCR 라이브러리를 불러오지 못했어요'));
      // 직접 호스팅판: 엔진·학습 데이터를 jsDelivr에서 받음(브라우저가 캐시)
      if (root.SIL_CDN) {
        const o = (tag) => ({ logger: (m) => onProgress && onProgress(Object.assign({ tag }, m)) });
        workersP = Promise.all([
          T.createWorker(['kor'], 1, o('kor')).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); return w; }),
          T.createWorker(['eng'], 1, o('eng')).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789.,%~' }); return w; }),
        ]).catch((e) => { workersP = null; throw e; });
        return workersP;
      }
      // 학습 데이터는 .js 파일(base64)로 두고, 워커 안에서 fetch를 가로채 넘겨줌
      // (.gz 파일을 못 올리는 호스팅에서도 동작)
      const base = baseUrl('vendor/');
      const wrap = [
        'self.SIL_BASE=' + JSON.stringify(base) + ';',
        'const _fetch=self.fetch.bind(self);',
        'self.fetch=async function(u,o){const m=/\\/(\\w+)\\.traineddata(\\.gz)?$/.exec(String(u));',
        ' if(m){importScripts(self.SIL_BASE+"lang/"+m[1]+".js");const s=atob(self.SIL_TD[m[1]]);delete self.SIL_TD[m[1]];',
        ' const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Response(a);}',
        ' return _fetch(u,o);};',
        'importScripts(self.SIL_BASE+"worker.min.js");',
      ].join('\n');
      const workerPath = URL.createObjectURL(new Blob([wrap], { type: 'text/javascript' }));
      const opt = (tag) => ({
        workerPath, workerBlobURL: false, corePath: baseUrl('vendor/core/'), langPath: baseUrl('vendor/lang'),
        gzip: true, cacheMethod: 'none', logger: (m) => onProgress && onProgress(Object.assign({ tag }, m)),
      });
      workersP = Promise.all([
        T.createWorker(['kor'], 1, opt('kor')).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); return w; }),
        T.createWorker(['eng'], 1, opt('eng')).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789.,%~' }); return w; }),
      ]).catch((e) => { workersP = null; throw e; });
    }
    return workersP;
  }
  // src: 원본 캔버스, rect: 사용자가 고른 영역(없으면 자동으로 능력치 창을 찾음)
  async function recognize(src, rect, onProgress) {
    const [A, B] = await getWorkers(onProgress);
    let used = rect || null, auto = false, allRows = [];
    if (!used && src.width * src.height > 700 * 500) {
      onProgress && onProgress({ tag: 'kor', status: '능력치 창 찾는 중', progress: 0 });
      const s1 = Math.min(1.5, 2600 / src.width);
      const pre1 = preprocess(src, null, { scale: s1 });
      await A.setParameters({ tessedit_pageseg_mode: '11' });
      try {
        const r0 = await A.recognize(pre1, {}, { blocks: true });
        const w0 = collectWords(r0.data);
        allRows = wordsToRows(w0);
        const loc = locatePanel(w0);
        if (loc) {
          const x = Math.max(0, loc.x / s1), y = Math.max(0, loc.y / s1);
          used = { x, y, w: Math.min(src.width - x, loc.w / s1), h: Math.min(src.height - y, loc.h / s1) };
          auto = true;
        }
      } finally { await A.setParameters({ tessedit_pageseg_mode: '6' }); }
    }
    const pre = preprocess(src, used);
    const [r1, r2] = await Promise.all([A.recognize(pre, {}, { blocks: true, text: true }), B.recognize(pre, {}, { blocks: true })]);
    const words = mergeDigitPass(collectWords(r1.data), collectWords(r2.data));
    const rows = wordsToRows(words);
    return { rows, allRows, found: parseRows(rows), text: r1.data.text, rect: used, auto };
  }

  // 캐릭터 창 칭호 띠(파란 바탕 흰 글씨): 초상화 위치 기준으로 잘라 따로 읽음
  async function readTitle(src, por, onProgress) {
    const [A] = await getWorkers(onProgress);
    const k = por.s;
    const x0 = Math.round(por.x + k * 4.05), x1 = Math.round(por.x + k * 6.2);
    const y0 = Math.round(por.y + k * 0.8), y1 = Math.round(por.y + k * 1.14);
    if (x0 < 0 || y0 < 0 || x1 > src.width || y1 > src.height) return '';
    const w = x1 - x0, h = y1 - y0, sc = Math.max(2, 90 / h);
    const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
    g.drawImage(src, x0, y0, w, h, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 255 - Math.min(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v > 140 ? 255 : v < 90 ? 0 : v; }
    g.putImageData(img, 0, 0);
    await A.setParameters({ tessedit_pageseg_mode: '7' });
    try { const r = await A.recognize(c); return (r.data.text || '').trim(); }
    finally { await A.setParameters({ tessedit_pageseg_mode: '6' }); }
  }

  // 화면 공유
  let stream = null, video = null;
  async function startShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('이 브라우저는 화면 공유를 지원하지 않아요');
    // 크기를 지정하지 않아야 화면을 줄이거나 늘리지 않고 원래 해상도로 받음
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 5, max: 15 }, resizeMode: 'none', cursor: 'never' }, audio: false });
    const track = stream.getVideoTracks()[0];
    // 글자 화질 우선(움직임보다 선명도) → 크롬이 해상도를 낮추지 않게
    try { track.contentHint = 'text'; } catch (e) { /* 무시 */ }
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    track.addEventListener('ended', () => { stream = null; root.dispatchEvent && root.dispatchEvent(new Event('sil-share-ended')); });
    return stream;
  }
  function sharing() { return !!stream; }
  const nextFrame = () => new Promise((res) => {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => res());
    else setTimeout(res, 250);
  });
  async function grabFrame() {
    if (!video || !stream) throw new Error('화면 공유 중이 아니에요');
    if (video.readyState < 2) await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
    // 방금 바뀐 화면이 완전히 들어오도록 새 프레임 두 장을 기다림
    await nextFrame(); await nextFrame();
    const track = stream.getVideoTracks()[0];
    if (root.ImageCapture && track) {
      try {
        const bmp = await new root.ImageCapture(track).grabFrame();
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0); return c;
      } catch (e) { /* 아래 방식으로 */ }
    }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0); return c;
  }
  function stopShare() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
  function imageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob); const im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(url); resolve(c); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없어요')); };
      im.src = url;
    });
  }

  // 화면 글자 줄들 중 목록의 이름과 같은 것 찾기 (칭호 이름 등). 짧은 이름은 정확히 같아야 함
  function findName(rows, names) {
    let best = null;
    for (const r of rows) {
      const t = norm(r.text);
      for (const n of names) {
        const k = norm(n); if (k.length < 2) continue;
        let sc = 0;
        if (t === k) sc = 1.02;
        else if (t.includes(k)) sc = 1;
        else if (k.length >= 4) {
          for (let L = k.length - 1; L <= k.length + 1; L++) for (let i = 0; i + L <= t.length; i++) {
            const part = t.slice(i, i + L); const v = 1 - lev(part, k) / Math.max(L, k.length); if (v > sc) sc = v;
          }
        }
        const need = k.length <= 3 ? 1 : 0.8;
        if (sc >= need && (!best || sc > best.score)) best = { name: n, score: sc, text: r.text };
      }
    }
    return best;
  }

  const api = { findName, readTitle, FIELDS, norm, matchField, splitPairs, parseRows, wordsToRows, collectWords, mergeDigitPass, locatePanel, toValue,
    preprocess, recognize, getWorkers, startShare, grabFrame, stopShare, sharing, imageFromBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SilOCR = api;
})(typeof window !== 'undefined' ? window : globalThis);
