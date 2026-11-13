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
  function sb() {
    if (!sbP) sbP = new Promise((res, rej) => {
      // 랭킹은 승인된 갱신 코드가 있는 사람만 볼 수 있어서, 갖고 있는 갱신 코드를 요청마다 같이 보냄(서버가 확인)
      const withCode = (url, opts) => {
        const t = viewCodes(); if (!t) return fetch(url, opts);
        const o = Object.assign({}, opts); const h = new Headers(o.headers || {}); h.set('x-sil-token', t); o.headers = h;
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
    $('#rankView').hidden = v !== 'rank';
    $('#adminView').hidden = v !== 'admin';
    for (const b of views.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false');
    if (v === 'rank') loadRank(true);
    if (v === 'admin') adminInit();
    window.scrollTo(0, 0);
  }
  views.addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });

  // ---------- 랭킹 목록 ----------
  const PAGE = 50;
  let rkCls = '', rkCount = 0, rkDone = false, rkBusy = false;
  async function loadRank(reset) {
    if (rkBusy) return; rkBusy = true;
    const list = $('#rankList'), empty = $('#rankEmpty');
    if (reset) { list.innerHTML = ''; rkCount = 0; rkDone = false; empty.hidden = false; empty.textContent = '불러오는 중이에요'; }
    try {
      const c = await sb();
      if (reset) {
        const { data: ok, error: ve } = await c.rpc('can_view');
        if (ve) throw ve;
        $('#rankFilters').hidden = !ok;
        if (!ok) {
          const wait = Object.values(A.ranks()).some(r => r && r.token && r.status === 'pending');
          empty.hidden = false;
          empty.textContent = wait ? '신청을 확인하고 있어요. 관리자가 승인하면 랭킹을 볼 수 있어요.'
            : '랭킹은 랭킹에 올라간 사람만 볼 수 있어요. 계산기에서 "랭킹에 올리기"로 신청해서 승인되면 볼 수 있어요. 다른 기기에서 승인받았다면 아래 "갱신 코드 입력"에 그때 받은 갱신 코드를 넣어 주세요.';
          rkDone = true; $('#btnRankMore').hidden = true; rkBusy = false; return;
        }
      }
      let q = c.from('players').select('id,nickname,cls,cp,updated_at,shot_path').order('cp', { ascending: false }).range(rkCount, rkCount + PAGE - 1);
      if (rkCls) q = q.eq('cls', rkCls);
      const { data, error } = await q;
      if (error) throw error;
      renderRows(data, rkCount);
      rkCount += data.length; rkDone = data.length < PAGE;
      empty.hidden = rkCount > 0;
      if (!rkCount) empty.textContent = rkCls ? `${rkCls} 랭킹에 아직 아무도 없어요` : '아직 올라온 캐릭터가 없어요. 계산기에서 "랭킹에 올리기"로 첫 번째가 되어 보세요';
    } catch (e) {
      empty.hidden = false; empty.textContent = '랭킹을 불러오지 못했어요. ' + errMsg(e);
    }
    $('#btnRankMore').hidden = rkDone;
    rkBusy = false;
  }
  function renderRows(rows, start) {
    const mine = new Set(Object.values(A.ranks()).filter(r => r && r.status === 'approved').map(r => String(r.nickname).toLowerCase()));
    const list = $('#rankList');
    rows.forEach((r, i) => {
      const li = el('li', { class: mine.has(r.nickname.toLowerCase()) ? 'me' : '' });
      li.append(
        el('button', { type: 'button', class: 'rk-row', 'aria-expanded': 'false', onclick: (e) => toggleDetail(li, r, e.currentTarget) },
          el('span', { class: 'rk-no', text: String(start + i + 1) }),
          el('span', { class: 'rk-who' },
            el('span', { class: 'rk-name', text: r.nickname }),
            el('span', { class: 'rk-meta' }, el('span', { text: r.cls }), el('span', { text: ago(r.updated_at) }))),
          el('span', { class: 'rk-cp' }, el('b', { text: fmtInt(r.cp) }), el('small', { text: korUnit(r.cp) }))));
      list.append(li);
    });
  }
  // 펼친 줄: 지금 실투력을 낸 스크린샷 + 계산기에서 세팅 보기
  // 강렬:초월 점유율 설명 (랭킹 상세·관리자 화면)
  const nf = (v) => String(Math.round(Number(v) * 100) / 100);
  function shareText(i) {
    i = i || {};
    if (i.L42 === true) return `직접 입력 ${nf(i.I46 ?? 35)} : ${nf(i.K46 ?? 65)} (${i.M46 || '강초뎀 적용 이전'} 기준)`;
    return `자동 (${Number(i.C29) > Number(i.C30) ? '강렬' : '초월'} 주력)`;
  }
  async function playerInputs(c, r) {
    if (r.inputs) return r.inputs;
    const { data, error } = await c.from('players').select('inputs').eq('id', r.id).single();
    if (error) throw error;
    return (r.inputs = data.inputs || {});
  }
  async function toggleDetail(li, r, btnEl) {
    const open = li.classList.toggle('open');
    btnEl.setAttribute('aria-expanded', String(open));
    let box = li.querySelector('.rk-detail');
    if (!open) { if (box) box.hidden = true; return; }
    if (box) { box.hidden = false; return; }
    const img = el('img', { alt: `${r.nickname} 실투력 스크린샷` });
    const cap = el('p', { class: 'rk-cap', text: '사진 불러오는 중이에요' });
    const shareP = el('p', { class: 'rk-cap', text: '강렬:초월 점유율 불러오는 중' });
    box = el('div', { class: 'rk-detail' },
      el('a', { class: 'rk-shot', target: '_blank', rel: 'noopener' }, img),
      el('div', { class: 'rk-side' },
        cap,
        el('p', { class: 'rk-cap', text: `실투력 ${fmtInt(r.cp)}, ${ago(r.updated_at)} 갱신` }),
        shareP,
        el('div', { class: 'rk-btns' },
          el('button', { type: 'button', class: 'btn', text: '계산기에서 세팅 보기', onclick: () => openPlayer(r) }),
          rkCls ? null : el('button', { type: 'button', class: 'btn', text: `${r.cls} 랭킹`, onclick: () => showClass(r.cls) }))));
    li.append(box);
    try {
      const c = await sb();
      playerInputs(c, r).then(i => { shareP.textContent = `강렬:초월 점유율 ${shareText(i)}`; }).catch(() => { shareP.textContent = ''; });
      const u = r.shot_path ? await signed(c, r.shot_path) : null;
      if (u) { img.src = u; img.parentNode.href = u; cap.textContent = '지금 랭킹 값을 낸 스크린샷이에요. 누르면 크게 보여요.'; }
      else { img.parentNode.hidden = true; cap.textContent = '사진이 아직 없어요.'; }
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
  $('#btnRankMore').onclick = () => loadRank(false);

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
      line.append(el('span', { class: 'rk-state' }, '랭킹 신청이 거절됐어요', r.memo ? el('small', { text: r.memo }) : null),
        el('span', { class: 'acts' }, btn('다시 신청', openApply)));
    } else {
      const upd = r.upd === 'held' ? `갱신 ${fmtInt(r.updCp)} 확인 기다리는 중`
        : (r.upd === 'rejected' || r.upd === 'reverted') ? `최근 갱신이 반영되지 않았어요${r.updMemo ? `: ${r.updMemo}` : ''}` : '';
      const posTxt = r.pos ? `전체 ${r.pos}위` + (r.cpos && r.cls ? `, ${r.cls} ${r.cpos}위` : '') : '랭킹 등록됨';
      line.append(el('span', { class: 'rk-state' }, el('span', { class: 'rk-pos', text: posTxt }), el('small', { text: `${r.nickname}, 올린 값 ${fmtInt(r.cp)}` }), upd ? el('small', { class: 'rk-upd', text: upd }) : null),
        el('span', { class: 'acts' }, btn('갱신 코드', showToken, true), btn('랭킹 갱신', doUpdate)));
    }
  }
  A.onRefresh(renderLine);

  async function position(c, cp, cls) {
    let q = c.from('players').select('id', { count: 'exact', head: true }).gt('cp', cp);
    if (cls) q = q.eq('cls', cls);
    const { count, error } = await q;
    return error ? null : count + 1;
  }
  async function positions(c, r) { r.pos = await position(c, r.cp); r.cpos = r.cls ? await position(c, r.cp, r.cls) : null; }
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

  // ---------- 랭킹 신청 ----------
  function openApply() {
    const miss = A.missing();
    if (miss.length) { toast(`${miss.join('·')}부터 채워 주세요`); return; }
    const cp = A.rankCp();
    if (!(cp > 0)) { toast('실투력이 계산되지 않았어요'); return; }
    const old = $('#applyDlg'); if (old) old.remove();
    const code = genCode();
    let img = null;
    const nick = el('input', { type: 'text', class: 'nick', maxlength: '20', placeholder: '게임 닉네임', value: A.nick() || (A.rank() || {}).nickname || '' });
    const file = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    const shotBox = el('div', { class: 'apply-shot', tabindex: '0', role: 'button' }, el('span', { text: '여기를 눌러 사진을 고르거나 Ctrl + V로 붙여 넣으세요' }));
    const setImg = async (blob) => {
      try {
        img = await toJpeg(await blobToCanvas(blob));
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
    const send = el('button', { type: 'button', class: 'btn primary', text: '신청하기', disabled: '' });
    const noBuff = el('input', { type: 'checkbox' });
    noBuff.onchange = () => { send.disabled = !noBuff.checked; };
    const card = el('div', { class: 'dialog-card apply-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'apTitle' },
      el('h3', { id: 'apTitle', text: '랭킹에 올리기' }),
      el('p', { class: 'apply-sum' }, `${A.cls()} 실투력 `, el('b', { text: fmtInt(cp) }), '을(를) 올려요. 관리자가 본인 캐릭터인지 확인한 뒤 랭킹에 보여요.'),
      el('label', { class: 'ex-row' }, el('span', {}, '닉네임', el('small', { text: '게임 닉네임 그대로' })), nick),
      el('div', { class: 'code-box' }, el('span', { text: '인증 코드' }), el('b', { text: code })),
      el('p', { text: '게임 채팅창에 이 코드를 입력한 다음, 채팅이 보이게 캐릭터 창과 상세 스탯 창을 띄우고 공격력에 마우스를 올린 채 스크린샷을 찍어 넣어 주세요.' }),
      shotBox, file,
      el('label', { class: 'chk-row' }, noBuff, el('span', {}, 'PC방 혜택과 지애 버프가 꺼진 상태에서 찍었어요', el('small', { text: 'PC방 혜택이나 지애 버프가 켜진 스크린샷은 랭킹에 올릴 수 없어요. 왼쪽 위 PC방 아이콘이 OFF인지 확인해 주세요.' }))),
      el('div', { class: 'dlg-actions' }, el('button', { type: 'button', class: 'btn', text: '취소', onclick: close }), send));
    const wrap = el('div', { class: 'dialog', id: 'applyDlg' }, card);
    document.body.append(wrap);
    setTimeout(() => nick.focus(), 50);
    send.onclick = async () => {
      const n = nick.value.trim();
      if (!n) { toast('닉네임을 적어 주세요'); nick.focus(); return; }
      if (!img) { toast('인증 코드가 보이는 스크린샷을 넣어 주세요'); return; }
      if (!noBuff.checked) { toast('PC방 혜택과 지애 버프가 꺼져 있는지 확인해 주세요'); return; }
      send.disabled = true; send.textContent = '보내는 중';
      try {
        const c = await sb();
        const path = `apply/${uuid()}.jpg`;
        const up = await c.storage.from('shots').upload(path, img, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        const token = genToken();
        const { error } = await c.rpc('submit_application', {
          p_nickname: n, p_server: '', p_cls: A.cls(), p_cp: cp, p_inputs: A.rankInputs(), p_code: code, p_shot: path, p_token: token,
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
      const path = `update/${uuid()}.jpg`;
      const up = await c.storage.from('shots').upload(path, await toJpeg(shot), { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      const { data: res, error } = await c.rpc('update_cp', { p_token: r.token, p_cls: A.cls(), p_cp: cp, p_inputs: A.rankInputs(), p_shot: path, p_edited: edited });
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

    const { data: apps, error } = await c.from('applications').select('id,nickname,cls,cp,inputs,verify_code,shot_path,created_at').eq('status', 'pending').order('created_at');
    if (error) throw error;
    if (!apps.length) pend.append(el('p', { class: 'rank-note', text: '기다리는 신청이 없어요' }));
    for (const a of apps) {
      const img = el('img', { alt: `${a.nickname} 신청 스크린샷` });
      signed(c, a.shot_path).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank', 'noopener'); } });
      const ok = el('button', { type: 'button', class: 'btn primary', text: '승인' });
      const no = el('button', { type: 'button', class: 'btn', text: '거절' });
      const item = el('div', { class: 'adm-item' }, img, el('div', { class: 'adm-info' },
        el('span', { class: 'nm', text: a.nickname }),
        el('span', { text: `${a.cls}, 실투력 ${fmtInt(a.cp)}` }),
        el('span', { text: `강렬:초월 점유율 ${shareText(a.inputs)}` }),
        el('span', { class: 'code' }, '인증 코드 ', el('b', { text: a.verify_code })),
        el('small', { class: 'adm-flag', text: '채팅의 인증 코드, 닉네임, PC방 아이콘 OFF, 지애 버프 없음을 확인하세요' }),
        el('small', { text: new Date(a.created_at).toLocaleString('ko-KR') }),
        el('div', { class: 'adm-acts' }, ok, no)));
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
      .select('id,cp,prev_cp,cls,inputs,edited,status,created_at,shot_path,player_id,players(nickname,hidden)')
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
      const img = el('img', { alt: `${p.nickname || ''} 갱신 스크린샷` });
      signed(c, h.shot_path).then(u => { if (u) { img.src = u; img.onclick = () => window.open(u, '_blank', 'noopener'); } });
      const diff = h.prev_cp ? (h.cp - h.prev_cp) / h.prev_cp * 100 : 0;
      const acts = el('div', { class: 'adm-acts' });
      const item = el('div', { class: 'adm-item' }, img, el('div', { class: 'adm-info' },
        el('span', { class: 'nm', text: p.nickname || '?' }),
        el('span', { text: `${h.cls || ''}, ${h.prev_cp ? fmtInt(h.prev_cp) + ' → ' : ''}${fmtInt(h.cp)}${h.prev_cp ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)` : ''}` }),
        el('span', { text: `강렬:초월 점유율 ${shareText(h.inputs)}` }),
        h.edited ? el('span', { class: 'adm-flag', text: '스크린샷 적용 뒤 손으로 고친 값 있음' }) : null,
        el('small', { text: ago(h.created_at) }), acts));
      if (h.status === 'held') {
        acts.append(el('button', { type: 'button', class: 'btn primary', text: '반영', onclick: () => act(h, 'approve', item, `${p.nickname} 갱신을 반영했어요`) }),
          el('button', { type: 'button', class: 'btn', text: '반영 안 함', onclick: () => act(h, 'reject', item, '반영하지 않았어요') }));
      } else {
        const hide = el('button', { type: 'button', class: 'btn', text: p.hidden ? '다시 보이기' : '랭킹에서 숨기기' });
        hide.onclick = async () => {
          const nv = !p.hidden;
          const { error: e } = await c.from('players').update({ hidden: nv }).eq('id', h.player_id);
          if (e) { toast(errMsg(e)); return; }
          p.hidden = nv; hide.textContent = nv ? '다시 보이기' : '랭킹에서 숨기기';
          toast(nv ? '랭킹에서 숨겼어요' : '다시 보이게 했어요');
        };
        acts.append(el('button', { type: 'button', class: 'btn primary', text: '확인', onclick: () => act(h, 'check', item, '확인했어요') }),
          el('button', { type: 'button', class: 'btn', text: '되돌리기', onclick: () => act(h, 'revert', item, '이전 값으로 되돌렸어요') }), hide);
      }
      return item;
    };
    for (const h of hsHeld) held.append(updItem(h));
    for (const h of hsLive) live.append(updItem(h));

    // 랭킹에 올라간 캐릭터: 숨기기 / 삭제(랭킹·갱신 기록·사진 모두)
    const all = el('div', { class: 'adm-sec' }, el('h3', { text: '랭킹에 올라간 캐릭터' }),
      el('p', { class: 'rank-note', text: '삭제하면 랭킹, 갱신 기록, 사진이 모두 지워지고 되돌릴 수 없어요. 다시 올리려면 새로 신청해야 해요.' }));
    body.append(all);
    const { data: ps, error: e3 } = await c.from('players').select('id,nickname,cls,cp,hidden,updated_at').order('cp', { ascending: false }).limit(500);
    if (e3) throw e3;
    if (!ps.length) all.append(el('p', { class: 'rank-note', text: '아직 올라간 캐릭터가 없어요' }));
    ps.forEach((p, i) => {
      const nm = el('span', { class: 'nm', text: `${i + 1}. ${p.nickname}${p.hidden ? ' (숨김)' : ''}` });
      const hide = el('button', { type: 'button', class: 'btn', text: p.hidden ? '다시 보이기' : '숨기기' });
      const del = el('button', { type: 'button', class: 'btn danger', text: '삭제' });
      const item = el('div', { class: 'adm-item adm-plain' }, el('div', { class: 'adm-info' }, nm,
        el('span', { text: `${p.cls}, 실투력 ${fmtInt(p.cp)}` }),
        el('small', { text: `${ago(p.updated_at)} 갱신` }),
        el('div', { class: 'adm-acts' }, hide, del)));
      hide.onclick = async () => {
        const nv = !p.hidden;
        const { error: e } = await c.from('players').update({ hidden: nv }).eq('id', p.id);
        if (e) { toast(errMsg(e)); return; }
        p.hidden = nv; hide.textContent = nv ? '다시 보이기' : '숨기기';
        nm.textContent = `${i + 1}. ${p.nickname}${nv ? ' (숨김)' : ''}`;
        toast(nv ? '랭킹에서 숨겼어요' : '다시 보이게 했어요');
      };
      del.onclick = async () => {
        const ok = await A.dialog({ title: `${p.nickname} 삭제`, text: '랭킹, 갱신 기록, 사진이 모두 지워지고 되돌릴 수 없어요.', ok: '삭제', danger: true });
        if (!ok) return;
        hide.disabled = del.disabled = true;
        const { data: paths, error: e } = await c.rpc('admin_delete_player', { p_id: p.id });
        if (e) { toast(errMsg(e)); hide.disabled = del.disabled = false; return; }
        if (paths && paths.length) { const { error: re } = await c.storage.from('shots').remove(paths); if (re) console.warn(re); }
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
  renderLine();
})();
