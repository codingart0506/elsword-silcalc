/* 실투력 계산 엔진 — 구글 시트 수식(model.json)을 브라우저에서 그대로 계산 */
(function (root) {
  'use strict';

  // ---------- 값 표현 ----------
  class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const ERR = {
    NA: new XErr('#N/A'), VALUE: new XErr('#VALUE!'), DIV0: new XErr('#DIV/0!'),
    REF: new XErr('#REF!'), NAME: new XErr('#NAME?'), NUM: new XErr('#NUM!'),
  };
  const errFromString = (s) => Object.values(ERR).find(e => e.code === s) || new XErr(s);
  const isErr = (v) => v instanceof XErr;
  class Matrix {
    constructor(rows) { this.rows = rows; this.h = rows.length; this.w = rows.length ? rows[0].length : 0; }
    at(r, c) {
      const rr = this.h === 1 ? 0 : r, cc = this.w === 1 ? 0 : c;
      if (rr >= this.h || cc >= this.w) return ERR.NA;
      return this.rows[rr][cc];
    }
    flat() { const o = []; for (const r of this.rows) for (const v of r) o.push(v); return o; }
    map(fn) { return new Matrix(this.rows.map(r => r.map(fn))); }
  }
  const isM = (v) => v instanceof Matrix;
  const first = (v) => isM(v) ? v.rows[0][0] : v;

  // ---------- 주소 ----------
  function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseA1(a) { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a); return m ? { c: colToNum(m[1]), r: +m[2] } : null; }

  // ---------- 토크나이저 ----------
  const ERR_LIT = /^#(N\/A|VALUE!|DIV\/0!|REF!|NAME\?|NUM!|NULL!)/;
  function tokenize(src) {
    const t = []; let i = 0;
    const sheetPart = "(?:'(?:[^']|'')+'|[A-Za-z_\\u0080-\\uFFFF][\\w.\\u0080-\\uFFFF]*)!";
    const refRe = new RegExp('^(' + sheetPart + ')?(\\$?[A-Z]{1,3}\\$?\\d+(?::\\$?[A-Z]{1,3}\\$?\\d+)?|\\$?[A-Z]{1,3}:\\$?[A-Z]{1,3}|\\$?\\d+:\\$?\\d+)(?![\\w(])');
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = src.slice(i);
      if (ch === '"') {
        let j = i + 1, s = '';
        while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; }
        t.push({ k: 'str', v: s }); i = j + 1; continue;
      }
      let m;
      if ((m = ERR_LIT.exec(rest))) { t.push({ k: 'err', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest)) && !/^\d+:/.test(rest)) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = refRe.exec(rest))) {
        let sheet = m[1] ? m[1].slice(0, -1) : null;
        if (sheet && sheet[0] === "'") sheet = sheet.slice(1, -1).replace(/''/g, "'");
        t.push({ k: 'ref', sheet, a: m[2].replace(/\$/g, '') }); i += m[0].length; continue;
      }
      if ((m = /^(TRUE|FALSE)(?![\w(])/i.exec(rest))) { t.push({ k: 'bool', v: m[1].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
      if ((m = /^([A-Za-z_][\w.]*)\s*\(/.exec(rest))) { t.push({ k: 'fn', v: m[1].toUpperCase().replace(/^(_XLFN\.|_XLWS\.)+/, '') }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][\w.]*/.exec(rest))) { t.push({ k: 'name', v: m[0].toUpperCase().replace(/^_XLPM\./, '') }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|<>)/.exec(rest))) { t.push({ k: 'op', v: m[0] }); i += 2; continue; }
      if ('+-*/^&=<>%:'.includes(ch)) { t.push({ k: 'op', v: ch }); i++; continue; }
      if ('(),;{}'.includes(ch)) { t.push({ k: ch }); i++; continue; }
      throw new Error('토큰 오류: ' + rest.slice(0, 20));
    }
    return t;
  }

  // ---------- 파서 (AST) ----------
  function parse(src) {
    const t = tokenize(src); let p = 0;
    const peek = () => t[p], next = () => t[p++];
    const expect = (k) => { const x = next(); if (!x || x.k !== k) throw new Error('구문 오류: ' + k + ' 필요 / ' + src); return x; };
    const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
    // 범위 연산(A:B)은 가장 강하게 묶임 — 단항 연산보다도 먼저
    function rangeExpr() {
      let e = postfix(primary());
      while (peek() && peek().k === 'op' && peek().v === ':') { next(); e = { t: 'range', l: e, r: postfix(primary()) }; }
      return e;
    }
    function expr(minP) {
      let left = unary();
      for (;;) {
        const x = peek();
        if (!x || x.k !== 'op' || !(x.v in BIN)) break;
        const pr = BIN[x.v]; if (pr < minP) break;
        next();
        const right = expr(x.v === '^' ? pr : pr + 1);
        left = { t: 'bin', op: x.v, l: left, r: right };
      }
      return left;
    }
    function unary() {
      const x = peek();
      if (x && x.k === 'op' && (x.v === '-' || x.v === '+')) { next(); const e = unary(); return x.v === '-' ? { t: 'neg', e } : e; }
      return rangeExpr();
    }
    function postfix(e) {
      while (peek() && peek().k === 'op' && peek().v === '%') { next(); e = { t: 'pct', e }; }
      return e;
    }
    function primary() {
      const x = next();
      if (!x) throw new Error('수식 끝: ' + src);
      switch (x.k) {
        case 'num': return { t: 'lit', v: x.v };
        case 'str': return { t: 'lit', v: x.v };
        case 'bool': return { t: 'lit', v: x.v };
        case 'err': return { t: 'lit', v: errFromString(x.v) };
        case 'ref': return { t: 'ref', sheet: x.sheet, a: x.a };
        case 'name': return { t: 'name', v: x.v };
        case '(': { const e = expr(0); expect(')'); return e; }
        case '{': {
          const rows = [[]];
          for (;;) {
            rows[rows.length - 1].push(expr(0));
            const y = next();
            if (y.k === '}') break;
            if (y.k === ';') rows.push([]); else if (y.k !== ',') throw new Error('배열 리터럴 오류');
          }
          return { t: 'arr', rows };
        }
        case 'fn': {
          const args = [];
          if (peek() && peek().k === ')') { next(); return { t: 'fn', name: x.v, args }; }
          for (;;) {
            if (peek() && (peek().k === ',' || peek().k === ')')) args.push({ t: 'missing' });
            else args.push(expr(0));
            const y = next();
            if (y.k === ')') break;
            if (y.k !== ',') throw new Error('인수 구분 오류: ' + src);
          }
          return { t: 'fn', name: x.v, args };
        }
      }
      throw new Error('예상치 못한 토큰 ' + JSON.stringify(x) + ' in ' + src);
    }
    const ast = expr(0);
    if (p !== t.length) throw new Error('남은 토큰: ' + src);
    return ast;
  }

  // ---------- 형 변환 ----------
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(s)) return s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s);
      return ERR.VALUE;
    }
    return ERR.VALUE;
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return ERR.VALUE; }
    return ERR.VALUE;
  }
  function numStr(n) {
    if (Number.isInteger(n)) return String(n);
    let s = n.toPrecision(15);
    if (s.includes('e')) return String(parseFloat(s));
    return s.replace(/\.?0+$/, '');
  }
  function toStr(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return numStr(v);
    return String(v);
  }
  // 정렬 순서: 숫자 < 문자 < 논리
  const typeRank = (v) => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 0;
  function cmp(a, b) {
    if (a === null || a === undefined) a = (typeof b === 'string') ? '' : (typeof b === 'boolean' ? false : 0);
    if (b === null || b === undefined) b = (typeof a === 'string') ? '' : (typeof a === 'boolean' ? false : 0);
    const ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) return ra - rb;
    if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    if (typeof a === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
    if (a === b) return 0;
    // 시트와 같이 유효숫자 15자리 기준으로 비교 (0.9999999999999999 = 1)
    if (Number(a.toPrecision(15)) === Number(b.toPrecision(15))) return 0;
    return a < b ? -1 : 1;
  }

  // 행렬 브로드캐스트
  function lift2(a, b, fn) {
    if (!isM(a) && !isM(b)) return fn(a, b);
    const A = isM(a) ? a : null, B = isM(b) ? b : null;
    const h = Math.max(A ? A.h : 1, B ? B.h : 1), w = Math.max(A ? A.w : 1, B ? B.w : 1);
    const rows = [];
    for (let r = 0; r < h; r++) { const row = []; for (let c = 0; c < w; c++) row.push(fn(A ? A.at(r, c) : a, B ? B.at(r, c) : b)); rows.push(row); }
    return new Matrix(rows);
  }
  const lift1 = (a, fn) => isM(a) ? a.map(fn) : fn(a);

  function binop(op, a, b) {
    return lift2(a, b, (x, y) => {
      if (isErr(x)) return x; if (isErr(y)) return y;
      switch (op) {
        case '&': { const s1 = toStr(x), s2 = toStr(y); return s1 + s2; }
        case '=': return cmp(x, y) === 0;
        case '<>': return cmp(x, y) !== 0;
        case '<': return cmp(x, y) < 0;
        case '>': return cmp(x, y) > 0;
        case '<=': return cmp(x, y) <= 0;
        case '>=': return cmp(x, y) >= 0;
      }
      const n1 = toNum(x), n2 = toNum(y);
      if (isErr(n1)) return n1; if (isErr(n2)) return n2;
      switch (op) {
        case '+': return n1 + n2;
        case '-': return n1 - n2;
        case '*': return n1 * n2;
        case '/': return n2 === 0 ? ERR.DIV0 : n1 / n2;
        case '^': { const r = Math.pow(n1, n2); return Number.isFinite(r) ? r : ERR.NUM; }
      }
      return ERR.VALUE;
    });
  }

  // ---------- 통합 문서 ----------
  class Workbook {
    constructor(model) {
      this.model = model;
      this.cells = {};       // sheet -> addr -> {f, v, a, spill, ast}
      for (const [sh, cells] of Object.entries(model.sheets)) {
        const m = this.cells[sh] = {};
        for (const [a, d] of Object.entries(cells)) m[a] = Object.assign({}, d);
      }
      this.inputs = {};      // 사용자 입력 덮어쓰기: "sheet!A1" -> value
      this.memo = new Map();
      this.rangeMemo = new Map();
      this.stack = new Set();
      this.staticMemo = new Map(); // 바뀌지 않는 칸만 든 범위는 계속 기억
      this.dynPos = {};             // 시트별로 바뀔 수 있는 칸(수식·넘침·입력) 위치
      for (const [sh, cells] of Object.entries(this.cells)) {
        const list = this.dynPos[sh] = [];
        for (const [a, d] of Object.entries(cells)) if ('f' in d || 'spill' in d) { const p = parseA1(a); if (p) list.push({ r: p.r, c: p.c, arr: !!d.arr }); }
      }
      this.touched = new Set();    // 입력으로 덮어쓴 적 있는 칸
      this.rdeps = new Map();      // 칸 → 그 칸을 읽은 계산들
      this.frame = null;
    }
    setInput(sheet, addr, value) {
      const key = sheet + '!' + addr;
      if (!this.touched.has(key)) {
        this.touched.add(key);
        const d = this.raw(sheet, addr);
        if (!d || !('f' in d || 'spill' in d)) { const p = parseA1(addr); if (p) { (this.dynPos[sheet] = this.dynPos[sheet] || []).push({ r: p.r, c: p.c, arr: false }); this.staticMemo.clear(); this._static = null; } }
      }
      if (key in this.inputs && this.inputs[key] === value) return;
      this.inputs[key] = value; this.dirty(key);
    }
    // 입력 여러 개를 한 번에: 바뀐 칸에 걸린 계산만 지움
    assign(map) {
      for (const k of Object.keys(this.inputs)) if (!(k in map)) { delete this.inputs[k]; this.dirty(k); }
      for (const [k, v] of Object.entries(map)) { const i = k.lastIndexOf('!'); this.setInput(k.slice(0, i), k.slice(i + 1), v); }
    }
    // 이 칸을 읽은 계산을 거슬러 올라가며 지움
    dirty(k) {
      const q = [k], seen = new Set(q);
      while (q.length) {
        const x = q.pop(); this.memo.delete(x); this.rangeMemo.delete(x);
        const s = this.rdeps.get(x); if (!s) continue;
        this.rdeps.delete(x);
        for (const y of s) if (!seen.has(y)) { seen.add(y); q.push(y); }
      }
    }
    note(k) { if (this.frame) this.frame.add(k); }
    track(key, fn) {
      const prev = this.frame, deps = new Set(); this.frame = deps;
      try { return fn(); } finally {
        this.frame = prev;
        for (const d of deps) { let s = this.rdeps.get(d); if (!s) this.rdeps.set(d, s = new Set()); s.add(key); }
      }
    }
    // 범위 안 값이 입력에 따라 바뀔 수 있는지(수식·넘친 칸·입력 칸이 있거나 위·왼쪽 배열 수식이 넘쳐 들어올 수 있으면)
    isStatic(r) {
      const key = r.sheet + '!' + r.c1 + ',' + r.r1 + ':' + r.c2 + ',' + r.r2;
      if (!this._static) this._static = new Map();
      let v = this._static.get(key);
      if (v === undefined) {
        v = true;
        for (const p of this.dynPos[r.sheet] || []) {
          if (p.r >= r.r1 && p.r <= r.r2 && p.c >= r.c1 && p.c <= r.c2) { v = false; break; }
          if (p.arr && ((p.c >= r.c1 && p.c <= r.c2 && p.r < r.r1) || (p.r >= r.r1 && p.r <= r.r2 && p.c < r.c1))) { v = false; break; }
        }
        this._static.set(key, v);
      }
      return v;
    }
    clearInputs() { this.inputs = {}; this.invalidate(); }
    invalidate() { this.memo.clear(); this.rangeMemo.clear(); this.rdeps.clear(); }
    raw(sheet, addr) { const s = this.cells[sheet]; return s ? s[addr] : undefined; }
    get(sheet, addr) {
      const key = sheet + '!' + addr;
      this.note(key);
      if (key in this.inputs) return this.inputs[key];
      if (this.memo.has(key)) return this.memo.get(key);
      const d = this.raw(sheet, addr);
      let val;
      if (d && 'v' in d) val = (typeof d.v === 'string' && ERR_LIT.test(d.v)) ? errFromString(d.v) : d.v;
      else val = this.track(key, () => !d ? this.spillFrom(sheet, addr) : 'spill' in d ? this.spillAt(sheet, d.spill, addr) : this.evalCell(sheet, addr, false));
      if (isM(val)) val = val.rows[0][0];
      this.memo.set(key, val);
      return val;
    }
    // 배열 결과가 흘러넘친 칸: 결과 밖이면 빈 칸
    spillAt(sheet, anchor, addr) {
      const anc = parseA1(anchor), me = parseA1(addr);
      const res = this.evalCell(sheet, anchor, true);
      const dr = me.r - anc.r, dc = me.c - anc.c;
      if (isM(res)) return dr < res.h && dc < res.w ? res.rows[dr][dc] : null;
      return dr === 0 && dc === 0 ? res : null;
    }
    // 모델에 없는 칸: 위(또는 왼쪽)에 있는 배열 수식이 지금 더 길게 넘쳐서 닿는지 확인
    spillFrom(sheet, addr) {
      const cells = this.cells[sheet]; if (!cells) return null;
      if (!this._colIdx) this._colIdx = {};
      let idx = this._colIdx[sheet];
      if (!idx) {
        idx = this._colIdx[sheet] = { col: {}, row: {} };
        for (const a of Object.keys(cells)) {
          const p = parseA1(a); if (!p) continue;
          (idx.col[p.c] = idx.col[p.c] || []).push(p.r);
          (idx.row[p.r] = idx.row[p.r] || []).push(p.c);
        }
        for (const k in idx.col) idx.col[k].sort((x, y) => x - y);
        for (const k in idx.row) idx.row[k].sort((x, y) => x - y);
      }
      const me = parseA1(addr); if (!me) return null;
      const below = (arr, v) => { if (!arr) return null; let lo = 0, hi = arr.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] < v) { ans = arr[m]; lo = m + 1; } else hi = m - 1; } return ans; };
      const tryAt = (a) => {
        const d = cells[a]; if (!d) return undefined;
        const anchor = 'spill' in d ? d.spill : ('f' in d && d.arr ? a : null);
        if (!anchor) return undefined;
        const k = sheet + '!' + anchor; if (this.stack.has(k) || this.stack.has(k + '#a')) return undefined;
        const res = this.evalCell(sheet, anchor, true);
        if (!isM(res)) return undefined;
        const anc = parseA1(anchor), dr = me.r - anc.r, dc = me.c - anc.c;
        return dr >= 0 && dc >= 0 && dr < res.h && dc < res.w ? res.rows[dr][dc] : undefined;
      };
      const r0 = below(idx.col[me.c], me.r);
      if (r0 !== null) { const v = tryAt(numToCol(me.c) + r0); if (v !== undefined) return v; }
      const c0 = below(idx.row[me.r], me.c);
      if (c0 !== null) { const v = tryAt(numToCol(c0) + me.r); if (v !== undefined) return v; }
      return null;
    }
    evalCell(sheet, addr, wantArray) {
      const key = sheet + '!' + addr + (wantArray ? '#a' : '');
      if (wantArray) { this.note(key); if (this.memo.has(key)) return this.memo.get(key); return this.track(key, () => this.evalCell0(sheet, addr, key, true)); }
      return this.evalCell0(sheet, addr, key, false);
    }
    evalCell0(sheet, addr, key, wantArray) {
      if (this.stack.has(key)) throw new Error('순환 참조: ' + key);
      this.stack.add(key);
      try {
        const d = this.raw(sheet, addr);
        if (!d.ast) d.ast = parse(d.f);
        const me = parseA1(addr);
        const ctx = { sheet, array: !!d.a, wb: this, scope: null, row: me.r, col: me.c };
        let v = this.ev(d.ast, ctx);
        if (v && v.t === 'rng') v = this.rangeValue(v);
        if (wantArray) this.memo.set(key, v);
        return v;
      } finally { this.stack.delete(key); }
    }
    rangeValue(r) {
      const key = 'R:' + r.sheet + '!' + r.c1 + ',' + r.r1 + ':' + r.c2 + ',' + r.r2;
      if (this.staticMemo.has(key)) return this.staticMemo.get(key);
      this.note(key);
      if (this.rangeMemo.has(key)) return this.rangeMemo.get(key);
      const st = this.isStatic(r);
      const build = () => {
        const rows = [];
        for (let rr = r.r1; rr <= r.r2; rr++) { const row = []; for (let cc = r.c1; cc <= r.c2; cc++) row.push(this.get(r.sheet, numToCol(cc) + rr)); rows.push(row); }
        return (r.r1 === r.r2 && r.c1 === r.c2) ? rows[0][0] : new Matrix(rows);
      };
      let m;
      if (st) { const prev = this.frame; this.frame = null; try { m = build(); } finally { this.frame = prev; } this.staticMemo.set(key, m); }
      else { m = this.track(key, build); this.rangeMemo.set(key, m); }
      return m;
    }
    makeRange(sheet, a) {
      let c1, r1, c2, r2;
      if (a.includes(':')) {
        const [x, y] = a.split(':');
        if (/^\d+$/.test(x)) { r1 = +x; r2 = +y; c1 = 1; c2 = 200; }
        else if (/^[A-Z]+$/.test(x)) { c1 = colToNum(x); c2 = colToNum(y); r1 = 1; r2 = this.maxRow(sheet); }
        else { const p = parseA1(x), q = parseA1(y); c1 = Math.min(p.c, q.c); c2 = Math.max(p.c, q.c); r1 = Math.min(p.r, q.r); r2 = Math.max(p.r, q.r); }
      } else { const p = parseA1(a); c1 = c2 = p.c; r1 = r2 = p.r; }
      return { t: 'rng', sheet, c1, r1, c2, r2 };
    }
    maxRow(sheet) {
      if (!this._maxRow) this._maxRow = {};
      if (!(sheet in this._maxRow)) { let m = 1; for (const a of Object.keys(this.cells[sheet] || {})) m = Math.max(m, parseA1(a).r); this._maxRow[sheet] = m; }
      return this._maxRow[sheet];
    }
    // 평가: 범위 참조는 {t:'rng'} 그대로 돌려줌(함수가 판단), 그 외는 값
    ev(n, ctx) {
      switch (n.t) {
        case 'lit': return n.v;
        case 'missing': return null;
        case 'ref': {
          const sh = n.sheet || ctx.sheet;
          if (!this.cells[sh]) return ERR.REF;
          const r = this.makeRange(sh, n.a);
          if (r.c1 === r.c2 && r.r1 === r.r2) return this.get(sh, numToCol(r.c1) + r.r1);
          return r;
        }
        case 'name': {
          if (ctx.scope && ctx.scope.has(n.v)) return ctx.scope.get(n.v);
          return ERR.NAME;
        }
        case 'range': {
          const a = this.refOf(n.l, ctx), b = this.refOf(n.r, ctx);
          if (!a || !b) return ERR.REF;
          if (a.sheet !== b.sheet) return ERR.REF;
          return { t: 'rng', sheet: a.sheet, c1: Math.min(a.c1, b.c1), r1: Math.min(a.r1, b.r1), c2: Math.max(a.c2, b.c2), r2: Math.max(a.r2, b.r2) };
        }
        case 'lambda': return n;
        case 'arr': return new Matrix(n.rows.map(row => row.map(e => first(this.val(e, ctx)))));
        case 'neg': return lift1(this.val(n.e, ctx), x => { const v = toNum(x); return isErr(v) ? v : -v; });
        case 'pct': return lift1(this.val(n.e, ctx), x => { const v = toNum(x); return isErr(v) ? v : v / 100; });
        case 'bin': return binop(n.op, this.val(n.l, ctx), this.val(n.r, ctx));
        case 'fn': {
          if (ctx.scope && ctx.scope.has(n.name)) {
            const lam = ctx.scope.get(n.name);
            if (!lam || lam.t !== 'closure') return ERR.NAME;
            return callLambda(lam, n.args.map(a => this.ev(a, ctx)), this);
          }
          const f = FN[n.name];
          if (!f) throw new Error('지원하지 않는 함수: ' + n.name);
          return f(n.args, ctx, this);
        }
      }
      throw new Error('알 수 없는 노드 ' + n.t);
    }
    val(n, ctx) { const v = this.ev(n, ctx); return v && v.t === 'rng' ? this.rangeValue(v) : v; }
    // 참조(범위)로 평가: 한 칸짜리 참조도 범위로
    refOf(n, ctx) {
      if (n.t === 'ref') { const sh = n.sheet || ctx.sheet; return this.cells[sh] ? this.makeRange(sh, n.a) : null; }
      const v = this.ev(n, ctx);
      return v && v.t === 'rng' ? v : null;
    }
    scalar(n, ctx) { return first(this.val(n, ctx)); }
  }

  // ---------- 함수 ----------
  function flatArgs(args, ctx, wb, fromRangeOnlyNumbers) {
    // 범위/배열에서 온 값과 직접 인수를 구분해 반환
    const out = [];
    for (const a of args) {
      if (a.t === 'missing') continue;
      const v = wb.ev(a, ctx);
      if (v && v.t === 'rng') { const m = wb.rangeValue(v); for (const x of (isM(m) ? m.flat() : [m])) out.push({ v: x, ref: true }); }
      else if (isM(v)) for (const x of v.flat()) out.push({ v: x, ref: true });
      else out.push({ v, ref: a.t === 'ref' });
    }
    return out;
  }
  function numbersOf(args, ctx, wb) {
    const nums = [];
    for (const { v, ref } of flatArgs(args, ctx, wb)) {
      if (isErr(v)) return v;
      if (ref) { if (typeof v === 'number') nums.push(v); }
      else { const n = toNum(v); if (isErr(n)) return n; nums.push(n); }
    }
    return nums;
  }
  function matchKey(key, v) {
    if (v === null || v === undefined) return false;
    if (typeof key === 'string' && typeof v === 'string') return key.toLowerCase() === v.toLowerCase();
    if (typeof key === 'number' && typeof v === 'number') return key === v;
    if (typeof key === 'boolean' && typeof v === 'boolean') return key === v;
    return false;
  }
  function lookupIndex(key, list, sorted) {
    if (!sorted) { for (let i = 0; i < list.length; i++) if (matchKey(key, list[i])) return i; return -1; }
    // 정렬 가정: key 이하인 마지막 값
    let lo = 0, hi = list.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; const v = list[mid];
      if (v === null || v === undefined || typeRank(v) !== typeRank(key)) {
        // 타입이 다른 칸은 선형으로 처리
        let j = -1; for (let i = 0; i < list.length; i++) { const x = list[i]; if (x !== null && typeRank(x) === typeRank(key) && cmp(x, key) <= 0) j = i; }
        return j;
      }
      if (cmp(v, key) <= 0) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }
  function asMatrix(v) { return isM(v) ? v : new Matrix([[v]]); }
  function criteriaFn(crit) {
    if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => matchKey(crit, v) || (typeof crit === 'number' && typeof v === 'string' && toNum(v) === crit);
    const s = toStr(crit);
    const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s); // 값에 줄바꿈이 있어도(예: '오케스트라 홀 \n(=둠 아포리아)')
    const op = m[1] || '=', rhsS = m[2];
    const rhsN = rhsS !== '' && !isNaN(Number(rhsS)) ? Number(rhsS) : null;
    const rhsB = /^(TRUE|FALSE)$/i.test(rhsS) ? rhsS.toUpperCase() === 'TRUE' : null;
    const wild = /[*?]/.test(rhsS) ? new RegExp('^' + rhsS.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i') : null;
    return (v) => {
      if (op === '=' || op === '<>') {
        let eq;
        if (rhsS === '') eq = (v === null || v === '');
        else if (rhsN !== null) eq = typeof v === 'number' ? v === rhsN : false;
        else if (rhsB !== null) eq = typeof v === 'boolean' && v === rhsB;
        else if (wild) eq = typeof v === 'string' && wild.test(v);
        else eq = typeof v === 'string' && v.toLowerCase() === rhsS.toLowerCase();
        return op === '=' ? eq : !eq;
      }
      if (rhsN !== null) { if (typeof v !== 'number') return false; const c = v - rhsN; return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; }
      if (typeof v !== 'string') return false;
      const c = cmp(v, rhsS); return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    };
  }
  // 조건 인수가 배열이면 원소마다 계산
  function liftCrit(crits, fn) {
    const mi = crits.findIndex(isM);
    for (const c of crits) if (!isM(c) && isErr(c)) return c;
    if (mi < 0) return fn(crits);
    const M = crits[mi];
    return new Matrix(M.rows.map((row, r) => row.map((_, c) => { const cs = crits.map(x => isM(x) ? x.at(r, c) : x); const e = cs.find(isErr); return e || fn(cs); })));
  }
  const uKey = (v) => v === null || v === undefined ? 'n:' : typeof v === 'number' ? 'd:' + Number(v.toPrecision(15)) : typeof v === 'boolean' ? 'b:' + v : isErr(v) ? 'e:' + v.code : 's:' + v;
  const reCache = new Map();
  function regexOf(p) {
    if (isErr(p)) return p; p = toStr(p);
    if (reCache.has(p)) return reCache.get(p);
    let flags = '', src = p;
    const m = /^\(\?([imsU]+)\)/.exec(src); if (m) { if (m[1].includes('i')) flags += 'i'; if (m[1].includes('s')) flags += 's'; if (m[1].includes('m')) flags += 'm'; src = src.slice(m[0].length); }
    let re; try { re = new RegExp(src, flags); } catch (e) { re = ERR.VALUE; }
    reCache.set(p, re); return re;
  }
  // XLOOKUP·XMATCH 찾기: mode 0 같음, -1 같거나 바로 작은, 1 같거나 바로 큰, 2 와일드카드
  function xFind(key, list, mode, search) {
    const n = list.length, order = [];
    if (search === -1 || search === -2) for (let i = n - 1; i >= 0; i--) order.push(i); else for (let i = 0; i < n; i++) order.push(i);
    if (mode === 2 && typeof key === 'string') { const f = criteriaFn(key); for (const i of order) { const v = list[i]; if (typeof v === 'string' && f(v)) return i; } return -1; }
    for (const i of order) if (matchKey(key, list[i]) || (typeof key === 'number' && typeof list[i] === 'number' && cmp(key, list[i]) === 0)) return i;
    if (mode === 0 || mode === 2) return -1;
    let best = -1;
    for (const i of order) {
      const v = list[i]; if (v === null || v === undefined || typeRank(v) !== typeRank(key) || isErr(v)) continue;
      const c = cmp(v, key);
      if (mode === -1 && c < 0 && (best < 0 || cmp(v, list[best]) > 0)) best = i;
      if (mode === 1 && c > 0 && (best < 0 || cmp(v, list[best]) < 0)) best = i;
    }
    return best;
  }
  function valOf(v, wb) { return v && v.t === 'rng' ? wb.rangeValue(v) : v; }
  function callLambda(lam, vals, wb) {
    const c2 = Object.assign({}, lam.ctx, { scope: new Map(lam.ctx.scope || []) });
    lam.params.forEach((p, i) => c2.scope.set(p, i < vals.length ? vals[i] : null));
    return wb.ev(lam.body, c2);
  }
  function roundHalfAway(x, d) {
    const f = Math.pow(10, d);
    const y = Number((Math.abs(x) * f).toPrecision(15));
    return Math.sign(x) * Math.round(y) / f;
  }

  const FN = {
    IF(args, ctx, wb) {
      const c = wb.val(args[0], ctx);
      const pick = (b, i) => {
        if (isErr(b)) return b;
        if (i === 1) return args.length > 1 ? (args[1].t === 'missing' ? 0 : wb.val(args[1], ctx)) : true;
        return args.length > 2 ? (args[2].t === 'missing' ? 0 : wb.val(args[2], ctx)) : false;
      };
      if (isM(c)) {
        const tv = args.length > 1 ? wb.val(args[1], ctx) : true, fv = args.length > 2 ? wb.val(args[2], ctx) : false;
        const tm = isM(tv) ? tv : null, fm = isM(fv) ? fv : null;
        return new Matrix(c.rows.map((row, r) => row.map((x, k) => {
          const b = toBool(x); if (isErr(b)) return b;
          return b ? (tm ? tm.at(r, k) : tv) : (fm ? fm.at(r, k) : fv);
        })));
      }
      const b = toBool(c);
      return pick(b, b === true ? 1 : 2);
    },
    IFERROR(args, ctx, wb) {
      const v = wb.val(args[0], ctx);
      const alt = () => args.length > 1 ? wb.val(args[1], ctx) : '';
      if (isM(v)) { if (!v.flat().some(isErr)) return v; return lift2(v, alt(), (x, a) => isErr(x) ? a : x); }
      return isErr(v) ? alt() : v;
    },
    IFNA(args, ctx, wb) {
      const v = wb.val(args[0], ctx); const na = (x) => isErr(x) && x.code === '#N/A';
      if (isM(v)) { if (!v.flat().some(na)) return v; return lift2(v, wb.val(args[1], ctx), (x, a) => na(x) ? a : x); }
      return na(v) ? wb.val(args[1], ctx) : v;
    },
    AND(args, ctx, wb) {
      let any = false;
      for (const { v, ref } of flatArgs(args, ctx, wb)) {
        if (isErr(v)) return v;
        if (ref && (v === null || typeof v === 'string')) continue;
        const b = toBool(v); if (isErr(b)) return b; any = true; if (!b) return false;
      }
      return any ? true : ERR.VALUE;
    },
    OR(args, ctx, wb) {
      let any = false, res = false;
      for (const { v, ref } of flatArgs(args, ctx, wb)) {
        if (isErr(v)) return v;
        if (ref && (v === null || typeof v === 'string')) continue;
        const b = toBool(v); if (isErr(b)) return b; any = true; if (b) res = true;
      }
      return any ? res : ERR.VALUE;
    },
    NOT(args, ctx, wb) { return lift1(wb.val(args[0], ctx), x => { const b = toBool(x); return isErr(b) ? b : !b; }); },
    MAX(args, ctx, wb) { const n = numbersOf(args, ctx, wb); if (isErr(n)) return n; return n.length ? Math.max(...n) : 0; },
    MIN(args, ctx, wb) { const n = numbersOf(args, ctx, wb); if (isErr(n)) return n; return n.length ? Math.min(...n) : 0; },
    SUM(args, ctx, wb) { const n = numbersOf(args, ctx, wb); if (isErr(n)) return n; return n.reduce((a, b) => a + b, 0); },
    AVERAGE(args, ctx, wb) { const n = numbersOf(args, ctx, wb); if (isErr(n)) return n; return n.length ? n.reduce((a, b) => a + b, 0) / n.length : ERR.DIV0; },
    PRODUCT(args, ctx, wb) { const n = numbersOf(args, ctx, wb); if (isErr(n)) return n; return n.length ? n.reduce((a, b) => a * b, 1) : 0; },
    ROUND(args, ctx, wb) {
      const x = toNum(wb.scalar(args[0], ctx)); if (isErr(x)) return x;
      const d = args.length > 1 ? toNum(wb.scalar(args[1], ctx)) : 0; if (isErr(d)) return d;
      return roundHalfAway(x, Math.trunc(d));
    },
    ABS(args, ctx, wb) { const x = toNum(wb.scalar(args[0], ctx)); return isErr(x) ? x : Math.abs(x); },
    VLOOKUP(args, ctx, wb) { return lookup(args, ctx, wb, true); },
    HLOOKUP(args, ctx, wb) { return lookup(args, ctx, wb, false); },
    COUNTIF(args, ctx, wb) {
      const list = asMatrix(wb.val(args[0], ctx)).flat();
      return liftCrit([wb.val(args[1], ctx)], ([crit]) => { const f = criteriaFn(crit); let n = 0; for (const v of list) if (!isErr(v) && f(v)) n++; return n; });
    },
    INDEX(args, ctx, wb) {
      const base = wb.ev(args[0], ctx);
      const rv = args.length > 1 && args[1].t !== 'missing' ? wb.val(args[1], ctx) : 0;
      const cv = args.length > 2 && args[2].t !== 'missing' ? wb.val(args[2], ctx) : 0;
      if (isM(rv) || isM(cv)) {
        const m = asMatrix(base && base.t === 'rng' ? wb.rangeValue(base) : base);
        return lift2(rv, cv, (r, c) => { r = toNum(r); c = toNum(c); if (isErr(r)) return r; if (isErr(c)) return c; r = Math.trunc(r); c = Math.trunc(c); if (m.h === 1 && args.length === 2) { c = r; r = 1; } if (m.w === 1 && c === 0) c = 1; if (m.h === 1 && r === 0) r = 1; if (r < 1 || r > m.h || c < 1 || c > m.w) return ERR.REF; return m.rows[r - 1][c - 1]; });
      }
      let r = toNum(first(rv)), c = toNum(first(cv));
      if (isErr(r)) return r; if (isErr(c)) return c;
      r = Math.trunc(r); c = Math.trunc(c);
      if (base && base.t === 'rng') {
        const h = base.r2 - base.r1 + 1, w = base.c2 - base.c1 + 1;
        if (h === 1 && args.length === 2) { c = r; r = 1; }
        const sub = (r1, r2, c1, c2) => ({ t: 'rng', sheet: base.sheet, r1: base.r1 + r1 - 1, r2: base.r1 + r2 - 1, c1: base.c1 + c1 - 1, c2: base.c1 + c2 - 1 });
        if (r === 0 && c === 0) return base;
        if (r === 0) { if (c < 1 || c > w) return ERR.REF; return sub(1, h, c, c); }
        if (c === 0) { if (w === 1) c = 1; else { if (r < 1 || r > h) return ERR.REF; return sub(r, r, 1, w); } }
        if (r < 1 || r > h || c < 1 || c > w) return ERR.REF;
        return sub(r, r, c, c);
      }
      if (isErr(base)) return base;
      const m = asMatrix(base);
      if (m.h === 1 && args.length === 2) { c = r; r = 1; }
      if (r === 0 && c === 0) return m;
      if (r === 0) return new Matrix(m.rows.map(row => [row[c - 1]]));
      if (c === 0) c = m.w === 1 ? 1 : 0;
      if (c === 0) return new Matrix([m.rows[r - 1]]);
      if (r < 1 || r > m.h || c < 1 || c > m.w) return ERR.REF;
      return m.rows[r - 1][c - 1];
    },
    MATCH(args, ctx, wb) {
      const key = wb.scalar(args[0], ctx); if (isErr(key)) return key;
      const m = asMatrix(wb.val(args[1], ctx));
      const type = args.length > 2 ? toNum(wb.scalar(args[2], ctx)) : 1;
      const list = m.h === 1 ? m.rows[0] : m.rows.map(r => r[0]);
      let i;
      if (type === 0) i = lookupIndex(key, list, false);
      else if (type === 1) i = lookupIndex(key, list, true);
      else { i = -1; for (let k = 0; k < list.length; k++) if (list[k] !== null && cmp(list[k], key) >= 0) i = k; }
      return i < 0 ? ERR.NA : i + 1;
    },
    // ---------- ver.3 시트용 함수 ----------
    NA() { return ERR.NA; },
    ISNUMBER(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => typeof v === 'number'); },
    ISTEXT(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => typeof v === 'string'); },
    ISLOGICAL(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => typeof v === 'boolean'); },
    ISBLANK(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => v === null || v === undefined); },
    ISNA(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v) && v.code === '#N/A'); },
    ISERROR(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v)); },
    N(args, ctx, wb) { const v = wb.scalar(args[0], ctx); return isErr(v) ? v : typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; },
    INT(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => { const x = toNum(v); return isErr(x) ? x : Math.floor(x); }); },
    TRUNC(args, ctx, wb) {
      const d = args.length > 1 ? toNum(wb.scalar(args[1], ctx)) : 0; if (isErr(d)) return d;
      return lift1(wb.val(args[0], ctx), v => { const x = toNum(v); if (isErr(x)) return x; const f = Math.pow(10, Math.trunc(d)); return Math.trunc(Number((x * f).toPrecision(15))) / f; });
    },
    MOD(args, ctx, wb) {
      return lift2(wb.val(args[0], ctx), wb.val(args[1], ctx), (a, b) => { a = toNum(a); b = toNum(b); if (isErr(a)) return a; if (isErr(b)) return b; if (b === 0) return ERR.DIV0; return a - b * Math.floor(a / b); });
    },
    VALUE(args, ctx, wb) {
      return lift1(wb.val(args[0], ctx), v => {
        if (isErr(v)) return v; if (typeof v === 'number') return v; if (v === null || v === '') return 0; if (typeof v === 'boolean') return ERR.VALUE;
        let s = String(v).trim(); if (/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?%?$/.test(s)) s = s.replace(/,/g, '');
        return toNum(s);
      });
    },
    TO_TEXT(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : toStr(v)); },
    LOWER(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : toStr(v).toLowerCase()); },
    UPPER(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : toStr(v).toUpperCase()); },
    LEN(args, ctx, wb) { return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : toStr(v).length); },
    LEFT(args, ctx, wb) {
      const n = args.length > 1 ? toNum(wb.scalar(args[1], ctx)) : 1; if (isErr(n)) return n;
      return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : toStr(v).slice(0, Math.max(0, Math.trunc(n))));
    },
    CHAR(args, ctx, wb) { const n = toNum(wb.scalar(args[0], ctx)); return isErr(n) ? n : String.fromCharCode(Math.trunc(n)); },
    EXACT(args, ctx, wb) { return lift2(wb.val(args[0], ctx), wb.val(args[1], ctx), (a, b) => isErr(a) ? a : isErr(b) ? b : toStr(a) === toStr(b)); },
    SUBSTITUTE(args, ctx, wb) {
      const find = toStr(wb.scalar(args[1], ctx)), rep = toStr(wb.scalar(args[2], ctx));
      if (isErr(find)) return find; if (isErr(rep)) return rep;
      const occ = args.length > 3 ? toNum(wb.scalar(args[3], ctx)) : null;
      return lift1(wb.val(args[0], ctx), v => {
        if (isErr(v)) return v; const s = toStr(v); if (find === '') return s;
        if (occ === null) return s.split(find).join(rep);
        let i = -1, k = 0; for (;;) { i = s.indexOf(find, i + 1); if (i < 0) return s; if (++k === occ) return s.slice(0, i) + rep + s.slice(i + find.length); }
      });
    },
    REGEXMATCH(args, ctx, wb) {
      const re = regexOf(wb.scalar(args[1], ctx)); if (isErr(re)) return re;
      return lift1(wb.val(args[0], ctx), v => isErr(v) ? v : re.test(toStr(v)));
    },
    REGEXEXTRACT(args, ctx, wb) {
      const re = regexOf(wb.scalar(args[1], ctx)); if (isErr(re)) return re;
      const one = (v) => { if (isErr(v)) return v; const m = re.exec(toStr(v)); if (!m) return ERR.NA; return m.length > 1 ? (m.length > 2 ? new Matrix([m.slice(1).map(x => x === undefined ? '' : x)]) : (m[1] === undefined ? '' : m[1])) : m[0]; };
      const v = wb.val(args[0], ctx);
      return isM(v) ? v.map(x => first(one(x))) : one(v);
    },
    TEXTJOIN(args, ctx, wb) {
      const d = toStr(wb.scalar(args[0], ctx)), ign = toBool(wb.scalar(args[1], ctx));
      const parts = [];
      for (const { v } of flatArgs(args.slice(2), ctx, wb)) { if (isErr(v)) return v; if (ign && (v === null || v === '')) continue; parts.push(toStr(v)); }
      return parts.join(d);
    },
    COUNT(args, ctx, wb) { let n = 0; for (const { v } of flatArgs(args, ctx, wb)) if (typeof v === 'number') n++; return n; },
    COUNTA(args, ctx, wb) { let n = 0; for (const { v } of flatArgs(args, ctx, wb)) if (v !== null && v !== undefined) n++; return n; },
    COUNTBLANK(args, ctx, wb) { let n = 0; for (const { v } of flatArgs(args, ctx, wb)) if (v === null || v === undefined || v === '') n++; return n; },
    COUNTUNIQUE(args, ctx, wb) { const s = new Set(); for (const { v } of flatArgs(args, ctx, wb)) if (v !== null && v !== undefined && v !== '') s.add(uKey(v)); return s.size; },
    COUNTIFS(args, ctx, wb) {
      const ranges = [], crits = [];
      for (let i = 0; i < args.length; i += 2) { ranges.push(asMatrix(wb.val(args[i], ctx)).flat()); crits.push(wb.val(args[i + 1], ctx)); }
      return liftCrit(crits, (cs) => {
        const fs = cs.map(criteriaFn); let n = 0;
        const len = ranges[0].length;
        for (let k = 0; k < len; k++) { let ok = true; for (let j = 0; j < fs.length; j++) { const v = ranges[j][k]; if (v === undefined || isErr(v) || !fs[j](v)) { ok = false; break; } } if (ok) n++; }
        return n;
      });
    },
    SUMIF(args, ctx, wb) {
      const rng = asMatrix(wb.val(args[0], ctx)).flat();
      const sum = args.length > 2 && args[2].t !== 'missing' ? asMatrix(wb.val(args[2], ctx)).flat() : rng;
      return liftCrit([wb.val(args[1], ctx)], ([c]) => { const f = criteriaFn(c); let s = 0; for (let k = 0; k < rng.length; k++) { const v = rng[k]; if (v !== undefined && !isErr(v) && f(v)) { const x = sum[k]; if (isErr(x)) return x; if (typeof x === 'number') s += x; } } return s; });
    },
    SUMIFS(args, ctx, wb) {
      const sum = asMatrix(wb.val(args[0], ctx)).flat();
      const ranges = [], crits = [];
      for (let i = 1; i < args.length; i += 2) { ranges.push(asMatrix(wb.val(args[i], ctx)).flat()); crits.push(wb.val(args[i + 1], ctx)); }
      return liftCrit(crits, (cs) => {
        const fs = cs.map(criteriaFn); let s = 0;
        for (let k = 0; k < sum.length; k++) { let ok = true; for (let j = 0; j < fs.length; j++) { const v = ranges[j][k]; if (v === undefined || isErr(v) || !fs[j](v)) { ok = false; break; } } if (ok) { const x = sum[k]; if (isErr(x)) return x; if (typeof x === 'number') s += x; } }
        return s;
      });
    },
    SUMPRODUCT(args, ctx, wb) {
      const ms = args.map(a => asMatrix(wb.val(a, ctx)));
      const h = ms[0].h, w = ms[0].w;
      for (const m of ms) if (m.h !== h || m.w !== w) return ERR.VALUE;
      let s = 0;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        let p = 1;
        for (const m of ms) { const v = m.rows[r][c]; if (isErr(v)) return v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; }
        s += p;
      }
      return s;
    },
    XLOOKUP(args, ctx, wb) {
      const look = asMatrix(wb.val(args[1], ctx)), res = asMatrix(wb.val(args[2], ctx));
      const missing = args.length > 3 && args[3].t !== 'missing' ? wb.val(args[3], ctx) : ERR.NA;
      const mode = args.length > 4 && args[4].t !== 'missing' ? toNum(wb.scalar(args[4], ctx)) : 0;
      const search = args.length > 5 && args[5].t !== 'missing' ? toNum(wb.scalar(args[5], ctx)) : 1;
      const vertical = look.w === 1 && look.h >= 1 && !(look.h === 1 && res.h === 1 && res.w > 1);
      const list = vertical ? look.rows.map(r => r[0]) : look.rows[0];
      const pick = (i) => {
        if (vertical) { const row = res.rows[i]; if (!row) return ERR.NA; return res.w === 1 ? row[0] : new Matrix([row.slice()]); }
        if (res.h === 1) return res.rows[0][i] === undefined ? ERR.NA : res.rows[0][i];
        return new Matrix(res.rows.map(r => [r[i]]));
      };
      const one = (key) => { if (isErr(key)) return key; const i = xFind(key, list, mode, search); return i < 0 ? missing : pick(i); };
      const key = wb.val(args[0], ctx);
      return isM(key) ? key.map(k => first(one(k))) : one(key);
    },
    XMATCH(args, ctx, wb) {
      const look = asMatrix(wb.val(args[1], ctx));
      const mode = args.length > 2 && args[2].t !== 'missing' ? toNum(wb.scalar(args[2], ctx)) : 0;
      const search = args.length > 3 && args[3].t !== 'missing' ? toNum(wb.scalar(args[3], ctx)) : 1;
      const list = look.w === 1 ? look.rows.map(r => r[0]) : look.rows[0];
      const one = (key) => { if (isErr(key)) return key; const i = xFind(key, list, mode, search); return i < 0 ? ERR.NA : i + 1; };
      const key = wb.val(args[0], ctx);
      return isM(key) ? key.map(one) : one(key);
    },
    SEQUENCE(args, ctx, wb) {
      const g = (i, d) => args.length > i && args[i].t !== 'missing' ? toNum(wb.scalar(args[i], ctx)) : d;
      const r = g(0, 1), c = g(1, 1), st = g(2, 1), sp = g(3, 1);
      for (const x of [r, c, st, sp]) if (isErr(x)) return x;
      const R = Math.trunc(r), C = Math.trunc(c);
      if (R < 1 || C < 1) return ERR.VALUE;
      const rows = []; let k = 0;
      for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(st + sp * k++); rows.push(row); }
      return R === 1 && C === 1 ? rows[0][0] : new Matrix(rows);
    },
    ROWS(args, ctx, wb) { const v = wb.ev(args[0], ctx); if (v && v.t === 'rng') return v.r2 - v.r1 + 1; return isM(v) ? v.h : isErr(v) ? v : 1; },
    COLUMNS(args, ctx, wb) { const v = wb.ev(args[0], ctx); if (v && v.t === 'rng') return v.c2 - v.c1 + 1; return isM(v) ? v.w : isErr(v) ? v : 1; },
    ROW(args, ctx, wb) {
      if (!args.length || args[0].t === 'missing') return ctx.row;
      const r = wb.refOf(args[0], ctx); if (!r) return ERR.VALUE;
      if (r.r1 === r.r2) return r.r1;
      const rows = []; for (let i = r.r1; i <= r.r2; i++) rows.push([i]); return new Matrix(rows);
    },
    COLUMN(args, ctx, wb) {
      if (!args.length || args[0].t === 'missing') return ctx.col;
      const r = wb.refOf(args[0], ctx); if (!r) return ERR.VALUE;
      if (r.c1 === r.c2) return r.c1;
      const row = []; for (let i = r.c1; i <= r.c2; i++) row.push(i); return new Matrix([row]);
    },
    ARRAYFORMULA(args, ctx, wb) { return wb.val(args[0], ctx); },
    TRANSPOSE(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx));
      const rows = []; for (let c = 0; c < m.w; c++) { const row = []; for (let r = 0; r < m.h; r++) row.push(m.rows[r][c]); rows.push(row); }
      return new Matrix(rows);
    },
    UNIQUE(args, ctx, wb) {
      let m = asMatrix(wb.val(args[0], ctx));
      const byCol = args.length > 1 && args[1].t !== 'missing' ? toBool(wb.scalar(args[1], ctx)) === true : false;
      const once = args.length > 2 && args[2].t !== 'missing' ? toBool(wb.scalar(args[2], ctx)) === true : false;
      if (byCol) m = FN.TRANSPOSE([{ t: 'lit', v: m }], ctx, wb);
      const cnt = new Map(), order = [];
      for (const row of m.rows) { const k = row.map(uKey).join('\u0000'); if (!cnt.has(k)) { cnt.set(k, 0); order.push([k, row]); } cnt.set(k, cnt.get(k) + 1); }
      const out = order.filter(([k]) => !once || cnt.get(k) === 1).map(([, row]) => row.slice());
      if (!out.length) return ERR.NA;
      let res = new Matrix(out);
      if (byCol) res = FN.TRANSPOSE([{ t: 'lit', v: res }], ctx, wb);
      return res.h === 1 && res.w === 1 ? res.rows[0][0] : res;
    },
    VSTACK(args, ctx, wb) {
      const ms = args.filter(a => a.t !== 'missing').map(a => asMatrix(wb.val(a, ctx)));
      const w = Math.max(...ms.map(m => m.w)); const rows = [];
      for (const m of ms) for (const r of m.rows) { const row = r.slice(); while (row.length < w) row.push(ERR.NA); rows.push(row); }
      return new Matrix(rows);
    },
    HSTACK(args, ctx, wb) {
      const ms = args.filter(a => a.t !== 'missing').map(a => asMatrix(wb.val(a, ctx)));
      const h = Math.max(...ms.map(m => m.h)); const rows = [];
      for (let r = 0; r < h; r++) { const row = []; for (const m of ms) for (let c = 0; c < m.w; c++) row.push(r < m.h ? m.rows[r][c] : ERR.NA); rows.push(row); }
      return new Matrix(rows);
    },
    FILTER(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx));
      const conds = args.slice(1).filter(a => a.t !== 'missing').map(a => asMatrix(wb.val(a, ctx)));
      const truthy = (v) => { if (isErr(v)) return false; const b = toBool(v); return b === true; };
      const byRow = conds.every(c => c.w === 1 && c.h === m.h) || (m.h > 1 && conds.every(c => c.h === m.h));
      if (byRow) {
        const out = m.rows.filter((_, r) => conds.every(c => truthy(c.rows[r][0])));
        if (!out.length) return ERR.NA;
        return new Matrix(out.map(r => r.slice()));
      }
      if (conds.every(c => c.h === 1 && c.w === m.w)) {
        const keep = []; for (let c = 0; c < m.w; c++) if (conds.every(x => truthy(x.rows[0][c]))) keep.push(c);
        if (!keep.length) return ERR.NA;
        return new Matrix(m.rows.map(r => keep.map(c => r[c])));
      }
      return ERR.VALUE;
    },
    TOCOL(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx));
      const ign = args.length > 1 && args[1].t !== 'missing' ? toNum(wb.scalar(args[1], ctx)) : 0;
      const byCol = args.length > 2 && args[2].t !== 'missing' ? toBool(wb.scalar(args[2], ctx)) === true : false;
      const out = [];
      const push = (v) => { if ((ign === 1 || ign === 3) && (v === null || v === undefined)) return; if ((ign === 2 || ign === 3) && isErr(v)) return; out.push([v]); };
      if (byCol) { for (let c = 0; c < m.w; c++) for (let r = 0; r < m.h; r++) push(m.rows[r][c]); }
      else for (const r of m.rows) for (const v of r) push(v);
      if (!out.length) return ERR.NA;
      return new Matrix(out);
    },
    CHOOSECOLS(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx)); const idx = [];
      for (const a of args.slice(1)) for (const x of asMatrix(wb.val(a, ctx)).flat()) { const n = Math.trunc(toNum(x)); const c = n < 0 ? m.w + n : n - 1; if (c < 0 || c >= m.w) return ERR.VALUE; idx.push(c); }
      return new Matrix(m.rows.map(r => idx.map(c => r[c])));
    },
    ARRAY_CONSTRAIN(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx)); const r = Math.trunc(toNum(wb.scalar(args[1], ctx))), c = Math.trunc(toNum(wb.scalar(args[2], ctx)));
      const rows = m.rows.slice(0, Math.max(1, r)).map(x => x.slice(0, Math.max(1, c)));
      return rows.length === 1 && rows[0].length === 1 ? rows[0][0] : new Matrix(rows);
    },
    SWITCH(args, ctx, wb) {
      const x = wb.scalar(args[0], ctx); if (isErr(x)) return x;
      let i = 1;
      for (; i + 1 < args.length; i += 2) { const c = wb.scalar(args[i], ctx); if (!isErr(c) && cmp(x, c) === 0 && typeRank(x) === typeRank(c)) return wb.val(args[i + 1], ctx); }
      return i < args.length ? wb.val(args[i], ctx) : ERR.NA;
    },
    IFS(args, ctx, wb) {
      for (let i = 0; i + 1 < args.length; i += 2) { const b = toBool(wb.scalar(args[i], ctx)); if (isErr(b)) return b; if (b) return wb.val(args[i + 1], ctx); }
      return ERR.NA;
    },
    LET(args, ctx, wb) {
      const c2 = Object.assign({}, ctx, { scope: new Map(ctx.scope || []) });
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (args[i].t !== 'name') return ERR.VALUE;
        c2.scope.set(args[i].v, wb.ev(args[i + 1], c2));
      }
      return wb.ev(args[args.length - 1], c2);
    },
    LAMBDA(args, ctx) {
      const params = args.slice(0, -1).map(a => a.v);
      return { t: 'closure', params, body: args[args.length - 1], ctx };
    },
    MAP(args, ctx, wb) {
      const lam = wb.ev(args[args.length - 1], ctx); if (!lam || lam.t !== 'closure') return ERR.VALUE;
      const ms = args.slice(0, -1).map(a => asMatrix(wb.val(a, ctx)));
      const h = ms[0].h, w = ms[0].w;
      const rows = [];
      for (let r = 0; r < h; r++) { const row = []; for (let c = 0; c < w; c++) row.push(first(valOf(callLambda(lam, ms.map(m => m.at(r, c)), wb), wb))); rows.push(row); }
      return new Matrix(rows);
    },
    MAKEARRAY(args, ctx, wb) {
      const R = Math.trunc(toNum(wb.scalar(args[0], ctx))), C = Math.trunc(toNum(wb.scalar(args[1], ctx)));
      const lam = wb.ev(args[2], ctx); if (!lam || lam.t !== 'closure') return ERR.VALUE;
      if (!(R >= 1 && C >= 1)) return ERR.VALUE;
      const rows = [];
      for (let r = 1; r <= R; r++) { const row = []; for (let c = 1; c <= C; c++) row.push(first(valOf(callLambda(lam, [r, c], wb), wb))); rows.push(row); }
      return new Matrix(rows);
    },
  };
  function lookup(args, ctx, wb, vertical) {
    const key = wb.scalar(args[0], ctx); if (isErr(key)) return key;
    const m = asMatrix(wb.val(args[1], ctx));
    const idx = toNum(wb.scalar(args[2], ctx)); if (isErr(idx)) return idx;
    let sorted = true;
    if (args.length > 3 && args[3].t !== 'missing') { const s = toBool(wb.scalar(args[3], ctx)); if (isErr(s)) return s; sorted = s; }
    const list = vertical ? m.rows.map(r => r[0]) : m.rows[0];
    const i = lookupIndex(key, list, sorted);
    if (i < 0) return ERR.NA;
    const k = Math.trunc(idx);
    if (k < 1 || k > (vertical ? m.w : m.h)) return ERR.REF;
    return vertical ? m.rows[i][k - 1] : m.rows[k - 1][i];
  }

  const api = { Workbook, Matrix, XErr, ERR, isErr, parse, tokenize, toStr, numStr, FN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SilEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
