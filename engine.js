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
      if ((m = /^([A-Za-z_][\w.]*)\s*\(/.exec(rest))) { t.push({ k: 'fn', v: m[1].toUpperCase().replace(/^_XLFN\./, '') }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][\w.]*/.exec(rest))) { t.push({ k: 'name', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|<>)/.exec(rest))) { t.push({ k: 'op', v: m[0] }); i += 2; continue; }
      if ('+-*/^&=<>%'.includes(ch)) { t.push({ k: 'op', v: ch }); i++; continue; }
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
      return postfix(primary());
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
    }
    setInput(sheet, addr, value) { this.inputs[sheet + '!' + addr] = value; this.invalidate(); }
    clearInputs() { this.inputs = {}; this.invalidate(); }
    invalidate() { this.memo.clear(); this.rangeMemo.clear(); }
    raw(sheet, addr) { const s = this.cells[sheet]; return s ? s[addr] : undefined; }
    get(sheet, addr) {
      const key = sheet + '!' + addr;
      if (key in this.inputs) return this.inputs[key];
      if (this.memo.has(key)) return this.memo.get(key);
      const d = this.raw(sheet, addr);
      let val;
      if (!d) val = null;
      else if ('v' in d) val = (typeof d.v === 'string' && ERR_LIT.test(d.v)) ? errFromString(d.v) : d.v;
      else if ('spill' in d) {
        const anc = parseA1(d.spill), me = parseA1(addr);
        const res = this.evalCell(sheet, d.spill, true);
        val = isM(res) ? res.at(me.r - anc.r, me.c - anc.c) : (me.r === anc.r && me.c === anc.c ? res : null);
      } else val = this.evalCell(sheet, addr, false);
      if (isM(val)) val = val.rows[0][0];
      this.memo.set(key, val);
      return val;
    }
    evalCell(sheet, addr, wantArray) {
      const key = sheet + '!' + addr + (wantArray ? '#a' : '');
      if (wantArray && this.memo.has(key)) return this.memo.get(key);
      if (this.stack.has(key)) throw new Error('순환 참조: ' + key);
      this.stack.add(key);
      try {
        const d = this.raw(sheet, addr);
        if (!d.ast) d.ast = parse(d.f);
        const ctx = { sheet, array: !!d.a, wb: this };
        let v = this.ev(d.ast, ctx);
        if (v && v.t === 'rng') v = this.rangeValue(v);
        if (wantArray) this.memo.set(key, v);
        return v;
      } finally { this.stack.delete(key); }
    }
    rangeValue(r) {
      const key = r.sheet + '!' + r.c1 + ',' + r.r1 + ':' + r.c2 + ',' + r.r2;
      if (this.rangeMemo.has(key)) return this.rangeMemo.get(key);
      const rows = [];
      for (let rr = r.r1; rr <= r.r2; rr++) { const row = []; for (let cc = r.c1; cc <= r.c2; cc++) row.push(this.get(r.sheet, numToCol(cc) + rr)); rows.push(row); }
      const m = (r.r1 === r.r2 && r.c1 === r.c2) ? rows[0][0] : new Matrix(rows);
      this.rangeMemo.set(key, m);
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
        case 'name': return ERR.NAME;
        case 'arr': return new Matrix(n.rows.map(row => row.map(e => first(this.val(e, ctx)))));
        case 'neg': return lift1(this.val(n.e, ctx), x => { const v = toNum(x); return isErr(v) ? v : -v; });
        case 'pct': return lift1(this.val(n.e, ctx), x => { const v = toNum(x); return isErr(v) ? v : v / 100; });
        case 'bin': return binop(n.op, this.val(n.l, ctx), this.val(n.r, ctx));
        case 'fn': {
          const f = FN[n.name];
          if (!f) throw new Error('지원하지 않는 함수: ' + n.name);
          return f(n.args, ctx, this);
        }
      }
      throw new Error('알 수 없는 노드 ' + n.t);
    }
    val(n, ctx) { const v = this.ev(n, ctx); return v && v.t === 'rng' ? this.rangeValue(v) : v; }
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
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s);
    const op = m[1] || '=', rhsS = m[2];
    const rhsN = rhsS !== '' && !isNaN(Number(rhsS)) ? Number(rhsS) : null;
    const rhsB = /^(TRUE|FALSE)$/i.test(rhsS) ? rhsS.toUpperCase() === 'TRUE' : null;
    const wild = /[*?]/.test(rhsS) ? new RegExp('^' + rhsS.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i') : null;
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
      if (isM(v)) { const a = alt(); return v.map((x) => isErr(x) ? first(a) : x); }
      return isErr(v) ? alt() : v;
    },
    IFNA(args, ctx, wb) { const v = wb.val(args[0], ctx); return (isErr(v) && v.code === '#N/A') ? wb.val(args[1], ctx) : v; },
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
    NOT(args, ctx, wb) { const b = toBool(wb.scalar(args[0], ctx)); return isErr(b) ? b : !b; },
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
      const rv = wb.val(args[0], ctx); const crit = wb.scalar(args[1], ctx);
      if (isErr(crit)) return crit;
      const f = criteriaFn(crit); let n = 0;
      for (const v of asMatrix(rv).flat()) if (!isErr(v) && f(v)) n++;
      return n;
    },
    INDEX(args, ctx, wb) {
      const m = asMatrix(wb.val(args[0], ctx));
      let r = args.length > 1 && args[1].t !== 'missing' ? toNum(wb.scalar(args[1], ctx)) : 0;
      let c = args.length > 2 && args[2].t !== 'missing' ? toNum(wb.scalar(args[2], ctx)) : 0;
      if (isErr(r)) return r; if (isErr(c)) return c;
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
