/* 실투력 랭킹: 목록 · 신청 · 스크린샷으로 갱신 · 관리자 승인 (Supabase) */
(function () {
  'use strict';
  const A = window.SilApp;
  if (!A || !window.SIL_CDN) return; // 직접 호스팅판(GitHub Pages)에서만 켬

  const SB_URL = 'https://qaeheqbuzwxbaujrsktr.supabase.co';
  const SB_KEY = 'sb_publishable_J0YXiKlO-CdW_vK_k5UhXA_mE7kvs1N'; // 공개용 키(브라우저에 넣어도 되는 키)
  const SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  // CDN 파일이 바뀌면(변조) 실행하지 않음
  const SB_SRI = 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O';
  const $ = (s, r) => (r || document).querySelector(s);
  const { el, toast, fmtInt, korUnit } = A;

  // ---------- 방문 통계(익명) ----------
  // 하루(한국 시간)마다 방문 수 · 그날 처음 연 브라우저 수 · 처음 온 브라우저 수, 아바타 추천 횟수만 더함. IP·기기 번호는 안 보냄
  function track(kind, extra) {
    try {
      fetch(SB_URL + '/rest/v1/rpc/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
        body: JSON.stringify(Object.assign({ p_kind: kind }, extra || {})) }).catch(() => {});
    } catch (e) { /* 통계는 실패해도 그만 */ }
  }
  window.SilTrack = track;
  (function visit() {
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    let last = null;
    try { last = localStorage.getItem('silcalc.seen'); localStorage.setItem('silcalc.seen', today); } catch (e) { /* 무시 */ }
    track('visit', { p_today: last !== today, p_first: !last });
  })();

  // ---------- 서버 연결(필요할 때만 불러옴) ----------
  let sbP = null;
  // 이 브라우저에 저장된 갱신 코드들(승인된 것 먼저, 최대 5개)
  function viewCodes() {
    const rs = Object.values(A.ranks()).filter(r => r && r.token);
    rs.sort((a, b) => (b.status === 'approved') - (a.status === 'approved'));
    return [...new Set(rs.map(r => r.token))].slice(0, 5).join(',');
  }
  // 이 브라우저를 구분하는 임의 번호(갱신 코드를 여러 기기에서 돌려 쓰는지 알아보는 용도, 개인 정보 아님)
  function devId() {
    try {
      let d = localStorage.getItem('silcalc.dev');
      if (!d) { const a = new Uint8Array(12); crypto.getRandomValues(a); d = [...a].map(x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('silcalc.dev', d); }
      return d;
    } catch (e) { return ''; }
  }
  function sb() {
    if (!sbP) sbP = new Promise((res, rej) => {
      // 랭킹은 승인된 갱신 코드가 있는 사람만 볼 수 있어서, 갖고 있는 갱신 코드를 요청마다 같이 보냄(서버가 확인)
      const withCode = (url, opts) => {
        const t = viewCodes(); if (!t) return fetch(url, opts);
        const o = Object.assign({}, opts); const h = new Headers(o.headers || {}); h.set('x-sil-token', t); const d = devId(); if (d) h.set('x-sil-dev', d); o.headers = h;
        return fetch(url, o);
      };
      const make = () => res(window.supabase.createClient(SB_URL, SB_KEY, { auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true }, global: { fetch: withCode } }));
      if (window.supabase && window.supabase.createClient) return make();
      const s = document.createElement('script');
      s.src = SB_JS; s.integrity = SB_SRI; s.crossOrigin = 'anonymous'; s.async = true; s.onload = make;
      s.onerror = () => { sbP = null; rej(new Error('랭킹 서버에 연결하지 못했어요')); };
      document.head.append(s);
    });
    return sbP;
  }
  const errMsg = (e) => (e && (e.message || e.error_description)) || '잠시 후 다시 시도해 주세요';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function ago(ts) {
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 90) return '방금';
    if (s < 3600) return `${Math.round(s / 60)}분 전`;
    if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)}일 전`;
    return new Date(ts).toLocaleDateString('ko-KR');
  }
  // 스크린샷 저장(가로 최대 1920): 되는 브라우저는 WebP(같은 글자 선명도에 JPEG의 절반쯤 크기), 안 되면 JPEG.
  // 원본(관리자 확인용)은 0.8, 랭킹에 보이는 사본은 0.6 — 사본이 여러 번 받아지는 쪽이라 더 줄임(0.6에서도 스탯 글자는 또렷함)
  function encodeImg(src, q) {
    const k = Math.min(1, 1920 / src.width);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => {
      if (b && b.type === 'image/webp') return res(b);
      c.toBlob(j => j ? res(j) : rej(new Error('사진을 변환하지 못했어요')), 'image/jpeg', 0.85);
    }, 'image/webp', q));
  }
  const toOrig = (src) => encodeImg(src, 0.8);
  const toPub = (src) => encodeImg(src, 0.6);
  const extOf = (b) => b && b.type === 'image/webp' ? 'webp' : 'jpg';
  const isPubPath = (p) => /_p\.(jpg|webp)$/.test(p || '');
  async function blobToCanvas(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c;
  }
  // 랭킹에 보일 사진: 캐릭터 창(전투력 줄까지)·상세 스탯 창만 또렷하게 두고 나머지(채팅·배경·다른 사람 이름표·점령전 줄 아래)는 흐리게.
  // 캐릭터 창: 장비창의 초록 악세서리 칸(2열 6행)으로 잡고, 상세 스탯 창에 가려 칸이 안 보이면 왼쪽 위 전직 일러스트(금색 테두리)로 잡음.
  // 상세 스탯 창: 창 안의 검은 구분 띠로 따로 찾음(캐릭터 창 위에 겹쳐 있어도 됨). 못 찾으면 캐릭터 창 오른쪽에 붙어 있다고 봄
  // 상세 스탯 창 찾기: 창 안의 검은 구분 띠(기본 능력치·공격·스킬·보조·방어…)가 같은 폭으로 여러 개 쌓여 있음.
  // 띠를 찾은 뒤 띠 위아래로 창 바탕색(짙은 남색) 줄이 이어지는 데까지를 창으로 봄. 못 찾으면 null
  function findStatPanel(src) {
    const W = src.width, H = src.height;
    const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const blk = (i) => d[i] <= 16 && d[i + 1] <= 16 && d[i + 2] <= 18;
    const minRun = Math.round(W * 0.04), join = Math.round(W * 0.07), minSpan = Math.round(W * 0.15);
    const rows = [];
    for (let y = 0; y < H; y++) {
      const runs = []; let st = -1, miss = 0;
      for (let x = 0; x <= W; x++) {
        const b = x < W && blk((y * W + x) * 4);
        if (b) { if (st < 0) st = x; miss = 0; }
        else if (st >= 0 && ++miss > 2) { const e = x - miss; if (e - st + 1 >= minRun) runs.push([st, e]); st = -1; miss = 0; }
      }
      const seg = [];
      for (const r of runs) {
        const l = seg[seg.length - 1];
        // 띠 이름(가운데 글자) 때문에 끊긴 곳만 이어 붙임: 끊긴 곳이 합친 띠의 가운데쯤일 때만(창 테두리 너머 다른 검은 곳과 붙지 않게)
        const ok = l && r[0] - l[1] <= join && Math.abs((l[1] + r[0]) / 2 - (l[0] + r[1]) / 2) <= 0.12 * (r[1] - l[0]);
        if (ok) { l[2] += r[1] - r[0] + 1; l[1] = r[1]; } else seg.push([r[0], r[1], r[1] - r[0] + 1]);
      }
      for (const s of seg) if (s[1] - s[0] + 1 >= minSpan && s[2] / (s[1] - s[0] + 1) >= 0.7) rows.push({ y, x0: s[0], x1: s[1] });
    }
    // 붙은 줄을 띠로 묶음
    const tol = Math.max(4, Math.round(W * 0.006)), bands = [];
    for (const r of rows) {
      const b = bands.find(b => r.y - b.y1 <= 2 && Math.abs(r.x0 - b.x0) <= tol && Math.abs(r.x1 - b.x1) <= tol);
      if (b) { b.y1 = r.y; } else bands.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1 });
    }
    const ok = bands.filter(b => { const h = b.y1 - b.y0 + 1, w = b.x1 - b.x0; return h >= w * 0.015 && h <= w * 0.07; });
    // 왼쪽·오른쪽 끝이 같은 띠가 3개 이상
    let best = null;
    for (const a of ok) {
      const g = ok.filter(b => Math.abs(b.x0 - a.x0) <= tol && Math.abs(b.x1 - a.x1) <= tol).sort((p, q) => p.y0 - q.y0);
      if (g.length < 3) continue;
      const u = g.map(b => b.y1 - b.y0 + 1).sort((p, q) => p - q)[g.length >> 1];
      let far = false; for (let i = 1; i < g.length; i++) if (g[i].y0 - g[i - 1].y1 > u * 16) far = true;
      if (far) continue;
      if (!best || g.length > best.g.length) best = { g, u };
    }
    if (!best) return null;
    const { g, u } = best;
    const x0 = Math.round(g.reduce((s, b) => s + b.x0, 0) / g.length), x1 = Math.round(g.reduce((s, b) => s + b.x1, 0) / g.length);
    // 줄마다: 창 바탕(짙은 남색 두 가지)·띠(검정)가 많으면 창 안, 밝은 줄(창 테두리)이면 끝
    const xa = Math.round(x0 + (x1 - x0) * 0.04), xb = Math.round(x1 - (x1 - x0) * 0.04);
    const rowKind = (y) => {
      let n = 0, br = 0, k = 0;
      for (let x = xa; x < xb; x += 3) {
        const i = (y * W + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2]; k++;
        if (Math.max(r, gg, b) >= 150) br++;
        else if ((r <= 20 && gg <= 20 && b <= 22) || (r >= 18 && r <= 74 && gg >= r + 2 && gg <= r + 18 && b >= gg + 2 && b <= gg + 18)) n++;
      }
      return br / k >= 0.6 ? 'edge' : n / k >= 0.45 ? 'in' : 'out';
    };
    const scan = (y, dir) => {
      let last = y, miss = 0;
      for (let yy = y; yy >= 0 && yy < H; yy += dir) {
        const t = rowKind(yy);
        if (t === 'edge') break;
        if (t === 'in') { last = yy; miss = 0; } else if (++miss > u * 1.3) break;
      }
      return last;
    };
    let top = scan(g[0].y0, -1), bot = scan(g[g.length - 1].y1, 1);
    // 창 높이는 띠 두께의 40배를 넘지 않음
    const lim = u * 40;
    if (bot - top > lim) { if (top < g[0].y0 - u * 20) top = Math.max(top, bot - lim); if (bot - top > lim) bot = top + lim; }
    return { x0: x0 - u, y0: top - u * 3.6, x1: x1 + u * 2.2, y1: bot + u * 1.5, u, n: g.length };
  }
  // 또렷하게 둘 곳 [[x0,y0,x1,y1], …]. 캐릭터 창이나 상세 스탯 창을 못 찾으면 null
  function privacyRects(src) {
    const W = src.width, H = src.height, SG = window.SilGear;
    let G = null, sp = null, ch = null, docked = null, unit = 0;
    try { G = SG && SG.detectGrid(src); } catch (e) { G = null; }
    try { sp = findStatPanel(src); } catch (e) { sp = null; }
    if (G && G.cells.length >= 12) {
      const P = G.pitch, xs = G.cells.map(c => c.x), xa = Math.min(...xs), xb = Math.max(...xs), y0 = Math.min(...G.cells.map(c => c.y));
      const top = y0 - 8.3 * P, left = xa - 13.85 * P, mid = xb + 1.5 * P;
      if (left >= -3 * P && top >= -3 * P && mid <= W + P) { ch = [left, top, mid, y0 + 8.75 * P]; docked = [mid, top, mid + 16.5 * P, y0 + 11.15 * P]; unit = P * 0.5; }
    }
    if (!ch) {
      let pt = null; try { pt = SG && SG.findPortrait(src); } catch (e) { pt = null; }
      if (pt) {
        const s = pt.s, r = [pt.x - 0.25 * s, pt.y - 0.8 * s, pt.x + 6.3 * s, pt.y + 6.02 * s];
        if (r[0] >= -s && r[1] >= -s && r[2] <= W + s && r[3] <= H + s) { ch = r; unit = s * 0.2; }
      }
    }
    // 찾은 상세 스탯 창 크기가 캐릭터 창과 맞을 때만 씀
    const st = sp && unit && sp.u / unit > 0.75 && sp.u / unit < 1.3 ? [sp.x0, sp.y0, sp.x1, sp.y1] : docked;
    if (!ch || !st) return null;
    return [ch, st];
  }
  // keep 안은 원본 그대로, 나머지는 흐리게(크게 줄였다가 다시 키움: 모든 브라우저에서 됨)
  function blurKeep(src, keep) {
    const W = src.width, H = src.height;
    const step = (from, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(from, 0, 0, w, h); return c; };
    const small = step(step(src, Math.max(16, Math.round(W / 5)), Math.max(16, Math.round(H / 5))), Math.max(8, Math.round(W / 18)), Math.max(8, Math.round(H / 18)));
    const out = step(step(small, Math.max(16, Math.round(W / 5)), Math.max(16, Math.round(H / 5))), W, H);
    const g = out.getContext('2d');
    for (const [x0, y0, x1, y1] of keep) {
      const a = Math.max(0, Math.round(Math.min(x0, x1))), b = Math.max(0, Math.round(Math.min(y0, y1))), c = Math.min(W, Math.round(Math.max(x0, x1))), d = Math.min(H, Math.round(Math.max(y0, y1)));
      if (c > a && d > b) g.drawImage(src, a, b, c - a, d - b, a, b, c - a, d - b);
    }
    return out;
  }
  // 랭킹에 보일 사본: 또렷한 칸(캐릭터 창·상세 스탯 창)만 남게 둘레를 잘라 냄. 흐린 바깥은 볼 게 없고 용량만 차지해서
  function cropKeep(src, keep) {
    if (!keep || !keep.length) return src;
    const W = src.width, H = src.height, m = Math.round(Math.min(W, H) * 0.01);
    const a = Math.max(0, Math.floor(Math.min(...keep.map(r => Math.min(r[0], r[2])))) - m), b = Math.max(0, Math.floor(Math.min(...keep.map(r => Math.min(r[1], r[3])))) - m);
    const c = Math.min(W, Math.ceil(Math.max(...keep.map(r => Math.max(r[0], r[2])))) + m), d = Math.min(H, Math.ceil(Math.max(...keep.map(r => Math.max(r[1], r[3])))) + m);
    if (c - a < W * 0.3 || d - b < H * 0.3) return src; // 너무 작게 잡히면 자르지 않음
    const out = document.createElement('canvas'); out.width = c - a; out.height = d - b;
    out.getContext('2d').drawImage(src, a, b, c - a, d - b, 0, 0, c - a, d - b);
    return out;
  }
  const pubOf = (src, keep) => cropKeep(blurKeep(src, keep), keep);
  function privacyBlur(src) { const k = privacyRects(src); return k ? pubOf(src, k) : null; }
  window.SilBlur = privacyBlur;
  window.SilBlurRects = privacyRects;

  // 관리자: 또렷하게 둘 곳을 직접 네모로 정함. 끌어서 새 네모, 네모 안을 끌면 옮김, 모서리 ×를 누르면 지움. 저장하면 네모 목록, 취소하면 null
  function editKeep(src, init) {
    return new Promise((resolve) => {
      const W = src.width, H = src.height;
      const base = blurKeep(src, []);
      let rects = init.map(r => r.slice()), auto = init.map(r => r.slice()), drag = null, raf = 0;
      const cv = el('canvas', { class: 'kp-cv' }); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const scale = () => W / cv.getBoundingClientRect().width;
      const norm = (r) => [Math.max(0, Math.min(r[0], r[2])), Math.max(0, Math.min(r[1], r[3])), Math.min(W, Math.max(r[0], r[2])), Math.min(H, Math.max(r[1], r[3]))];
      const draw = () => {
        raf = 0; g.drawImage(base, 0, 0);
        const k = scale(), list = drag && drag.mode === 'new' ? rects.concat([drag.r]) : rects;
        for (const r0 of list) { const r = norm(r0); if (r[2] - r[0] > 1 && r[3] - r[1] > 1) g.drawImage(src, r[0], r[1], r[2] - r[0], r[3] - r[1], r[0], r[1], r[2] - r[0], r[3] - r[1]); }
        g.lineWidth = 3 * k; g.strokeStyle = '#3182f6';
        for (const r0 of list) { const r = norm(r0); g.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); }
        for (const r0 of rects) {
          const r = norm(r0), R = 13 * k;
          g.fillStyle = '#3182f6'; g.beginPath(); g.arc(r[2], r[1], R, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 2.5 * k; const q = R * 0.42;
          g.beginPath(); g.moveTo(r[2] - q, r[1] - q); g.lineTo(r[2] + q, r[1] + q); g.moveTo(r[2] + q, r[1] - q); g.lineTo(r[2] - q, r[1] + q); g.stroke();
          g.strokeStyle = '#3182f6'; g.lineWidth = 3 * k;
        }
        info.textContent = rects.length ? `또렷하게 둘 곳 ${rects.length}군데` : '아직 정한 곳이 없어요. 사진 위를 끌어서 네모를 그리세요';
      };
      const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
      const at = (e) => { const b = cv.getBoundingClientRect(), k = W / b.width; return [(e.clientX - b.left) * k, (e.clientY - b.top) * k]; };
      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const [x, y] = at(e), R = 18 * scale();
        const hit = rects.findIndex(r0 => { const r = norm(r0); return Math.hypot(x - r[2], y - r[1]) <= R; });
        if (hit >= 0) { rects.splice(hit, 1); redraw(); return; }
        const inside = rects.findIndex(r0 => { const r = norm(r0); return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; });
        drag = inside >= 0 ? { mode: 'move', i: inside, x, y, r: norm(rects[inside]) } : { mode: 'new', r: [x, y, x, y] };
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return; const [x, y] = at(e);
        if (drag.mode === 'new') { drag.r[2] = Math.max(0, Math.min(W, x)); drag.r[3] = Math.max(0, Math.min(H, y)); }
        else { const o = drag.r, dx = Math.max(-o[0], Math.min(W - o[2], x - drag.x)), dy = Math.max(-o[1], Math.min(H - o[3], y - drag.y)); rects[drag.i] = [o[0] + dx, o[1] + dy, o[2] + dx, o[3] + dy]; }
        redraw();
      });
      const up = () => {
        if (!drag) return;
        if (drag.mode === 'new') { const r = norm(drag.r); if (r[2] - r[0] >= 12 * scale() && r[3] - r[1] >= 12 * scale()) rects.push(r); }
        drag = null; redraw();
      };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      const info = el('span', { class: 'kp-info' });
      const close = (v) => { box.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const clr = el('button', { type: 'button', class: 'btn', text: '모두 지우기' }); clr.onclick = () => { rects = []; redraw(); };
      const back = el('button', { type: 'button', class: 'btn', text: '자동으로 찾은 곳' }); back.onclick = () => { rects = auto.map(r => r.slice()); redraw(); };
      back.hidden = !auto.length;
      const no = el('button', { type: 'button', class: 'btn', text: '취소' }); no.onclick = () => close(null);
      const ok = el('button', { type: 'button', class: 'btn primary', text: '이대로 저장' });
      ok.onclick = () => { if (!rects.length) { toast('또렷하게 둘 곳을 하나 이상 그려 주세요'); return; } close(rects.map(norm)); };
      const box = el('div', { class: 'kp', role: 'dialog', 'aria-label': '가릴 곳 직접 정하기' },
        el('div', { class: 'kp-head' }, el('b', { text: '가릴 곳 직접 정하기' }),
          el('span', { text: '캐릭터 창(전투력 줄까지)과 상세 스탯 창을 끌어서 네모로 감싸세요. 네모 밖은 모두 흐려져요. 네모 안을 끌면 옮기고, 모서리 ×를 누르면 지워요.' })),
        el('div', { class: 'kp-stage' }, cv),
        el('div', { class: 'kp-acts' }, info, el('span', { class: 'kp-gap' }), clr, back, no, ok));
      document.addEventListener('keydown', onKey);
      document.body.append(box);
      draw();
    });
  }
  // 관리자: 원본(확인용)과 랭킹에 보일 흐린 사본을 나란히. 누르면 크게 열림
  // 흐린 사본이 없으면(예전 화면으로 신청 등) 여기서 원본으로 만들어 붙임. 자동으로 못 가리거나 잘못 가렸으면 직접 네모로 정함
  function shotPair(c, orig, pub, fix, folder) {
    const one = (path, cap) => {
      const img = el('img', { alt: cap });
      shotUrl(c, path).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank'); } });
      return el('figure', { class: 'adm-shot' }, img, el('figcaption', { text: cap }));
    };
    const editBtn = el('button', { type: 'button', class: 'btn adm-edit', text: '가릴 곳 직접 정하기' });
    const box = el('div', { class: 'adm-shots' }, one(orig, '원본(확인용)'), editBtn);
    let slot = null;
    const put = (node) => { if (slot) slot.replaceWith(node); else box.insertBefore(node, editBtn); slot = node; };
    const setPub = (path) => put(one(path, '랭킹에 보일 사진'));
    const note = (t) => put(el('p', { class: 'adm-flag', text: t }));
    let cvP = null;
    const loadOrig = () => cvP || (cvP = (async () => {
      const b = await shotBlob(c, orig); if (!b) throw new Error('원본 사진을 열지 못했어요');
      return blobToCanvas(b);
    })().catch(e => { cvP = null; throw e; }));
    const save = async (pc) => {
      const blob = await toPub(pc), path = `${folder}/${uuid()}_p.${extOf(blob)}`;
      const up = await c.storage.from('shots').upload(path, blob, { contentType: blob.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await fix(path); if (error) throw error;
      setPub(path);
    };
    editBtn.hidden = !fix || !orig;
    editBtn.onclick = async () => {
      editBtn.disabled = true;
      try {
        const cv = await loadOrig();
        const rects = await editKeep(cv, privacyRects(cv) || []);
        if (rects) { await save(pubOf(cv, rects)); toast('랭킹에 보일 사진을 바꿨어요'); }
      } catch (e) { console.warn(e); toast('저장하지 못했어요. ' + errMsg(e)); }
      editBtn.disabled = false;
    };
    if (pub) { setPub(pub); return box; }
    note('다른 사람 이름을 가린 사진을 만드는 중이에요');
    (async () => {
      try {
        if (!fix || !orig) throw null;
        const pc = privacyBlur(await loadOrig()); if (!pc) throw null;
        await save(pc);
      } catch (e) { if (e) console.warn(e); note('다른 사람 이름을 자동으로 못 가렸어요. 아래 \'가릴 곳 직접 정하기\'로 정해 주세요. 그냥 반영하면 원본이 그대로 랭킹에 보여요'); }
    })();
    return box;
  }
  // 관리자: 같이 올린 계산기 값(갱신이면 이전 값과 비교해 바뀐 것 표시)
  function inputsView(inputs, prev) {
    const rows = A.describeInputs ? A.describeInputs(inputs) : [];
    const before = prev ? new Map(A.describeInputs(prev).map(r => [r.c, r.txt])) : null;
    const changed = before ? rows.filter(r => before.has(r.c) && before.get(r.c) !== r.txt).length : 0;
    const box = el('details', { class: 'adm-inputs' }, el('summary', { text: `올린 계산기 값 보기 (${rows.length}개${before ? `, 바뀐 값 ${changed}개` : ''})` }));
    const tb = el('table', { class: 'adm-in-table' });
    let tab = '';
    for (const r of rows) {
      if (r.tab !== tab) { tab = r.tab; tb.append(el('tr', { class: 'grp' }, el('th', { colspan: '2', text: tab }))); }
      const old = before && before.has(r.c) && before.get(r.c) !== r.txt ? before.get(r.c) : null;
      tb.append(el('tr', { class: old ? 'chg' : '' }, el('td', { text: r.name }), el('td', { text: old ? `${old} → ${r.txt}` : r.txt })));
    }
    box.append(tb);
    return box;
  }
  // 관리자: 신청·갱신 사진을 계산기처럼 한 번 읽어서, 올린 값과 다른 상세 스탯을 띄움.
  // 한 장씩 차례로 읽고(엔진은 같이 씀), 읽은 결과는 이 탭을 닫기 전까지 기억해서 다시 읽지 않음
  const ocrMemo = new Map();
  let ocrQ = Promise.resolve();
  // 읽기 엔진(ocr.js)이 바뀌면 예전에 읽어 둔 결과는 안 씀: 주소의 ?v= 값(파일 내용으로 정해짐)을 열쇠에 넣음
  const ocrVer = (() => { const el = document.querySelector('script[src*="ocr.js"]'); const m = el && /[?&]v=(\w+)/.exec(el.src); return m ? m[1] : '0'; })();
  const ocrKey = (path) => 'silOcrChk.' + ocrVer + '.r2.' + path;
  function shotCheck(c, path, inputs) {
    const O = window.SilOCR;
    const box = el('div', { class: 'adm-ocr' }, el('span', { text: '사진 자동 확인: 차례를 기다리는 중' }));
    if (!path || !O || !O.recognize || !O.FIELDS) { box.hidden = true; return box; }
    const run = async () => {
      if (!box.isConnected) return; // 그새 승인·거절해서 목록에서 빠짐
      let res = ocrMemo.get(path);
      if (!res) { try { res = JSON.parse(sessionStorage.getItem(ocrKey(path)) || 'null'); } catch (e) { res = null; } }
      if (!res) {
        box.firstChild.textContent = '사진 자동 확인: 사진 읽는 중';
        const b = await shotBlob(c, path); if (!b) throw new Error('원본 사진을 열지 못했어요');
        const cv = await blobToCanvas(b);
        const r = await O.recognize(cv, null);
        res = {};
        const take = (rr) => { for (const [k, f] of Object.entries(rr.found || {})) if (!res[k] && f && typeof f.value === 'number') res[k] = { v: f.value, low: f.score < 0.8 || !!f.guessed }; };
        take(r);
        let atkList = r.atk || [];
        // 공격력·적응력 줄을 못 읽었으면: 공격력에 마우스를 올려 뜬 설명 창 때문에 창 위치를 아래쪽만 잡은 경우가 있어서,
        // 창 위쪽으로 넓힌 부분만 한 번 더 읽어 빈 칸을 채움
        if (r.rect && (!res.C11 || !res.C14)) {
          const R = r.rect, up = R.h * 0.35;
          const r2 = await O.recognize(cv, { x: Math.max(0, R.x - 20), y: Math.max(0, R.y - up), w: Math.min(cv.width - Math.max(0, R.x - 20), R.w + 40), h: up + R.h * 0.45 });
          take(r2); atkList = atkList.concat(r2.atk || []);
        }
        // 물리·마법 공격력이 둘 다 보이면 둘 다 남겨 둠(어느 쪽인지는 올린 세팅의 전직으로 고름)
        res.atk = {};
        for (const a of atkList) if (a.kind && (!res.atk[a.kind] || a.score > res.atk[a.kind].score)) res.atk[a.kind] = { v: a.value, low: a.score < 0.8, score: a.score };
        try { sessionStorage.setItem(ocrKey(path), JSON.stringify(res)); } catch (e) { /* 못 남겨도 됨 */ }
      }
      ocrMemo.set(path, res);
      showShotCheck(box, res, inputs || {});
    };
    ocrQ = ocrQ.then(() => new Promise(r => setTimeout(r, 0))).then(run)
      .catch(e => { console.warn(e); box.className = 'adm-ocr warn'; box.textContent = '사진 자동 확인을 못 했어요. ' + errMsg(e); });
    return box;
  }
  function showShotCheck(box, res, inp) {
    const O = window.SilOCR;
    const names = new Map((A.describeInputs ? A.describeInputs(inp) : []).map(r => [r.c, r.name]));
    const num = (v) => typeof v === 'number' ? v : (v === '' || v == null || !isFinite(+v) ? null : +v);
    const fmt = (v, pct) => v == null ? '없음' : pct ? `${+(v * 100).toFixed(2)}%` : fmtInt(v);
    const diff = [], miss = []; let same = 0;
    const atkT = A.atkTypeOf ? A.atkTypeOf(inp) : null; // 이 전직의 주 공격력(물리/마법)
    // 강배(체력 50% 초과)·역강배(체력 50% 이하) 수치가 12%p 이상 차이 나면 바지를 갈아입는 세팅:
    // 사진엔 입고 있던 바지 쪽만 나오고 다른 쪽은 계산기에 따로 적으니, 이 두 줄은 틀린 값으로 안 셈
    const big = (a, b) => a != null && b != null && Math.abs(a - b) >= 0.12 - 1e-9;
    // 사진 한 줄을 못 읽어도 알 수 있게 사진·올린 값의 강배-역강배 짝을 모두 보고, '강배 역강배 수치 동일'을 켠 세팅도 갈아입는 세팅으로 봄
    const pv = (c) => res[c] ? res[c].v : null, eq = inp._eq === true || inp._eq === 'true';
    const swap = eq || big(pv('C24'), pv('C25')) || big(num(inp.C24), num(inp.C25)) || big(pv('C24'), num(inp.C25)) || big(num(inp.C24), pv('C25'));
    const pants = [];
    let atkUnread = false; // 이 전직의 공격력을 사진에서 못 읽음(가장 중요한 칸이라 '같아요'라고 하지 않음)
    for (const f of O.FIELDS) {
      const c = f.cell; if (!c || c === 'C35') continue; // 동작속도는 계산에 안 씀
      const pct = f.kind === 'pct', up = num(inp[c]);
      let r = res[c], name = names.get(c) || (c === 'C11' ? '공격력' : c === 'C12' ? '극대화 범위 최댓값' : f.names[0]) || c;
      // 공격력은 전직에 맞는 줄(물리/마법)만 비교. 그 줄을 못 읽었으면 못 읽은 항목으로
      if (c === 'C11' && atkT && res.atk) { r = res.atk[atkT] || null; name = `${atkT} 공격력`; }
      if (!r && c === 'C11') {
        // 이 전직의 공격력 줄은 못 읽었는데, 올린 값이 사진의 반대 공격력(물리↔마법)과 같으면 바꿔 넣은 것
        const otherT = atkT === '마법' ? '물리' : atkT === '물리' ? '마법' : null, o = otherT && res.atk && res.atk[otherT];
        if (o && up != null && Math.abs(up - o.v) < 0.5) { diff.push({ name, up: fmt(up, pct), shot: '못 읽음', note: `올린 값이 사진의 ${otherT} 공격력과 같아요` }); continue; }
        atkUnread = true;
      }
      if (!r) { if (up) miss.push(name); continue; }
      if (up != null && Math.abs(up - r.v) < (pct ? 5e-6 : 0.5)) same++;
      else if (swap && (c === 'C24' || c === 'C25')) pants.push(`${name} 올린 ${fmt(up, pct)}, 사진 ${fmt(r.v, pct)}`);
      else diff.push({ name, up: fmt(up, pct), shot: fmt(r.v, pct), low: r.low });
    }
    box.innerHTML = '';
    if (!same && !diff.length && !pants.length) {
      box.className = 'adm-ocr warn';
      box.append(el('span', { text: '사진 자동 확인: 상세 스탯 창을 못 읽었어요. 사진을 직접 봐 주세요' }));
      return;
    }
    if (diff.length) {
      box.className = 'adm-ocr bad';
      const tb = el('table', {}, el('tr', {}, el('th', { text: '항목' }), el('th', { text: '올린 값' }), el('th', { text: '사진' })));
      for (const d of diff) tb.append(el('tr', {}, el('td', {}, d.name, d.note ? el('small', { text: d.note }) : d.low ? el('small', { text: ' 사진 글자가 흐려서 잘못 읽었을 수 있어요' }) : null), el('td', { class: 'v', text: d.up }), el('td', { class: 'v', text: d.shot })));
      box.append(el('b', { class: 't', text: `사진과 다른 값 ${diff.length}개` }), tb);
    } else if (atkUnread) {
      box.className = 'adm-ocr warn';
      box.append(el('b', { class: 't', text: '공격력을 사진에서 못 읽었어요. 사진에서 직접 확인해 주세요' }),
        el('span', { text: `읽은 상세 스탯 ${same}개는 올린 값과 같아요` }));
    } else {
      box.className = 'adm-ocr ok';
      const what = pants.length ? '바지 수치 말고 ' : '';
      box.append(el('span', { text: miss.length ? `사진 자동 확인: ${what}읽은 상세 스탯 ${same}개는 올린 값과 같아요` : `사진 자동 확인: ${what}상세 스탯 ${same}개가 올린 값과 모두 같아요` }));
    }
    if (pants.length) box.append(el('small', { class: 'miss', text: `강배·역강배 바지를 갈아입는 세팅(${eq ? '강배 역강배 수치 동일을 켬' : '두 수치 차이 12%p 이상'})이라 사진과 달라도 돼요: ${pants.join(' / ')}` }));
    if (miss.length) box.append(el('small', { class: 'miss', text: `사진에서 못 읽은 항목: ${miss.join(', ')}` }));
  }
  // 관리자: 신청·갱신한 세팅을 계산기에서 열어 실투력이 맞는지 확인
  function adminSetting(nick, cls, inputs) {
    return el('button', { type: 'button', class: 'btn', text: '계산기에서 세팅 보기', onclick: () => { setView('calc'); A.openShared({ n: cls, k: nick, i: inputs || {} }); } });
  }
  function genCode() { return 'SIL-' + String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)); }
  function genToken() {
    const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const b = crypto.getRandomValues(new Uint8Array(20)); let s = '';
    b.forEach((x, i) => { s += AL[x % 32]; if (i % 5 === 4 && i < 19) s += '-'; });
    return s;
  }

  // 사이트가 업데이트됐는데 예전 화면을 계속 띄워 두고 있으면(워터마크·갱신 방식이 예전 것) 랭킹을 열 때 새로 불러옴
  let freshAt = 0;
  async function checkFresh(view) {
    if (Date.now() - freshAt < 60000) return; freshAt = Date.now();
    try {
      const cur = [...document.scripts].map(x => x.src || '').find(u => /rank\.js\?v=/.test(u)); if (!cur) return;
      const html = await (await fetch(location.pathname + '?fresh=' + Date.now(), { cache: 'no-store' })).text();
      const m = html.match(/rank\.js\?v=([0-9a-f]+)/); if (!m || cur.endsWith('v=' + m[1])) return;
      if (sessionStorage.getItem('silReloaded') === m[1]) return;
      sessionStorage.setItem('silReloaded', m[1]);
      toast('사이트가 새로 바뀌어서 다시 불러와요');
      setTimeout(() => location.replace(location.pathname + '?' + view), 700);
    } catch (e) { /* 다음에 다시 */ }
  }

  // ---------- 화면 전환 ----------
  const views = $('#views'); views.hidden = false;
  function setView(v) {
    document.body.classList.toggle('view-rank', v === 'rank');
    document.body.classList.toggle('view-admin', v === 'admin');
    document.body.classList.toggle('view-avatar', v === 'avatar');
    document.body.classList.toggle('view-optchg', v === 'optchg');
    if ($('#ocView')) $('#ocView').hidden = v !== 'optchg';
    if (v === 'optchg' && window.SilOptChg && window.SilOptChg.show) window.SilOptChg.show();
    $('#rankView').hidden = v !== 'rank';
    if ($('#avView')) $('#avView').hidden = v !== 'avatar';
    if (v === 'avatar' && window.SilAvatar) window.SilAvatar.render();
    $('#adminView').hidden = v !== 'admin';
    for (const b of views.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false');
    if (v === 'rank') { checkFresh('rank'); markView(); loadRank(true); }
    if (v === 'admin') adminInit();
    window.scrollTo(0, 0);
  }
  views.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });

  // ---------- 랭킹 목록 ----------
  // 10등씩 쪽으로 나눠 보여 줌(이전·쪽 번호·다음)
  const PAGE = 10;
  let rkMode = 'all', rkCls = '', rkPage = 0, rkBusy = false, rkTotal = null, rkTotalFor = null;
  // 전체 인원: 실투력 -1보다 높은 사람 수(= 모두)를 순위 조회로 셈
  // 서버 요청 줄이기: 랭킹 볼 자격(10분)·내 순위·전체 인원(1분)은 잠깐 기억해 두고 다시 묻지 않음. 목록·상세는 서버가 매번 다시 확인함
  const FRESH = 60000, CAN_FRESH = 600000, totals = {};
  let canAt = 0, mineAt = 0;
  async function countRank(c) {
    const hit = totals[rkCls];
    if (hit && Date.now() - hit.at < FRESH) { rkTotal = hit.n; rkTotalFor = rkCls; return; }
    try {
      const { data, error } = await c.rpc('rank_pos', { p_cp: -1, p_cls: rkCls || null });
      if (error) throw error;
      const r = data && data[0]; if (!r) throw new Error('no');
      rkTotal = Math.max(0, (rkCls ? r.in_cls : r.overall) - 1); rkTotalFor = rkCls;
      totals[rkCls] = { n: rkTotal, at: Date.now() };
    } catch (e) { rkTotal = null; rkTotalFor = null; }
  }
  function drawPages(more) {
    const box = $('#rankPages'); box.textContent = '';
    const pages = rkTotal != null ? Math.max(1, Math.ceil(rkTotal / PAGE), rkPage + 1) : rkPage + 1 + (more ? 1 : 0);
    const span = window.matchMedia('(max-width: 520px)').matches ? 1 : 2;
    const show = new Set([0, pages - 1]);
    for (let i = rkPage - span; i <= rkPage + span; i++) if (i >= 0 && i < pages) show.add(i);
    let last = -1;
    const btn = (i) => box.append(el('button', { type: 'button', class: 'rk-pg' + (i === rkPage ? ' on' : ''), 'aria-current': i === rkPage ? 'page' : 'false', 'aria-label': `${i + 1}쪽 (${i * PAGE + 1}위부터)`, text: String(i + 1), onclick: () => goTo(i) }));
    for (const i of [...show].sort((a, b) => a - b)) {
      if (i - last === 2) btn(last + 1);
      else if (i - last > 2) box.append(el('span', { class: 'rk-gap', 'aria-hidden': 'true', text: '…' }));
      btn(i); last = i;
    }
    return pages;
  }
  async function loadRank(reset) {
    if (rkBusy) return; rkBusy = true;
    const list = $('#rankList'), empty = $('#rankEmpty'), pager = $('#rankPager');
    if (reset) { rkPage = 0; list.innerHTML = ''; pager.hidden = true; empty.hidden = false; empty.textContent = '불러오는 중이에요'; }
    else if (!list.children.length) { empty.hidden = false; empty.textContent = '불러오는 중이에요'; }
    let more = false;
    try {
      const c = await sb();
      if (reset) {
        let ok = Date.now() - canAt < CAN_FRESH;
        if (!ok) {
          // 갱신 코드도 관리자 로그인도 없으면 서버가 어차피 못 보게 하므로 묻지 않음
          let who = !!viewCodes();
          if (!who) { try { who = !!(await c.auth.getSession()).data.session; } catch (e) { who = false; } }
          if (who) { const { data, error: ve } = await c.rpc('can_view'); if (ve) throw ve; ok = !!data; }
          if (ok) canAt = Date.now();
        }
        $('#rankFilters').hidden = !ok;
        if (ok) { if (Date.now() - mineAt < FRESH) drawMine(); else loadMine(c); } else { mine = []; drawMine(); }
        if (!ok) {
          const wait = Object.values(A.ranks()).some(r => r && r.token && r.status === 'pending');
          const gone = Object.values(A.ranks()).find(r => r && (r.status === 'hidden' || r.status === 'removed'));
          const rej = Object.values(A.ranks()).find(r => r && r.status === 'rejected');
          empty.hidden = false;
          empty.textContent = gone ? `관리자가 랭킹에서 ${gone.status === 'hidden' ? '내려서' : '삭제해서'} 랭킹을 볼 수 없어요.${gone.memo ? ` 사유: ${gone.memo}` : ''}`
            : wait ? '신청을 확인하고 있어요. 관리자가 승인하면 랭킹을 볼 수 있어요.'
            : rej ? `랭킹 신청이 거절됐어요.${rej.memo ? ` 사유: ${rej.memo}` : ''} 다시 신청해서 승인되면 볼 수 있어요.`
            : '랭킹은 랭킹에 올라간 사람만 볼 수 있어요. 계산기에서 "랭킹에 올리기"로 신청해서 승인되면 볼 수 있어요. 다른 기기에서 승인받았다면 아래 "갱신 코드 입력"에 그때 받은 갱신 코드를 넣어 주세요.';
          pager.hidden = true; rkBusy = false; return;
        }
      }
      // 전직별인데 아직 전직을 안 골랐으면 목록 없이 안내만(검색해서 고르면 그 전직만 보여 줌)
      if (rkMode === 'cls' && !rkCls) {
        list.innerHTML = ''; pager.hidden = true; $('#rankPageNo').textContent = '';
        empty.hidden = false; empty.textContent = '위 검색 칸에 전직 이름을 적어서 고르면 그 전직 랭킹만 보여요';
        rkBusy = false; return;
      }
      // 한 명 더 받아서 다음 쪽이 있는지 알아봄
      const { data, error } = await c.rpc('rank_list', { p_cls: rkCls || null, p_offset: rkPage * PAGE, p_limit: PAGE + 1 });
      if (error) throw error;
      if (!data.length && rkPage > 0) { rkPage--; rkBusy = false; return loadRank(false); }
      if (reset || rkTotalFor !== rkCls) await countRank(c);
      more = data.length > PAGE;
      list.innerHTML = '';
      renderRows(data.slice(0, PAGE), rkPage * PAGE);
      if (rkPage === 0) {
        const gs = (rkCls ? [] : GOD_FIXED).concat((await loadGods(c)).filter((x) => !rkCls || x.cls === rkCls));
        for (const x of gs.slice().reverse()) list.prepend(godRow(x));
      }
      showGods();
      if (!reset) drawMine();
      empty.hidden = data.length > 0;
      if (!data.length) empty.textContent = rkCls ? `${rkCls} 랭킹에 아직 아무도 없어요` : '아직 올라온 캐릭터가 없어요. 계산기에서 "랭킹에 올리기"로 첫 번째가 되어 보세요';
    } catch (e) {
      canAt = 0; // 그사이 숨겨졌을 수 있으니 다음에는 다시 물음
      empty.hidden = false; empty.textContent = '랭킹을 불러오지 못했어요. ' + errMsg(e);
    }
    const n = list.querySelectorAll(':scope > li:not(.rk-god)').length;
    pager.hidden = !(rkPage > 0 || more);
    const pages = pager.hidden ? ($('#rankPages').textContent = '', 1) : drawPages(more);
    $('#btnRankPrev').disabled = rkPage === 0; $('#btnRankNext').disabled = !more;
    $('#rankPageNo').textContent = n ? `${rkPage * PAGE + 1}~${rkPage * PAGE + n}위` + (rkTotal != null ? ` · 전체 ${rkTotal}명` : '') : '';
    rkBusy = false;
  }
  // 1·2·3등은 금·은·동 왕관
  const CROWN = ['gold', 'silver', 'bronze'];
  function rankNo(n) {
    const box = el('span', { class: 'rk-no' + (n <= 3 ? ' crown ' + CROWN[n - 1] : ''), 'aria-label': `${n}위` });
    if (n <= 3) box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 8.6 7.6 12 12 5.6l4.4 6.4 4.4-3.4-1.7 8.9H4.9z"/><circle cx="3.2" cy="7.4" r="1.7"/><circle cx="12" cy="4.2" r="1.7"/><circle cx="20.8" cy="7.4" r="1.7"/><rect x="4.9" y="18.6" width="14.2" height="2.2" rx="1.1"/></svg>';
    box.append(el('span', { class: 'n', text: String(n) }));
    return box;
  }
  // 신: 관리자가 '신'으로 정한 캐릭터. 서버에서 숫자 순위·인원 수·내 순위 계산에서 빠짐.
  // 평소엔 숨겨 두고, 랭킹 제목 글자를 누르면 제목이 영롱해지면서 1위 위에 나타남(다시 누르면 숨김)
  let gods = [], godsAt = 0, godOn = false;
  // 서버 캐릭터가 아닌 고정 신(사진은 사이트 파일). 전체 랭킹에만 보임
  // focus: 사진 속 캐릭터 위치(가로·세로 비율). 사진을 열 때 강림 원이 여기서 터짐
  const GOD_FIXED = [{ id: 'god-ganadarap', nickname: '가나다랍', img: 'god.jpg', focus: [0.215, 0.6], halo: [0.211, 0.41] }];
  function fixedGodDetail(li, r, btnEl) {
    const open = li.classList.toggle('open');
    btnEl.setAttribute('aria-expanded', String(open));
    let box = li.querySelector('.rk-detail');
    if (!open) { if (box) box.hidden = true; return; }
    if (box) { box.hidden = false; godPhotoFx(box.querySelector('.rk-shot'), r.focus, r.halo); return; }
    const img = el('img', { alt: `${r.nickname} 스크린샷`, src: r.img });
    const shot = el('button', { type: 'button', class: 'rk-shot', 'aria-label': '사진 크게 보기' }, img);
    shot.onclick = () => lightbox(img.src, img.alt, true);
    box = el('div', { class: 'rk-detail god-detail' }, shot);
    li.append(box);
    img.decode().catch(() => {}).then(() => godPhotoFx(shot, r.focus, r.halo));
  }
  async function loadGods(c) {
    if (Date.now() - godsAt < FRESH) return gods;
    try { const { data, error } = await c.rpc('rank_gods'); if (error) throw error; gods = data || []; } catch (e) { gods = []; }
    godsAt = Date.now();
    return gods;
  }
  function godRow(r) {
    const li = el('li', { class: 'rk-god', 'data-id': r.id });
    const badge = el('span', { class: 'rk-no rk-god-no', 'aria-label': '신' });
    badge.innerHTML = '<svg viewBox="0 0 26 10" aria-hidden="true"><ellipse cx="13" cy="5" rx="10" ry="3.3"/></svg>';
    badge.append(el('span', { class: 'n', text: '0' }));
    li.append(el('button', { type: 'button', class: 'rk-row', 'aria-expanded': 'false', onclick: (e) => (r.img ? fixedGodDetail(li, r, e.currentTarget) : toggleDetail(li, r, e.currentTarget, true)) },
      badge,
      el('span', { class: 'rk-who' }, el('span', { class: 'rk-name', text: r.nickname }), el('span', { class: 'rk-meta' }, el('span', { text: '신' }))),
      el('span', { class: 'rk-cp' }, el('b', { text: '측정 불가' }))));
    li.hidden = !godOn;
    return li;
  }
  function showGods() {
    const rows = document.querySelectorAll('#rankList > li.rk-god');
    $('#rankTitle').classList.toggle('has-god', rows.length > 0); // 신이 있을 때만 제목에 가끔 빛이 지나감(눌러 보라는 힌트)
    $('#rankTitle').classList.toggle('god-on', godOn && rows.length > 0);
    rows.forEach((li) => { li.hidden = !godOn; li.classList.remove('leave'); });
  }
  // 빛가루: rect 안 아래쪽에서 피어올라 흩어짐
  // ---------- 신 연출(캔버스) ----------
  // 빛 알갱이·빛줄기·번개를 캔버스에 직접 그림(더하기 합성으로 빛나게). PC(넓은 화면)와 모바일(세로 화면)은 구성 자체를 다르게 함
  const bigFx = () => matchMedia('(min-width: 1024px)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };
  // 0→1→0 모양(시작 a, 다 차오름 b, 줄기 시작 c, 끝 d)
  const env = (t, a, b, c, d) => (t <= a || t >= d ? 0 : t < b ? ease.out((t - a) / (b - a)) : t <= c ? 1 : 1 - ease.inOut((t - c) / (d - c)));
  const SPR = new Map();
  function sprite(rgb, soft) {
    const key = rgb + (soft ? 's' : ''); if (SPR.has(key)) return SPR.get(key);
    const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    if (soft) { gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(0.5, `rgba(${rgb},.35)`); gr.addColorStop(1, `rgba(${rgb},0)`); }
    else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.32)`); gr.addColorStop(1, `rgba(${rgb},0)`); }
    g.fillStyle = gr; g.fillRect(0, 0, n, n); SPR.set(key, cv); return cv;
  }
  const GOLD = '255,206,110', WHITE = '255,246,226', LILAC = '196,170,255', ICE = '170,190,255', CYAN = '110,231,255', PINK = '255,120,214', DUST = '214,200,180';
  function stage(fx, life) {
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = el('canvas', { class: 'god-cv' }); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr); fx.append(cv);
    const S = { W, H, g, ps: [], draws: [], timers: [], t: 0 };
    S.at = (t, f) => S.timers.push({ t, f });
    S.draw = (f) => S.draws.push(f);
    S.add = (p) => { p.age = 0; S.ps.push(p); };
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, t - S.t)); S.t = t;
      for (const m of S.timers) if (!m.done && t >= m.t) { m.done = true; m.f(S); }
      g.clearRect(0, 0, W, H);
      for (const f of S.draws) { g.save(); f(g, t, dt); g.restore(); }
      for (let i = S.ps.length - 1; i >= 0; i--) {
        const p = S.ps[i]; p.age += dt;
        if (p.age >= p.life) { S.ps.splice(i, 1); continue; }
        if (p.to) { const k = ease.out(Math.min(1, p.age / p.life)); p.x = p.fx + (p.to[0] - p.fx) * k; p.y = p.fy + (p.to[1] - p.fy) * k; }
        else {
          const dr = Math.pow(p.drag ?? 0.985, dt * 60);
          p.vx = p.vx * dr + (p.ax || 0) * dt; p.vy = p.vy * dr + (p.grav || 0) * dt;
          if (p.sway) p.x += Math.sin(p.age * p.sway + p.ph) * p.swayA * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        const k = p.age / p.life;
        let a = (p.alpha ?? 1) * (k < (p.fin ?? 0.12) ? k / (p.fin ?? 0.12) : 1 - Math.pow((k - (p.fin ?? 0.12)) / (1 - (p.fin ?? 0.12)), 1.5));
        if (p.tw) a *= 0.55 + 0.45 * Math.sin(p.age * p.tw + p.ph);
        if (a <= 0.003) continue;
        const sz = p.size * (1 + (p.grow || 0) * k);
        g.globalAlpha = a; g.globalCompositeOperation = p.normal ? 'source-over' : 'lighter';
        if (p.draw) { g.save(); g.translate(p.x, p.y); p.draw(g, p, sz); g.restore(); }
        else g.drawImage(p.img, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (t < life) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return S;
  }
  // 빛 알갱이 터뜨리기
  function burst(S, n, x, y, o) {
    for (let i = 0; i < n; i++) {
      const ang = o.ang != null ? o.ang + rnd(-o.spread, o.spread) : rnd(0, Math.PI * 2), sp = rnd(o.sp[0], o.sp[1]);
      S.add({ x: x + rnd(-(o.jx || 0), o.jx || 0), y: y + rnd(-(o.jy || 0), o.jy || 0), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: rnd(o.size[0], o.size[1]), life: rnd(o.life[0], o.life[1]), img: sprite(o.colors[i % o.colors.length]), drag: o.drag ?? 0.95, grav: o.grav || 0,
        tw: o.tw ? rnd(8, 18) : 0, ph: rnd(0, 6), alpha: o.alpha ?? 1, fin: o.fin });
    }
  }
  // 지그재그 번개(중간점 흔들기) + 갈래
  function boltPath(x0, y0, x1, y1, disp, out) {
    if (disp < 3) { out.push([x1, y1]); return; }
    const mx = (x0 + x1) / 2 + rnd(-disp, disp), my = (y0 + y1) / 2 + rnd(-disp, disp) * 0.3;
    boltPath(x0, y0, mx, my, disp / 2, out); boltPath(mx, my, x1, y1, disp / 2, out);
  }
  function makeBolt(x0, y0, x1, y1, disp, branches) {
    const main = [[x0, y0]]; boltPath(x0, y0, x1, y1, disp, main);
    const all = [main];
    for (let i = 0; i < branches; i++) {
      const p = main[Math.floor(rnd(0.15, 0.7) * main.length)], len = rnd(60, 160), ang = Math.PI / 2 + rnd(-1.1, 1.1);
      const br = [[p[0], p[1]]]; boltPath(p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, disp * 0.35, br); all.push(br);
    }
    return all;
  }
  function drawBolt(g, paths, a, w) {
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [lw, col, al] of [[w * 7, '120,130,255', 0.10], [w * 3, '160,175,255', 0.28], [w * 1.4, '210,220,255', 0.7], [w * 0.6, '255,255,255', 1]]) {
      g.strokeStyle = `rgba(${col},${al * a})`;
      paths.forEach((pts, i) => { g.lineWidth = i ? lw * 0.5 : lw; g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); });
    }
  }
  // 위에서 내려오는 빛줄기 다발(부드러운 쐐기 여러 겹)
  function drawRays(g, ax, ay, tx, ty, n, spread, len, a, t, warm) {
    g.globalCompositeOperation = 'lighter';
    const base = Math.atan2(ty - ay, tx - ax);
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5, ang = base + f * spread + Math.sin(t * 0.9 + i * 1.7) * 0.02;
      const w = (0.018 + 0.022 * Math.abs(Math.sin(i * 2.3))) * (0.85 + 0.15 * Math.sin(t * 2 + i));
      const ex = ax + Math.cos(ang) * len, ey = ay + Math.sin(ang) * len;
      const gr = g.createLinearGradient(ax, ay, ex, ey);
      const al = a * (0.10 + 0.10 * Math.abs(Math.cos(i * 1.3)));
      gr.addColorStop(0, `rgba(${warm ? '255,236,190' : '220,230,255'},0)`); gr.addColorStop(0.55, `rgba(${warm ? '255,226,160' : '200,215,255'},${al})`); gr.addColorStop(1, `rgba(${warm ? '255,214,130' : '190,205,255'},0)`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(ax, ay);
      g.lineTo(ax + Math.cos(ang - w) * len, ay + Math.sin(ang - w) * len); g.lineTo(ax + Math.cos(ang + w) * len, ay + Math.sin(ang + w) * len); g.closePath(); g.fill();
    }
  }
  function bloom(g, x, y, rx, ry, rgb, a) {
    if (a <= 0) return;
    g.globalCompositeOperation = 'lighter'; g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${0.55 * a})`); gr.addColorStop(0.35, `rgba(${rgb},${0.18 * a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function ringDraw(g, x, y, r, sq, a, rgb, lw) {
    if (a <= 0) return;
    g.globalCompositeOperation = 'lighter'; g.save(); g.translate(x, y); g.scale(1, sq);
    for (const [k, al] of [[3, 0.12], [1.6, 0.3], [0.7, 0.9]]) { g.strokeStyle = `rgba(${rgb},${al * a})`; g.lineWidth = lw * k; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  // 아래 순서로 깔림: 어두운 막(CSS) → 캔버스. 신 줄·왕관·흔들림은 CSS 클래스로
  function shake(delay, hard) {
    const card = $('#rankView'); card.style.setProperty('--sd', `${delay}s`);
    card.classList.remove('god-shake', 'god-shake-hard'); void card.offsetWidth; card.classList.add(hard ? 'god-shake-hard' : 'god-shake');
    setTimeout(() => card.classList.remove('god-shake', 'god-shake-hard'), (delay + 0.9) * 1000);
  }
  const FX = {
    // 빛: PC는 높은 곳에서 넓게 퍼지는 빛줄기 다발과 가로 렌즈 빛, 모바일은 좁고 곧은 빛기둥
    light(fx, c) {
      const S = stage(fx, 3.2), rx = c.r.left + c.r.width / 2;
      S.draw((g, t) => {
        const a = env(t, 0.05, 0.6, 1.7, 3.0);
        if (c.big) drawRays(g, rx, -c.H * 0.35, rx, c.cy, 26, 0.95, c.cy + c.H * 0.75, a, t, true);
        else drawRays(g, c.cx, -60, c.cx, c.cy, 9, 0.22, c.cy + 260, a * 1.2, t, true);
        bloom(g, rx, c.cy, c.r.width * (c.big ? 0.75 : 0.9), c.r.height * 2.2, '255,214,140', env(t, 0.35, 0.6, 0.9, 2.4));
        if (c.big) { // 가로 렌즈 빛(애너모픽)
          const a2 = env(t, 0.4, 0.55, 0.8, 1.8); g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(0, 0, c.W, 0); gr.addColorStop(0, 'rgba(180,200,255,0)'); gr.addColorStop(0.5, `rgba(255,236,200,${0.5 * a2})`); gr.addColorStop(1, 'rgba(180,200,255,0)');
          g.fillStyle = gr; g.fillRect(0, c.cy - 1.5, c.W, 3);
        }
        ringDraw(g, c.cx, c.cy, 20 + ease.out(Math.min(1, Math.max(0, (t - 0.45) / 1.1))) * (c.big ? 520 : 220), 0.32, env(t, 0.45, 0.5, 0.6, 1.6), '255,226,160', 1.6);
      });
      S.at(0.45, () => burst(S, c.big ? 150 : 60, rx, c.cy, { sp: [40, c.big ? 380 : 200], size: [6, 16], life: [0.9, 2.2], colors: [GOLD, WHITE, GOLD, LILAC], drag: 0.95, grav: -25, tw: true, jx: c.r.width * 0.4, jy: 8 }));
      for (let i = 0; i < (c.big ? 26 : 12); i++) S.at(0.55 + i * 0.07, () => burst(S, c.big ? 4 : 3, rx, c.cy + 10, { ang: -Math.PI / 2, spread: 0.5, sp: [20, 70], size: [5, 11], life: [1.4, 2.4], colors: [GOLD, WHITE], drag: 0.99, grav: -12, tw: true, jx: c.r.width * 0.45, alpha: 0.85 }));
      shake(0.45, false);
      return 3200;
    },
    // 번개: PC는 여러 각도에서 세 번 내리치고 카드 둘레에 전기가 기어 다님, 모바일은 위에서 곧게 두 번
    thunder(fx, c) {
      const S = stage(fx, 2.6), strikes = c.big ? [0.22, 0.5, 0.86] : [0.25, 0.62];
      const shapes = strikes.map((st, i) => makeBolt(c.big ? c.cx + rnd(-c.W * 0.25, c.W * 0.25) : c.cx + rnd(-40, 60), -20, c.cx + rnd(-6, 6), c.cy, c.big ? 140 : 70, c.big ? 3 : 2));
      const arcs = [];
      S.draw((g, t) => {
        strikes.forEach((st, i) => {
          const dtt = t - st; if (dtt < 0 || dtt > 0.32) return;
          const a = (dtt < 0.05 ? 1 : 1 - (dtt - 0.05) / 0.27) * (Math.random() < 0.15 ? 0.4 : 1);
          if (Math.random() < 0.08 && dtt < 0.15) shapes[i] = makeBolt(shapes[i][0][0][0], -20, c.cx + rnd(-6, 6), c.cy, c.big ? 140 : 70, c.big ? 3 : 2);
          drawBolt(g, shapes[i], a, c.big ? 2.4 : 1.8);
          g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(200,210,255,${0.32 * a * (i ? 0.6 : 1)})`; g.fillRect(0, 0, c.W, c.H);
          bloom(g, c.cx, c.cy, 160, 90, '170,190,255', a);
        });
        // 카드 둘레를 기어 다니는 전기
        if (t > strikes[0] && t < strikes[0] + 1.6) {
          if (Math.random() < (c.big ? 0.55 : 0.35)) {
            const r = c.r, side = Math.floor(rnd(0, 4)), u = rnd(0, 1), v = Math.min(1, u + rnd(0.06, 0.18));
            const P = (q) => side === 0 ? [r.left + q * r.width, r.top] : side === 1 ? [r.right, r.top + q * r.height] : side === 2 ? [r.left + q * r.width, r.bottom] : [r.left, r.top + q * r.height];
            const [x0, y0] = P(u), [x1, y1] = P(v), pts = [[x0, y0]]; boltPath(x0, y0, x1, y1, 14, pts); arcs.push({ pts, t });
          }
          for (let i = arcs.length - 1; i >= 0; i--) { const age = t - arcs[i].t; if (age > 0.12) { arcs.splice(i, 1); continue; } drawBolt(g, [arcs[i].pts], 1 - age / 0.12, 0.9); }
        }
      });
      strikes.forEach((st) => S.at(st + 0.02, () => burst(S, c.big ? 70 : 34, c.cx, c.cy, { sp: [180, c.big ? 620 : 380], size: [4, 9], life: [0.25, 0.7], colors: [ICE, WHITE, CYAN], drag: 0.93, grav: 700, fin: 0.02 })));
      shake(strikes[0], true);
      return 2600;
    },
    // 하늘: 안개가 갈라지며 금빛이 새어 나오고 깃털이 내려옴. PC는 좌우로, 모바일은 위아래로 갈라짐
    heaven(fx, c) {
      const S = stage(fx, 4.4), rx = c.r.left + c.r.width / 2, n = c.big ? 46 : 24;
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0, x = c.big ? rx + rnd(-c.r.width * 0.55, c.r.width * 0.55) : rx + rnd(-c.r.width * 0.6, c.r.width * 0.6), y = c.cy + rnd(-c.r.height * 1.3, c.r.height * 1.3);
        const out = c.big ? (x < rx ? -1 : 1) : (y < c.cy ? -1 : 1);
        S.add({ x, y, vx: c.big ? out * rnd(40, 70) : rnd(-10, 10), vy: c.big ? rnd(-8, 4) : out * rnd(30, 55), ax: c.big ? out * rnd(90, 160) : 0, grav: c.big ? 0 : out * rnd(70, 120), drag: 1,
          size: rnd(c.big ? 180 : 120, c.big ? 360 : 230), life: rnd(2.4, 3.2), img: sprite(i % 3 ? '250,246,255' : '232,224,255', true), alpha: 0.9, normal: true, fin: 0.04, grow: 0.35 });
      }
      S.draw((g, t) => {
        const a = env(t, 0.5, 1.4, 2.6, 4.2);
        drawRays(g, rx, c.cy - (c.big ? 340 : 220), rx, c.cy + 400, c.big ? 18 : 9, c.big ? 2.2 : 1.6, c.big ? 900 : 520, a * 0.9, t, true);
        bloom(g, rx, c.cy, c.r.width * 0.7, c.r.height * 2.4, '255,220,140', a);
      });
      // 깃털: 좌우로 흔들리며 천천히 떨어짐
      const feather = (g, p, sz) => {
        g.rotate(Math.sin(p.age * 2.2 + p.ph) * 0.6 + p.rot);
        const l = sz, w = sz * 0.26, gr = g.createLinearGradient(-w, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(236,230,255,.55)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, -l / 2); g.quadraticCurveTo(w, -l / 6, w * 0.25, l / 2); g.quadraticCurveTo(0, l / 2.3, -w * 0.25, l / 2); g.quadraticCurveTo(-w, -l / 6, 0, -l / 2); g.fill();
        g.strokeStyle = 'rgba(210,200,240,.8)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -l / 2.2); g.lineTo(0, l * 0.62); g.stroke();
      };
      for (let i = 0; i < (c.big ? 22 : 10); i++) S.at(rnd(0.6, 1.8), () => S.add({ x: rnd(c.big ? c.W * 0.15 : 10, c.big ? c.W * 0.85 : c.W - 10), y: -30, vx: 0, vy: rnd(45, 85), drag: 1, sway: rnd(1.6, 2.6), swayA: rnd(30, 60), ph: rnd(0, 6), rot: rnd(-0.4, 0.4),
        size: rnd(c.big ? 26 : 20, c.big ? 38 : 28), life: rnd(2.6, 3.6), normal: true, alpha: 0.95, fin: 0.08, draw: feather }));
      S.at(0.9, () => burst(S, c.big ? 80 : 36, rx, c.cy, { sp: [20, 150], size: [5, 12], life: [1.2, 2.4], colors: [GOLD, WHITE], drag: 0.97, grav: -20, tw: true, jx: c.r.width * 0.4 }));
      return 4400;
    },
    // 차원 균열: 흩어진 빛 조각들이 날아와 신 줄로 모이며 나타남(글리치). PC는 화면 사방에서, 모바일은 위에서 쏟아짐
    glitch(fx, c) {
      const S = stage(fx, 2.6), r = c.r, cols = [CYAN, PINK, WHITE, LILAC], n = c.big ? 420 : 170;
      for (let i = 0; i < n; i++) {
        const tx = rnd(r.left + 6, r.right - 6), ty = rnd(r.top + 4, r.bottom - 4);
        const fx0 = c.big ? (Math.random() < 0.5 ? rnd(-40, c.W + 40) : (Math.random() < 0.5 ? -40 : c.W + 40)) : tx + rnd(-120, 120);
        const fy0 = c.big ? (Math.random() < 0.5 ? (Math.random() < 0.5 ? -40 : c.H + 40) : rnd(0, c.H)) : rnd(-80, r.top - 60);
        S.at(rnd(0, 0.25), (S2) => S2.add({ x: fx0, y: fy0, fx: fx0, fy: fy0, to: [tx, ty], life: rnd(0.55, 0.85), size: rnd(4, 9), alpha: 0.95, fin: 0.05,
          draw: (g, p, sz) => { g.fillStyle = `rgba(${cols[i % 4]},1)`; g.fillRect(-sz / 2, -sz / 2, sz, sz * 0.6); } }));
      }
      S.draw((g, t) => {
        // 가로 지지직 띠
        if (t < 1.3) {
          g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < (c.big ? 7 : 4); i++) if (Math.random() < 0.5) { const y = rnd(0, c.H), h = rnd(2, c.big ? 26 : 14); g.fillStyle = `rgba(${Math.random() < 0.5 ? CYAN : PINK},${rnd(0.05, 0.16)})`; g.fillRect(rnd(-50, c.W * 0.3), y, rnd(c.W * 0.3, c.W), h); }
        }
        // 위에서 아래로 훑는 스캔 빛
        const k = (t - 0.75) / 0.6; if (k > 0 && k < 1) { g.globalCompositeOperation = 'lighter'; const y = r.top - 20 + (r.height + 40) * k; const gr = g.createLinearGradient(0, y - 18, 0, y + 18); gr.addColorStop(0, 'rgba(110,231,255,0)'); gr.addColorStop(0.5, 'rgba(220,250,255,.55)'); gr.addColorStop(1, 'rgba(255,120,214,0)'); g.fillStyle = gr; g.fillRect(r.left - 40, y - 18, r.width + 80, 36); }
        bloom(g, r.left + r.width / 2, c.cy, r.width * 0.6, r.height * 1.6, '160,140,255', env(t, 0.7, 0.85, 1.0, 2.0));
      });
      const card = $('#rankView'); card.classList.add('god-jitter'); setTimeout(() => card.classList.remove('god-jitter'), 1200);
      return 2600;
    },
    // 쿵 착지: 신 줄이 떨어지며 먼지 구름과 파편이 튀고 충격파가 퍼짐. PC는 넓게, 모바일은 작고 위로
    slam(fx, c) {
      const S = stage(fx, 2.8), r = c.r, rx = r.left + r.width / 2, hit = 0.52;
      S.at(hit, () => {
        for (let i = 0; i < (c.big ? 40 : 18); i++) {
          const side = i % 2 ? 1 : -1;
          S.add({ x: side > 0 ? r.right - rnd(0, 40) : r.left + rnd(0, 40), y: r.bottom - rnd(0, 10), vx: side * rnd(c.big ? 120 : 50, c.big ? 520 : 220), vy: rnd(-70, -10), drag: 0.93, grav: -8,
            size: rnd(c.big ? 70 : 44, c.big ? 150 : 90), grow: 1.4, life: rnd(1.1, 1.9), img: sprite(DUST, true), alpha: 0.55, normal: true, fin: 0.04 });
        }
        for (let i = 0; i < (c.big ? 50 : 22); i++) {
          const rock = (g, p, sz) => { g.rotate(p.age * p.spin); g.fillStyle = 'rgba(120,108,96,1)'; g.fillRect(-sz / 2, -sz / 2, sz, sz * 0.7); };
          S.add({ x: rnd(r.left, r.right), y: r.bottom - 2, vx: rnd(-1, 1) * (c.big ? 380 : 170), vy: -rnd(140, c.big ? 420 : 300), grav: 1100, drag: 0.995, spin: rnd(-12, 12),
            size: rnd(3, 7), life: rnd(0.7, 1.2), alpha: 1, normal: true, fin: 0.02, draw: rock });
        }
        burst(S, c.big ? 50 : 22, rx, r.bottom, { ang: -Math.PI / 2, spread: 1.3, sp: [80, 300], size: [5, 10], life: [0.5, 1.1], colors: [WHITE, GOLD], drag: 0.94, grav: 300 });
      });
      S.draw((g, t) => {
        const k = (t - hit) / 0.9;
        if (k > 0 && k < 1) {
          ringDraw(g, rx, r.bottom, 10 + ease.out(k) * (c.big ? c.W * 0.55 : r.width * 0.75), 0.16, 1 - k, '255,244,226', 2.2);
          // 바닥에 닿는 순간 가로로 번쩍
          const a = Math.max(0, 1 - k * 4); g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(r.left - 80, 0, r.right + 80, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,250,235,${0.8 * a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(r.left - 80, r.bottom - 2, r.width + 160, 4);
        }
      });
      shake(hit, true);
      $('#rankList').classList.add('pushed');
      return 2800;
    },
    // 유성: 꼬리를 길게 끄는 유성이 떨어져 신 줄에 꽂힘. PC는 화면 끝에서 비스듬히 + 잔별똥, 모바일은 위에서 거의 수직으로
    meteor(fx, c) {
      const S = stage(fx, 3), hit = 0.68, sx = c.big ? c.W * 0.96 : c.cx + 90, sy = c.big ? -120 : -80, trail = [];
      S.draw((g, t) => {
        if (c.big) for (let i = 0; i < 7; i++) { // 잔별똥
          const t0 = 0.05 + i * 0.22, k = (t - t0) / 0.5; if (k <= 0 || k >= 1) continue;
          const x0 = c.W * (0.3 + 0.1 * i), y0 = -20, x1 = x0 - 260, y1 = 200 + i * 30, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
          const gr = g.createLinearGradient(x, y, x + 90, y - 70); gr.addColorStop(0, `rgba(255,240,210,${0.7 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,240,210,0)');
          g.globalCompositeOperation = 'lighter'; g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 90, y - 70); g.stroke();
        }
        const k = Math.min(1, Math.max(0, (t - 0.08) / (hit - 0.08)));
        if (t < hit + 0.02) {
          const e = k * k, x = sx + (c.cx - sx) * e, y = sy + (c.cy - sy) * e;
          trail.unshift([x, y]); if (trail.length > 26) trail.pop();
          g.globalCompositeOperation = 'lighter';
          trail.forEach(([tx, ty], i) => { const f = 1 - i / trail.length, sz = (c.big ? 90 : 60) * f; g.globalAlpha = 0.5 * f; g.drawImage(sprite(i < 4 ? WHITE : '255,170,90'), tx - sz / 2, ty - sz / 2, sz, sz); });
          g.globalAlpha = 1; const hz = c.big ? 70 : 48; g.drawImage(sprite(WHITE), x - hz / 2, y - hz / 2, hz, hz);
          if (Math.random() < 0.7) burst(S, 2, x, y, { sp: [20, 90], size: [3, 7], life: [0.3, 0.6], colors: ['255,170,90', GOLD], drag: 0.92, grav: 60 });
        }
        bloom(g, c.cx, c.cy, c.big ? 520 : 260, c.big ? 260 : 150, '255,210,150', env(t, hit, hit + 0.06, hit + 0.2, hit + 1.4));
        ringDraw(g, c.cx, c.cy, 14 + ease.out(Math.min(1, Math.max(0, (t - hit) / 1))) * (c.big ? 640 : 260), 0.3, env(t, hit, hit + 0.04, hit + 0.1, hit + 1), '255,226,180', 2);
      });
      S.at(hit, () => burst(S, c.big ? 170 : 70, c.cx, c.cy, { sp: [120, c.big ? 700 : 380], size: [4, 11], life: [0.5, 1.4], colors: [WHITE, GOLD, '255,150,80'], drag: 0.94, grav: 260 }));
      shake(hit, true);
      return 3000;
    },
    // 별자리: 밤하늘에 별이 하나씩 켜지고, 신 줄 둘레에 별을 이은 왕관(PC는 넓은 타원, 모바일은 위쪽 반원)이 그려진 뒤 줄로 모여듦
    stars(fx, c) {
      const S = stage(fx, 3.6), rx = c.r.left + c.r.width / 2, n = c.big ? 240 : 100;
      const field = Array.from({ length: n }, () => ({ x: rnd(0, c.W), y: rnd(0, c.H), s: rnd(2, c.big ? 7 : 5), at: rnd(0, 0.9), tw: rnd(2, 6), ph: rnd(0, 6) }));
      const k = c.big ? 9 : 7, pts = Array.from({ length: k }, (_, i) => {
        const a = c.big ? Math.PI * 2 * i / k - Math.PI / 2 : Math.PI + Math.PI * i / (k - 1);
        const rxx = c.big ? c.r.width * 0.62 : c.r.width * 0.5, ryy = c.big ? c.r.height * 2.4 : c.r.height * 2.2;
        return [rx + Math.cos(a) * rxx + rnd(-10, 10), c.cy + Math.sin(a) * ryy + rnd(-6, 6)];
      });
      S.draw((g, t) => {
        g.globalCompositeOperation = 'lighter';
        if (c.big) { bloom(g, c.W * 0.25, c.H * 0.3, 420, 260, '140,110,255', 0.35 * env(t, 0, 0.8, 2.6, 3.5)); bloom(g, c.W * 0.78, c.H * 0.62, 380, 240, '90,150,255', 0.3 * env(t, 0.2, 1, 2.6, 3.5)); }
        const fade = env(t, 0, 0.3, 2.6, 3.5);
        for (const st of field) { if (t < st.at) continue; const a = Math.min(1, (t - st.at) * 4) * fade * (0.5 + 0.5 * Math.sin(t * st.tw + st.ph)); g.globalAlpha = a; g.drawImage(sprite(st.s > 4 ? WHITE : ICE), st.x - st.s, st.y - st.s, st.s * 2, st.s * 2); }
        g.globalAlpha = 1;
        const gather = ease.inOut(Math.min(1, Math.max(0, (t - 1.65) / 0.35)));
        const P = pts.map(([x, y]) => [x + (rx - x) * gather, y + (c.cy - y) * gather]);
        const drawn = (t - 0.6) / 0.9 * (c.big ? k : k - 1);
        g.lineCap = 'round';
        for (let i = 0; i < (c.big ? k : k - 1); i++) {
          const f = Math.min(1, Math.max(0, drawn - i)); if (f <= 0) break;
          const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % k], la = (1 - gather) * fade;
          g.strokeStyle = `rgba(200,210,255,${0.22 * la})`; g.lineWidth = 6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); g.stroke();
          g.strokeStyle = `rgba(255,255,255,${0.85 * la})`; g.lineWidth = 1.2; g.stroke();
        }
        P.forEach(([x, y], i) => { const on = t > 0.6 + i * 0.1; if (!on) return; const z = (c.big ? 30 : 22) * (1 + 0.25 * Math.sin(t * 6 + i)); g.drawImage(sprite(i % 2 ? GOLD : WHITE), x - z / 2, y - z / 2, z, z); });
        bloom(g, rx, c.cy, c.r.width * 0.6, c.r.height * 2, '220,210,255', env(t, 1.8, 1.9, 2.1, 3.2));
      });
      S.at(1.95, () => burst(S, c.big ? 120 : 50, rx, c.cy, { sp: [60, c.big ? 420 : 220], size: [4, 10], life: [0.8, 1.8], colors: [WHITE, ICE, GOLD], drag: 0.95, grav: -10, tw: true, jx: c.r.width * 0.3 }));
      return 3600;
    },
    // 불꽃: 줄 아래에서 불길이 솟아 감싸고 불티가 날림. PC는 줄 너비 전체가 불벽, 모바일은 가운데에서 높이 치솟는 불기둥
    flame(fx, c) {
      const S = stage(fx, 3.2), r = c.r, rx = r.left + r.width / 2, FL = ['255,236,170', '255,170,70', '255,110,50', '255,70,40'];
      const emit = (n, life) => { for (let i = 0; i < n; i++) {
        const x = c.big ? rnd(r.left, r.right) : rx + rnd(-r.width * 0.22, r.width * 0.22) * (1 - Math.random() * 0.5);
        S.add({ x, y: r.bottom + rnd(-4, 10), vx: rnd(-20, 20), vy: -rnd(c.big ? 140 : 200, c.big ? 300 : 420), drag: 0.97, grav: -60, sway: rnd(4, 9), swayA: rnd(20, 50), ph: rnd(0, 6),
          size: rnd(c.big ? 34 : 30, c.big ? 70 : 60), grow: -0.7, life: rnd(life * 0.6, life), img: sprite(FL[Math.floor(Math.random() * 4)]), alpha: 0.75, fin: 0.06 }); } };
      for (let i = 0; i < 26; i++) S.at(0.05 + i * 0.045, () => emit(c.big ? 18 : 10, 0.9));
      for (let i = 0; i < 14; i++) S.at(1.2 + i * 0.1, () => burst(S, c.big ? 5 : 3, rx, r.bottom, { ang: -Math.PI / 2, spread: 0.7, sp: [30, 120], size: [3, 6], life: [1.2, 2], colors: ['255,180,90', GOLD], drag: 0.99, grav: -30, tw: true, jx: c.big ? r.width * 0.45 : r.width * 0.2 }));
      S.draw((g, t) => { bloom(g, rx, r.bottom - 10, c.big ? r.width * 0.7 : r.width * 0.5, c.big ? 160 : 220, '255,120,50', env(t, 0.05, 0.4, 1.3, 2.6)); });
      return 3200;
    },
    // 소용돌이: 빛 알갱이가 소용돌이치며 한 점으로 빨려 들어가 검은 핵이 생겼다가, 터지면서 신이 나타남
    vortex(fx, c) {
      const S = stage(fx, 2.9), rx = c.r.left + c.r.width / 2, pop = 1.05, n = c.big ? 320 : 140, R = c.big ? Math.max(c.W, c.H) * 0.55 : Math.max(c.W, c.H) * 0.5;
      for (let i = 0; i < n; i++) {
        const a0 = rnd(0, Math.PI * 2), r0 = rnd(R * 0.5, R), st = rnd(0, 0.35), col = [LILAC, CYAN, WHITE][i % 3];
        S.at(st, (S2) => S2.add({ x: rx, y: c.cy, life: pop - st, size: rnd(4, 10), img: sprite(col), fin: 0.1, alpha: 0.95,
          draw: (g, p, sz) => { const k = p.age / p.life, e = k * k, rr = r0 * (1 - e), ang = a0 + e * 7; g.drawImage(p.img, Math.cos(ang) * rr - sz / 2, Math.sin(ang) * rr * (c.big ? 0.55 : 0.9) - sz / 2, sz, sz); } }));
      }
      S.draw((g, t) => {
        const core = env(t, 0.45, 1.0, 1.02, 1.12), cr = (c.big ? 70 : 46) * Math.min(1, (t - 0.45) / 0.55);
        if (core > 0 && cr > 0) { g.globalCompositeOperation = 'source-over'; const gr = g.createRadialGradient(rx, c.cy, 0, rx, c.cy, cr); gr.addColorStop(0, `rgba(0,0,0,${core})`); gr.addColorStop(0.7, `rgba(10,0,30,${core})`); gr.addColorStop(0.86, `rgba(180,150,255,${0.9 * core})`); gr.addColorStop(1, 'rgba(180,150,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(rx, c.cy, cr, 0, Math.PI * 2); g.fill(); }
        bloom(g, rx, c.cy, c.big ? 600 : 280, c.big ? 300 : 200, '230,220,255', env(t, pop, pop + 0.04, pop + 0.12, pop + 1.1));
        ringDraw(g, rx, c.cy, 20 + ease.out(Math.min(1, Math.max(0, (t - pop) / 0.9))) * (c.big ? 760 : 300), c.big ? 0.4 : 0.6, env(t, pop, pop + 0.03, pop + 0.1, pop + 0.9), '220,210,255', 2.4);
      });
      S.at(pop, () => burst(S, c.big ? 200 : 80, rx, c.cy, { sp: [200, c.big ? 900 : 460], size: [4, 10], life: [0.5, 1.3], colors: [WHITE, LILAC, CYAN], drag: 0.93 }));
      shake(pop, true);
      return 2900;
    },
    // 오로라: 위쪽 하늘에 초록·청록·보랏빛 커튼이 일렁이며 내려오고, 빛 알갱이가 천천히 오름. PC는 가로로 넓게 세 겹, 모바일은 두 겹
    aurora(fx, c) {
      const S = stage(fx, 3.8), rx = c.r.left + c.r.width / 2;
      const bands = (c.big ? [[0.18, '120,255,190', 0], [0.28, '110,220,255', 2], [0.36, '190,140,255', 4]] : [[0.12, '120,255,190', 0], [0.22, '170,140,255', 3]]);
      S.draw((g, t) => {
        const a = env(t, 0.1, 1.0, 2.6, 3.7); if (a <= 0) return;
        g.globalCompositeOperation = 'lighter';
        for (const [by, rgb, ph] of bands) {
          const base = c.H * by, amp = c.big ? 46 : 26, hgt = c.big ? 220 : 160;
          for (let x = 0; x < c.W; x += c.big ? 5 : 4) {
            const y = base + Math.sin(x * 0.006 + t * 1.3 + ph) * amp + Math.sin(x * 0.017 - t * 0.9 + ph) * amp * 0.4;
            const h = hgt * (0.6 + 0.4 * Math.sin(x * 0.011 + t * 1.7 + ph));
            const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.25, `rgba(${rgb},${0.22 * a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = gr; g.fillRect(x, y, c.big ? 5 : 4, h);
          }
        }
        bloom(g, rx, c.cy, c.r.width * 0.6, c.r.height * 2, '150,240,220', env(t, 0.7, 1.1, 2, 3.4));
      });
      for (let i = 0; i < 20; i++) S.at(0.8 + i * 0.08, () => burst(S, c.big ? 5 : 3, rx, c.cy, { ang: -Math.PI / 2, spread: 0.9, sp: [20, 80], size: [4, 9], life: [1.4, 2.4], colors: ['150,255,210', WHITE, '190,160,255'], drag: 0.99, grav: -14, tw: true, jx: c.r.width * 0.45 }));
      return 3800;
    },
  };
  // 신 카드에서 사진을 열 때(다섯 가지 중 확률로 하나). 어떤 연출이든 끝나면 사진 속 머리 위에 후광이 떠 있음
  const PFX = {
    // 빛 번짐: 캐릭터 자리에서 빛이 번지며 사진이 드러남. PC는 알갱이가 나선으로 돌며 오르고 가로 렌즈 빛
    bloom(S, c) {
      S.draw((g, t) => {
        bloom(g, c.x, c.y, c.ir.width * (c.big ? 0.9 : 0.7), c.ir.height * (c.big ? 0.9 : 0.7), '255,222,150', env(t, 0.05, 0.45, 0.7, 2.0));
        ringDraw(g, c.x, c.y, 12 + ease.out(Math.min(1, Math.max(0, (t - 0.25) / 1.2))) * c.ir.width * (c.big ? 0.9 : 0.6), 1, env(t, 0.25, 0.3, 0.5, 1.5), '255,230,170', 1.4);
        if (c.big) { const a2 = env(t, 0.3, 0.45, 0.6, 1.4); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(c.x - 500, 0, c.x + 500, 0); gr.addColorStop(0, 'rgba(180,200,255,0)'); gr.addColorStop(0.5, `rgba(255,240,210,${0.55 * a2})`); gr.addColorStop(1, 'rgba(180,200,255,0)'); g.fillStyle = gr; g.fillRect(c.x - 500, c.y - 1.5, 1000, 3); }
      });
      const n = c.big ? 70 : 28;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, rad = rnd(c.ir.width * 0.06, c.ir.width * (c.big ? 0.26 : 0.2)), spin = rnd(1.6, 2.6) * (i % 2 ? 1 : -1), rise = rnd(40, c.big ? 160 : 90);
        S.at(rnd(0.2, 0.7), (S2) => S2.add({ x: c.x, y: c.y, life: rnd(1.3, 2.2), size: rnd(5, c.big ? 13 : 10), img: sprite(i % 3 ? GOLD : WHITE), tw: rnd(8, 16), ph: rnd(0, 6), fin: 0.1,
          draw: (g, p, sz) => { const k = p.age / p.life, ang = a0 + spin * p.age * 2, rr = rad * (0.4 + k); g.drawImage(p.img, Math.cos(ang) * rr - sz / 2, Math.sin(ang) * rr * 0.45 - rise * ease.out(k) - sz / 2, sz, sz); } }));
      }
    },
    // 플래시: 번쩍하고 사진이 즉석 사진처럼 하얗게 떴다가 색이 올라옴. 따뜻한 빛샘이 사진을 훑음
    flash(S, c) {
      S.draw((g, t) => {
        const fl = env(t, 0, 0.04, 0.08, 0.5); if (fl > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,255,255,${(c.big ? 0.75 : 0.6) * fl})`; g.fillRect(0, 0, c.W, c.H); }
        const k = (t - 0.35) / 1.1; if (k > 0 && k < 1) {
          g.save(); g.beginPath(); g.rect(c.ir.left, c.ir.top, c.ir.width, c.ir.height); g.clip(); g.globalCompositeOperation = 'lighter';
          const x = c.ir.left - c.ir.width * 0.4 + c.ir.width * 1.8 * ease.inOut(k), gr = g.createLinearGradient(x - 120, 0, x + 120, 0);
          gr.addColorStop(0, 'rgba(255,120,80,0)'); gr.addColorStop(0.45, 'rgba(255,170,90,.35)'); gr.addColorStop(0.55, 'rgba(255,220,170,.45)'); gr.addColorStop(1, 'rgba(255,120,200,0)');
          g.fillStyle = gr; g.fillRect(c.ir.left, c.ir.top, c.ir.width, c.ir.height); g.restore();
        }
      });
      if (c.big) S.at(0.05, () => burst(S, 40, c.ir.left + c.ir.width / 2, c.ir.top + c.ir.height / 2, { sp: [80, 300], size: [3, 7], life: [0.5, 1], colors: [WHITE, GOLD], drag: 0.92, jx: c.ir.width * 0.4, jy: c.ir.height * 0.4 }));
    },
    // 홀로그램 스캔: 위에서 아래로 청록 스캔선이 지나가며 사진이 그려짐. PC는 가로 잔상 띠도 함께
    scan(S, c) {
      S.draw((g, t) => {
        const k = Math.min(1, Math.max(0, (t - 0.1) / 1.2)); if (k <= 0 || k >= 1) return;
        const y = c.ir.top + c.ir.height * ease.inOut(k); g.globalCompositeOperation = 'lighter';
        const gr = g.createLinearGradient(0, y - 30, 0, y + 6); gr.addColorStop(0, 'rgba(110,231,255,0)'); gr.addColorStop(0.8, 'rgba(110,231,255,.35)'); gr.addColorStop(1, 'rgba(230,255,255,.95)');
        g.fillStyle = gr; g.fillRect(c.ir.left - 8, y - 30, c.ir.width + 16, 36);
        g.fillStyle = 'rgba(230,255,255,.9)'; g.fillRect(c.ir.left - (c.big ? 60 : 10), y, c.ir.width + (c.big ? 120 : 20), 1.5);
        if (c.big && Math.random() < 0.5) { g.fillStyle = `rgba(${Math.random() < 0.5 ? CYAN : PINK},.14)`; g.fillRect(c.ir.left, rnd(c.ir.top, y), c.ir.width, rnd(2, 8)); }
      });
      for (let i = 0; i < 12; i++) S.at(0.1 + i * 0.1, () => { const y = c.ir.top + c.ir.height * ease.inOut(Math.min(1, (S.t - 0.1) / 1.2)); burst(S, c.big ? 5 : 3, c.ir.left + rnd(0, c.ir.width), y, { sp: [20, 90], size: [3, 6], life: [0.4, 0.8], colors: [CYAN, WHITE], drag: 0.9 }); });
    },
    // 물결: 캐릭터 자리에서 물결 고리가 여러 겹 퍼지며 사진이 출렁이다 가라앉음
    ripple(S, c) {
      S.draw((g, t) => {
        for (let i = 0; i < (c.big ? 5 : 3); i++) {
          const k = (t - 0.1 - i * 0.22) / 1.3; if (k <= 0 || k >= 1) continue;
          ringDraw(g, c.x, c.y, 8 + ease.out(k) * c.ir.width * (c.big ? 1.1 : 0.8), 0.55, (1 - k) * 0.9, i % 2 ? '170,220,255' : '255,240,210', 1.2);
        }
        bloom(g, c.x, c.y, c.ir.width * 0.5, c.ir.height * 0.4, '170,220,255', env(t, 0.05, 0.3, 0.6, 1.6));
      });
      S.at(0.2, () => burst(S, c.big ? 40 : 18, c.x, c.y, { ang: -Math.PI / 2, spread: 0.8, sp: [60, 200], size: [3, 7], life: [0.6, 1.2], colors: ['200,235,255', WHITE], drag: 0.95, grav: 220 }));
    },
    // 조각 맞춤(드묾): 사진이 조각조각 흩어진 채 날아와 제자리에 맞춰지고 이음새가 반짝임
    shards(S, c) {
      const img = c.img; if (!img || !img.naturalWidth) return;
      const cols = c.big ? 9 : 6, rows = c.big ? 7 : 5, tw = c.ir.width / cols, th = c.ir.height / rows, sw = img.naturalWidth / cols, sh = img.naturalHeight / rows, tiles = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) tiles.push({ i, j, dx: rnd(-1, 1) * (c.big ? 420 : 160), dy: rnd(-1, 1) * (c.big ? 300 : 200), rot: rnd(-1.2, 1.2), d: rnd(0, 0.35) });
      S.draw((g, t) => {
        const hold = env(t, 0, 0.01, 1.5, 2.3); if (hold <= 0) return;
        g.globalCompositeOperation = 'source-over';
        for (const q of tiles) {
          const k = ease.out(Math.min(1, Math.max(0, (t - q.d) / 0.85))), x = c.ir.left + q.i * tw, y = c.ir.top + q.j * th;
          g.save(); g.globalAlpha = Math.min(1, k * 2) * hold; g.translate(x + tw / 2 + q.dx * (1 - k), y + th / 2 + q.dy * (1 - k)); g.rotate(q.rot * (1 - k));
          g.drawImage(img, q.i * sw, q.j * sh, sw, sh, -tw / 2 - 0.5, -th / 2 - 0.5, tw + 1, th + 1); g.restore();
        }
        const seam = env(t, 1.05, 1.12, 1.2, 1.7); if (seam > 0) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = `rgba(255,240,200,${0.8 * seam})`; g.lineWidth = 1;
          for (let i = 1; i < cols; i++) { g.beginPath(); g.moveTo(c.ir.left + i * tw, c.ir.top); g.lineTo(c.ir.left + i * tw, c.ir.bottom); g.stroke(); }
          for (let j = 1; j < rows; j++) { g.beginPath(); g.moveTo(c.ir.left, c.ir.top + j * th); g.lineTo(c.ir.right, c.ir.top + j * th); g.stroke(); } }
      });
      S.at(1.1, () => burst(S, c.big ? 60 : 24, c.ir.left + c.ir.width / 2, c.ir.top + c.ir.height / 2, { sp: [40, 220], size: [3, 8], life: [0.5, 1.1], colors: [GOLD, WHITE], drag: 0.94, jx: c.ir.width * 0.45, jy: c.ir.height * 0.45 }));
    },
  };
  // 나오는 확률(가중치). 드문 연출일수록 작음
  const FX_W = { light: 18, slam: 15, thunder: 13, glitch: 11, heaven: 10, flame: 9, meteor: 8, aurora: 7, vortex: 5, stars: 4 };
  const PFX_W = { bloom: 34, flash: 26, scan: 18, ripple: 14, shards: 8 };
  const FX_NAME = { light: '빛기둥', slam: '쿵 착지', thunder: '번개', glitch: '차원 균열', heaven: '하늘 문', flame: '불꽃', meteor: '유성', aurora: '오로라', vortex: '소용돌이', stars: '별자리' };
  const PFX_NAME = { bloom: '빛 번짐', flash: '플래시', scan: '홀로그램 스캔', ripple: '물결', shards: '조각 맞춤' };
  function pickW(w, last) {
    const ks = Object.keys(w).filter((k) => k !== last), tot = ks.reduce((a, k) => a + w[k], 0);
    let x = Math.random() * tot; for (const k of ks) { x -= w[k]; if (x <= 0) return k; } return ks[ks.length - 1];
  }
  let lastPfx = null;
  function godPhotoFx(shot, focus, halo) {
    if (!shot) return;
    const img = shot.querySelector('img'), f = focus || [0.5, 0.5];
    shot.style.setProperty('--fx', `${(f[0] * 100).toFixed(1)}%`); shot.style.setProperty('--fy', `${(f[1] * 100).toFixed(1)}%`);
    if (halo && img && !shot.querySelector('.god-halo')) {
      const h = el('span', { class: 'god-halo', 'aria-hidden': 'true' }); shot.append(h);
      const place = () => { const sr = shot.getBoundingClientRect(), ir = img.getBoundingClientRect(); h.style.left = `${ir.left - sr.left + ir.width * halo[0]}px`; h.style.top = `${ir.top - sr.top + ir.height * halo[1]}px`; h.style.setProperty('--hw', `${Math.max(22, ir.width * 0.075)}px`); };
      place(); addEventListener('resize', place);
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { logEgg('photo'); return; }
    const kind = PFX[window.__godPfx] ? window.__godPfx : pickW(PFX_W, lastPfx); lastPfx = kind;
    logEgg('photo:' + kind);
    for (const k of Object.keys(PFX)) shot.classList.remove('pfx-' + k);
    void shot.offsetWidth; shot.classList.add('pfx-' + kind);
    const big = bigFx(), ir = img ? img.getBoundingClientRect() : shot.getBoundingClientRect();
    const c = { big, ir, img, x: ir.left + ir.width * f[0], y: ir.top + ir.height * f[1], W: innerWidth, H: innerHeight };
    const fx = el('div', { class: 'god-fx soft' + (big ? ' big' : ''), 'aria-hidden': 'true' });
    fx.style.setProperty('--x', `${c.x}px`); fx.style.setProperty('--y', `${c.y}px`);
    document.body.append(fx);
    PFX[kind](stage(fx, 2.6), c);
    fx.style.animationDuration = '2.6s';
    setTimeout(() => { fx.remove(); shot.classList.remove('pfx-' + kind); }, 2600);
  }
    let lastFx = null;
  function godFx(li) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { logEgg('reveal'); return; }
    const kind = FX[window.__godFx] ? window.__godFx : pickW(FX_W, lastFx);
    lastFx = kind;
    logEgg('reveal:' + kind);
    // 번개·유성·빛 고리가 꽂히는 곳: 줄 가운데의 신 이름
    const r = li.getBoundingClientRect(), nm = (li.querySelector('.rk-who') || li).getBoundingClientRect();
    const c = { r, cx: nm.left + nm.width / 2, cy: r.top + r.height / 2, big: bigFx(), W: innerWidth, H: innerHeight };
    const fx = el('div', { class: `god-fx fx-${kind}` + (c.big ? ' big' : ''), 'aria-hidden': 'true' });
    fx.style.setProperty('--x', `${c.cx}px`); fx.style.setProperty('--y', `${c.cy}px`);
    // 화면은 어둡게, 신 줄만 타원 조명으로 밝게
    fx.style.setProperty('--sx', `${r.left + r.width / 2}px`); fx.style.setProperty('--sy', `${c.cy}px`);
    fx.style.setProperty('--sw', `${Math.round(r.width * 0.62)}px`); fx.style.setProperty('--sh', `${Math.round(r.height * 1.6)}px`);
    document.body.append(fx);
    const life = FX[kind](fx, c);
    fx.style.animationDuration = `${life / 1000}s`; // 어두운 막도 연출 길이에 맞춰 걷힘
    li.classList.add('fx-' + kind);
    const list = $('#rankList'); list.classList.add('bow');
    setTimeout(() => { fx.remove(); li.classList.remove('fx-' + kind); list.classList.remove('bow', 'pushed'); }, life);
  }
  // 이스터에그를 본 기록(관리자 열람 기록 탭에서 누가 몇 번 봤는지 보임). 실패해도 그만
  const eggLogged = {};
  function logEgg(what) {
    if (eggLogged[what] && Date.now() - eggLogged[what] < 60000) return;
    eggLogged[what] = Date.now();
    sb().then((c) => c.rpc('log_egg', { p_what: what })).catch(() => {});
  }
  $('#rankTitle').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#rankList > li.rk-god')];
    if (!rows.length) return;
    godOn = !godOn;
    if (godOn) { showGods(); godFx(rows[0]); return; }
    // 숨길 때는 위로 스르륵 사라짐
    $('#rankTitle').classList.remove('god-on');
    rows.forEach((li) => li.classList.add('leave'));
    setTimeout(showGods, 280);
  });
  // 지금 계산 방식(A.calcVer) 전에 올린 기록: 다시 갱신하면 사라짐
  const oldCalc = (r) => !!A.calcVer && (r.calc ?? null) !== A.calcVer();
  function renderRows(rows, start) {
    const me = new Set(Object.values(A.ranks()).filter(r => r && r.status === 'approved').map(r => String(r.nickname).toLowerCase()));
    const myIds = new Set(mine.map(m => m.id));
    const list = $('#rankList');
    rows.forEach((r, i) => {
      const n = start + i + 1, mine1 = myIds.has(r.id) || me.has(r.nickname.toLowerCase());
      const li = el('li', { class: [mine1 ? 'me' : '', n <= 3 ? `top top${n}` : ''].join(' ').trim(), 'data-id': r.id });
      li.append(
        el('button', { type: 'button', class: 'rk-row', 'aria-expanded': 'false', onclick: (e) => toggleDetail(li, r, e.currentTarget) },
          rankNo(n),
          el('span', { class: 'rk-who' },
            el('span', { class: 'rk-name', text: r.nickname }),
            el('span', { class: 'rk-meta' }, el('span', { text: r.cls }), el('span', { text: ago(r.updated_at) }), oldCalc(r) ? el('span', { class: 'rk-old', text: '실투력 업데이트 전 지표' }) : null)),
          el('span', { class: 'rk-cp' }, el('b', { text: fmtInt(r.cp) }), el('small', { text: korUnit(r.cp) }))));
      list.append(li);
    });
  }
  // 펼친 줄: 지금 실투력을 낸 스크린샷 + 계산기에서 세팅 보기
  // 강렬:초월 점유율 설명 (랭킹 상세·관리자 화면)
  const nf = (v) => String(Math.round(Number(v) * 100) / 100);
  function shareText(i) {
    i = A.migrate ? A.migrate(i) : (i || {});
    if (i.A_B4 === true) return `${nf(i.A_B7 ?? 65)} : ${nf(i.A_B6 ?? 35)} (${/이후/.test(i.A_B5 || '') ? '딜 미터로 잰 비율' : '감으로 넣은 비율'})`;
    return `자동 (${Number(i.C29) > Number(i.C30) ? '강렬' : '초월'} 주력)`;
  }
  async function playerDetail(c, r) {
    if (r.inputs) return r;
    const { data, error } = await c.rpc('rank_detail', { p_id: r.id });
    if (error) throw error;
    const d = (data && data[0]) || {};
    r.inputs = d.inputs || {}; r.shot_path = d.shot_path || null;
    return r;
  }
  async function playerInputs(c, r) { return (await playerDetail(c, r)).inputs; }
  // 보는 사람 표시(워터마크): 캡처가 퍼지면 누가 봤는지 알 수 있게
  function viewerName() {
    const rs = Object.values(A.ranks()).filter(x => x && x.token && x.status === 'approved');
    const cur = A.rank && A.rank(A.key());
    const me = (cur && cur.status === 'approved' && cur.nickname) || (rs[0] && rs[0].nickname);
    return me || '관리자';
  }
  // 그림 워터마크용 짧은 두 줄(작게 잘라 낸 캡처에도 한 벌이 통째로 들어가게): 닉네임 / 월.일 시:분
  function stampLines() {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return [viewerName(), `${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`];
  }
  function stamp() {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${viewerName()}  ${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  // 사진을 못 받아 와서 픽셀에 못 박을 때만 쓰는 흐린 겹침 글자
  function watermark() {
    const t = stamp(), w = el('div', { class: 'wm', 'aria-hidden': 'true' });
    for (let i = 0; i < 24; i++) w.append(el('span', { text: t }));
    return w;
  }
  // 눈에 안 보이는 워터마크(사진): 보는 사람마다 다른 무늬를 사진 전체에 깔아 둠.
  // 무늬는 '보는 사람 닉네임 + 사진 경로'로 정해지는 ±1 격자(칸 크기 B)를 부드럽게 이은 것이고, 파랑만 아주 조금(어두운 곳 1.5칸, 밝은 곳 5칸) 바꿈.
  // 휴대폰으로 다시 찍거나 줄이고 다시 저장해도 큰 무늬라서 남고, 관리자 화면에서 원본과 맞대어 보면 누구 무늬인지 가려낼 수 있음
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const fnv32 = (s) => { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const WM_B = (w) => Math.max(8, Math.round(w / 120));
  function wmGrid(key, w, h) {
    const B = WM_B(w), gw = Math.ceil(w / B) + 2, gh = Math.ceil(h / B) + 2, r = mulberry(fnv32('silwm|' + key)), v = new Int8Array(gw * gh);
    for (let i = 0; i < v.length; i++) v[i] = r() < 0.5 ? -1 : 1;
    return { B, gw, gh, v };
  }
  const wmAmp = (R, G, Bl) => 1 + 2.5 * ((R * 0.299 + G * 0.587 + Bl * 0.114) / 255);
  function bakeCanvas(cv, key) {
    const w = cv.width, h = cv.height, g = cv.getContext('2d', { willReadFrequently: true });
    const img = g.getImageData(0, 0, w, h), d = img.data, { B, gw, v } = wmGrid(key, w, h);
    for (let y = 0; y < h; y++) {
      const fy = y / B, gy = Math.floor(fy), ty = fy - gy;
      for (let x = 0; x < w; x++) {
        const fx = x / B, gx = Math.floor(fx), tx = fx - gx, k = gy * gw + gx;
        const p = (v[k] * (1 - tx) + v[k + 1] * tx) * (1 - ty) + (v[k + gw] * (1 - tx) + v[k + gw + 1] * tx) * ty;
        const i = (y * w + x) * 4, a = wmAmp(d[i], d[i + 1], d[i + 2]);
        d[i + 2] = Math.max(0, Math.min(255, Math.round(d[i + 2] + a * p)));
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  async function bakeShot(url, key) {
    try {
      const res = await fetch(url); if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
      cv.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
      bakeCanvas(cv, key);
      const out = await new Promise(r => cv.toBlob(r, 'image/png'));
      return out ? URL.createObjectURL(out) : null;
    } catch (e) { console.warn(e); return null; }
  }

  // ---------- 퍼진 캡처에서 무늬 주인 찾기 ----------
  // 1) 캡처 안에서 원본 사진이 어디에 얼마 크기로 들어 있는지 찾음(위상 상관, 크기를 바꿔 가며) → 2) 그 자리의 원본을 빼서 남은 파랑 차이만 모음
  // 3) 후보(랭킹 캐릭터 닉네임 + 관리자)마다 무늬를 만들어 남은 차이와 얼마나 같은지 점수(z)로 비교. 진짜 본 사람은 z가 다른 사람보다 훨씬 큼
  function fft1(re, im, n, inv) {
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function fft2(re, im, W, H, inv) {
    const r = new Float64Array(Math.max(W, H)), i2 = new Float64Array(Math.max(W, H));
    for (let y = 0; y < H; y++) { const o = y * W; fft1(re.subarray(o, o + W), im.subarray(o, o + W), W, inv); }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) { r[y] = re[y * W + x]; i2[y] = im[y * W + x]; }
      fft1(r, i2, H, inv);
      for (let y = 0; y < H; y++) { re[y * W + x] = r[y]; im[y * W + x] = i2[y]; }
    }
  }
  const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
  // 캔버스를 w×h로 줄여 밝기 기울기 크기(테두리 강조)로
  function gradOf(src, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), G = new Float32Array(w * h);
    for (let j = 0; j < w * h; j++) L[j] = d[j * 4] * 0.3 + d[j * 4 + 1] * 0.59 + d[j * 4 + 2] * 0.11;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x; G[j] = Math.abs(L[j + 1] - L[j - 1]) + Math.abs(L[j + w] - L[j - w]); }
    return G;
  }
  // 캡처(leak) 안에서 원본(orig)이 놓인 자리: { s(원본→캡처 배율), tx, ty, q(맞는 정도) }
  async function locate(orig, leak, tick, coarse) {
    const M0 = coarse ? 160 : 256, f = M0 / Math.max(leak.width, leak.height);
    const lw = Math.max(8, Math.round(leak.width * f)), lh = Math.max(8, Math.round(leak.height * f));
    const GL = gradOf(leak, lw, lh);
    let best = null;
    const ws = []; for (let wpx = 0.12 * Math.max(lw, lh); wpx <= 1.7 * Math.max(lw, lh); wpx *= coarse ? 1.06 : 1.035) ws.push(wpx);
    for (let n = 0; n < ws.length; n++) {
      const ow = Math.max(6, Math.round(ws[n] * orig.width / Math.max(orig.width, orig.height))), oh = Math.max(6, Math.round(ws[n] * orig.height / Math.max(orig.width, orig.height)));
      const W = pow2(lw + ow), H = pow2(lh + oh);
      if (W * H > (1 << 19)) continue;
      const GO = gradOf(orig, ow, oh);
      const ar = new Float64Array(W * H), ai = new Float64Array(W * H), br = new Float64Array(W * H), bi = new Float64Array(W * H);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) ar[y * W + x] = GL[y * lw + x];
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) br[y * W + x] = GO[y * ow + x];
      fft2(ar, ai, W, H, false); fft2(br, bi, W, H, false);
      for (let k = 0; k < W * H; k++) { const r = ar[k] * br[k] + ai[k] * bi[k], im = ai[k] * br[k] - ar[k] * bi[k], m = Math.hypot(r, im) + 1e-9; ar[k] = r / m; ai[k] = im / m; }
      fft2(ar, ai, W, H, true);
      let pk = -Infinity, px = 0, py = 0;
      for (let k = 0; k < W * H; k++) if (ar[k] > pk) { pk = ar[k]; px = k % W; py = (k / W) | 0; }
      pk /= W * H;
      if (px > W / 2) px -= W; if (py > H / 2) py -= H;
      if (!best || pk > best.pk) best = { pk, s: ow / orig.width / f, tx: px / f, ty: py / f };
      if (tick && n % 6 === 0) { tick(n / ws.length); await new Promise(r => setTimeout(r, 0)); }
    }
    if (!best) return null;
    if (coarse) return best;
    // 크게 놓고 다듬기: 배율 ±3%, 자리 ±3칸(캡처 해상도 절반)
    const k2 = Math.min(1, 900 / Math.max(leak.width, leak.height)), lw2 = Math.round(leak.width * k2), lh2 = Math.round(leak.height * k2);
    const G2 = gradOf(leak, lw2, lh2);
    const goOf = (s) => { const ow = Math.round(orig.width * s * k2), oh = Math.round(orig.height * s * k2); return ow < 8 || oh < 8 ? null : { ow, oh, G: gradOf(orig, ow, oh) }; };
    const ncc = (go, tx, ty) => {
      if (!go) return -1;
      const { ow, oh, G: GO } = go, ox = Math.round(tx * k2), oy = Math.round(ty * k2);
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
      for (let y = 2; y < oh - 2; y += 2) { const yy = y + oy; if (yy < 1 || yy >= lh2 - 1) continue; for (let x = 2; x < ow - 2; x += 2) { const xx = x + ox; if (xx < 1 || xx >= lw2 - 1) continue; const a = GO[y * ow + x], b = G2[yy * lw2 + xx]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++; } }
      if (n < 200) return -1;
      const cv = sab / n - sa / n * sb / n, va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
      return cv / Math.sqrt(va * vb + 1e-9);
    };
    let cur = { s: best.s, tx: best.tx, ty: best.ty, q: ncc(goOf(best.s), best.tx, best.ty) };
    for (const step of [0.012, 0.004]) {
      for (let it = 0; it < 6; it++) {
        let moved = false; const base = cur;
        for (const ds of [-step, 0, step]) {
          const s = base.s * (1 + ds), go = goOf(s);
          for (const dy of [-2, -1, 0, 1, 2]) for (const dx of [-2, -1, 0, 1, 2]) {
            if (!ds && !dx && !dy) continue;
            const tx = base.tx + dx / k2, ty = base.ty + dy / k2, q = ncc(go, tx, ty);
            if (q > cur.q + 1e-4) { cur = { s, tx, ty, q }; moved = true; }
          }
        }
        if (!moved) break;
        if (tick) { await new Promise(r => setTimeout(r, 0)); }
      }
    }
    return cur;
  }
  // 자리를 찾은 뒤: 캡처 해상도에서 원본을 겹쳐 빼고, 남은 파랑 차이를 무늬 격자 칸마다 모음
  function residualGrid(orig, leak, at) {
    const W = leak.width, H = leak.height, s = at.s;
    const ow = Math.round(orig.width * s), oh = Math.round(orig.height * s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(orig, Math.round(at.tx), Math.round(at.ty), ow, oh);
    const O = g.getImageData(0, 0, W, H).data, Ld = leak.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const x0 = Math.max(1, Math.round(at.tx)), y0 = Math.max(1, Math.round(at.ty)), x1 = Math.min(W - 1, Math.round(at.tx) + ow - 1), y1 = Math.min(H - 1, Math.round(at.ty) + oh - 1);
    // 캡처의 색이 조금 다를 수 있어(화면 색 보정·감마) 원본 파랑 → 캡처 파랑 대응표를 만들어 맞춤(테두리처럼 크게 바뀌는 곳은 빼고)
    const lum = (A, i) => A[i] * 0.3 + A[i + 1] * 0.59 + A[i + 2] * 0.11;
    const gradAt = (i) => Math.abs(lum(O, i + 4) - lum(O, i - 4)) + Math.abs(lum(O, i + W * 4) - lum(O, i - W * 4));
    const NB = 64, bs = new Float64Array(NB), bn = new Float64Array(NB);
    let n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * W + x) * 4; if (gradAt(i) > 12) continue; const k = O[i + 2] >> 2; bs[k] += Ld[i + 2]; bn[k]++; n++; }
    if (n < 500) return null;
    const ctr = [], val = [];
    for (let k = 0; k < NB; k++) if (bn[k] >= 8) { ctr.push(k * 4 + 1.5); val.push(bs[k] / bn[k]); }
    if (ctr.length < 2) return null;
    const lut = new Float64Array(256);
    for (let v = 0; v < 256; v++) {
      let k = 0; while (k < ctr.length - 2 && ctr[k + 1] < v) k++;
      const t = (v - ctr[k]) / (ctr[k + 1] - ctr[k]); lut[v] = val[k] + (val[k + 1] - val[k]) * t;
    }
    const slope = (v) => Math.max(0.3, Math.min(2, (lut[Math.min(255, v + 6)] - lut[Math.max(0, v - 6)]) / (Math.min(255, v + 6) - Math.max(0, v - 6))));
    const { B, gw, gh } = wmGrid('', orig.width, orig.height);
    const vw = x1 - x0, vh = y1 - y0, RM = new Float32Array(vw * vh), WM = new Float32Array(vw * vh);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4, wt = 1 / (1 + (gradAt(i) / 6) ** 2); if (wt < 0.05) continue;
      let r = Ld[i + 2] - lut[O[i + 2]]; if (r > 12) r = 12; else if (r < -12) r = -12;
      const j = (y - y0) * vw + (x - x0); RM[j] = r * wt; WM[j] = wt;
    }
    // 넓게 번지는 색 차이(밝기 보정·압축 얼룩)는 빼고 무늬 크기의 차이만 남김: 주변(무늬 칸 3개쯤) 가중 평균을 뺌
    const Rh = Math.max(3, Math.round(3 * B * s)), SW = vw + 1;
    const SR = new Float64Array(SW * (vh + 1)), SWt = new Float64Array(SW * (vh + 1));
    for (let y = 0; y < vh; y++) { let a = 0, b = 0; for (let x = 0; x < vw; x++) { a += RM[y * vw + x]; b += WM[y * vw + x]; SR[(y + 1) * SW + x + 1] = SR[y * SW + x + 1] + a; SWt[(y + 1) * SW + x + 1] = SWt[y * SW + x + 1] + b; } }
    const box = (S, xa, ya, xb, yb) => S[yb * SW + xb] - S[ya * SW + xb] - S[yb * SW + xa] + S[ya * SW + xa];
    const HP = new Float32Array(vw * vh);
    const Rg = new Float64Array(gw * gh), Ng = new Float64Array(gw * gh);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const j = y * vw + x, wt = WM[j]; if (!wt) continue;
      const xa = Math.max(0, x - Rh), xb = Math.min(vw, x + Rh + 1), ya = Math.max(0, y - Rh), yb = Math.min(vh, y + Rh + 1);
      const sw = box(SWt, xa, ya, xb, yb), m = sw > 0 ? box(SR, xa, ya, xb, yb) / sw : 0;
      const r = RM[j] / wt - m; HP[j] = r * wt;
      const X = x + x0, Y = y + y0, i = (Y * W + X) * 4;
      const ox = (X - at.tx) / s / B, oy = (Y - at.ty) / s / B, gx = Math.floor(ox), gy = Math.floor(oy), tx = ox - gx, ty = oy - gy;
      if (gx < 0 || gy < 0 || gx >= gw - 1 || gy >= gh - 1) continue;
      const a = wmAmp(O[i], O[i + 1], O[i + 2]) * slope(O[i + 2]), k = gy * gw + gx;
      for (const [kk, hw] of [[k, (1 - tx) * (1 - ty)], [k + 1, tx * (1 - ty)], [k + gw, (1 - tx) * ty], [k + gw + 1, tx * ty]]) { Rg[kk] += wt * r * a * hw; Ng[kk] += wt * (a * hw) ** 2; }
    }
    // 남은 차이를 눈으로 보는 그림(살짝 뭉개서 키움): 예전 방식(글자) 워터마크는 여기에 글자로 드러남
    const view = document.createElement('canvas'); view.width = vw; view.height = vh;
    const vg = view.getContext('2d'), vd = vg.createImageData(vw, vh), q = vd.data, rr = Math.max(1, Math.round(Math.max(vw, vh) / 600));
    const S2 = new Float64Array((vw + 1) * (vh + 1));
    for (let y = 0; y < vh; y++) { let row = 0; for (let x = 0; x < vw; x++) { row += HP[y * vw + x]; S2[(y + 1) * (vw + 1) + x + 1] = S2[y * (vw + 1) + x + 1] + row; } }
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const ya = Math.max(0, y - rr), yb = Math.min(vh, y + rr + 1), xa = Math.max(0, x - rr), xb = Math.min(vw, x + rr + 1);
      const m = (S2[yb * (vw + 1) + xb] - S2[ya * (vw + 1) + xb] - S2[yb * (vw + 1) + xa] + S2[ya * (vw + 1) + xa]) / ((yb - ya) * (xb - xa));
      const k = (y * vw + x) * 4; q[k] = q[k + 1] = q[k + 2] = Math.max(0, Math.min(255, 128 + m * 24)); q[k + 3] = 255;
    }
    vg.putImageData(vd, 0, 0);
    return { Rg, Ng, gw, gh, B, view };
  }
  // 후보마다 점수: 남은 차이와 그 사람 무늬의 상관(z). 무늬가 없는 사람은 0 근처
  function scoreNames(res, origW, origH, path, names) {
    const { Rg, Ng } = res, idx = [];
    let sN = 0, sNN = 0, sRR = 0;
    for (let k = 0; k < Ng.length; k++) if (Ng[k] > 0) { idx.push(k); sN += Ng[k]; sNN += Ng[k] * Ng[k]; sRR += Rg[k] * Rg[k] / Ng[k]; }
    const neff = sN * sN / Math.max(1e-9, sNN);
    const out = names.map(n => {
      const v = wmGrid(n + '|' + path, origW, origH).v; let sv = 0;
      for (const k of idx) sv += Rg[k] * v[k];
      const rho = sv / Math.sqrt(Math.max(1e-9, sRR * sN));
      return { name: n, z: rho * Math.sqrt(neff) };
    });
    return out.sort((a, b) => b.z - a.z);
  }
  window.SilWM = { bakeCanvas, locate, residualGrid, scoreNames, wmGrid };
  function wmFinder(c, ps) {
    ps = ps || [];
    // 1) 퍼진 사진: 어느 캐릭터 사진인지 고르면, 원본과 맞대어 누구 무늬인지 찾음
    const who = el('input', { type: 'search', class: 'adm-search', placeholder: '캡처에 나온 랭킹 캐릭터 (모르면 비워 두세요)', list: 'wmChars', autocomplete: 'off' });
    const dl = el('datalist', { id: 'wmChars' }); for (const p of ps) dl.append(el('option', { value: p.nickname }));
    const out = el('div', { class: 'wm-out wm-result' });
    let leakCv = null, busy = false;
    const z1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const run = async () => {
      if (!leakCv || busy) return;
      const nm = who.value.trim();
      const p = ps.find(x => x.nickname === nm) || ps.find(x => x.nickname.toLowerCase() === nm.toLowerCase());
      out.textContent = '';
      if (nm && !p) { out.append(el('p', { class: 'adm-flag', text: '랭킹에 없는 캐릭터예요' })); return; }
      busy = true;
      const note = el('p', { class: 'rank-note', text: '원본 사진을 불러오는 중이에요' }); out.append(note);
      try {
        const loadShot = async (path) => { const b = await shotBlob(c, path); return b ? blobToCanvas(b) : null; };
        let best = null, found = p;
        if (!p) {
          // 사진 속 캐릭터를 모르면: 랭킹 캐릭터 사진마다 대충 맞대 보고(작게) 가장 잘 맞는 캐릭터를 고름
          const list = ps.filter(x => x.shot_path); let top = [];
          for (let k = 0; k < list.length; k++) {
            note.textContent = `캡처에 나온 캐릭터를 찾는 중이에요 (${k + 1}/${list.length})`;
            try { const o = await loadShot(list[k].shot_path); if (!o) continue; const at = await locate(o, leakCv, null, true); if (at) top.push({ p: list[k], pk: at.pk }); } catch (e) { /* 넘어감 */ }
            await new Promise(r => setTimeout(r, 0));
          }
          top.sort((a, b) => b.pk - a.pk); top = top.slice(0, 2);
          if (!top.length) { note.textContent = '퍼진 사진 안에서 랭킹 사진을 못 찾았어요.'; busy = false; return; }
          found = top[0].p;
          for (const t of top) {
            const o = await loadShot(t.p.shot_path);
            const at = await locate(o, leakCv, (f) => { note.textContent = `${t.p.nickname} 사진을 맞대는 중이에요 ${Math.round(f * 100)}%`; });
            if (at && (!best || at.q > best.at.q)) { best = { path: t.p.shot_path, o, at }; found = t.p; }
          }
        }
        const pp = found;
        const { data: hs } = await c.from('cp_history').select('shot_path,pub_path,created_at').eq('player_id', pp.id).order('created_at', { ascending: false }).limit(20);
        const paths = [...new Set([pp.shot_path, ...(hs || []).map(h => h.pub_path || h.shot_path)].filter(Boolean))].slice(0, 6).filter(x => !best || x !== best.path);
        let n = 0;
        for (const path of paths) {
          n++;
          const o = await loadShot(path); if (!o) continue;
          const at = await locate(o, leakCv, (f) => { note.textContent = `${pp.nickname} 사진 ${n}/${paths.length}장째를 맞대는 중이에요 ${Math.round(f * 100)}%`; });
          if (at && (!best || at.q > best.at.q)) best = { path, o, at };
        }
        const p2 = pp;
        if (!best || best.at.q < 0.3) { note.textContent = `사진에서 ${p2.nickname} 랭킹 사진을 못 찾았어요`; busy = false; return; }
        note.textContent = '누구 무늬인지 비교하는 중이에요';
        await new Promise(r => setTimeout(r, 0));
        const res = residualGrid(best.o, leakCv, best.at);
        if (!res) { note.textContent = '사진이 너무 작아서 비교할 수 없어요'; busy = false; return; }
        const { data: vl } = await c.from('view_log').select('viewer_nick,at').eq('kind', 'detail').eq('target', p2.id).order('at', { ascending: false }).limit(1000);
        const names = [...new Set(['관리자', ...ps.map(x => x.nickname), ...(vl || []).map(v => v.viewer_nick).filter(Boolean)])];
        const sc = scoreNames(res, best.o.width, best.o.height, best.path, names);
        const top = sc[0], second = sc[1] ? sc[1].z : 0, gap = top.z - second;
        const sure = top.z >= 6 && gap >= 3, likely = !sure && top.z >= 4.5 && gap >= 2;
        out.textContent = '';
        out.append(el('p', { class: 'wm-verdict' + (sure ? ' sure' : likely ? ' likely' : '') },
          sure ? `퍼뜨린 사람: ${top.name} 님 (이 사람 화면에서 찍은 캡처예요)` : likely ? `퍼뜨린 사람: ${top.name} 님일 가능성이 높아요` : '누구 화면에서 찍은 캡처인지 못 찾았어요',
          sure || likely ? el('small', { text: ` (점수 ${z1(top.z)}, 다음 ${z1(second)})` }) : null));
        const seen = (vl || []).filter(v => v.viewer_nick === top.name).slice(0, 5).map(v => new Date(v.at).toLocaleString('ko-KR'));
        out.append(el('p', { class: 'rank-note', text: `캡처에 나온 캐릭터: ${p2.nickname}` + ((sure || likely) && seen.length ? ` · ${top.name} 님이 이 캐릭터를 본 시각: ${seen.join(', ')}${(vl || []).filter(v => v.viewer_nick === top.name).length > 5 ? ' 외' : ''}` : '') }));
        out.append(el('ol', { class: 'wm-cands' }, ...sc.slice(0, 5).map(x => el('li', { text: `${x.name}  ${z1(x.z)}` }))));
      } catch (e) { console.warn(e); out.textContent = '찾지 못했어요. ' + errMsg(e); }
      busy = false;
    };
    who.addEventListener('change', run);
    const show = async (blob) => {
      if (!blob) return;
      try {
        leakCv = await blobToCanvas(blob);
        zone.querySelector('p').textContent = `넣은 사진 ${leakCv.width}×${leakCv.height}`;
        run();
      } catch (e) { out.textContent = '이미지를 열지 못했어요'; }
    };
    const fin = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    fin.onchange = () => show(fin.files[0]);
    const zone = el('div', { class: 'wm-drop', tabindex: '0' },
      el('p', { text: '캡처·사진을 붙여 넣거나(Ctrl + V) 끌어다 놓으세요' }),
      el('button', { type: 'button', class: 'btn', text: '이미지 열기', onclick: () => fin.click() }), fin);
    zone.addEventListener('paste', (e) => { const f = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/')); if (f) { e.preventDefault(); e.stopPropagation(); show(f.getAsFile()); } });
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => { e.preventDefault(); show([...e.dataTransfer.files].find(f => f.type.startsWith('image/'))); });
    return el('div', { class: 'adm-sec' }, el('h3', { text: '워터마크 찾기' }),
      zone, el('div', { class: 'adm-find' }, who, dl), out);
  }
  // 랭킹 화면 전체에 눈에 안 띄는 워터마크(보는 사람·시각)를 덮어 둠: 화면 캡처에도 그대로 남음
  function markView() {
    const v = $('#rankView'); if (!v) return;
    let m = v.querySelector('.rk-wm');
    if (!m) { m = el('div', { class: 'rk-wm', 'aria-hidden': 'true' }); v.append(m); }
    const [l1, l2] = stampLines().map(x => String(x).replace(/[<>&"']/g, ''));
    // 눈에는 안 보이는 글자(닉네임 / 시각 두 줄)를 촘촘히: 파랑만 딱 1칸(255→254) 낮춤. 밝기로 치면 0.1칸이라 사람 눈으로는 구별이 안 되고,
    // 캡처 원본(PNG)을 관리자 화면 '워터마크 찾기'의 '안 보이는 글자 찾기'에 넣으면 드러남. 겹치면 2칸이 되니 한 겹만 씀
    const WM = window.SIL_WM || { fs: 60, fill: 'rgb(255,255,0)', op: 0.005, blur: 1.5, a: [18, 70, 50], b: null };
    const fs = WM.fs, lh = Math.round(fs * 1.15), mc = document.createElement('canvas').getContext('2d');
    mc.font = `900 ${fs}px sans-serif`;
    const tw = Math.ceil(Math.max(mc.measureText(l1).width, mc.measureText(l2).width));
    const tile = (deg, padX, padY) => {
      const r = deg * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r);
      const x = Math.round(padX / 2 + fs * sn), y = Math.round(padY / 2 + tw * sn + fs * cs);
      const w = Math.ceil(x + tw * cs + lh * sn + padX / 2), h = Math.ceil(y + lh * cs + 0.3 * fs + padY / 2);
      const txt = (t, dy) => `<text x="${x}" y="${y + dy}" font-family="sans-serif" font-weight="900" font-size="${fs}" fill="${WM.fill}" fill-opacity="${WM.op}">${t}</text>`;
      // 글자 테두리를 뭉개서 눈에 덜 띄게(압축해도 남는 건 굵은 덩어리 쪽이라 찾기에는 거의 영향 없음)
      const flt = WM.blur ? `<filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${WM.blur}"/></filter>` : '';
      const grp = `<g transform="rotate(${-deg} ${x} ${y})"${WM.blur ? ' filter="url(#f)"' : ''}>${txt(l1, 0)}${txt(l2, lh)}</g>`;
      return { w, h, url: 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${flt}${grp}</svg>`) + '")' };
    };
    const A1 = tile(...WM.a), A2 = WM.b ? tile(...WM.b) : null;
    m.style.backgroundImage = A2 ? A1.url + ',' + A2.url : A1.url;
    m.style.backgroundPosition = A2 ? `0 0, ${Math.round(A1.w / 2)}px ${Math.round(A1.h / 2)}px` : '0 0';
  }
  // 크게 보기(화면 위에 따로 뜸)에도 랭킹 화면과 같은 워터마크를 덮음
  function viewMark() {
    const m = $('#rankView .rk-wm'); if (!m) return null;
    const c = el('div', { class: 'rk-wm', 'aria-hidden': 'true' });
    c.style.backgroundImage = m.style.backgroundImage; c.style.backgroundPosition = m.style.backgroundPosition;
    return c;
  }
  function lightbox(src, alt, marked) {
    const box = el('div', { class: 'lb', role: 'dialog', 'aria-label': alt },
      el('div', { class: 'lb-in' }, el('img', { src, alt }), marked ? null : watermark(), viewMark()));
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    box.onclick = close; document.addEventListener('keydown', onKey);
    document.body.append(box);
  }
  async function toggleDetail(li, r, btnEl, god) {
    const open = li.classList.toggle('open');
    btnEl.setAttribute('aria-expanded', String(open));
    let box = li.querySelector('.rk-detail');
    if (!open) { if (box) box.hidden = true; return; }
    if (box) { box.hidden = false; if (god) godPhotoFx(box.querySelector('.rk-shot:not(.ask)')); return; }
    const img = el('img', { alt: `${r.nickname} 실투력 스크린샷` });
    const cap = el('p', { class: 'rk-cap', text: '사진 불러오는 중이에요' });
    const shareP = el('p', { class: 'rk-cap', text: '초월:강렬 비율 불러오는 중' });
    // 사진은 "사진 보기"를 눌러야 받음(세팅만 보러 펼치는 사람이 많아서 저장소 전송량을 아낌)
    const askT = el('b', { text: '사진 보기' }), askS = el('small', { text: '누르면 스크린샷을 불러와요' });
    const ask = el('span', { class: 'rk-ask' }, askT, askS);
    const shot = el('button', { type: 'button', class: 'rk-shot', 'aria-label': '사진 크게 보기' }, img);
    let marked = false, loadPic = null;
    shot.onclick = () => { if (img.src) lightbox(img.src, img.alt, marked); else if (loadPic) loadPic(); };
    box = el('div', { class: 'rk-detail' },
      shot,
      el('div', { class: 'rk-side' },
        cap,
        el('p', { class: 'rk-cap', text: god ? `${ago(r.updated_at)} 갱신` : `실투력 ${fmtInt(r.cp)}, ${ago(r.updated_at)} 갱신` }),
        shareP,
        el('div', { class: 'rk-btns' },
          el('button', { type: 'button', class: 'btn', text: '계산기에서 세팅 보기', onclick: () => openPlayer(r) }),
          rkCls ? null : el('button', { type: 'button', class: 'btn', text: `${r.cls} 랭킹`, onclick: () => showClass(r.cls) }))));
    li.append(box);
    try {
      const c = await sb();
      await playerDetail(c, r);
      shareP.textContent = `초월:강렬 비율 ${shareText(r.inputs)}`;
      if (!r.shot_path) { shot.hidden = true; cap.textContent = '사진이 아직 없어요.'; return; }
      let busy = false;
      loadPic = async () => {
        if (busy) return; busy = true;
        askT.textContent = '사진 불러오는 중이에요'; askS.textContent = '';
        try {
          const u = await shotUrl(c, r.shot_path);
          const bu = u ? await bakeShot(u, viewerName() + '|' + r.shot_path) : null;
          if (bu) { marked = true; img.src = bu; }
          else if (u) { img.src = u; shot.append(watermark()); }
          if (u) { loadPic = null; ask.remove(); shot.classList.remove('ask'); shot.setAttribute('aria-label', '사진 크게 보기'); if (god) img.decode().catch(() => {}).then(() => godPhotoFx(shot)); }
          else { askT.textContent = '사진을 불러오지 못했어요'; askS.textContent = '다시 누르면 한 번 더 불러와요'; }
        } catch (e) { askT.textContent = '사진을 불러오지 못했어요'; askS.textContent = '다시 누르면 한 번 더 불러와요'; }
        busy = false;
      };
      cap.remove();
      if (god || await shotCached(r.shot_path)) await loadPic(); // 신은 열면 사진까지 바로 보여 줌
      if (!img.src) { shot.classList.add('ask'); shot.setAttribute('aria-label', '사진 보기'); shot.append(ask); }
    } catch (e) { cap.textContent = '사진을 불러오지 못했어요.'; }
  }
  async function openPlayer(r) {
    try {
      const c = await sb();
      const inputs = await playerInputs(c, r);
      setView('calc');
      A.openShared({ n: r.cls, k: r.nickname, i: inputs });
    } catch (e) { toast('세팅을 불러오지 못했어요. ' + errMsg(e)); }
  }
  // 전체 / 전직별(전직을 고르면 그 전직 안에서의 순위). 전직은 검색 칸에 적어서 고름
  const CLASSES = A.classes();
  const findBox = $('#rankFind'), clsQ = $('#rankClsQ'), clsOpts = $('#rankClsOpts');
  const nsp = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();
  let optIdx = -1;
  // 앞부분이 맞는 전직 먼저, 그다음 중간에 들어 있는 전직
  function clsMatches(q) {
    const k = nsp(q); if (!k) return CLASSES.slice();
    const a = CLASSES.filter(c => nsp(c).startsWith(k)), b = CLASSES.filter(c => !nsp(c).startsWith(k) && nsp(c).includes(k));
    return a.concat(b);
  }
  function drawOpts() {
    const list = clsMatches(clsQ.value === rkCls ? '' : clsQ.value);
    clsOpts.textContent = '';
    if (!list.length) clsOpts.append(el('p', { class: 'rk-find-none', text: '맞는 전직이 없어요' }));
    list.forEach((c, i) => {
      const b = el('button', { type: 'button', role: 'option', id: 'rkopt' + i, class: 'rk-find-opt' + (i === optIdx ? ' on' : '') + (c === rkCls ? ' cur' : ''), 'aria-selected': String(i === optIdx), text: c, tabindex: '-1' });
      b.onmousedown = (e) => e.preventDefault(); b.onclick = () => pickCls(c);
      clsOpts.append(b);
    });
    clsOpts.hidden = false; clsQ.setAttribute('aria-expanded', 'true');
    if (optIdx >= 0) { clsQ.setAttribute('aria-activedescendant', 'rkopt' + optIdx); const on = clsOpts.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    else clsQ.removeAttribute('aria-activedescendant');
  }
  function closeOpts() { clsOpts.hidden = true; clsQ.setAttribute('aria-expanded', 'false'); clsQ.removeAttribute('aria-activedescendant'); optIdx = -1; }
  function pickCls(c) { closeOpts(); clsQ.value = c; clsQ.blur(); setMode('cls', c); }
  // 목록은 글자를 적었을 때만 펼침(↓ 키로는 전체 목록)
  clsQ.addEventListener('focus', () => { clsQ.select(); optIdx = -1; });
  clsQ.addEventListener('input', () => { optIdx = 0; if (nsp(clsQ.value)) drawOpts(); else closeOpts(); });
  clsQ.addEventListener('blur', () => setTimeout(() => { closeOpts(); if (rkCls) clsQ.value = rkCls; }, 150));
  clsQ.addEventListener('keydown', (e) => {
    const n = clsOpts.querySelectorAll('.rk-find-opt').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); optIdx = Math.min(n - 1, optIdx + 1); drawOpts(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); optIdx = Math.max(0, optIdx - 1); drawOpts(); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = clsMatches(clsQ.value === rkCls ? '' : clsQ.value)[Math.max(0, optIdx)]; if (c) pickCls(c); }
    else if (e.key === 'Escape') { closeOpts(); clsQ.blur(); }
  });
  function setMode(mode, cls, keepPage) {
    for (const t of $('#rankMode').querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.v === mode);
    findBox.hidden = mode !== 'cls';
    rkMode = mode;
    // 전직별: 기본 전직 없이 비워 두고, 검색해서 고른 전직만 보여 줌
    if (mode === 'cls') { rkCls = cls || ''; clsQ.value = rkCls; }
    else rkCls = '';
    $('#rankTitle').textContent = rkCls ? `${rkCls} 랭킹` : mode === 'cls' ? '전직별 랭킹' : '실투력 랭킹';
    const done = loadRank(!keepPage);
    if (mode === 'cls' && !rkCls) setTimeout(() => clsQ.focus(), 0);
    return done;
  }
  function showClass(cls) { setMode('cls', cls); window.scrollTo(0, 0); }
  $('#rankMode').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setMode(b.dataset.v); });

  // ---------- 내 순위(이 브라우저에 있는 승인된 캐릭터) ----------
  let mine = [];
  async function loadMine(c) {
    try { const { data, error } = await c.rpc('my_ranks'); if (error) throw error; mine = data || []; mineAt = Date.now(); } catch (e) { mine = []; }
    drawMine();
  }
  function drawMine() {
    const box = $('#rankMine'); box.textContent = '';
    box.hidden = !mine.length; if (!mine.length) return;
    box.append(el('span', { class: 'rk-mine-lab', text: '내 순위' }));
    for (const m of mine) {
      const here = rkCls && m.cls === rkCls, pos = rkCls ? (here ? m.in_cls : null) : m.overall;
      const b = el('button', { type: 'button', class: 'rk-mine-item', title: '이 캐릭터가 있는 쪽으로 가기' },
        el('b', { text: pos ? `${pos}위` : `${m.cls}` }),
        el('span', { class: 'nm', text: m.nickname }),
        el('small', { text: rkCls ? (here ? `전체 ${m.overall}위` : `${m.cls} ${m.in_cls}위 · 전체 ${m.overall}위`) : `${m.cls} ${m.in_cls}위` }));
      b.onclick = () => jumpTo(m);
      box.append(b);
    }
  }
  async function jumpTo(m) {
    if (rkCls && m.cls !== rkCls) { rkCls = m.cls; }
    const pos = rkCls ? m.in_cls : m.overall;
    rkPage = Math.max(0, Math.floor((pos - 1) / PAGE));
    await setMode(rkCls ? 'cls' : 'all', rkCls, true);
    const li = $(`#rankList li[data-id="${m.id}"]`);
    if (li) { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1800); }
  }
  const goTo = (i) => { if (rkBusy || i === rkPage) return; rkPage = Math.max(0, i); loadRank(false).then(() => $('#rankList').scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  const goPage = (d) => goTo(rkPage + d);
  $('#btnRankPrev').onclick = () => goPage(-1);
  $('#btnRankNext').onclick = () => goPage(1);

  // ---------- 실투력 카드 아래 랭킹 줄 ----------
  const line = $('#rankLine');
  const checked = {};
  const btn = (text, onclick, mute) => el('button', { type: 'button', class: 'txt sm' + (mute ? ' mute' : ''), text, onclick });
  // 랭킹에는 실투력 1억 이상만 올림(서버에서도 막음)
  const RANK_MIN = 100000000;
  const underMin = (cp) => { if (cp >= RANK_MIN) return false; toast(`실투력 1억부터 랭킹에 올릴 수 있어요. 지금 ${fmtInt(cp)}`); return true; };
  function renderLine() {
    const r = A.rank();
    if (A.isShared() || (!r && A.missing().includes('세팅'))) { line.hidden = true; return; }
    line.hidden = false; line.innerHTML = '';
    if (!r) {
      const cp = A.rankCp();
      line.append(el('span', { class: 'rk-state' }, '랭킹에 아직 안 올렸어요', cp > 0 && cp < RANK_MIN ? el('small', { text: '실투력 1억부터 올릴 수 있어요' }) : null), el('span', { class: 'acts' }, btn('랭킹에 올리기', openApply)));
      return;
    }
    if (!checked[A.key()]) { checked[A.key()] = true; checkStatus(A.key()); }
    if (r.status === 'pending') {
      line.append(el('span', { class: 'rk-state' }, '랭킹 승인 기다리는 중', el('small', { text: r.nickname })),
        el('span', { class: 'acts' }, btn('갱신 코드', showToken, true)));
    } else if (r.status === 'rejected') {
      line.append(el('span', { class: 'rk-state' }, '랭킹 신청이 거절됐어요', r.memo ? el('small', { text: `사유: ${r.memo}` }) : null),
        el('span', { class: 'acts' }, btn('다시 신청', openApply)));
      noticeRemoved(r);
    } else if (r.status === 'hidden' || r.status === 'removed') {
      // 관리자가 내린 경우: 사유를 보여 줌(처음 한 번은 창으로)
      line.append(el('span', { class: 'rk-state' }, r.status === 'hidden' ? '관리자가 랭킹에서 내렸어요' : '관리자가 랭킹에서 삭제했어요', r.memo ? el('small', { text: `사유: ${r.memo}` }) : null),
        el('span', { class: 'acts' }, r.status === 'removed' ? btn('다시 신청', () => { A.setRank(null); renderLine(); openApply(); }) : btn('갱신 코드', showToken, true)));
      noticeRemoved(r);
    } else {
      const upd = r.upd === 'held' ? `갱신 ${fmtInt(r.updCp)} 확인 기다리는 중`
        : (r.upd === 'rejected' || r.upd === 'reverted') ? `최근 갱신이 반영되지 않았어요${r.updMemo ? `: ${r.updMemo}` : ''}` : '';
      const posTxt = r.pos ? `전체 ${r.pos}위` + (r.cpos && r.cls ? `, ${r.cls} ${r.cpos}위` : '') : '랭킹 등록됨';
      line.append(el('span', { class: 'rk-state' }, el('span', { class: 'rk-pos', text: posTxt }), el('small', { text: `${r.nickname}, 올린 값 ${fmtInt(r.cp)}` }), upd ? el('small', { class: 'rk-upd', text: upd }) : null),
        el('span', { class: 'acts' }, btn('갱신 코드', showToken, true), btn('랭킹 갱신', doUpdate)));
    }
  }
  A.onRefresh(renderLine);
  function noticeRemoved(r) {
    const k = r.status + '|' + (r.memo || '');
    if (r.seen === k) return;
    r.seen = k; A.setRank(r);
    if (r.status === 'rejected') {
      A.dialog({ title: '랭킹 신청이 거절됐어요', text: `${r.nickname} 랭킹 신청이 거절됐어요.${r.memo ? `\n사유: ${r.memo}` : ''}`, ok: '확인' });
      return;
    }
    A.dialog({ title: r.status === 'hidden' ? '랭킹에서 내려졌어요' : '랭킹에서 삭제됐어요',
      text: `${r.nickname} 캐릭터를 관리자가 랭킹에서 ${r.status === 'hidden' ? '내렸어요. 랭킹도 볼 수 없어요' : '삭제했어요'}.${r.memo ? `\n사유: ${r.memo}` : ''}`, ok: '확인' });
  }

  async function positions(c, r) {
    const { data, error } = await c.rpc('rank_pos', { p_cp: r.cp, p_cls: r.cls || null });
    const d = !error && data && data[0];
    r.pos = d ? d.overall : null; r.cpos = d ? d.in_cls : null;
  }
  async function checkStatus(key) {
    const r = A.rank(key); if (!r || !r.token) return;
    try {
      const c = await sb();
      const { data, error } = await c.rpc('my_status', { p_token: r.token });
      if (error) throw error;
      const st = data && data[0];
      if (!st) { A.setRank(null, key); }
      else {
        Object.assign(r, { status: st.status, nickname: st.nickname, cp: Number(st.cp), memo: st.memo || '', upd: st.upd_status || '', updCp: Number(st.upd_cp) || 0, updMemo: st.upd_memo || '' });
        if (st.status === 'approved') { r.cls = r.cls || A.cls(); await positions(c, r); }
        A.setRank(r, key);
      }
      if (key === A.key()) renderLine();
    } catch (e) { console.warn(e); }
  }
  function showToken() {
    const r = A.rank(); if (!r) return;
    A.dialog({ title: '갱신 코드', text: '다른 기기나 브라우저에서 갱신할 때 이 코드가 필요해요. 다른 사람에게 알려 주지 마세요.', code: r.token, ok: '닫기' });
  }

  // 피시방·에너지드링크·지애·이벤트 버프, 추피 보정·가동률 DPS 전환·하의 스위칭을 켠 세팅은 랭킹에 올리지 않음(서버에도 안 보냄)
  // 랭킹은 같은 필드 기준으로만 비교: 전투력 출력 기준 필드가 '네블론 레이드 : 글리터 보스'일 때만 신청·갱신
  const RANK_FIELD = '네블론 레이드 : 글리터 보스';
  function buffBlocked() {
    const field = String(A.val ? (A.val('I8') ?? '') : '');
    if (field !== RANK_FIELD) {
      A.dialog({ title: '랭킹에 올릴 수 없어요', text: `랭킹은 전투력 출력 기준 필드가 '${RANK_FIELD}'일 때만 올릴 수 있어요. 지금은 '${field.replace(/\s*\n\s*/g, ' ') || '-'}'이에요. 계산기의 스킬·장비 탭에서 필드를 바꾼 뒤 다시 눌러 주세요.`, ok: '확인' });
      return true;
    }
    const bf = A.rankBuffs ? A.rankBuffs() : [];
    if (!bf.length) return false;
    A.dialog({ title: '랭킹에 올릴 수 없어요', text: `${bf.join(', ')}이(가) 켜져 있어요. 이걸 켠 세팅은 랭킹에 올릴 수 없어요. 계산기의 스킬·장비 탭에서 끈 뒤(이벤트 버프는 '미적용'으로) 다시 눌러 주세요.`, ok: '확인' });
    return true;
  }

  // 스크린샷 넣는 칸(누르기·붙여넣기·끌어 놓기). 다른 사람 이름을 가린 사본도 같이 만듦
  function shotPicker() {
    const st = { img: null, pub: null };
    const file = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    const box = el('div', { class: 'apply-shot', tabindex: '0', role: 'button' }, el('span', { text: '여기를 눌러 사진을 고르거나 Ctrl + V로 붙여 넣으세요' }));
    st.set = async (src, note) => {
      try {
        const cv = src instanceof HTMLCanvasElement ? src : await blobToCanvas(src);
        st.img = await toOrig(cv);
        const pc = privacyBlur(cv); st.pub = pc ? await toPub(pc) : null;
        box.innerHTML = ''; box.classList.add('has');
        box.append(el('img', { src: URL.createObjectURL(st.img), alt: '올릴 스크린샷' }), el('span', { text: note || '다른 사진으로 바꾸려면 다시 누르세요' }));
      } catch (e) { toast('사진을 읽지 못했어요'); }
    };
    box.onclick = () => file.click();
    box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    box.addEventListener('dragover', (e) => e.preventDefault());
    box.addEventListener('drop', (e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) st.set(f); });
    file.onchange = () => { if (file.files[0]) st.set(file.files[0]); };
    const onPaste = (e) => {
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (!it) return;
      e.preventDefault(); e.stopImmediatePropagation(); st.set(it.getAsFile());
    };
    window.addEventListener('paste', onPaste, true);
    st.off = () => window.removeEventListener('paste', onPaste, true);
    st.box = box; st.file = file;
    return st;
  }
  // 예시 사진: 이렇게 찍으면 돼요(누르면 크게)
  function exampleFig() {
    return el('figure', { class: 'apply-ex' },
      el('img', { src: 'apply_ex.jpg', alt: '스크린샷 예시: 채팅 입력칸의 인증 코드, 캐릭터 창, 상세 스탯 창, 공격력 범위 창', loading: 'lazy', onclick: () => window.open('apply_ex.jpg', '_blank', 'noopener') }),
      el('figcaption', {}, el('b', { text: '이렇게 찍어 주세요' }),
        el('ol', {},
          el('li', { text: '채팅 입력칸에 위 인증 코드(예시의 TEST-1234 자리)' }),
          el('li', { text: '캐릭터 창: 닉네임과 전투력이 보이게' }),
          el('li', { text: '상세 스탯 창' }),
          el('li', { text: '상세 스탯 창의 공격력에 마우스를 올려 뜬 범위 창' }))));
  }

  // ---------- 랭킹 신청 ----------
  function openApply() {
    const miss = A.missing();
    if (miss.length) { toast(`${miss.join('·')}부터 채워 주세요`); return; }
    if (buffBlocked()) return;
    const cp = A.rankCp();
    if (!(cp > 0)) { toast('실투력이 계산되지 않았어요'); return; }
    if (underMin(cp)) return;
    const old = $('#applyDlg'); if (old) old.remove();
    const code = genCode();
    const pick = shotPicker();
    const nick = el('input', { type: 'text', class: 'nick', maxlength: '20', placeholder: '게임 닉네임', value: A.nick() || (A.rank() || {}).nickname || '' });
    const close = () => { pick.off(); wrap.remove(); };
    const send = el('button', { type: 'button', class: 'btn primary', text: '신청하기' });
    const card = el('div', { class: 'dialog-card apply-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'apTitle' },
      el('h3', { id: 'apTitle', text: '랭킹에 올리기' }),
      el('p', { class: 'apply-sum' }, `${A.cls()} 실투력 `, el('b', { text: fmtInt(cp) }), '을(를) 올려요. 관리자가 본인 캐릭터인지 확인한 뒤 랭킹에 보여요.'),
      el('label', { class: 'ex-row' }, el('span', {}, '닉네임', el('small', { text: '게임 닉네임 그대로' })), nick),
      el('div', { class: 'code-box' }, el('span', { text: '인증 코드' }), el('b', { text: code })),
      el('p', { text: '게임 채팅창에 이 코드를 입력한 다음, 채팅이 보이게 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 찍어 넣어 주세요. 채팅 글자가 캐릭터 창이나 상세 스탯 창을 덮지 않게 해 주세요.' }),
      exampleFig(),
      el('p', { class: 'apply-privacy' }, '신청하면 닉네임, 계산기 세팅, 스크린샷이 랭킹용으로 저장돼요. 랭킹을 볼 때는 본 기록(본 캐릭터, 시각, 기기 구분용 임의 번호)이 180일 동안 남아요. 자세한 내용은 ', el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', text: '개인정보 처리방침' }), '에 있어요.'),
      pick.box, pick.file,
      el('div', { class: 'dlg-actions' }, el('button', { type: 'button', class: 'btn', text: '취소', onclick: close }), send));
    const wrap = el('div', { class: 'dialog', id: 'applyDlg' }, card);
    document.body.append(wrap);
    setTimeout(() => nick.focus(), 50);
    send.onclick = async () => {
      const n = nick.value.trim();
      if (!n) { toast('닉네임을 적어 주세요'); nick.focus(); return; }
      const img = pick.img, pub = pick.pub;
      if (!img) { toast('인증 코드가 보이는 스크린샷을 넣어 주세요'); return; }
      if (buffBlocked()) return;
      send.disabled = true; send.textContent = '보내는 중';
      try {
        const c = await sb();
        const id = uuid(), path = `apply/${id}.${extOf(img)}`;
        const up = await c.storage.from('shots').upload(path, img, { contentType: img.type || 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        // 랭킹에 보일 사진(캐릭터·상세 스탯 창 밖을 흐리게). 원본은 관리자만 봄
        const pubPath = pub ? `apply/${id}_p.${extOf(pub)}` : null;
        if (pubPath) { const u2 = await c.storage.from('shots').upload(pubPath, pub, { contentType: pub.type || 'image/jpeg', upsert: false }); if (u2.error) throw u2.error; }
        const token = genToken();
        const { error } = await c.rpc('submit_application_v2', {
          p_nickname: n, p_server: '', p_cls: A.cls(), p_cp: cp, p_inputs: A.rankInputs(), p_code: code, p_shot: path, p_token: token, p_pub: pubPath,
        });
        if (error) throw error;
        if (A.nick() !== n) A.setNick(n);
        A.setRank({ token, status: 'pending', nickname: n, cls: A.cls(), cp });
        checked[A.key()] = true;
        close(); renderLine();
        await A.dialog({ title: '신청했어요', text: '관리자가 스크린샷을 확인하면 랭킹에 올라가요. 아래 갱신 코드는 다른 기기에서 갱신할 때 필요하니 따로 적어 두세요.', code: token, ok: '확인' });
      } catch (e) {
        toast('신청하지 못했어요. ' + errMsg(e));
        send.disabled = false; send.textContent = '신청하기';
      }
    };
  }

  // ---------- 승인된 사람: 스크린샷으로 갱신 ----------
  // 갱신할 때마다 새 인증 코드를 채팅에 적고 찍은 스크린샷을 보내고, 관리자가 확인한 뒤에 반영됨.
  // 코드는 보내기 전까지(최대 6시간) 같은 것을 보여 줌: 창을 닫고 게임에서 찍어 와도 같은 코드
  const updKey = (r) => 'silcalc.updcode.' + String(r.token || '').slice(0, 10);
  function updCode(r) {
    try { const o = JSON.parse(localStorage.getItem(updKey(r)) || 'null'); if (o && o.c && Date.now() - o.t < 6 * 36e5) return o.c; } catch (e) { /* 무시 */ }
    const c = genCode();
    try { localStorage.setItem(updKey(r), JSON.stringify({ c, t: Date.now() })); } catch (e) { /* 무시 */ }
    return c;
  }
  async function doUpdate() {
    const r = A.rank(); if (!r) return;
    const miss = A.missing();
    if (miss.length) { toast(`${miss.join('·')}부터 채워 주세요`); return; }
    if (buffBlocked()) return;
    const cp = A.rankCp();
    if (!(cp > 0)) { toast('실투력이 계산되지 않았어요'); return; }
    if (underMin(cp)) return;
    const old = $('#applyDlg'); if (old) old.remove();
    // 계산기에 넣은 사진은 코드가 나오기 전에 찍은 것이라 미리 넣지 않음(신청처럼 매번 새로 찍어 넣음)
    const code = updCode(r), pick = shotPicker();
    const close = () => { pick.off(); wrap.remove(); };
    const send = el('button', { type: 'button', class: 'btn primary', text: '보내기' });
    const card = el('div', { class: 'dialog-card apply-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'upTitle' },
      el('h3', { id: 'upTitle', text: '랭킹 갱신' }),
      el('p', { class: 'apply-sum' }, `${r.nickname} 실투력을 `, el('b', { text: fmtInt(cp) }), '(으)로 바꿔 달라고 보내요. 관리자가 스크린샷을 확인하면 랭킹에 반영돼요.'),
      el('div', { class: 'code-box' }, el('span', { text: '인증 코드' }), el('b', { text: code })),
      el('p', { text: '게임 채팅 입력칸에 이 코드를 적은 다음, 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 새로 찍어 넣어 주세요. 채팅 글자가 캐릭터 창이나 상세 스탯 창을 덮지 않게 해 주세요. 갱신할 때마다 코드가 새로 나와요.' }),
      el('p', { class: 'apply-privacy', text: '지금 계산기에 있는 값이 그대로 올라가요. 스크린샷의 스탯과 다르면 반영되지 않아요.' }),
      exampleFig(),
      pick.box, pick.file,
      el('div', { class: 'dlg-actions' }, el('button', { type: 'button', class: 'btn', text: '취소', onclick: close }), send));
    const wrap = el('div', { class: 'dialog', id: 'applyDlg' }, card);
    document.body.append(wrap);
    send.onclick = async () => {
      if (!pick.img) { toast('인증 코드가 보이는 스크린샷을 넣어 주세요'); return; }
      if (buffBlocked()) return;
      send.disabled = true; send.textContent = '보내는 중';
      try {
        const c = await sb();
        const id = uuid(), path = `update/${id}.${extOf(pick.img)}`;
        const up = await c.storage.from('shots').upload(path, pick.img, { contentType: pick.img.type || 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        let pubPath = null;
        if (pick.pub) { pubPath = `update/${id}_p.${extOf(pick.pub)}`; const u2 = await c.storage.from('shots').upload(pubPath, pick.pub, { contentType: pick.pub.type || 'image/jpeg', upsert: false }); if (u2.error) pubPath = null; }
        const { error } = await c.rpc('update_cp_v3', { p_token: r.token, p_cls: A.cls(), p_cp: cp, p_inputs: A.rankInputs(), p_shot: path, p_edited: A.edited(), p_pub: pubPath, p_code: code });
        if (error) throw error;
        try { localStorage.removeItem(updKey(r)); } catch (e) { /* 무시 */ }
        Object.assign(r, { upd: 'held', updCp: cp, updMemo: '' }); A.setRank(r);
        close(); renderLine();
        toast('보냈어요. 관리자가 확인하면 랭킹에 반영돼요');
      } catch (e) {
        toast('갱신하지 못했어요. ' + errMsg(e));
        send.disabled = false; send.textContent = '보내기';
      }
    };
  }

  // ---------- 다른 기기에서 받은 갱신 코드로 연결 ----------
  $('#btnLinkCode').onclick = async () => {
    const t = await A.dialog({ title: '갱신 코드 입력', text: '랭킹 신청을 마쳤을 때 받은 갱신 코드를 넣으면, 이 기기에서도 랭킹을 보고 내 랭킹을 갱신할 수 있어요. 계산기에서 지금 고른 캐릭터에 연결돼요.', input: '', ok: '입력' });
    if (!t) return;
    const token = t.trim().toUpperCase();
    try {
      const c = await sb();
      const { data, error } = await c.rpc('my_status', { p_token: token });
      if (error) throw error;
      const st = data && data[0];
      if (!st) { toast('맞는 코드를 찾지 못했어요'); return; }
      A.setRank({ token, status: st.status, nickname: st.nickname, cls: A.cls(), cp: Number(st.cp), memo: st.memo || '' });
      if (!A.nick()) A.setNick(st.nickname);
      checked[A.key()] = false;
      toast(`${st.nickname} 캐릭터에 연결했어요`);
      canAt = 0; mineAt = 0; loadRank(true); renderLine();
    } catch (e) { toast(errMsg(e)); }
  };

  // ---------- 관리자 ----------
  async function signed(c, path) {
    if (!path) return null;
    const { data, error } = await c.storage.from('shots').createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  }
  // 사진은 한 번 받으면 이 브라우저에 보관해서 다시 볼 때는 서버에서 안 받음(저장소 전송량 절약).
  // 사진 경로는 올릴 때마다 새 이름(uuid)이라 내용이 바뀌지 않음
  const SHOT_CACHE = 'silcalc-shots-v1';
  const shotKey = (path) => 'https://shots.silcalc.invalid/' + encodeURIComponent(path);
  // 이 브라우저에 이미 받아 둔 사진인지(받아 둔 건 서버에서 안 받으니 바로 보여 줌)
  async function shotCached(path) {
    if (!path) return false;
    try { const cache = await caches.open(SHOT_CACHE); return !!(await cache.match(shotKey(path))); } catch (e) { return false; }
  }
  async function shotBlob(c, path) {
    if (!path) return null;
    const key = shotKey(path);
    let cache = null;
    try { cache = await caches.open(SHOT_CACHE); const hit = await cache.match(key); if (hit) return await hit.blob(); } catch (e) { cache = null; }
    const u = await signed(c, path); if (!u) return null;
    const res = await fetch(u); if (!res.ok) return null;
    const blob = await res.blob();
    if (cache) { try { await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })); } catch (e) { /* 저장 못 해도 그냥 씀 */ } }
    return blob;
  }
  async function shotUrl(c, path) { const b = await shotBlob(c, path); return b ? URL.createObjectURL(b) : null; }
  // 숨기기·삭제 사유: 그 사람이 다음에 사이트를 열면 창으로 보여 줌
  async function setHidden(c, id, nv) {
    let reason = '';
    if (nv) {
      const v = await A.dialog({ title: '랭킹에서 숨기기', text: '숨긴 사람이 사이트를 열면 이 사유가 창으로 보여요. 비워 둬도 돼요.', input: '', ok: '숨기기' });
      if (v === null) return null; reason = String(v).trim();
    }
    const { error } = await c.rpc('admin_hide_player', { p_id: id, p_hidden: nv, p_reason: reason });
    if (error) { toast(errMsg(error)); return null; }
    return reason;
  }
  async function adminInit() {
    const body = $('#adminBody');
    body.innerHTML = ''; body.append(el('p', { class: 'rank-note', text: '불러오는 중이에요' }));
    try {
      const c = await sb();
      const { data: { session } } = await c.auth.getSession();
      $('#btnAdminOut').hidden = !session;
      if (!session) { adminLogin(c, body); return; }
      const { data: isAdmin, error } = await c.rpc('claim_admin');
      if (error) throw error;
      if (!isAdmin) { body.innerHTML = ''; body.append(el('p', { text: '관리자 계정이 아니에요.' })); return; }
      await adminPanel(c, body);
    } catch (e) { body.innerHTML = ''; body.append(el('p', { text: '불러오지 못했어요. ' + errMsg(e) })); }
  }
  function adminLogin(c, body) {
    body.innerHTML = '';
    const note = el('p', { class: 'rank-note', text: '관리자 메일로 로그인 링크를 받아요.' });
    const mail = el('input', { type: 'email', placeholder: '메일 주소', autocomplete: 'email' });
    const go = el('button', { type: 'button', class: 'btn primary', text: '로그인 링크 받기' });
    go.onclick = async () => {
      const m = mail.value.trim(); if (!m) { mail.focus(); return; }
      go.disabled = true;
      const { error } = await c.auth.signInWithOtp({ email: m, options: { emailRedirectTo: location.origin + location.pathname + '?admin' } });
      go.disabled = false;
      if (error) { toast('보내지 못했어요. ' + errMsg(error)); return; }
      note.textContent = '메일을 보냈어요. 메일 안의 링크를 누르면 이 화면으로 돌아와요.';
    };
    body.append(note, el('div', { class: 'adm-login' }, mail, go));
  }
  async function adminPanel(c, body) {
    body.innerHTML = '';
    // 한 화면에 다 늘어놓으면 너무 길어서 탭으로 나눔(마지막에 본 탭 기억). 탭 줄은 내려도 위에 붙어 있음
    const TABS = [['apps', '신청'], ['upd', '갱신'], ['chars', '캐릭터'], ['logs', '열람 기록'], ['stats', '방문'], ['wm', '워터마크 찾기'], ['admins', '관리자']];
    const bar = el('div', { class: 'seg adm-tabs', role: 'tablist', 'aria-label': '관리 메뉴' });
    const panes = {}, tabBtn = {}, cntEl = {};
    for (const [k, t] of TABS) {
      cntEl[k] = el('b', { class: 'adm-cnt' + (k === 'apps' || k === 'upd' ? ' todo' : '') });
      tabBtn[k] = el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': 'false' }, t, cntEl[k]);
      panes[k] = el('div', { class: 'adm-pane', role: 'tabpanel' }); panes[k].hidden = true;
      tabBtn[k].onclick = () => show(k);
      bar.append(tabBtn[k]);
    }
    let cur = null;
    const show = (k) => {
      cur = k;
      for (const [x] of TABS) { tabBtn[x].setAttribute('aria-selected', String(x === k)); panes[x].hidden = x !== k; }
      try { sessionStorage.setItem('silAdmTab', k); } catch (e) { /* 무시 */ }
      const top = bar.getBoundingClientRect().top; if (top < 0) bar.scrollIntoView({ block: 'start' });
    };
    const setCnt = (k, n) => { cntEl[k].textContent = n ? String(n) : ''; cntEl[k].hidden = !n; };
    const recount = () => {
      setCnt('apps', panes.apps.querySelectorAll('.adm-item').length);
      setCnt('upd', panes.upd.querySelectorAll('.adm-item').length);
    };
    body.append(bar, ...TABS.map(([k]) => panes[k]));
    // 아무 데서도 안 쓰는 사진(거절된 신청 사진, 지운 기록의 사진 등)은 저장소에서 정리
    c.rpc('admin_orphan_shots').then(async ({ data, error }) => {
      if (error || !data || !data.length) return;
      const names = data.map(x => typeof x === 'string' ? x : Object.values(x)[0]).filter(Boolean);
      const { error: re } = await c.storage.from('shots').remove(names);
      if (!re) body.prepend(el('p', { class: 'rank-note', text: `안 쓰는 사진 ${names.length}장(거절된 신청 사진 등)을 저장소에서 지웠어요` }));
    }).catch(e => console.warn(e));

    // ---------- 신청 ----------
    const pend = el('div', { class: 'adm-sec' }, el('h3', { text: '승인 기다리는 신청' }));
    panes.apps.append(pend);
    const { data: apps, error } = await c.from('applications').select('id,nickname,cls,cp,inputs,verify_code,shot_path,pub_path,created_at').eq('status', 'pending').order('created_at');
    if (error) throw error;
    const noApps = el('p', { class: 'rank-note', text: '기다리는 신청이 없어요' }); noApps.hidden = !!apps.length;
    pend.append(noApps);
    const gone = (item) => { item.remove(); recount(); noApps.hidden = !!pend.querySelector('.adm-item'); };
    for (const a of apps) {
      const img = shotPair(c, a.shot_path, a.pub_path, (p) => c.rpc('admin_set_app_pub', { p_id: a.id, p_path: p }), 'apply');
      const ok = el('button', { type: 'button', class: 'btn primary', text: '승인' });
      const no = el('button', { type: 'button', class: 'btn', text: '거절' });
      const item = el('div', { class: 'adm-item' }, img, el('div', { class: 'adm-info' },
        el('span', { class: 'nm', text: a.nickname }),
        el('span', { text: `${a.cls}, 실투력 ${fmtInt(a.cp)}` }),
        el('span', { text: `초월:강렬 비율 ${shareText(a.inputs)}` }),
        el('span', { class: 'code' }, '인증 코드 ', el('b', { text: a.verify_code })),
        el('small', { class: 'adm-flag', text: '채팅의 인증 코드와 닉네임을 확인하세요' }),
        shotCheck(c, a.shot_path, a.inputs),
        inputsView(a.inputs),
        el('small', { text: new Date(a.created_at).toLocaleString('ko-KR') }),
        el('div', { class: 'adm-acts' }, ok, no, adminSetting(a.nickname, a.cls, a.inputs))));
      ok.onclick = async () => {
        ok.disabled = no.disabled = true;
        const { error: e } = await c.rpc('approve_application', { p_id: a.id });
        if (e) { toast(errMsg(e)); ok.disabled = no.disabled = false; return; }
        gone(item); toast(`${a.nickname} 승인했어요`);
      };
      no.onclick = async () => {
        const memo = await A.dialog({ title: '거절 이유', text: '신청한 사람 화면에 보여요. 비워 둬도 돼요.', input: '', ok: '거절' });
        if (memo === null) return;
        ok.disabled = no.disabled = true;
        const { error: e } = await c.rpc('reject_application', { p_id: a.id, p_memo: memo || '' });
        if (e) { toast(errMsg(e)); ok.disabled = no.disabled = false; return; }
        // 거절한 신청 사진은 남겨 둘 필요가 없어서 바로 지움(사유는 남음)
        const rm = [a.shot_path, a.pub_path].filter(Boolean);
        if (rm.length) { const { error: re } = await c.storage.from('shots').remove(rm); if (re) console.warn(re); }
        gone(item); toast(`${a.nickname} 신청을 거절했어요`);
      };
      pend.append(item);
    }

    // ---------- 갱신 ----------
    const held = el('div', { class: 'adm-sec' }, el('h3', { text: '확인 기다리는 갱신' }),
      el('p', { class: 'rank-note', text: '갱신은 모두 여기서 확인한 뒤에 랭킹에 올라가요. 채팅의 인증 코드·닉네임과 스탯이 맞는지 보고 반영하세요.' }));
    panes.upd.append(held);
    const { data: hs, error: e2 } = await c.from('cp_history')
      .select('id,cp,prev_cp,cls,inputs,prev_inputs,edited,status,created_at,shot_path,pub_path,verify_code,player_id,players(nickname,hidden)')
      .eq('status', 'held').order('created_at', { ascending: false }).limit(60);
    if (e2) throw e2;
    const hsHeld = hs;
    if (!hsHeld.length) held.append(el('p', { class: 'rank-note', text: '확인할 갱신이 없어요' }));
    const act = async (h, action, item, done) => {
      let memo = '';
      if (action === 'reject' || action === 'revert') {
        memo = await A.dialog({ title: action === 'reject' ? '반영하지 않기' : '되돌리기', text: '이유를 적으면 그 사람 화면에 보여요. 비워 둬도 돼요.', input: '', ok: action === 'reject' ? '반영 안 함' : '되돌리기' });
        if (memo === null) return;
      }
      for (const b of item.querySelectorAll('button')) b.disabled = true;
      const { error: e } = await c.rpc('review_update', { p_id: h.id, p_action: action, p_memo: memo || '' });
      if (e) { toast(errMsg(e)); for (const b of item.querySelectorAll('button')) b.disabled = false; return; }
      item.remove(); recount(); toast(done);
    };
    const updItem = (h) => {
      const p = h.players || {};
      const img = shotPair(c, h.shot_path, h.pub_path, (p) => c.rpc('admin_set_hist_pub', { p_id: h.id, p_path: p }), 'update');
      const diff = h.prev_cp ? (h.cp - h.prev_cp) / h.prev_cp * 100 : 0;
      const acts = el('div', { class: 'adm-acts' });
      const setBtn = adminSetting(p.nickname || '', h.cls, h.inputs);
      const item = el('div', { class: 'adm-item' }, img, el('div', { class: 'adm-info' },
        el('span', { class: 'nm', text: p.nickname || '?' }),
        el('span', { text: `${h.cls || ''}, ${h.prev_cp ? fmtInt(h.prev_cp) + ' → ' : ''}${fmtInt(h.cp)}${h.prev_cp ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)` : ''}` }),
        el('span', { text: `초월:강렬 비율 ${shareText(h.inputs)}` }),
        h.verify_code ? el('span', { class: 'code' }, '인증 코드 ', el('b', { text: h.verify_code })) : null,
        h.verify_code ? el('small', { class: 'adm-flag', text: '채팅의 인증 코드와 닉네임을 확인하세요' }) : (h.status === 'held' ? el('small', { class: 'adm-flag', text: '인증 코드 없이 들어온 갱신이에요(예전 화면)' }) : null),
        h.edited ? el('span', { class: 'adm-flag', text: '스크린샷 적용 뒤 손으로 고친 값 있음' }) : null,
        h.status === 'held' ? shotCheck(c, h.shot_path, h.inputs) : null,
        inputsView(h.inputs, h.prev_inputs),
        el('small', { text: ago(h.created_at) }), acts));
      if (h.status === 'held') {
        acts.append(el('button', { type: 'button', class: 'btn primary', text: '반영', onclick: () => act(h, 'approve', item, `${p.nickname} 갱신을 반영했어요`) }),
          el('button', { type: 'button', class: 'btn', text: '반영 안 함', onclick: () => act(h, 'reject', item, '반영하지 않았어요') }));
      } else {
        const hide = el('button', { type: 'button', class: 'btn', text: p.hidden ? '다시 보이기' : '랭킹에서 숨기기' });
        hide.onclick = async () => {
          const nv = !p.hidden;
          if (await setHidden(c, h.player_id, nv) === null) return;
          p.hidden = nv; hide.textContent = nv ? '다시 보이기' : '랭킹에서 숨기기';
          toast(nv ? '랭킹에서 숨겼어요' : '다시 보이게 했어요');
        };
        acts.append(el('button', { type: 'button', class: 'btn primary', text: '확인', onclick: () => act(h, 'check', item, '확인했어요') }),
          el('button', { type: 'button', class: 'btn', text: '되돌리기', onclick: () => act(h, 'revert', item, '이전 값으로 되돌렸어요') }), hide);
      }
      acts.append(setBtn);
      return item;
    };
    for (const h of hsHeld) held.append(updItem(h));
    recount();

    // 목록 아래 쪽수 넘기기
    const pager = (onGo) => {
      const arrow = (label, d) => { const b = el('button', { type: 'button', class: 'rk-arrow', 'aria-label': label }); b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`; return b; };
      const prev = arrow('이전 쪽', 'M15 5.5L8.5 12l6.5 6.5'), next = arrow('다음 쪽', 'M9 5.5l6.5 6.5L9 18.5');
      const no = el('span', { class: 'adm-pageno' });
      prev.onclick = () => onGo(-1); next.onclick = () => onGo(1);
      const box = el('div', { class: 'adm-pager' }, prev, no, next);
      box.set = (pg, pages) => { box.hidden = pages <= 1; no.textContent = `${pg + 1} / ${pages}`; prev.disabled = pg <= 0; next.disabled = pg >= pages - 1; };
      return box;
    };
    const searchBox = (ph) => el('input', { type: 'search', class: 'adm-search', placeholder: ph, autocomplete: 'off', enterkeyhint: 'search' });
    const has = (s, q) => String(s || '').toLowerCase().includes(q);

    // ---------- 방문 통계 ----------
    {
      const box = el('div', { class: 'adm-sec' }, el('p', { class: 'rank-note', text: '깃허브 페이지 주소로 들어온 방문이에요(한국 시간 하루 기준). 방문자는 그날 사이트를 연 브라우저 수, 처음 온 사람은 처음 연 브라우저 수예요.' }));
      panes.stats.append(box);
      c.rpc('admin_site_stats', { p_days: 60 }).then(({ data, error }) => {
        if (error) { box.append(el('p', { class: 'rank-note', text: '불러오지 못했어요. ' + errMsg(error) })); return; }
        const rows = data || [];
        if (!rows.length) { box.append(el('p', { class: 'rank-note', text: '아직 기록이 없어요' })); return; }
        const sum = (n, k) => rows.slice(0, n).reduce((a, r) => a + (Number(r[k]) || 0), 0);
        box.append(el('p', { class: 'adm-stat-sum', text: `최근 7일: 방문자 ${fmtInt(sum(7, 'visitors'))}명 · 방문 ${fmtInt(sum(7, 'views'))}번 · 처음 온 사람 ${fmtInt(sum(7, 'new_visitors'))}명 · 아바타 추천 ${fmtInt(sum(7, 'avatar'))}번` }));
        const cols = [['visitors', '방문자'], ['views', '방문'], ['new_visitors', '처음 온 사람'], ['avatar', '아바타 추천']];
        const tb = el('tbody');
        for (const r of rows) tb.append(el('tr', null, el('th', { scope: 'row', text: String(r.day).slice(5).replace('-', '/') }), ...cols.map(([k]) => el('td', { text: fmtInt(Number(r[k]) || 0) }))));
        box.append(el('div', { class: 'adm-stats-wrap' }, el('table', { class: 'adm-stats' }, el('thead', null, el('tr', null, el('th', { scope: 'col', text: '날짜' }), ...cols.map(([, t]) => el('th', { scope: 'col', text: t })))), tb)));
      }).catch(e => box.append(el('p', { class: 'rank-note', text: '불러오지 못했어요. ' + errMsg(e) })));
    }
    // ---------- 열람 기록 ----------
    // 누가 언제 무엇을 봤는지 + 기기 수(갱신 코드 돌려쓰기 확인). 이상하면 그 사람을 캐릭터 탭에서 숨기면 랭킹도 못 봐요
    const LOG_PAGE = 40;
    const logs = el('div', { class: 'adm-sec' },
      el('p', { class: 'rank-note', text: '랭킹 목록과 상세(사진·세팅)를 본 기록이에요. 180일 지나면 지워져요. 이름을 누르면 그 사람 기록만 보여요. 최근 7일 동안 기기 4대 이상에서 봤으면 갱신 코드를 나눠 줬을 수 있고, 하루에 서로 다른 캐릭터 상세를 30명 넘게 봤으면 세팅을 긁어 가는 것일 수 있어서 빨갛게 보여요.' }));
    const logQ = searchBox('닉네임 검색(본 사람 또는 본 캐릭터)');
    const logInfo = el('p', { class: 'rank-note adm-found' });
    const logBox = el('div', { class: 'adm-logs' });
    let lg = [], only = null, logPg = 0;
    const logPager = pager((d) => { logPg += d; drawLogs(); logs.scrollIntoView({ block: 'start' }); });
    logs.append(el('div', { class: 'adm-find' }, logQ), logInfo, logBox, logPager);
    panes.logs.append(logs);
    const eggName = (k) => { const [, typ, fx] = k.split(':'); const nm = typ === 'photo' ? PFX_NAME[fx] : FX_NAME[fx]; return typ === 'photo' ? `이스터에그: 신 사진${nm ? `(${nm})` : ''}` : `이스터에그: 신을 불러냄${nm ? `(${nm})` : ''}`; };
    const kindText = (l) => l.kind === 'detail' ? `${l.target_nick || '지워진 캐릭터'} 상세` : l.kind === 'list' ? '전체 랭킹'
      : l.kind.startsWith('egg:') ? eggName(l.kind) : `${l.kind.slice(5)} 랭킹`;
    // 이스터에그(신): 찾은 사람 수, 연출 10개·사진 연출 5개를 몇 개나 봤는지(다 본 사람 표시), 사람별로 본 연출 목록
    const eggBox = el('div', { class: 'adm-egg' });
    logs.querySelector('.rank-note').after(eggBox);
    (async () => {
      const { data: eg, error: ee } = await c.from('view_log').select('viewer,viewer_nick,kind,at').like('kind', 'egg:%').order('at', { ascending: true }).limit(5000);
      if (ee) { eggBox.append(el('p', { class: 'rank-note', text: '이스터에그 기록을 불러오지 못했어요. ' + errMsg(ee) })); return; }
      const NR = Object.keys(FX_NAME).length, NP = Object.keys(PFX_NAME).length, by = new Map();
      let reveals = 0;
      for (const l of eg || []) {
        const k = l.viewer || l.viewer_nick || '?', [, typ, fx] = l.kind.split(':');
        const o = by.get(k) || { nick: l.viewer_nick || '지워진 캐릭터', rv: new Set(), ph: new Set(), n: 0, first: l.at, last: l.at };
        if (typ === 'photo') { if (PFX_NAME[fx]) o.ph.add(fx); } else { o.n++; reveals++; if (FX_NAME[fx]) o.rv.add(fx); }
        o.last = l.at; by.set(k, o);
      }
      const people = [...by.values()];
      const allR = people.filter((o) => o.rv.size >= NR).length, allP = people.filter((o) => o.ph.size >= NP).length, all = people.filter((o) => o.rv.size >= NR && o.ph.size >= NP).length;
      eggBox.append(el('p', { class: 'adm-egg-head', text: people.length ? `이스터에그(신) 찾은 사람 ${people.length}명 · 불러낸 횟수 ${reveals}번` : '아직 이스터에그(신)를 찾은 사람이 없어요' }));
      if (people.length) eggBox.append(el('p', { class: 'adm-egg-sub', text: `강림 연출 ${NR}개 다 본 사람 ${allR}명 · 사진 연출 ${NP}개 다 본 사람 ${allP}명 · ${NR + NP}개 전부 본 사람 ${all}명` }));
      const pct = (w) => { const t = Object.values(w).reduce((a, b) => a + b, 0); return (k) => Math.round(w[k] / t * 100) + '%'; };
      const pr = pct(FX_W), pp = pct(PFX_W);
      eggBox.append(el('p', { class: 'adm-egg-legend', text: `나올 확률 — 강림: ${Object.keys(FX_W).map((k) => `${FX_NAME[k]} ${pr(k)}`).join(', ')} / 사진: ${Object.keys(PFX_W).map((k) => `${PFX_NAME[k]} ${pp(k)}`).join(', ')}` }));
      const when = (t) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      // 많이 모은 사람부터(같으면 먼저 찾은 사람)
      people.sort((a, b) => (b.rv.size + b.ph.size) - (a.rv.size + a.ph.size) || new Date(a.first) - new Date(b.first));
      const list = el('ol', { class: 'adm-egg-list' });
      for (const o of people.slice(0, 150)) {
        const done = o.rv.size >= NR && o.ph.size >= NP;
        const seen = el('div', { class: 'adm-egg-seen', hidden: '' },
          el('span', { text: '강림: ' + Object.keys(FX_NAME).map((k) => (o.rv.has(k) ? '✓' : '·') + FX_NAME[k]).join('  ') }),
          el('span', { text: '사진: ' + Object.keys(PFX_NAME).map((k) => (o.ph.has(k) ? '✓' : '·') + PFX_NAME[k]).join('  ') }));
        const more = el('button', { type: 'button', class: 'txt sm', text: '본 연출', onclick: () => { seen.hidden = !seen.hidden; } });
        list.append(el('li', { class: done ? 'done' : '' },
          el('button', { type: 'button', class: 'txt sm nm', text: o.nick, onclick: () => { logQ.value = o.nick; loadLogs(); } }),
          el('span', { class: 'adm-egg-cnt', text: `강림 ${o.rv.size}/${NR} · 사진 ${o.ph.size}/${NP}` }),
          done ? el('span', { class: 'adm-egg-badge', text: '전부 봄' }) : null,
          el('small', { text: `${o.n}번 불러냄 · 처음 ${when(o.first)}${o.last !== o.first ? `, 마지막 ${ago(o.last)}` : ''}` }),
          more, seen));
      }
      if (people.length) eggBox.append(list);
    })();
    const drawLogs = () => {
      logBox.textContent = '';
      const rows = only ? lg.filter(l => l.viewer === only) : lg;
      if (only) logBox.append(el('button', { type: 'button', class: 'txt sm', text: '전체 기록 보기', onclick: () => { only = null; logPg = 0; drawLogs(); } }));
      if (!rows.length) logBox.append(el('p', { class: 'rank-note', text: logQ.value.trim() ? '찾는 기록이 없어요' : '아직 기록이 없어요' }));
      // 하루 동안 상세를 본 횟수·서로 다른 캐릭터 수, 7일 동안 쓴 기기 수
      const cnt = {}, uniq = {}, devs = {};
      for (const l of lg) {
        if (l.kind === 'detail' && Date.now() - new Date(l.at) < 864e5) { cnt[l.viewer] = (cnt[l.viewer] || 0) + 1; (uniq[l.viewer] = uniq[l.viewer] || new Set()).add(l.target_nick); }
        if (l.dev && Date.now() - new Date(l.at) < 7 * 864e5) (devs[l.viewer] = devs[l.viewer] || new Set()).add(l.dev);
      }
      const pages = Math.max(1, Math.ceil(rows.length / LOG_PAGE)); logPg = Math.min(Math.max(0, logPg), pages - 1);
      for (const l of rows.slice(logPg * LOG_PAGE, (logPg + 1) * LOG_PAGE)) {
        const nDev = devs[l.viewer] ? devs[l.viewer].size : 0, nU = uniq[l.viewer] ? uniq[l.viewer].size : 0, many = nU >= 30 || nDev >= 4;
        logBox.append(el('div', { class: 'adm-log' + (many ? ' many' : '') },
          el('button', { type: 'button', class: 'txt sm nm', text: l.viewer_nick || '지워진 캐릭터', onclick: () => { only = l.viewer; logPg = 0; drawLogs(); } }),
          el('span', { text: kindText(l) }),
          el('small', { text: `${ago(l.at)}${nDev ? `, 기기 ${nDev}대(7일)` : ''}${cnt[l.viewer] ? `, 오늘 상세 ${cnt[l.viewer]}번(${nU}명)` : ''}` })));
      }
      logPager.set(logPg, pages);
    };
    let logSeq = 0;
    const loadLogs = async () => {
      const q = logQ.value.trim().replace(/[,()%*\\]/g, ''), my = ++logSeq;
      let qy = c.from('view_log').select('at,viewer,viewer_nick,kind,target_nick,dev').order('at', { ascending: false }).limit(q ? 500 : 300);
      if (q) qy = qy.or(`viewer_nick.ilike.%${q}%,target_nick.ilike.%${q}%`);
      const { data, error: e4 } = await qy;
      if (my !== logSeq) return;
      if (e4) { logInfo.textContent = '기록을 불러오지 못했어요. ' + errMsg(e4); return; }
      lg = data || []; only = null; logPg = 0;
      logInfo.textContent = q ? `'${q}' 기록 ${lg.length}개${lg.length >= 500 ? '(최근 500개까지)' : ''}` : `최근 기록 ${lg.length}개`;
      drawLogs();
    };
    let logT = 0; logQ.oninput = () => { clearTimeout(logT); logT = setTimeout(loadLogs, 350); };
    await loadLogs();

    // ---------- 캐릭터 ----------
    // 랭킹에 올라간 캐릭터: 검색 / 숨기기 / 삭제(랭킹·갱신 기록·사진 모두) / 그 캐릭터 열람 기록 보기
    const CH_PAGE = 20;
    const all = el('div', { class: 'adm-sec' },
      el('p', { class: 'rank-note', text: '숨기면 랭킹에서 빠지고 그 사람은 랭킹도 못 봐요(분탕 차단). 삭제하면 랭킹, 갱신 기록, 사진이 모두 지워지고 되돌릴 수 없어요.' }));
    panes.chars.append(all);
    const { data: ps, error: e3 } = await c.from('players').select('id,nickname,cls,cp,hidden,hide_reason,updated_at,shot_path,god').order('cp', { ascending: false }).limit(1000);
    if (e3) throw e3;
    ps.forEach((p, i) => { p.rank = i + 1; });
    setCnt('chars', ps.length);
    // 예전에 올라간 사진 중 흐린 사본이 아닌 것: 다른 사람 이름을 가린 사본으로 바꿈(원본은 갱신 기록에 남음)
    const raw = ps.filter(p => p.shot_path && !isPubPath(p.shot_path));
    if (raw.length) {
      const fix = el('button', { type: 'button', class: 'btn', text: `예전 랭킹 사진 ${raw.length}장 이름 가리기` });
      fix.onclick = async () => {
        fix.disabled = true; let done = 0, miss = [];
        for (const p of raw) {
          try {
            const b = await shotBlob(c, p.shot_path); if (!b) throw new Error('사진 없음');
            const cv = await blobToCanvas(b);
            const pc = privacyBlur(cv); if (!pc) { miss.push(p.nickname); continue; }
            const blob = await toPub(pc), path = `apply/${uuid()}_p.${extOf(blob)}`;
            const up = await c.storage.from('shots').upload(path, blob, { contentType: blob.type, upsert: false });
            if (up.error) throw up.error;
            const { error: e } = await c.rpc('admin_set_pub', { p_id: p.id, p_path: path });
            if (e) throw e;
            p.shot_path = path; done++;
          } catch (e) { console.warn(e); miss.push(p.nickname); }
        }
        fix.textContent = `${done}장 가렸어요${miss.length ? `, 못 가린 사진: ${miss.join(', ')}` : ''}`;
      };
      all.append(fix);
    }
    // 예전에 JPEG로 올린 랭킹 사진을 WebP로 다시 저장(같은 글자 선명도에 크기 절반쯤 → 보는 사람마다 받는 양이 줄어 저장소 전송량 절약)
    const jpgs = ps.filter(p => p.shot_path && /_p\.jpg$/.test(p.shot_path));
    if (jpgs.length) {
      const sq = el('button', { type: 'button', class: 'btn', text: `랭킹 사진 ${jpgs.length}장 용량 줄이기` });
      const sqOut = el('p', { class: 'rank-note' });
      sq.onclick = async () => {
        sq.disabled = true; let done = 0, before = 0, after = 0; const miss = [];
        for (const p of jpgs) {
          sqOut.textContent = `줄이는 중이에요 (${done + miss.length + 1}/${jpgs.length})`;
          try {
            const b = await shotBlob(c, p.shot_path); if (!b) throw new Error('사진 없음');
            const cv0 = await blobToCanvas(b); let k0 = null; try { k0 = privacyRects(cv0); } catch (e) { k0 = null; }
            const nb = await toPub(cropKeep(cv0, k0));
            if (nb.type !== 'image/webp' || nb.size >= b.size * 0.9) { miss.push(p.nickname); continue; }
            const path = `${/^update\//.test(p.shot_path) ? 'update' : 'apply'}/${uuid()}_p.webp`;
            const up = await c.storage.from('shots').upload(path, nb, { contentType: 'image/webp', upsert: false });
            if (up.error) throw up.error;
            const { error: e } = await c.rpc('admin_set_pub', { p_id: p.id, p_path: path });
            if (e) throw e;
            before += b.size; after += nb.size; p.shot_path = path; done++;
          } catch (e) { console.warn(e); miss.push(p.nickname); }
        }
        const kb = (n) => Math.round(n / 1024).toLocaleString('ko-KR') + 'KB';
        sqOut.textContent = `${done}장을 줄였어요 (${kb(before)} → ${kb(after)})${miss.length ? `. 그대로 둔 사진: ${miss.join(', ')}` : ''}`;
        sq.textContent = '랭킹 사진 용량 줄이기 끝';
      };
      all.append(el('div', { class: 'adm-recalc' }, sq, sqOut));
    }
    const chQ = searchBox('닉네임 또는 전직 검색');
    const onlyHid = el('input', { type: 'checkbox' });
    const chInfo = el('p', { class: 'rank-note adm-found' });
    const chBox = el('div');
    let chPg = 0;
    const chPager = pager((d) => { chPg += d; drawChars(); all.scrollIntoView({ block: 'start' }); });
    all.append(el('div', { class: 'adm-find' }, chQ, el('label', { class: 'adm-chk' }, onlyHid, '숨긴 캐릭터만')), chInfo, chBox, chPager);
    const charItem = (p) => {
      const tag = () => (p.god ? ' [신]' : '') + (p.hidden ? ` (숨김${p.hide_reason ? ': ' + p.hide_reason : ''})` : '');
      const nm = el('span', { class: 'nm', text: `${p.rank}. ${p.nickname}${tag()}` });
      const hide = el('button', { type: 'button', class: 'btn', text: p.hidden ? '다시 보이기' : '숨기기' });
      const del = el('button', { type: 'button', class: 'btn danger', text: '삭제' });
      const seeLog = el('button', { type: 'button', class: 'btn', text: '열람 기록' });
      seeLog.onclick = () => { logQ.value = p.nickname; show('logs'); loadLogs(); };
      // 랭킹에 보이는 사진의 가린 곳을 다시 정함(원본은 갱신 기록에 남아 있음)
      const fixShot = el('button', { type: 'button', class: 'btn', text: '사진 가릴 곳 고치기' });
      fixShot.hidden = !p.shot_path;
      fixShot.onclick = async () => {
        fixShot.disabled = true;
        try {
          const { data: hs } = await c.from('cp_history').select('shot_path,pub_path').eq('player_id', p.id).order('created_at', { ascending: false }).limit(30);
          const h = (hs || []).find(x => x.pub_path === p.shot_path || x.shot_path === p.shot_path);
          const origPath = h ? h.shot_path : p.shot_path;
          const b = await shotBlob(c, origPath); if (!b) throw new Error('원본 사진을 열지 못했어요');
          const cv = await blobToCanvas(b);
          const rects = await editKeep(cv, privacyRects(cv) || []);
          if (rects) {
            const blob = await toPub(pubOf(cv, rects)), path = `${/^update\//.test(origPath) ? 'update' : 'apply'}/${uuid()}_p.${extOf(blob)}`;
            const up = await c.storage.from('shots').upload(path, blob, { contentType: blob.type, upsert: false });
            if (up.error) throw up.error;
            const { error: e } = await c.rpc('admin_set_player_pub', { p_id: p.id, p_path: path });
            if (e) throw e;
            p.shot_path = path; toast(`${p.nickname} 랭킹 사진을 바꿨어요`);
          }
        } catch (e) { console.warn(e); toast('바꾸지 못했어요. ' + errMsg(e)); }
        fixShot.disabled = false;
      };
      const item = el('div', { class: 'adm-item adm-plain' }, el('div', { class: 'adm-info' }, nm,
        el('span', { text: `${p.cls}, 실투력 ${fmtInt(p.cp)}` }),
        el('small', { text: `${ago(p.updated_at)} 갱신` }),
        el('div', { class: 'adm-acts' }, hide, seeLog, fixShot, del)));
      hide.onclick = async () => {
        const nv = !p.hidden;
        const why = await setHidden(c, p.id, nv); if (why === null) return;
        p.hidden = nv; p.hide_reason = nv ? why : null; hide.textContent = nv ? '다시 보이기' : '숨기기';
        nm.textContent = `${p.rank}. ${p.nickname}${tag()}`;
        toast(nv ? '랭킹에서 숨겼어요' : '다시 보이게 했어요');
      };
      del.onclick = async () => {
        const why = await A.dialog({ title: `${p.nickname} 삭제`, text: '랭킹, 갱신 기록, 사진이 모두 지워지고 되돌릴 수 없어요. 지운 사람이 사이트를 열면 아래 사유가 창으로 보여요(비워 둬도 돼요).', input: '', ok: '삭제', danger: true });
        if (why === null) return;
        hide.disabled = del.disabled = true;
        // 흐린 사본(pub_path) 파일도 같이 지우려고 먼저 모아 둠
        let pubs = [];
        try {
          const [h1, h2] = await Promise.all([c.from('cp_history').select('pub_path').eq('player_id', p.id), c.from('applications').select('pub_path').ilike('nickname', p.nickname)]);
          pubs = [...(h1.data || []), ...(h2.data || [])].map(x => x.pub_path).filter(Boolean);
        } catch (e) { console.warn(e); }
        const { data: paths, error: e } = await c.rpc('admin_delete_player', { p_id: p.id, p_reason: String(why).trim() });
        if (e) { toast(errMsg(e)); hide.disabled = del.disabled = false; return; }
        const rm = [...new Set([...(paths || []), ...pubs])];
        if (rm.length) { const { error: re } = await c.storage.from('shots').remove(rm); if (re) console.warn(re); }
        ps.splice(ps.indexOf(p), 1); setCnt('chars', ps.length); drawChars();
        toast(`${p.nickname} 랭킹을 지웠어요`);
      };
      return item;
    };
    const drawChars = () => {
      const q = chQ.value.trim().toLowerCase();
      const rows = ps.filter(p => (!onlyHid.checked || p.hidden) && (!q || has(p.nickname, q) || has(p.cls, q)));
      const pages = Math.max(1, Math.ceil(rows.length / CH_PAGE)); chPg = Math.min(Math.max(0, chPg), pages - 1);
      chBox.textContent = '';
      if (!ps.length) chBox.append(el('p', { class: 'rank-note', text: '아직 올라간 캐릭터가 없어요' }));
      else if (!rows.length) chBox.append(el('p', { class: 'rank-note', text: '찾는 캐릭터가 없어요' }));
      for (const p of rows.slice(chPg * CH_PAGE, (chPg + 1) * CH_PAGE)) chBox.append(charItem(p));
      chInfo.textContent = q || onlyHid.checked ? `${rows.length}명 찾았어요` : `모두 ${ps.length}명`;
      chPager.set(chPg, pages);
    };
    chQ.oninput = () => { chPg = 0; drawChars(); };
    onlyHid.onchange = () => { chPg = 0; drawChars(); };
    drawChars();

    // ---------- 워터마크 찾기 ----------
    panes.wm.append(wmFinder(c, ps));

    // ---------- 관리자 ----------
    // 처음 관리자(주인)가 메일을 넣어 두면, 그 메일로 이 화면에서 로그인한 사람이 관리자가 됨. 주인만 넣고 뺄 수 있음
    const adm = el('div', { class: 'adm-sec' },
      el('p', { class: 'rank-note', text: '여기에 메일을 넣어 두면 그 사람이 이 화면(주소 끝 ?admin)에서 그 메일로 로그인 링크를 받아 관리자가 돼요. 관리자는 신청·갱신 승인, 숨기기·삭제, 열람 기록을 모두 할 수 있어요. 넣고 빼는 건 처음 관리자만 할 수 있어요.' }));
    const admList = el('div', { class: 'adm-admins' });
    const admMail = el('input', { type: 'email', class: 'adm-search', placeholder: '관리자로 넣을 메일 주소', autocomplete: 'off' });
    const admAdd = el('button', { type: 'button', class: 'btn primary', text: '관리자로 넣기' });
    const admForm = el('div', { class: 'adm-find' }, admMail, admAdd);
    adm.append(admList, admForm);
    panes.admins.append(adm);
    const drawAdmins = async () => {
      const { data, error: ea } = await c.rpc('admin_list');
      admList.textContent = '';
      if (ea) { admList.append(el('p', { class: 'adm-flag', text: '관리자 목록을 불러오지 못했어요. ' + errMsg(ea) })); admForm.hidden = true; return; }
      const meOwner = (data || []).some(a => a.is_me && a.is_owner);
      admForm.hidden = !meOwner;
      for (const a of data || []) {
        const row = el('div', { class: 'adm-item adm-plain' }, el('div', { class: 'adm-info' },
          el('span', { class: 'nm', text: a.email || '(메일 없음)' }),
          el('small', { text: [a.is_owner ? '처음 관리자' : '', a.is_me ? '나' : '', a.joined ? '로그인함' : '아직 로그인 안 함'].filter(Boolean).join(', ') })));
        if (meOwner && !a.is_owner) {
          const rm = el('button', { type: 'button', class: 'btn danger', text: '빼기' });
          rm.onclick = async () => {
            if (!await A.dialog({ title: '관리자에서 빼기', text: `${a.email} 을(를) 관리자에서 빼요. 바로 관리자 화면을 못 쓰게 돼요.`, ok: '빼기', danger: true })) return;
            const { error: er } = await c.rpc('admin_remove', { p_email: a.email });
            if (er) { toast(errMsg(er)); return; }
            toast('관리자에서 뺐어요'); drawAdmins();
          };
          row.querySelector('.adm-info').append(el('div', { class: 'adm-acts' }, rm));
        }
        admList.append(row);
      }
    };
    admAdd.onclick = async () => {
      const m = admMail.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) { toast('메일 주소를 확인해 주세요'); admMail.focus(); return; }
      admAdd.disabled = true;
      const { error: er } = await c.rpc('admin_invite', { p_email: m });
      admAdd.disabled = false;
      if (er) { toast(errMsg(er)); return; }
      admMail.value = ''; toast('관리자로 넣었어요. 그 메일로 로그인하면 관리자가 돼요'); drawAdmins();
    };
    drawAdmins();

    // 처음 열 탭: 마지막에 보던 탭, 없으면 할 일이 있는 탭
    let first = null; try { first = sessionStorage.getItem('silAdmTab'); } catch (e) { /* 무시 */ }
    if (!panes[first]) first = apps.length ? 'apps' : hsHeld.length ? 'upd' : 'chars';
    show(first);
  }
  $('#btnAdminOut').onclick = async () => { const c = await sb(); await c.auth.signOut(); adminInit(); };

  // ---------- 시작 ----------
  const qs = new URLSearchParams(location.search);
  if (qs.has('admin')) setView('admin');
  else if (qs.has('rank')) setView('rank');
  else if (qs.has('avatar')) setView('avatar');
  renderLine();
})();
