/* 실투력 랭킹: 목록 · 신청 · 스크린샷으로 갱신 · 관리자 승인 (Supabase) */
(function () {
  'use strict';
  const A = window.SilApp;
  if (!A || !window.SIL_CDN) return; // 직접 호스팅판(GitHub Pages)에서만 켬

  const SB_URL = 'https://qaeheqbuzwxbaujrsktr.supabase.co';
  const SB_KEY = 'sb_publishable_J0YXiKlO-CdW_vK_k5UhXA_mE7kvs1N'; // 공개용 키(브라우저에 넣어도 되는 키)
  const SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  const $ = (s, r) => (r || document).querySelector(s);
  const { el, toast, fmtInt, korUnit } = A;

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
      s.src = SB_JS; s.async = true; s.onload = make;
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
  // 스크린샷은 JPEG로 줄여서 올림(가로 최대 1920)
  function toJpeg(src) {
    const k = Math.min(1, 1920 / src.width);
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('사진을 변환하지 못했어요')), 'image/jpeg', 0.85));
  }
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
  function privacyBlur(src) { const k = privacyRects(src); return k ? blurKeep(src, k) : null; }
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
      signed(c, path).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank', 'noopener'); } });
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
      const u = await signed(c, orig); if (!u) throw new Error('원본 사진을 열지 못했어요');
      return blobToCanvas(await (await fetch(u)).blob());
    })().catch(e => { cvP = null; throw e; }));
    const save = async (pc) => {
      const path = `${folder}/${uuid()}_p.jpg`;
      const up = await c.storage.from('shots').upload(path, await toJpeg(pc), { contentType: 'image/jpeg', upsert: false });
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
        if (rects) { await save(blurKeep(cv, rects)); toast('랭킹에 보일 사진을 바꿨어요'); }
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
  let rkCls = '', rkPage = 0, rkBusy = false, rkTotal = null, rkTotalFor = null;
  // 전체 인원: 실투력 -1보다 높은 사람 수(= 모두)를 순위 조회로 셈
  async function countRank(c) {
    try {
      const { data, error } = await c.rpc('rank_pos', { p_cp: -1, p_cls: rkCls || null });
      if (error) throw error;
      const r = data && data[0]; if (!r) throw new Error('no');
      rkTotal = Math.max(0, (rkCls ? r.in_cls : r.overall) - 1); rkTotalFor = rkCls;
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
        const { data: ok, error: ve } = await c.rpc('can_view');
        if (ve) throw ve;
        $('#rankFilters').hidden = !ok;
        if (ok) loadMine(c); else { mine = []; drawMine(); }
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
      // 한 명 더 받아서 다음 쪽이 있는지 알아봄
      const { data, error } = await c.rpc('rank_list', { p_cls: rkCls || null, p_offset: rkPage * PAGE, p_limit: PAGE + 1 });
      if (error) throw error;
      if (!data.length && rkPage > 0) { rkPage--; rkBusy = false; return loadRank(false); }
      if (reset || rkTotalFor !== rkCls) await countRank(c);
      more = data.length > PAGE;
      list.innerHTML = '';
      renderRows(data.slice(0, PAGE), rkPage * PAGE);
      if (!reset) drawMine();
      empty.hidden = data.length > 0;
      if (!data.length) empty.textContent = rkCls ? `${rkCls} 랭킹에 아직 아무도 없어요` : '아직 올라온 캐릭터가 없어요. 계산기에서 "랭킹에 올리기"로 첫 번째가 되어 보세요';
    } catch (e) {
      empty.hidden = false; empty.textContent = '랭킹을 불러오지 못했어요. ' + errMsg(e);
    }
    const n = list.children.length;
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
  function renderRows(rows, start) {
    const me = new Set(Object.values(A.ranks()).filter(r => r && r.status === 'approved').map(r => String(r.nickname).toLowerCase()));
    const myIds = new Set(mine.map(m => m.id));
    const list = $('#rankList'), mark = textMark();
    rows.forEach((r, i) => {
      const li = el('li', { class: myIds.has(r.id) || me.has(r.nickname.toLowerCase()) ? 'me' : '', 'data-id': r.id });
      li.append(
        el('button', { type: 'button', class: 'rk-row', 'aria-expanded': 'false', onclick: (e) => toggleDetail(li, r, e.currentTarget) },
          rankNo(start + i + 1),
          el('span', { class: 'rk-who' },
            el('span', { class: 'rk-name', text: r.nickname }),
            el('span', { class: 'rk-meta' }, el('span', { text: r.cls + mark }), el('span', { text: ago(r.updated_at) }))),
          el('span', { class: 'rk-cp' }, el('b', { text: fmtInt(r.cp) }), el('small', { text: korUnit(r.cp) }))));
      list.append(li);
    });
  }
  // 펼친 줄: 지금 실투력을 낸 스크린샷 + 계산기에서 세팅 보기
  // 강렬:초월 점유율 설명 (랭킹 상세·관리자 화면)
  const nf = (v) => String(Math.round(Number(v) * 100) / 100);
  function shareText(i) {
    i = i || {};
    if (i.L42 === true) return `${nf(i.K46 ?? 65)} : ${nf(i.I46 ?? 35)} (${/이후/.test(i.M46 || '') ? '딜 미터로 잰 비율' : '감으로 넣은 비율'})`;
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
  // 글자 워터마크: 화면에 안 보이는 폭 0 문자로 '보는 사람(닉네임 지문)·시각(시 단위)'을 순위 줄마다 숨겨 둠.
  // 목록을 복사해서 글로 퍼뜨려도 남고, 관리자 화면 '워터마크 찾기'에 붙여 넣으면 읽힘(복사한 곳이 이런 문자를 지우면 사라짐)
  const ZW = ['\u200B', '\u200C', '\u200D', '\u2060'], ZW_MARK = '\u2063', WM_EPOCH = Date.UTC(2026, 0, 1);
  const fnv = (s) => { let h = 0x811c9dc5; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h & 0xffffff; };
  function textMark() {
    let v = fnv(viewerName()) * 65536 + (Math.max(0, Math.floor((Date.now() - WM_EPOCH) / 36e5)) & 0xffff), out = '';
    for (let i = 0; i < 20; i++) { out = ZW[v % 4] + out; v = Math.floor(v / 4); }
    return ZW_MARK + out + ZW_MARK;
  }
  function readTextMarks(s) {
    const re = new RegExp(ZW_MARK + '([' + ZW.join('') + ']{20})' + ZW_MARK, 'g'), seen = new Map();
    for (const m of String(s).matchAll(re)) {
      let v = 0; for (const ch of m[1]) v = v * 4 + ZW.indexOf(ch);
      const k = m[1]; if (!seen.has(k)) seen.set(k, { hash: Math.floor(v / 65536), at: new Date(WM_EPOCH + (v % 65536) * 36e5) });
    }
    return [...seen.values()];
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
  // 퍼진 캡처에서 워터마크 드러내기: 주변 평균과의 아주 작은 차이만 남겨 크게 키움(색 차이·밝기 차이 두 가지)
  function revealMark(src, mode) {
    const w = src.width, h = src.height, d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const v = new Float32Array(w * h);
    for (let i = 0, j = 0; j < v.length; i += 4, j++) v[j] = mode === 'faint' ? d[i + 2] : mode === 'lum' ? (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) : d[i + 2] - (d[i] + d[i + 1]) / 2;
    const W = w + 1, S = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += v[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; } }
    const M = Math.max(w, h), faint = mode === 'faint';
    const R = faint ? Math.max(6, Math.round(M / 50)) : Math.max(4, Math.round(M / 120)), gain = faint ? 60 : mode === 'lum' ? 14 : 10;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const og = out.getContext('2d'), od = og.createImageData(w, h), o = od.data;
    const res = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
        const mean = (S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
        const r = mean - v[y * w + x];
        res[y * w + x] = faint ? Math.max(-2.5, Math.min(2.5, r)) : r;
      }
    }
    let fin = res;
    if (faint) {
      // 압축 잡음(작은 점)은 살짝 뭉갬. 글자·테두리처럼 크게 튀는 곳은 위에서 잘라 냄
      const r2 = Math.max(1, Math.round(M / 700)), T = new Float64Array(W * (h + 1));
      for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += res[y * w + x]; T[(y + 1) * W + x + 1] = T[y * W + x + 1] + row; } }
      fin = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r2), y1 = Math.min(h, y + r2 + 1);
        for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r2), x1 = Math.min(w, x + r2 + 1); fin[y * w + x] = (T[y1 * W + x1] - T[y0 * W + x1] - T[y1 * W + x0] + T[y0 * W + x0]) / ((y1 - y0) * (x1 - x0)); }
      }
    }
    for (let j = 0; j < w * h; j++) { const q = 128 + fin[j] * gain, p = j * 4; o[p] = o[p + 1] = o[p + 2] = q; o[p + 3] = 255; }
    og.putImageData(od, 0, 0);
    return out;
  }
  function wmFinder(c, ps) {
    ps = ps || [];
    // 1) 퍼진 사진: 어느 캐릭터 사진인지 고르면, 원본과 맞대어 누구 무늬인지 찾음
    const who = el('input', { type: 'search', class: 'adm-search', placeholder: '사진 속 캐릭터 닉네임(비워 두면 자동으로 찾아요)', list: 'wmChars', autocomplete: 'off' });
    const dl = el('datalist', { id: 'wmChars' }); for (const p of ps) dl.append(el('option', { value: p.nickname }));
    const out = el('div', { class: 'wm-out wm-result' });
    const old = el('details', { class: 'wm-old' }, el('summary', { text: '예전 방식으로 보기(랭킹 목록 캡처, 예전 글자 무늬)' }));
    let leakCv = null, busy = false;
    const z1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const run = async () => {
      if (!leakCv || busy) return;
      const nm = who.value.trim();
      const p = ps.find(x => x.nickname === nm) || ps.find(x => x.nickname.toLowerCase() === nm.toLowerCase());
      out.textContent = '';
      if (nm && !p) { out.append(el('p', { class: 'adm-flag', text: '랭킹 캐릭터 목록에서 골라 주세요. 모르면 비워 두면 자동으로 찾아요.' })); return; }
      busy = true;
      const note = el('p', { class: 'rank-note', text: '원본 사진을 불러오는 중이에요' }); out.append(note);
      try {
        const loadShot = async (path) => { const u = await signed(c, path); return u ? blobToCanvas(await (await fetch(u)).blob()) : null; };
        let best = null, found = p;
        if (!p) {
          // 사진 속 캐릭터를 모르면: 랭킹 캐릭터 사진마다 대충 맞대 보고(작게) 가장 잘 맞는 캐릭터를 고름
          const list = ps.filter(x => x.shot_path); let top = [];
          for (let k = 0; k < list.length; k++) {
            note.textContent = `사진 속 캐릭터를 찾는 중이에요 (${k + 1}/${list.length})`;
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
        if (!best || best.at.q < 0.3) { note.textContent = `퍼진 사진 안에서 ${p2.nickname} 랭킹 사진을 못 찾았어요. 다른 캐릭터 사진이거나, 너무 작게 잘렸을 수 있어요.`; busy = false; return; }
        note.textContent = '누구 무늬인지 비교하는 중이에요';
        await new Promise(r => setTimeout(r, 0));
        const res = residualGrid(best.o, leakCv, best.at);
        if (!res) { note.textContent = '사진이 너무 작게 들어 있어서 비교할 수 없어요.'; busy = false; return; }
        const { data: vl } = await c.from('view_log').select('viewer_nick,at').eq('kind', 'detail').eq('target', p2.id).order('at', { ascending: false }).limit(1000);
        const names = [...new Set(['관리자', ...ps.map(x => x.nickname), ...(vl || []).map(v => v.viewer_nick).filter(Boolean)])];
        const sc = scoreNames(res, best.o.width, best.o.height, best.path, names);
        const top = sc[0], second = sc[1] ? sc[1].z : 0, gap = top.z - second;
        const sure = top.z >= 6 && gap >= 3, likely = !sure && top.z >= 4.5 && gap >= 2;
        out.textContent = '';
        out.append(el('p', { class: 'wm-verdict' + (sure ? ' sure' : likely ? ' likely' : '') },
          sure ? `${top.name} 님이 본 화면이에요` : likely ? `${top.name} 님일 가능성이 높아요` : '누가 본 화면인지 가려내지 못했어요',
          el('small', { text: sure || likely ? ` (점수 ${z1(top.z)}, 다음 후보 ${z1(second)})` : ' (예전 방식 무늬였거나 사진이 너무 많이 줄었을 수 있어요. 아래 남은 차이 그림에 글자가 보이면 그 글자가 본 사람이에요)' })));
        const seen = (vl || []).filter(v => v.viewer_nick === top.name).slice(0, 5).map(v => new Date(v.at).toLocaleString('ko-KR'));
        if ((sure || likely) && seen.length) out.append(el('p', { class: 'rank-note', text: `${top.name} 님이 ${p2.nickname} 상세를 본 기록: ${seen.join(', ')}${(vl || []).filter(v => v.viewer_nick === top.name).length > 5 ? ' 외' : ''}` }));
        out.append(el('ol', { class: 'wm-cands' }, ...sc.slice(0, 5).map(x => el('li', { text: `${x.name}  ${z1(x.z)}` }))));
        out.append(el('p', { class: 'rank-note', text: `사진 속 캐릭터: ${p2.nickname}. 후보 ${names.length}명 중 점수가 높은 순서예요. 무늬가 없는 사람은 0 근처(대개 3 아래)이고, 본 사람은 6을 훌쩍 넘어요. 맞대기 정도 ${Math.round(best.at.q * 100)}%` }));
        const fig = el('figure', { class: 'wm-res' }, res.view, el('figcaption', { text: '원본을 빼고 남은 차이(밝게 키움)' }));
        out.append(fig);
      } catch (e) { console.warn(e); out.textContent = '찾지 못했어요. ' + errMsg(e); }
      busy = false;
    };
    who.addEventListener('change', run);
    // 복사해서 퍼진 글: 숨은 글자를 읽어 닉네임 지문과 맞는 랭킹 캐릭터를 찾음
    const txt = el('textarea', { class: 'wm-text', rows: '3', placeholder: '퍼진 글(랭킹을 복사해 붙인 글)을 여기에 붙여 넣으세요' });
    const txtOut = el('div', { class: 'wm-out' });
    txt.oninput = async () => {
      const marks = readTextMarks(txt.value); txtOut.textContent = '';
      if (!txt.value.trim()) return;
      if (!marks.length) { txtOut.textContent = '숨은 글자를 못 찾았어요. 복사한 곳에서 지워졌을 수 있어요'; return; }
      const names = ['관리자'].concat(ps.map(x => x.nickname));
      for (const m of marks) {
        const hit = names.filter(n => fnv(n) === m.hash);
        const d = m.at, z = (n) => String(n).padStart(2, '0');
        txtOut.append(el('p', { text: `${hit.length ? hit.join(' 또는 ') : '모르는 사람(지워진 캐릭터일 수 있어요)'}, ${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}시쯤 본 화면` }));
      }
    };
    const show = async (blob) => {
      if (!blob) return;
      try {
        leakCv = await blobToCanvas(blob);
        old.querySelectorAll(':scope > :not(summary)').forEach(n => n.remove());
        old.append(el('p', { text: '안 보이는 글자 찾기(랭킹 목록 캡처 원본)' }), revealMark(leakCv, 'faint'), el('p', { text: '색 차이로 찾기' }), revealMark(leakCv, 'chroma'), el('p', { text: '밝기 차이로 찾기' }), revealMark(leakCv, 'lum'));
        zone.querySelector('p').textContent = `넣은 사진: ${leakCv.width}×${leakCv.height}. 다른 사진으로 바꾸려면 다시 붙여 넣으세요.`;
        run();
      } catch (e) { out.textContent = '이미지를 열지 못했어요'; }
    };
    const fin = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    fin.onchange = () => show(fin.files[0]);
    const zone = el('div', { class: 'wm-drop', tabindex: '0' },
      el('p', { text: '퍼진 캡처·사진을 이 칸을 누른 뒤 Ctrl + V로 붙여 넣거나 끌어다 놓으세요.' }),
      el('button', { type: 'button', class: 'btn', text: '이미지 열기', onclick: () => fin.click() }), fin);
    zone.addEventListener('paste', (e) => { const f = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/')); if (f) { e.preventDefault(); e.stopPropagation(); show(f.getAsFile()); } });
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => { e.preventDefault(); show([...e.dataTransfer.files].find(f => f.type.startsWith('image/'))); });
    return el('div', { class: 'adm-sec' }, el('h3', { text: '워터마크 찾기' }),
      el('p', { class: 'rank-note', text: '랭킹 사진에는 보는 사람마다 다른 무늬가 눈에 안 띄게 깔려 있어요. 퍼진 캡처나 휴대폰으로 찍은 사진을 넣으면, 사진 속 랭킹 캐릭터의 원본 사진과 맞대어 누가 본 화면인지 찾아요. 아래 칸은 퍼뜨린 사람이 아니라 사진에 찍힌 캐릭터예요(알면 빨라지고, 비워 두면 자동으로 찾아요). 줄이거나 다시 저장한 사진도 대개 찾을 수 있어요. 11월 17일 업데이트 전 화면(예전 글자 무늬)은 아래 남은 차이 그림에 글자로 보일 수 있어요.' }),
      zone, el('div', { class: 'adm-find' }, who, dl), out, old,
      el('h3', { text: '복사한 글에서 찾기' }), txt, txtOut);
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
  async function toggleDetail(li, r, btnEl) {
    const open = li.classList.toggle('open');
    btnEl.setAttribute('aria-expanded', String(open));
    let box = li.querySelector('.rk-detail');
    if (!open) { if (box) box.hidden = true; return; }
    if (box) { box.hidden = false; return; }
    const img = el('img', { alt: `${r.nickname} 실투력 스크린샷` });
    const cap = el('p', { class: 'rk-cap', text: '사진 불러오는 중이에요' });
    const shareP = el('p', { class: 'rk-cap', text: '초월:강렬 비율 불러오는 중' });
    const shot = el('button', { type: 'button', class: 'rk-shot', 'aria-label': '사진 크게 보기' }, img);
    let marked = false;
    shot.onclick = () => { if (img.src) lightbox(img.src, img.alt, marked); };
    box = el('div', { class: 'rk-detail' },
      shot,
      el('div', { class: 'rk-side' },
        cap,
        el('p', { class: 'rk-cap', text: `실투력 ${fmtInt(r.cp)}, ${ago(r.updated_at)} 갱신${textMark()}` }),
        shareP,
        el('div', { class: 'rk-btns' },
          el('button', { type: 'button', class: 'btn', text: '계산기에서 세팅 보기', onclick: () => openPlayer(r) }),
          rkCls ? null : el('button', { type: 'button', class: 'btn', text: `${r.cls} 랭킹`, onclick: () => showClass(r.cls) }))));
    li.append(box);
    try {
      const c = await sb();
      await playerDetail(c, r);
      shareP.textContent = `초월:강렬 비율 ${shareText(r.inputs)}`;
      const u = r.shot_path ? await signed(c, r.shot_path) : null;
      const bu = u ? await bakeShot(u, viewerName() + '|' + r.shot_path) : null;
      if (bu) { marked = true; img.src = bu; }
      else if (u) { img.src = u; shot.append(watermark()); }
      if (u) cap.textContent = '지금 랭킹 값을 낸 스크린샷이에요. 누르면 크게 보여요.';
      else { shot.hidden = true; cap.textContent = '사진이 아직 없어요.'; }
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
  clsQ.addEventListener('focus', () => { clsQ.select(); optIdx = -1; drawOpts(); });
  clsQ.addEventListener('input', () => { optIdx = 0; drawOpts(); });
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
    if (mode === 'cls') { rkCls = cls || rkCls || A.cls() || CLASSES[0]; clsQ.value = rkCls; }
    else rkCls = '';
    $('#rankTitle').textContent = rkCls ? `${rkCls} 랭킹` : '실투력 랭킹';
    return loadRank(!keepPage);
  }
  function showClass(cls) { setMode('cls', cls); window.scrollTo(0, 0); }
  $('#rankMode').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setMode(b.dataset.v); });

  // ---------- 내 순위(이 브라우저에 있는 승인된 캐릭터) ----------
  let mine = [];
  async function loadMine(c) {
    try { const { data, error } = await c.rpc('my_ranks'); if (error) throw error; mine = data || []; } catch (e) { mine = []; }
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
  function renderLine() {
    const r = A.rank();
    if (A.isShared() || (!r && A.missing().includes('세팅'))) { line.hidden = true; return; }
    line.hidden = false; line.innerHTML = '';
    if (!r) {
      line.append(el('span', { class: 'rk-state', text: '랭킹에 아직 안 올렸어요' }), el('span', { class: 'acts' }, btn('랭킹에 올리기', openApply)));
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

  // 피시방·에너지드링크·지애·이벤트 버프를 켠 세팅은 랭킹에 올리지 않음(서버에도 안 보냄)
  function buffBlocked() {
    const bf = A.rankBuffs ? A.rankBuffs() : [];
    if (!bf.length) return false;
    A.dialog({ title: '랭킹에 올릴 수 없어요', text: `${bf.join(', ')}이(가) 켜져 있어요. 이 버프를 켠 세팅은 랭킹에 올릴 수 없어요. 세팅의 스킬·장비 탭 '도핑'에서 끈 뒤(이벤트 버프는 '미적용'으로) 다시 눌러 주세요.`, ok: '확인' });
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
        st.img = await toJpeg(cv);
        const pc = privacyBlur(cv); st.pub = pc ? await toJpeg(pc) : null;
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
      el('p', { text: '게임 채팅창에 이 코드를 입력한 다음, 채팅이 보이게 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 찍어 넣어 주세요. PC방 혜택과 지애 버프는 끄고 찍어 주세요.' }),
      exampleFig(),
      el('p', { class: 'apply-privacy', text: '신청하면 닉네임, 계산기 세팅, 스크린샷이 랭킹용으로 저장돼요. 랭킹을 볼 때는 본 기록(본 캐릭터, 시각, 기기 구분용 임의 번호)이 180일 동안 남아요. IP 주소는 모으지 않아요.' }),
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
        const id = uuid(), path = `apply/${id}.jpg`;
        const up = await c.storage.from('shots').upload(path, img, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        // 랭킹에 보일 사진(캐릭터·상세 스탯 창 밖을 흐리게). 원본은 관리자만 봄
        const pubPath = pub ? `apply/${id}_p.jpg` : null;
        if (pubPath) { const u2 = await c.storage.from('shots').upload(pubPath, pub, { contentType: 'image/jpeg', upsert: false }); if (u2.error) throw u2.error; }
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
    const old = $('#applyDlg'); if (old) old.remove();
    const code = updCode(r), pick = shotPicker(), shot = A.shot();
    if (shot) pick.set(shot, '계산기에 읽힌 스크린샷이에요. 채팅에 위 코드가 안 보이면 코드를 적고 다시 찍어 넣어 주세요');
    const close = () => { pick.off(); wrap.remove(); };
    const send = el('button', { type: 'button', class: 'btn primary', text: '보내기' });
    const card = el('div', { class: 'dialog-card apply-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'upTitle' },
      el('h3', { id: 'upTitle', text: '랭킹 갱신' }),
      el('p', { class: 'apply-sum' }, `${r.nickname} 실투력을 `, el('b', { text: fmtInt(cp) }), '(으)로 바꿔 달라고 보내요. 관리자가 스크린샷을 확인하면 랭킹에 반영돼요.'),
      el('div', { class: 'code-box' }, el('span', { text: '인증 코드' }), el('b', { text: code })),
      el('p', { text: '게임 채팅 입력칸에 이 코드를 적은 다음, 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 찍어 넣어 주세요. 갱신할 때마다 코드가 새로 나와요. PC방 혜택과 지애 버프는 끄고 찍어 주세요.' }),
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
        const id = uuid(), path = `update/${id}.jpg`;
        const up = await c.storage.from('shots').upload(path, pick.img, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        let pubPath = null;
        if (pick.pub) { pubPath = `update/${id}_p.jpg`; const u2 = await c.storage.from('shots').upload(pubPath, pick.pub, { contentType: 'image/jpeg', upsert: false }); if (u2.error) pubPath = null; }
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
      loadRank(true); renderLine();
    } catch (e) { toast(errMsg(e)); }
  };

  // ---------- 관리자 ----------
  async function signed(c, path) {
    if (!path) return null;
    const { data, error } = await c.storage.from('shots').createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  }
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
    const TABS = [['apps', '신청'], ['upd', '갱신'], ['chars', '캐릭터'], ['logs', '열람 기록'], ['wm', '워터마크 찾기'], ['admins', '관리자']];
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
    const live = el('div', { class: 'adm-sec' }, el('h3', { text: '바로 반영된 갱신' }),
      el('p', { class: 'rank-note', text: '예전 방식(인증 코드 없이 바로 반영)으로 들어온 갱신이에요. 사진을 보고 확인하거나, 이상하면 되돌려요.' }));
    panes.upd.append(held, live);
    const { data: hs, error: e2 } = await c.from('cp_history')
      .select('id,cp,prev_cp,cls,inputs,prev_inputs,edited,status,created_at,shot_path,pub_path,verify_code,player_id,players(nickname,hidden)')
      .in('status', ['held', 'live']).order('created_at', { ascending: false }).limit(60);
    if (e2) throw e2;
    const hsHeld = hs.filter(h => h.status === 'held'), hsLive = hs.filter(h => h.status === 'live');
    if (!hsHeld.length) held.append(el('p', { class: 'rank-note', text: '확인할 갱신이 없어요' }));
    if (!hsLive.length) live.append(el('p', { class: 'rank-note', text: '새로 반영된 갱신이 없어요' }));
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
    for (const h of hsLive) live.append(updItem(h));
    recount();

    // 목록 아래 쪽수 넘기기
    const pager = (onGo) => {
      const prev = el('button', { type: 'button', class: 'btn', text: '이전' }), next = el('button', { type: 'button', class: 'btn', text: '다음' });
      const no = el('span', { class: 'adm-pageno' });
      prev.onclick = () => onGo(-1); next.onclick = () => onGo(1);
      const box = el('div', { class: 'adm-pager' }, prev, no, next);
      box.set = (pg, pages) => { box.hidden = pages <= 1; no.textContent = `${pg + 1} / ${pages}`; prev.disabled = pg <= 0; next.disabled = pg >= pages - 1; };
      return box;
    };
    const searchBox = (ph) => el('input', { type: 'search', class: 'adm-search', placeholder: ph, autocomplete: 'off', enterkeyhint: 'search' });
    const has = (s, q) => String(s || '').toLowerCase().includes(q);

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
    const kindText = (l) => l.kind === 'detail' ? `${l.target_nick || '지워진 캐릭터'} 상세` : l.kind === 'list' ? '전체 랭킹' : `${l.kind.slice(5)} 랭킹`;
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
    const { data: ps, error: e3 } = await c.from('players').select('id,nickname,cls,cp,hidden,hide_reason,updated_at,shot_path').order('cp', { ascending: false }).limit(1000);
    if (e3) throw e3;
    ps.forEach((p, i) => { p.rank = i + 1; });
    setCnt('chars', ps.length);
    // 예전에 올라간 사진 중 흐린 사본이 아닌 것: 다른 사람 이름을 가린 사본으로 바꿈(원본은 갱신 기록에 남음)
    const raw = ps.filter(p => p.shot_path && !/_p\.jpg$/.test(p.shot_path));
    if (raw.length) {
      const fix = el('button', { type: 'button', class: 'btn', text: `예전 랭킹 사진 ${raw.length}장 이름 가리기` });
      fix.onclick = async () => {
        fix.disabled = true; let done = 0, miss = [];
        for (const p of raw) {
          try {
            const u = await signed(c, p.shot_path); if (!u) throw new Error('사진 없음');
            const cv = await blobToCanvas(await (await fetch(u)).blob());
            const pc = privacyBlur(cv); if (!pc) { miss.push(p.nickname); continue; }
            const path = `apply/${uuid()}_p.jpg`;
            const up = await c.storage.from('shots').upload(path, await toJpeg(pc), { contentType: 'image/jpeg', upsert: false });
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
    const chQ = searchBox('닉네임 또는 전직 검색');
    const onlyHid = el('input', { type: 'checkbox' });
    const chInfo = el('p', { class: 'rank-note adm-found' });
    const chBox = el('div');
    let chPg = 0;
    const chPager = pager((d) => { chPg += d; drawChars(); all.scrollIntoView({ block: 'start' }); });
    all.append(el('div', { class: 'adm-find' }, chQ, el('label', { class: 'adm-chk' }, onlyHid, '숨긴 캐릭터만')), chInfo, chBox, chPager);
    const charItem = (p) => {
      const tag = () => p.hidden ? ` (숨김${p.hide_reason ? ': ' + p.hide_reason : ''})` : '';
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
          const u = await signed(c, origPath); if (!u) throw new Error('원본 사진을 열지 못했어요');
          const cv = await blobToCanvas(await (await fetch(u)).blob());
          const rects = await editKeep(cv, privacyRects(cv) || []);
          if (rects) {
            const path = `${/^update\//.test(origPath) ? 'update' : 'apply'}/${uuid()}_p.jpg`;
            const up = await c.storage.from('shots').upload(path, await toJpeg(blurKeep(cv, rects)), { contentType: 'image/jpeg', upsert: false });
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
