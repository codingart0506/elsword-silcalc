/* 장비창 일반 악세서리(초록 칸) 아이콘 인식 */
(function (root) {
  'use strict';
  const N = 24; // 비교용 축소 크기
  // 체크 표시(왼쪽 위)와 옷걸이 표시(오른쪽 아래)는 비교에서 뺌
  const MASK = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) MASK[y * N + x] = (x < 9 && y < 9) || (x >= 14 && y >= 14) ? 0 : 1;

  // 초록 칸 배경 판별
  const isGreen = (r, g, b) => g - b > 12 && g >= r - 2 && r - b > 6 && g > 150;

  function components(mask, W, H) {
    const lab = new Int32Array(W * H), out = []; let id = 0; const st = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || lab[i]) continue;
      id++; let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
      st.push(i); lab[i] = id;
      while (st.length) {
        const p = st.pop(), x = p % W, y = (p / W) | 0; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; st.push(p - 1); }
        if (x < W - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; st.push(p + 1); }
        if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; st.push(p - W); }
        if (y < H - 1 && mask[p + W] && !lab[p + W]) { lab[p + W] = id; st.push(p + W); }
      }
      out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
    }
    return out;
  }
  function cluster(vals, tol) {
    const s = [...vals].sort((a, b) => a - b), groups = [];
    for (const v of s) { const g = groups[groups.length - 1]; if (g && v - g.last <= tol) { g.items.push(v); g.last = v; } else groups.push({ items: [v], last: v }); }
    return groups.map(g => ({ v: g.items.reduce((a, b) => a + b, 0) / g.items.length, n: g.items.length }));
  }

  // 2열 × 최대 6행의 초록 칸 격자 찾기
  function detectGrid(canvas) {
    const W = canvas.width, H = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) mask[i] = isGreen(d[j], d[j + 1], d[j + 2]) ? 1 : 0;
    const sq = components(mask, W, H).filter(c => c.w >= 14 && c.h >= 14 && c.w <= 120 && c.h <= 120 && Math.abs(c.w - c.h) < 0.3 * Math.max(c.w, c.h) && c.area > 0.25 * c.w * c.h);
    if (sq.length < 3) return null;
    const sizes = sq.map(c => Math.max(c.w, c.h)).sort((a, b) => a - b);
    const s = sizes[(sizes.length * 0.6) | 0];
    const full = sq.filter(c => Math.max(c.w, c.h) > s * 0.8);
    const tol = Math.max(2, s * 0.15);
    const xs = cluster(full.map(c => c.x), tol);
    // 간격이 칸 크기의 1.0~1.25배인 이웃한 두 열 중 칸이 가장 많은 쌍
    let best = null;
    for (const a of xs) for (const b of xs) {
      const gap = b.v - a.v;
      if (gap > s * 0.95 && gap < s * 1.3 && (!best || a.n + b.n > best.n)) best = { a: a.v, b: b.v, n: a.n + b.n, p: gap };
    }
    if (!best || best.n < 3) return null;
    let P = best.p;
    const inCols = full.filter(c => Math.abs(c.x - best.a) <= tol || Math.abs(c.x - best.b) <= tol);
    const ys = cluster(inCols.map(c => c.y), tol).sort((a, b) => a.v - b.v);
    if (!ys.length) return null;
    // 같은 간격으로 이어지는 행만 (가장 긴 연속)
    let y0 = ys[0].v, y1 = ys[ys.length - 1].v;
    let rows = Math.round((y1 - y0) / P) + 1;
    // 여러 행에 걸친 거리로 간격을 더 정확히 (초상화 위치 계산에 중요)
    if (rows >= 3) P = (y1 - y0) / (rows - 1);
    if (rows > 6) { // 가장 많이 걸린 6행 구간
      let bestStart = y0, bestHits = -1;
      for (let k = 0; k <= rows - 6; k++) { const st = y0 + k * P; const hits = ys.filter(r => r.v >= st - tol && r.v <= st + 5 * P + tol).reduce((a, r) => a + r.n, 0); if (hits > bestHits) { bestHits = hits; bestStart = st; } }
      y0 = bestStart; rows = 6;
    }
    // 위아래로 빠진 행이 있으면 초록 비율로 확인해 붙임
    const greenFrac = (x, y) => {
      let g = 0, t = 0; const xi = Math.round(x), yi = Math.round(y), si = Math.round(s);
      for (let yy = yi; yy < yi + si; yy += 2) for (let xx = xi; xx < xi + si; xx += 2) { if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; t++; g += mask[yy * W + xx]; }
      return t ? g / t : 0;
    };
    while (rows < 6) {
      const up = Math.max(greenFrac(best.a, y0 - P), greenFrac(best.b, y0 - P));
      const down = Math.max(greenFrac(best.a, y0 + rows * P), greenFrac(best.b, y0 + rows * P));
      if (Math.max(up, down) < 0.15) break;
      if (up >= down) y0 -= P; rows++;
    }
    const cells = [];
    for (let r = 0; r < rows; r++) for (const [ci, x] of [[0, best.a], [1, best.b]]) cells.push({ x: Math.round(x), y: Math.round(y0 + r * P), s: Math.round(s), slot: (ci ? '우' : '좌') + (r + 1) });
    return { cells, size: s, pitch: P };
  }

  function featureOf(canvas, c) {
    const t = document.createElement('canvas'); t.width = N; t.height = N;
    const g = t.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, c.x, c.y, c.s, c.s, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data, f = new Uint8Array(N * N * 3);
    for (let i = 0; i < N * N; i++) { f[i * 3] = d[i * 4]; f[i * 3 + 1] = d[i * 4 + 1]; f[i * 3 + 2] = d[i * 4 + 2]; }
    return f;
  }
  function thumbOf(canvas, c, size) {
    const t = document.createElement('canvas'); t.width = size; t.height = size;
    t.getContext('2d').drawImage(canvas, c.x, c.y, c.s, c.s, 0, 0, size, size);
    return t.toDataURL('image/png');
  }
  const NOMASK = new Uint8Array(N * N).fill(1);
  function dist(a, b, mask) {
    mask = mask || MASK;
    let s = 0, n = 0;
    for (let i = 0; i < N * N; i++) { if (!mask[i]) continue; const k = i * 3; s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]); n += 3; }
    return s / n;
  }
  const b64ToBytes = (b) => Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
  const bytesToB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };

  // 기본 아이콘 사전 + 이 브라우저에서 가르친 아이콘 (kind: 'acc' 악세서리 / 'cls' 전직 초상화)
  const STORE = { acc: 'silcalc.icons.v1', cls: 'silcalc.classes.v1' };
  const BASE = { acc: () => root.SIL_ICONS || [], cls: () => root.SIL_CLASS_ICONS || [] };
  function library(kind) {
    kind = kind || 'acc';
    const base = BASE[kind]().map(e => ({ name: e.name, f: b64ToBytes(e.f), src: 'base' }));
    let mine = [];
    try { mine = (JSON.parse(localStorage.getItem(STORE[kind])) || []).map(e => ({ name: e.name, f: b64ToBytes(e.f), src: 'mine' })); } catch (e) { /* 저장소 없음 */ }
    return base.concat(mine);
  }
  function teach(name, f, kind) {
    kind = kind || 'acc';
    let mine = [];
    try { mine = JSON.parse(localStorage.getItem(STORE[kind])) || []; } catch (e) { /* 무시 */ }
    mine.push({ name, f: bytesToB64(f) });
    try { localStorage.setItem(STORE[kind], JSON.stringify(mine)); } catch (e) { return false; }
    return true;
  }
  // 가르칠 때 여러 배율로 늘려 저장 → 해상도가 다른 스크린샷에서도 알아봄
  function teachFrom(canvas, rect, name, kind) {
    const m = Math.max(4, Math.round(rect.s * 0.15));
    const sx = Math.max(0, rect.x - m), sy = Math.max(0, rect.y - m);
    const sw = Math.min(canvas.width - sx, rect.s + 2 * m), sh = Math.min(canvas.height - sy, rect.s + 2 * m);
    let ok = true;
    for (const sc of [0.7, 0.8, 0.9, 1, 1.12, 1.25, 1.4]) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * sc)); c.height = Math.max(1, Math.round(sh * sc));
      const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const r = { x: Math.round((rect.x - sx) * sc), y: Math.round((rect.y - sy) * sc), s: Math.round(rect.s * sc) };
      ok = teach(name, featureOf(c, r), kind) && ok;
    }
    return ok;
  }
  const MATCH = 15; // 같은 아이템(배율 달라도) 대개 14 이하, 다른 아이템 18 이상
  const GUESS = 20; // 옷걸이·체크 표시 유무가 다를 때 이 사이로 나올 수 있음

  // 칸 위치가 1~2px 어긋나도 맞도록 주변을 조금씩 옮겨 가며 가장 가까운 값을 찾음
  function bestMatch(canvas, c, lib, mask, reach) {
    const st = Math.max(1, Math.round(c.s / 36)); reach = reach || 2;
    const byName = {};
    for (const ds of [-st, 0, st]) for (let dy = -reach * st; dy <= reach * st; dy += st) for (let dx = -reach * st; dx <= reach * st; dx += st) {
      const f = featureOf(canvas, { x: c.x + dx, y: c.y + dy, s: c.s + ds });
      for (const e of lib) { const dd = dist(f, e.f, mask); if (!(e.name in byName) || dd < byName[e.name]) byName[e.name] = dd; }
    }
    const ranked = Object.entries(byName).sort((a, b) => a[1] - b[1]);
    if (!ranked.length) return null;
    return { name: ranked[0][0], d: ranked[0][1], second: ranked[1] ? ranked[1][1] : Infinity };
  }
  // 캐릭터·살펴보기 창 왼쪽 위 전직 일러스트: 얇은 금색 테두리 사각형을 찾음
  const isGold = (r, g, b) => r > 150 && g > 110 && b < 140 && r - b > 70 && g - b > 40;
  function findPortrait(canvas) {
    const W = canvas.width, H = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H), dk = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      m[i] = isGold(d[j], d[j + 1], d[j + 2]) ? 1 : 0;
      dk[i] = Math.max(d[j], d[j + 1], d[j + 2]) < 60 ? 1 : 0;
    }
    const minL = Math.max(24, Math.round(H * 0.035)), GAP = 2;
    const cand = [];
    for (let x = 0; x < W; x++) {
      let best = 0, bs = 0, st = -1, last = -10;
      for (let y = 0; y < H; y++) {
        if (!m[y * W + x]) continue;
        if (st < 0 || y - last > GAP + 1) st = y;
        last = y;
        if (last - st + 1 > best) { best = last - st + 1; bs = st; }
      }
      if (best >= minL) cand.push({ x, s: bs, e: bs + best, L: best });
    }
    const tol = Math.max(4, Math.round(H * 0.005));
    const colFrac = (arr, x, y0, y1) => { if (x < 0 || x >= W || y1 <= y0) return 0; let c = 0; for (let y = y0; y < y1; y++) c += arr[y * W + x]; return c / (y1 - y0); };
    const rowFrac = (arr, y, x0, x1) => { if (y < 0 || y >= H || x1 <= x0) return 0; let c = 0; for (let x = x0; x < x1; x++) c += arr[y * W + x]; return c / (x1 - x0); };
    let found = null;
    for (let i = 0; i < cand.length; i++) for (let k = i + 1; k < cand.length; k++) {
      const a = cand[i], b = cand[k], dd = b.x - a.x;
      if (dd < minL) continue;
      if (Math.abs(a.e - b.e) > tol) continue;
      const Lm = Math.max(a.L, b.L);
      if (Lm < 0.6 * dd || Lm > 1.1 * dd) continue;
      const e = Math.max(a.e, b.e), top = e - dd;
      if (top < 0) continue;
      // 아래 테두리도 금색
      let hit = 0;
      for (let x = a.x; x <= b.x; x++) { for (let y = Math.max(0, e - tol - 1); y <= Math.min(H - 1, e); y++) if (m[y * W + x]) { hit++; break; } }
      if (hit < 0.7 * (dd + 1)) continue;
      const q = dd >> 2;
      // 안쪽은 금색이 거의 없어야 함
      let g = 0, n = 0;
      for (let y = top + q; y < e - q; y += 2) for (let x = a.x + q; x < b.x - q; x += 2) { n++; g += m[y * W + x]; }
      if (n && g / n > 0.3) continue;
      // 테두리 바깥 검은 선 (왼쪽·오른쪽·아래)
      const kk = Math.max(2, Math.round(dd * 0.04));
      let dl = 0, dr = 0, db = 0;
      for (let t = 1; t <= kk; t++) {
        dl = Math.max(dl, colFrac(dk, a.x - t, top + q, e - q));
        dr = Math.max(dr, colFrac(dk, b.x + t, top + q, e - q));
        db = Math.max(db, rowFrac(dk, e + t, a.x + q, b.x - q));
      }
      if (Math.min(dl, dr, db) < 0.6) continue;
      const sc = dd * 1000 + a.L + b.L;
      if (!found || sc > found.sc) found = { sc, x: a.x, y: top, s: dd };
    }
    return found ? { x: found.x, y: found.y, s: found.s } : null;
  }
  function recognizeClass(canvas) {
    const r = findPortrait(canvas);
    if (!r) return null;
    const lib = library('cls');
    const best = lib.length ? bestMatch(canvas, r, lib, NOMASK, 4) : null;
    let match = null;
    if (best && best.d <= CLS_MATCH) match = best;
    else if (best && best.d <= CLS_MATCH + 6 && best.second - best.d >= 8) match = Object.assign({ guess: true }, best);
    return Object.assign({}, r, { f: featureOf(canvas, r), thumb: thumbOf(canvas, r, 48), match, nearest: best });
  }
  const CLS_MATCH = 16;

  function recognize(canvas) {
    let cls = null;
    try { cls = recognizeClass(canvas); } catch (e) { /* 초상화 없음 */ }
    const grid = detectGrid(canvas);
    if (!grid) return cls ? { grid: null, cells: [], cls } : null;
    const lib = library('acc');
    const cells = grid.cells.map(c => {
      const best = lib.length ? bestMatch(canvas, c, lib) : null;
      // 확실(15 이하) / 애매하지만 다른 후보보다 뚜렷이 가까움(20 이하, 차이 6 이상) → 추정
      let match = null;
      if (best && best.d <= MATCH) match = best;
      else if (best && best.d <= GUESS && best.second - best.d >= 6) match = Object.assign({ guess: true }, best);
      return Object.assign({}, c, { f: featureOf(canvas, c), thumb: thumbOf(canvas, c, 40), match, nearest: best });
    });
    return { grid, cells, cls };
  }

  const api = { detectGrid, featureOf, dist, bestMatch, recognize, recognizeClass, findPortrait, teach, teachFrom, library, bytesToB64, b64ToBytes, N, MATCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SilGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
