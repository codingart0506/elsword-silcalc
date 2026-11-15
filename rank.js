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
  // 장비창의 초록 악세서리 칸(2열 6행)으로 창 위치를 잡음. 상세 스탯 창은 캐릭터 창 오른쪽에 붙어서 열림. 못 찾으면 null(원본을 씀)
  function privacyBlur(src) {
    let G = null;
    try { G = window.SilGear && window.SilGear.detectGrid(src); } catch (e) { G = null; }
    if (!G || G.cells.length < 12) return null;
    const W = src.width, H = src.height, P = G.pitch;
    const xs = G.cells.map(c => c.x), xa = Math.min(...xs), xb = Math.max(...xs), y0 = Math.min(...G.cells.map(c => c.y));
    const top = y0 - 8.3 * P, left = xa - 13.85 * P, mid = xb + 1.5 * P, right = mid + 16.5 * P;
    if (left < -3 * P || top < -3 * P || mid > W + P) return null;
    const keep = [[left, top, mid, y0 + 8.75 * P], [mid, top, right, y0 + 11.15 * P]];
    // 흐리게: 크게 줄였다가 다시 키움(모든 브라우저에서 됨)
    const step = (from, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(from, 0, 0, w, h); return c; };
    const small = step(step(src, Math.max(16, Math.round(W / 5)), Math.max(16, Math.round(H / 5))), Math.max(8, Math.round(W / 18)), Math.max(8, Math.round(H / 18)));
    const out = step(step(small, Math.max(16, Math.round(W / 5)), Math.max(16, Math.round(H / 5))), W, H);
    const g = out.getContext('2d');
    for (const [x0, y0_, x1, y1] of keep) {
      const a = Math.max(0, Math.round(x0)), b = Math.max(0, Math.round(y0_)), c = Math.min(W, Math.round(x1)), d = Math.min(H, Math.round(y1));
      if (c > a && d > b) g.drawImage(src, a, b, c - a, d - b, a, b, c - a, d - b);
    }
    return out;
  }
  window.SilBlur = privacyBlur;
  // 관리자: 원본(확인용)과 랭킹에 보일 흐린 사본을 나란히. 누르면 크게 열림
  // 흐린 사본이 없으면(예전 화면으로 신청 등) 여기서 원본으로 만들어 붙임
  function shotPair(c, orig, pub, fix, folder) {
    const one = (path, cap) => {
      const img = el('img', { alt: cap });
      signed(c, path).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank', 'noopener'); } });
      return el('figure', { class: 'adm-shot' }, img, el('figcaption', { text: cap }));
    };
    const box = el('div', { class: 'adm-shots' }, one(orig, '원본(확인용)'));
    if (pub) { box.append(one(pub, '랭킹에 보일 사진')); return box; }
    const note = el('p', { class: 'adm-flag', text: '다른 사람 이름을 가린 사진을 만드는 중이에요' });
    box.append(note);
    (async () => {
      try {
        if (!fix || !orig) throw null;
        const u = await signed(c, orig); if (!u) throw null;
        const cv = await blobToCanvas(await (await fetch(u)).blob());
        const pc = privacyBlur(cv); if (!pc) throw null;
        const path = `${folder}/${uuid()}_p.jpg`;
        const up = await c.storage.from('shots').upload(path, await toJpeg(pc), { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        const { error } = await fix(path); if (error) throw error;
        note.replaceWith(one(path, '랭킹에 보일 사진'));
      } catch (e) { if (e) console.warn(e); note.textContent = '다른 사람 이름을 자동으로 못 가렸어요. 반영하면 원본이 그대로 랭킹에 보여요'; }
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
    if (v === 'rank') { markView(); loadRank(true); }
    if (v === 'admin') adminInit();
    window.scrollTo(0, 0);
  }
  views.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });

  // ---------- 랭킹 목록 ----------
  // 10등씩 쪽으로 나눠 보여 줌(이전·다음)
  const PAGE = 10;
  let rkCls = '', rkPage = 0, rkBusy = false;
  async function loadRank(reset) {
    if (rkBusy) return; rkBusy = true;
    const list = $('#rankList'), empty = $('#rankEmpty'), pager = $('#rankPager');
    if (reset) { rkPage = 0; list.innerHTML = ''; pager.hidden = true; empty.hidden = false; empty.textContent = '불러오는 중이에요'; }
    let more = false;
    try {
      const c = await sb();
      if (reset) {
        const { data: ok, error: ve } = await c.rpc('can_view');
        if (ve) throw ve;
        $('#rankFilters').hidden = !ok;
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
      more = data.length > PAGE;
      list.innerHTML = '';
      renderRows(data.slice(0, PAGE), rkPage * PAGE);
      empty.hidden = data.length > 0;
      if (!data.length) empty.textContent = rkCls ? `${rkCls} 랭킹에 아직 아무도 없어요` : '아직 올라온 캐릭터가 없어요. 계산기에서 "랭킹에 올리기"로 첫 번째가 되어 보세요';
    } catch (e) {
      empty.hidden = false; empty.textContent = '랭킹을 불러오지 못했어요. ' + errMsg(e);
    }
    const n = list.children.length;
    pager.hidden = !(rkPage > 0 || more);
    $('#btnRankPrev').disabled = rkPage === 0; $('#btnRankNext').disabled = !more;
    $('#rankPageNo').textContent = n ? `${rkPage * PAGE + 1}~${rkPage * PAGE + n}위` : '';
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
    const mine = new Set(Object.values(A.ranks()).filter(r => r && r.status === 'approved').map(r => String(r.nickname).toLowerCase()));
    const list = $('#rankList'), mark = textMark();
    rows.forEach((r, i) => {
      const li = el('li', { class: mine.has(r.nickname.toLowerCase()) ? 'me' : '' });
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
    if (i.L42 === true) return `${nf(i.K46 ?? 65)} : ${nf(i.I46 ?? 35)} (${i.M46 || '강초뎀 적용 이전'} 기준)`;
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
  // 눈에 거의 안 보이는 워터마크: 보는 사람 닉네임·시각을 사진 곳곳(자리·기울기 무작위)에 픽셀로 박음
  // 파랑 채널을 조금, 밝기를 아주 조금만 바꿔서 눈으로는 안 보이고, 관리자 화면 '워터마크 찾기'에 넣으면 글자가 드러남
  async function bakeShot(url) {
    try {
      const res = await fetch(url); if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const w = bmp.width, h = bmp.height;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const mg = m.getContext('2d', { willReadFrequently: true });
      const [l1, l2] = stampLines(), fs = Math.max(16, Math.round(w / 34));
      mg.font = `700 ${fs}px sans-serif`; mg.fillStyle = '#fff'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
      const tw = Math.max(mg.measureText(l1).width, mg.measureText(l2).width);
      const cols = Math.max(2, Math.round(w / (tw * 1.25))), rows = Math.max(4, Math.round(h / (fs * 3.4)));
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const x = (q + 0.3 + Math.random() * 0.4) * w / cols, y = (r + 0.2 + Math.random() * 0.6) * h / rows;
        mg.save(); mg.translate(x, y); mg.rotate((-30 + Math.random() * 20) * Math.PI / 180); mg.fillText(l1, 0, -fs * 0.58); mg.fillText(l2, 0, fs * 0.58); mg.restore();
      }
      const md = mg.getImageData(0, 0, w, h).data, img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = md[i + 3]; if (!a) continue;
        // 밝기를 조금(압축돼도 남게) + 파랑을 조금 더. 어두운 곳은 작은 변화도 눈에 띄어서 덜, 밝은 곳은 조금 더
        const k = a / 255, lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        const L = (2 + 3 * lum) * k, B = L + (2 + 5 * lum) * k;
        d[i] += d[i] >= L ? -L : L; d[i + 1] += d[i + 1] >= L ? -L : L; d[i + 2] += d[i + 2] >= B ? -B : B;
      }
      g.putImageData(img, 0, 0);
      const out = await new Promise(r => cv.toBlob(r, 'image/png'));
      return out ? URL.createObjectURL(out) : null;
    } catch (e) { console.warn(e); return null; }
  }
  // 퍼진 캡처에서 워터마크 드러내기: 주변 평균과의 아주 작은 차이만 남겨 크게 키움(색 차이·밝기 차이 두 가지)
  function revealMark(src, mode) {
    const w = src.width, h = src.height, d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const v = new Float32Array(w * h);
    for (let i = 0, j = 0; j < v.length; i += 4, j++) v[j] = mode === 'lum' ? (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) : d[i + 2] - (d[i] + d[i + 1]) / 2;
    const W = w + 1, S = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += v[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; } }
    const R = Math.max(4, Math.round(Math.max(w, h) / 120)), gain = mode === 'lum' ? 14 : 10;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const og = out.getContext('2d'), od = og.createImageData(w, h), o = od.data;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
        const mean = (S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0]) / ((y1 - y0) * (x1 - x0));
        const q = 128 + (mean - v[y * w + x]) * gain, p = (y * w + x) * 4;
        o[p] = o[p + 1] = o[p + 2] = q; o[p + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }
  function wmFinder(c) {
    const view = el('div', { class: 'wm-out' });
    // 복사해서 퍼진 글: 숨은 글자를 읽어 닉네임 지문과 맞는 랭킹 캐릭터를 찾음
    const txt = el('textarea', { class: 'wm-text', rows: '3', placeholder: '퍼진 글(랭킹을 복사해 붙인 글)을 여기에 붙여 넣으세요' });
    const txtOut = el('div', { class: 'wm-out' });
    txt.oninput = async () => {
      const marks = readTextMarks(txt.value); txtOut.textContent = '';
      if (!txt.value.trim()) return;
      if (!marks.length) { txtOut.textContent = '숨은 글자를 못 찾았어요. 복사한 곳에서 지워졌을 수 있어요'; return; }
      let names = ['관리자'];
      try { const { data } = await c.from('players').select('nickname'); names = names.concat((data || []).map(x => x.nickname)); } catch (e) { /* 무시 */ }
      for (const m of marks) {
        const who = names.filter(n => fnv(n) === m.hash);
        const d = m.at, z = (n) => String(n).padStart(2, '0');
        txtOut.append(el('p', { text: `${who.length ? who.join(' 또는 ') : '모르는 사람(지워진 캐릭터일 수 있어요)'}, ${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}시쯤 본 화면` }));
      }
    };
    const show = async (blob) => {
      if (!blob) return;
      view.textContent = '찾는 중이에요';
      try {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        view.textContent = '';
        view.append(el('p', { text: '색 차이로 찾기' }), revealMark(c, 'chroma'), el('p', { text: '밝기 차이로 찾기' }), revealMark(c, 'lum'));
      } catch (e) { view.textContent = '이미지를 열지 못했어요'; }
    };
    const fin = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    fin.onchange = () => show(fin.files[0]);
    const zone = el('div', { class: 'wm-drop', tabindex: '0' },
      el('p', { text: '퍼진 랭킹 캡처를 이 칸을 누른 뒤 Ctrl + V로 붙여 넣거나 끌어다 놓으세요. 드러난 글자가 그 화면을 본 사람 닉네임과 시각이에요.' }),
      el('button', { type: 'button', class: 'btn', text: '이미지 열기', onclick: () => fin.click() }), fin);
    zone.addEventListener('paste', (e) => { const f = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/')); if (f) { e.preventDefault(); e.stopPropagation(); show(f.getAsFile()); } });
    zone.addEventListener('dragover', (e) => e.preventDefault());
    zone.addEventListener('drop', (e) => { e.preventDefault(); show([...e.dataTransfer.files].find(f => f.type.startsWith('image/'))); });
    return el('div', { class: 'adm-sec' }, el('h3', { text: '워터마크 찾기' }),
      el('p', { class: 'rank-note', text: '랭킹 화면·랭킹 사진에는 보는 사람 닉네임과 시각이 눈에 안 띄게 깔려 있고, 순위 글자에도 안 보이는 문자로 숨겨 둬요. 캡처나 복사한 글이 돌면 여기에 넣어서 누가 봤는지 확인하고, 아래 열람 기록과 맞춰 보세요. 많이 줄이거나 여러 번 다시 저장한 사진, 숨은 문자를 지우는 곳에 올린 글은 안 읽힐 수 있어요.' }),
      zone, view, txt, txtOut);
  }
  // 랭킹 화면 전체에 눈에 안 띄는 워터마크(보는 사람·시각)를 덮어 둠: 화면 캡처에도 그대로 남음
  function markView() {
    const v = $('#rankView'); if (!v) return;
    let m = v.querySelector('.rk-wm');
    if (!m) { m = el('div', { class: 'rk-wm', 'aria-hidden': 'true' }); v.append(m); }
    const [l1, l2] = stampLines().map(x => String(x).replace(/[<>&"']/g, ''));
    // 아주 옅은 누런색 글자(닉네임 / 시각 두 줄)를 촘촘히: 흰 바탕에서 밝기 3~4칸·파랑 7칸쯤만 빠져서 눈에는 거의 안 띄고,
    // 카톡처럼 사진을 압축해 보내도, 작게 잘라 내도 '워터마크 찾기'의 밝기 차이로 드러남(색 차이는 압축하면 잘 사라짐)
    const WM = window.SIL_WM || { fs: 44, fill: 'rgb(150,140,0)', op: 0.03, a: [18, 70, 50], b: [30, 110, 90] };
    const fs = WM.fs, lh = Math.round(fs * 1.15), mc = document.createElement('canvas').getContext('2d');
    mc.font = `900 ${fs}px sans-serif`;
    const tw = Math.ceil(Math.max(mc.measureText(l1).width, mc.measureText(l2).width));
    const tile = (deg, padX, padY) => {
      const r = deg * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r);
      const x = Math.round(padX / 2 + fs * sn), y = Math.round(padY / 2 + tw * sn + fs * cs);
      const w = Math.ceil(x + tw * cs + lh * sn + padX / 2), h = Math.ceil(y + lh * cs + 0.3 * fs + padY / 2);
      const txt = (t, dy) => `<text x="${x}" y="${y + dy}" font-family="sans-serif" font-weight="900" font-size="${fs}" fill="${WM.fill}" fill-opacity="${WM.op}">${t}</text>`;
      return { w, h, url: 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="rotate(${-deg} ${x} ${y})">${txt(l1, 0)}${txt(l2, lh)}</g></svg>`) + '")' };
    };
    const A1 = tile(...WM.a), A2 = tile(...WM.b);
    m.style.backgroundImage = A1.url + ',' + A2.url;
    m.style.backgroundPosition = `0 0, ${Math.round(A1.w / 2)}px ${Math.round(A1.h / 2)}px`;
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
      const bu = u ? await bakeShot(u) : null;
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
  // 전체 / 전직별(전직을 고르면 그 전직 안에서의 순위)
  const clsSel = $('#rankCls');
  for (const c of A.classes()) clsSel.append(el('option', { value: c, text: c }));
  function setMode(mode, cls) {
    for (const t of $('#rankMode').querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.v === mode);
    clsSel.hidden = mode !== 'cls';
    if (mode === 'cls') { clsSel.value = cls || A.cls() || clsSel.value || clsSel.options[0].value; rkCls = clsSel.value; }
    else rkCls = '';
    $('#rankTitle').textContent = rkCls ? `${rkCls} 랭킹` : '실투력 랭킹';
    loadRank(true);
  }
  function showClass(cls) { setMode('cls', cls); window.scrollTo(0, 0); }
  $('#rankMode').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) setMode(b.dataset.v); });
  clsSel.onchange = () => setMode('cls', clsSel.value);
  const goPage = (d) => { if (rkBusy) return; rkPage = Math.max(0, rkPage + d); loadRank(false).then(() => $('#rankList').scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
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
    A.dialog({ title: '갱신 코드', text: '다른 기기나 브라우저에서 갱신할 때 이 코드가 필요해요. 다른 사람에게 알려 주지 마세요.', area: r.token, ok: '닫기' });
  }

  // 피시방·에너지드링크·지애 버프를 켠 세팅은 랭킹에 올리지 않음(서버에도 안 보냄)
  function buffBlocked() {
    const bf = A.rankBuffs ? A.rankBuffs() : [];
    if (!bf.length) return false;
    A.dialog({ title: '랭킹에 올릴 수 없어요', text: `${bf.join(', ')}이(가) 켜져 있어요. 이 버프를 켠 세팅은 랭킹에 올릴 수 없어요. 세팅의 스킬·장비 탭 '도핑'에서 체크를 끈 뒤 다시 눌러 주세요.`, ok: '확인' });
    return true;
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
    let img = null, pub = null;
    const nick = el('input', { type: 'text', class: 'nick', maxlength: '20', placeholder: '게임 닉네임', value: A.nick() || (A.rank() || {}).nickname || '' });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    const shotBox = el('div', { class: 'apply-shot', tabindex: '0', role: 'button' }, el('span', { text: '여기를 눌러 사진을 고르거나 Ctrl + V로 붙여 넣으세요' }));
    const setImg = async (blob) => {
      try {
        const cv = await blobToCanvas(blob);
        img = await toJpeg(cv);
        const pc = privacyBlur(cv); pub = pc ? await toJpeg(pc) : null;
        shotBox.innerHTML = ''; shotBox.classList.add('has');
        shotBox.append(el('img', { src: URL.createObjectURL(img), alt: '올릴 스크린샷' }), el('span', { text: '다른 사진으로 바꾸려면 다시 누르세요' }));
      } catch (e) { toast('사진을 읽지 못했어요'); }
    };
    shotBox.onclick = () => file.click();
    shotBox.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    file.onchange = () => { if (file.files[0]) setImg(file.files[0]); };
    const onPaste = (e) => {
      const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
      if (!it) return;
      e.preventDefault(); e.stopImmediatePropagation(); setImg(it.getAsFile());
    };
    window.addEventListener('paste', onPaste, true);
    const close = () => { window.removeEventListener('paste', onPaste, true); wrap.remove(); };
    const send = el('button', { type: 'button', class: 'btn primary', text: '신청하기' });
    const card = el('div', { class: 'dialog-card apply-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'apTitle' },
      el('h3', { id: 'apTitle', text: '랭킹에 올리기' }),
      el('p', { class: 'apply-sum' }, `${A.cls()} 실투력 `, el('b', { text: fmtInt(cp) }), '을(를) 올려요. 관리자가 본인 캐릭터인지 확인한 뒤 랭킹에 보여요.'),
      el('label', { class: 'ex-row' }, el('span', {}, '닉네임', el('small', { text: '게임 닉네임 그대로' })), nick),
      el('div', { class: 'code-box' }, el('span', { text: '인증 코드' }), el('b', { text: code })),
      el('p', { text: '게임 채팅창에 이 코드를 입력한 다음, 채팅이 보이게 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 찍어 넣어 주세요. PC방 혜택과 지애 버프는 끄고 찍어 주세요.' }),
      el('p', { class: 'apply-privacy', text: '신청하면 닉네임, 계산기 세팅, 스크린샷이 랭킹용으로 저장돼요. 랭킹을 볼 때는 본 기록(본 캐릭터, 시각, 기기 구분용 임의 번호)이 180일 동안 남아요. IP 주소는 모으지 않아요.' }),
      shotBox, file,
      el('div', { class: 'dlg-actions' }, el('button', { type: 'button', class: 'btn', text: '취소', onclick: close }), send));
    const wrap = el('div', { class: 'dialog', id: 'applyDlg' }, card);
    document.body.append(wrap);
    setTimeout(() => nick.focus(), 50);
    send.onclick = async () => {
      const n = nick.value.trim();
      if (!n) { toast('닉네임을 적어 주세요'); nick.focus(); return; }
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
        await A.dialog({ title: '신청했어요', text: '관리자가 스크린샷을 확인하면 랭킹에 올라가요. 아래 갱신 코드는 다른 기기에서 갱신할 때 필요하니 따로 적어 두세요.', area: token, ok: '확인' });
      } catch (e) {
        toast('신청하지 못했어요. ' + errMsg(e));
        send.disabled = false; send.textContent = '신청하기';
      }
    };
  }

  // ---------- 승인된 사람: 스크린샷으로 갱신 ----------
  async function doUpdate() {
    const r = A.rank(); if (!r) return;
    const miss = A.missing();
    if (miss.length) { toast(`${miss.join('·')}부터 채워 주세요`); return; }
    if (buffBlocked()) return;
    const shot = A.shot();
    if (!shot) {
      await A.dialog({ title: '스크린샷이 필요해요', text: '랭킹은 스크린샷으로만 갱신할 수 있어요. 지금 세팅으로 스크린샷을 넣고 적용한 다음 다시 눌러 주세요.', ok: '확인' });
      return;
    }
    const cp = A.rankCp(), edited = A.edited();
    const big = r.cp && cp > r.cp;
    const ok = await A.dialog({ title: '랭킹 갱신', text: `${r.nickname} 실투력을 ${fmtInt(cp)}(으)로 바꿔요. PC방 혜택과 지애 버프가 꺼진 상태로 찍은 스크린샷일 때만 갱신할 수 있어요.` + ((edited || big) ? ` ${edited ? '스크린샷을 적용한 뒤 손으로 고친 값이 있어서' : '실투력이 올라서'} 관리자가 확인한 뒤에 랭킹에 반영돼요.` : ''), ok: '버프 없이 찍었어요, 갱신' });
    if (!ok) return;
    try {
      const c = await sb();
      const id = uuid(), path = `update/${id}.jpg`;
      const up = await c.storage.from('shots').upload(path, await toJpeg(shot), { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      let pubPath = null;
      try { const pc = privacyBlur(shot); if (pc) pubPath = `update/${id}_p.jpg`; if (pubPath) { const u2 = await c.storage.from('shots').upload(pubPath, await toJpeg(pc), { contentType: 'image/jpeg', upsert: false }); if (u2.error) throw u2.error; } } catch (e) { console.warn(e); pubPath = null; }
      const { data: res, error } = await c.rpc('update_cp_v2', { p_token: r.token, p_cls: A.cls(), p_cp: cp, p_inputs: A.rankInputs(), p_shot: path, p_edited: edited, p_pub: pubPath });
      if (error) throw error;
      if (res === 'held') {
        Object.assign(r, { upd: 'held', updCp: cp, updMemo: '' }); A.setRank(r); renderLine();
        toast('관리자가 확인하면 랭킹에 반영돼요');
      } else {
        Object.assign(r, { cp, cls: A.cls(), upd: 'live', updCp: cp, updMemo: '' }); await positions(c, r); A.setRank(r); renderLine();
        toast(`랭킹을 갱신했어요${r.pos ? ` (${r.pos}위)` : ''}`);
      }
    } catch (e) { toast('갱신하지 못했어요. ' + errMsg(e)); }
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
    const pend = el('div', { class: 'adm-sec' }, el('h3', { text: '승인 기다리는 신청' }));
    const hist = el('div', { class: 'adm-sec' }, el('h3', { text: '최근 갱신' }));
    body.append(pend, hist);
    // 아무 데서도 안 쓰는 사진(거절된 신청 사진, 지운 기록의 사진 등)은 저장소에서 정리
    c.rpc('admin_orphan_shots').then(async ({ data, error }) => {
      if (error || !data || !data.length) return;
      const names = data.map(x => typeof x === 'string' ? x : Object.values(x)[0]).filter(Boolean);
      const { error: re } = await c.storage.from('shots').remove(names);
      if (!re) body.prepend(el('p', { class: 'rank-note', text: `안 쓰는 사진 ${names.length}장(거절된 신청 사진 등)을 저장소에서 지웠어요` }));
    }).catch(e => console.warn(e));

    const { data: apps, error } = await c.from('applications').select('id,nickname,cls,cp,inputs,verify_code,shot_path,pub_path,created_at').eq('status', 'pending').order('created_at');
    if (error) throw error;
    if (!apps.length) pend.append(el('p', { class: 'rank-note', text: '기다리는 신청이 없어요' }));
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
        item.remove(); toast(`${a.nickname} 승인했어요`);
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
        item.remove(); toast(`${a.nickname} 신청을 거절했어요`);
      };
      pend.append(item);
    }

    const held = el('div', { class: 'adm-sec' }, el('h3', { text: '확인 기다리는 갱신' }),
      el('p', { class: 'rank-note', text: '실투력이 오른 갱신이나 손으로 고친 값이 있는 갱신이에요. 사진을 보고 반영해야 랭킹에 올라가요.' }));
    const live = el('div', { class: 'adm-sec' }, el('h3', { text: '바로 반영된 갱신' }),
      el('p', { class: 'rank-note', text: '실투력이 그대로거나 내려간 갱신이라 바로 반영됐어요. 사진을 보고 확인하거나, 이상하면 되돌려요.' }));
    body.insertBefore(held, hist); body.insertBefore(live, hist); hist.remove();
    const { data: hs, error: e2 } = await c.from('cp_history')
      .select('id,cp,prev_cp,cls,inputs,prev_inputs,edited,status,created_at,shot_path,pub_path,player_id,players(nickname,hidden)')
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
      item.remove(); toast(done);
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

    body.append(wmFinder(c));
    // 열람 기록: 누가 언제 무엇을 봤는지 + 기기 수(갱신 코드 돌려쓰기 확인). 이상하면 그 사람을 아래에서 숨기면 랭킹도 못 봐요
    const logs = el('div', { class: 'adm-sec' }, el('h3', { text: '열람 기록' }),
      el('p', { class: 'rank-note', text: '랭킹 목록과 상세(사진·세팅)를 본 기록이에요. 최근 300개, 180일 지나면 지워져요. 이름을 누르면 그 사람 기록만 보여요. 한 사람이 최근 7일 동안 기기 4대 이상에서 봤으면 갱신 코드를 나눠 줬을 수 있어요.' }));
    body.append(logs);
    const { data: lg, error: e4 } = await c.from('view_log').select('at,viewer,viewer_nick,kind,target_nick,dev').order('at', { ascending: false }).limit(300);
    if (e4) throw e4;
    const logBox = el('div', { class: 'adm-logs' });
    let only = null;
    const kindText = (l) => l.kind === 'detail' ? `${l.target_nick || '지워진 캐릭터'} 상세` : l.kind === 'list' ? '전체 랭킹' : `${l.kind.slice(5)} 랭킹`;
    const drawLogs = () => {
      logBox.textContent = '';
      const rows = only ? lg.filter(l => l.viewer === only) : lg;
      if (only) logBox.append(el('button', { type: 'button', class: 'txt sm', text: '전체 기록 보기', onclick: () => { only = null; drawLogs(); } }));
      if (!rows.length) logBox.append(el('p', { class: 'rank-note', text: '아직 기록이 없어요' }));
      const cnt = {}, devs = {};
      for (const l of lg) {
        if (l.kind === 'detail' && Date.now() - new Date(l.at) < 864e5) cnt[l.viewer] = (cnt[l.viewer] || 0) + 1;
        if (l.dev && Date.now() - new Date(l.at) < 7 * 864e5) (devs[l.viewer] = devs[l.viewer] || new Set()).add(l.dev);
      }
      for (const l of rows) {
        const nDev = devs[l.viewer] ? devs[l.viewer].size : 0, many = cnt[l.viewer] >= 30 || nDev >= 4;
        logBox.append(el('div', { class: 'adm-log' + (many ? ' many' : '') },
          el('button', { type: 'button', class: 'txt sm nm', text: l.viewer_nick || '지워진 캐릭터', onclick: () => { only = l.viewer; drawLogs(); } }),
          el('span', { text: kindText(l) }),
          el('small', { text: `${ago(l.at)}${nDev ? `, 기기 ${nDev}대(7일)` : ''}${cnt[l.viewer] >= 30 ? ', 하루 상세 ' + cnt[l.viewer] + '번' : ''}` })));
      }
    };
    drawLogs(); logs.append(logBox);

    // 랭킹에 올라간 캐릭터: 숨기기 / 삭제(랭킹·갱신 기록·사진 모두)
    const all = el('div', { class: 'adm-sec' }, el('h3', { text: '랭킹에 올라간 캐릭터' }),
      el('p', { class: 'rank-note', text: '숨기면 랭킹에서 빠지고 그 사람은 랭킹도 못 봐요(분탕 차단). 삭제하면 랭킹, 갱신 기록, 사진이 모두 지워지고 되돌릴 수 없어요.' }));
    body.append(all);
    const { data: ps, error: e3 } = await c.from('players').select('id,nickname,cls,cp,hidden,hide_reason,updated_at,shot_path').order('cp', { ascending: false }).limit(500);
    if (e3) throw e3;
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
    if (!ps.length) all.append(el('p', { class: 'rank-note', text: '아직 올라간 캐릭터가 없어요' }));
    ps.forEach((p, i) => {
      const tag = () => p.hidden ? ` (숨김${p.hide_reason ? ': ' + p.hide_reason : ''})` : '';
      const nm = el('span', { class: 'nm', text: `${i + 1}. ${p.nickname}${tag()}` });
      const hide = el('button', { type: 'button', class: 'btn', text: p.hidden ? '다시 보이기' : '숨기기' });
      const del = el('button', { type: 'button', class: 'btn danger', text: '삭제' });
      const item = el('div', { class: 'adm-item adm-plain' }, el('div', { class: 'adm-info' }, nm,
        el('span', { text: `${p.cls}, 실투력 ${fmtInt(p.cp)}` }),
        el('small', { text: `${ago(p.updated_at)} 갱신` }),
        el('div', { class: 'adm-acts' }, hide, del)));
      hide.onclick = async () => {
        const nv = !p.hidden;
        const why = await setHidden(c, p.id, nv); if (why === null) return;
        p.hidden = nv; p.hide_reason = nv ? why : null; hide.textContent = nv ? '다시 보이기' : '숨기기';
        nm.textContent = `${i + 1}. ${p.nickname}${tag()}`;
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
        item.remove(); toast(`${p.nickname} 랭킹을 지웠어요`);
      };
      all.append(item);
    });
  }
  $('#btnAdminOut').onclick = async () => { const c = await sb(); await c.auth.signOut(); adminInit(); };

  // ---------- 시작 ----------
  const qs = new URLSearchParams(location.search);
  if (qs.has('admin')) setView('admin');
  else if (qs.has('rank')) setView('rank');
  else if (qs.has('avatar')) setView('avatar');
  renderLine();
})();
