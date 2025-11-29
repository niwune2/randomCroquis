(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // 画像UI
  const art = $('#art');
  const stage = $('#stage');
  const imageWrap = $('#imageWrap');
  const remain = $('#remain');
  const stat = $('#stat');
  const announcer = $('#announce');

  // ファイル操作
  const pickFilesBtn = $('#pickFiles');
  const pickFolderBtn = $('#pickFolder');
  const clearListBtn = $('#clearList');
  const hiddenFile = $('#hiddenFile');

  // 再生系
  const togglePlayBtn = $('#togglePlay');
  const playLabel = $('#playLabel');
  const prevBtn = $('#prevBtn');
  const nextBtn = $('#nextBtn');

  // 表示設定
  const intervalInput = $('#interval');
  const shuffleBtn = $('#shuffleBtn');
  const reshuffleBtn = $('#reshuffleBtn');
  const fsBtn = $('#fsBtn');

  // 終了音
  const pickAudioBtn = $('#pickAudio');
  const hiddenAudio = $('#hiddenAudio');
  const sfxToggleBtn = $('#sfxToggle');
  const sfxModeSel = $('#sfxMode');
  const sfxVolumeRange = $('#sfxVolume');
  const sfxTestBtn = $('#sfxTest');
  const sfxName = $('#sfxName');

  // 状態
  let files = [];
  let entries = [];             // { id, name, url }
  let index = 0;
  let playing = false;
  let shuffleOn = true;         // 既定ON

  let intervalMs = 60000;
  let endTime = 0;
  let rafId = null;

  // 終了音 状態
  const sfx = {
    enabled: true,
    mode: 'every',   // 'every' | 'last'
    vol: 1,
    audio: null,
    url: null,
    name: ''
  };

  // util
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const uid = () => Math.random().toString(36).slice(2, 10);

  const shuffleInPlace = (arr) => {
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  const announce = (text) => {
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => announcer.textContent = text, 0);
  };

  const updateStat = () => {
    stat.textContent = `${entries.length ? (index + 1) : 0} / ${entries.length} 枚`;
  };

  const setProgress = (ratio) => {
    const deg = `${Math.floor(360 * Math.min(1, Math.max(0, ratio)))}deg`;
    stage.style.setProperty('--deg', deg);
  };

  const validateInterval = () => {
    const raw = Number(intervalInput.value);
    const fixed = clamp(isNaN(raw) ? 60 : Math.round(raw / 5) * 5, 5, 600);
    if (fixed !== raw) intervalInput.value = fixed;
    intervalMs = fixed * 1000;
    remain.textContent = fixed;
  };

  const updateShuffleUI = () => {
    shuffleBtn.setAttribute('aria-pressed', String(shuffleOn));
    shuffleBtn.textContent = `シャッフル: ${shuffleOn ? 'ON' : 'OFF'}`;
    reshuffleBtn.disabled = entries.length <= 1;
  };

  const reshuffleKeepCurrent = () => {
    if (entries.length <= 1) return;
    const current = entries[index];
    const rest = entries.filter((_, i) => i !== index);
    shuffleInPlace(rest);
    entries = [current, ...rest];
    index = 0;
    preloadNext();
    resetCountdown();
    updateStat();
    announce('順序を再シャッフルしました');
  };

  // ==== 終了音 ====
  function revokeSfxUrl(){
    if (sfx.url) { try { URL.revokeObjectURL(sfx.url); } catch(_){} }
    sfx.url = null;
  }
  function setSfxFromFile(file){
    revokeSfxUrl();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = sfx.vol;
    sfx.audio = audio;
    sfx.url = url;
    sfx.name = file.name;
    sfxName.textContent = file.name;
    sfxToggleBtn.disabled = false;
    sfxTestBtn.disabled = false;
    sfxModeSel.disabled = false;
    sfxVolumeRange.disabled = false;
  }
  function playSfx(trigger){
    // trigger: 'auto' | 'manual'
    if (!sfx.enabled || !sfx.audio) return;

    // 鳴動タイミング
    if (sfx.mode === 'last') {
      // 最後の画像から次へ自動切替する瞬間のみ鳴らす
      // ループ仕様のため「最後＝配列末尾」
      const isLast = entries.length >= 2 && index === entries.length - 1;
      if (!isLast) return;
      if (trigger !== 'auto') return; // 手動時は鳴らさない
    } else {
      // every
      if (trigger !== 'auto') return; // 手動時は鳴らさない
    }

    try {
      sfx.audio.currentTime = 0;
      sfx.audio.volume = sfx.vol;
      sfx.audio.play().catch(err => {
        console.warn('終了音の再生に失敗:', err);
      });
    } catch (e) {
      console.warn('終了音の再生に失敗:', e);
    }
  }

  // ==== 画像読み込み ====
  function revokeAllImages(){
    entries.forEach(e => { try { URL.revokeObjectURL(e.url); } catch(_){} });
  }

  async function loadFromFileList(fileList) {
    if (!fileList || !fileList.length) return;
    stop();
    revokeAllImages();
    files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length){
      alert('画像ファイルが選択されていません。');
      return;
    }
    entries = files.map(f => ({ id: uid(), name: f.name, url: URL.createObjectURL(f) }));
    if (shuffleOn && entries.length > 1) {
      shuffleInPlace(entries);
    }
    index = 0;
    await show(index);
    updateStat();
    preloadNext();
    updateShuffleUI();
  }

  async function loadFromDirectory() {
    if (!window.showDirectoryPicker) {
      alert('この機能はChrome系ブラウザでのみ動作します。フォルダではなく複数ファイル選択をご利用ください。');
      return;
    }
    try {
      stop();
      revokeAllImages();
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const picked = [];
      for await (const [, handle] of dirHandle.entries()) {
        if (handle.kind === 'file') {
          const file = await handle.getFile();
          if (file.type.startsWith('image/')) picked.push(file);
        }
      }
      if (!picked.length){
        alert('フォルダ内に画像が見つかりませんでした。');
        return;
      }
      files = picked;
      entries = files.map(f => ({ id: uid(), name: f.name, url: URL.createObjectURL(f) }));
      if (shuffleOn && entries.length > 1) {
        shuffleInPlace(entries);
      }
      index = 0;
      await show(index);
      updateStat();
      preloadNext();
      updateShuffleUI();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      alert('フォルダの読み込みに失敗しました。権限やブラウザ設定を確認してください。');
    }
  }

  // ==== 表示 ====
  async function show(i){
    if (!entries.length){
      art.removeAttribute('src');
      art.alt = '画像が未選択です。上部のボタンから読み込んでください。';
      return;
    }
    index = (i + entries.length) % entries.length;
    const e = entries[index];

    return new Promise((resolve) => {
      art.onload = () => {
        updateStat();
        resolve();
      };
      art.onerror = () => {
        console.warn('壊れた画像をスキップ:', e.name);
        next();        // 壊れていたら次へ
        resolve();
      };
      art.src = e.url;
      art.alt = e.name;
    });
  }

  function next(auto=false){
    if (!entries.length) return;
    if (auto) playSfx('auto');          // 自動切替の直前に終了音
    index = (index + 1) % entries.length;
    show(index);
    preloadNext();
    if (auto) resetCountdown();
  }

  function prev(){
    if (!entries.length) return;
    index = (index - 1 + entries.length) % entries.length;
    show(index);
    preloadNext();
    resetCountdown();
  }

  function preloadNext(){
    if (!entries.length) return;
    const nextIdx = (index + 1) % entries.length;
    const url = entries[nextIdx].url;
    const img = new Image();
    img.src = url;
  }

  // ==== タイマー ====
  function resetTimerVisual(){
    setProgress(0);
    remain.textContent = Math.round(intervalMs/1000);
  }

  function resetCountdown(){
    if (!playing) return;
    endTime = performance.now() + intervalMs;
  }

  function tick(now){
    if (!playing){
      setProgress(0);
    } else {
      const msLeft = Math.max(0, endTime - now);
      const secLeft = Math.ceil(msLeft / 1000);
      const ratio = 1 - (msLeft / intervalMs);
      setProgress(ratio);
      remain.textContent = secLeft;
      if (msLeft <= 0){
        // 自動切替フロー
        next(true);                  // true = 自動切替
        endTime = performance.now() + intervalMs;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function start(){
    if (!entries.length){
      alert('まず画像を読み込んでください。');
      return;
    }
    if (playing) return;
    playing = true;
    togglePlayBtn.setAttribute('aria-pressed','true');
    playLabel.textContent = '停止';  // 再生中は「停止」
    endTime = performance.now() + intervalMs;
    rafId = requestAnimationFrame(tick);
  }

  function stop(){
    playing = false;
    togglePlayBtn.setAttribute('aria-pressed','false');
    playLabel.textContent = '再生';  // 停止時は「再生」
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    resetTimerVisual();
  }

  function togglePlay(){ playing ? stop() : start(); }

  async function enterFullscreen(){
    const el = document.documentElement;
    try { await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.()); } catch(_){}
  }

  // ==== イベント ====
  pickFilesBtn.addEventListener('click', () => hiddenFile.click());
  hiddenFile.addEventListener('change', (e) => loadFromFileList(e.target.files));
  pickFolderBtn.addEventListener('click', loadFromDirectory);

  clearListBtn.addEventListener('click', () => {
    stop(); revokeAllImages(); files = []; entries = []; index = 0; updateStat();
    art.removeAttribute('src'); art.alt = '読み込みが解除されました。';
    updateShuffleUI();
  });

  togglePlayBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', () => next(false)); // 手動時は音を鳴らさない仕様
  prevBtn.addEventListener('click', prev);

  intervalInput.addEventListener('change', () => { validateInterval(); resetCountdown(); });

  // シャッフル：ONになった瞬間に必ず並び替え
  shuffleBtn.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    updateShuffleUI();
    if (shuffleOn) {
      reshuffleKeepCurrent();
    }
  });

  // 任意タイミングで再シャッフル
  reshuffleBtn.addEventListener('click', () => {
    if (entries.length <= 1) return;
    reshuffleKeepCurrent();
  });

  fsBtn.addEventListener('click', enterFullscreen);

  // キーボード
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const key = e.key.toLowerCase();
    if (key === ' ') { e.preventDefault(); togglePlay(); }
    else if (key === 'arrowright') { next(false); }
    else if (key === 'arrowleft') { prev(); }
    else if (key === 'f') { enterFullscreen(); }
    else if (key === 's') { shuffleBtn.click(); }
    else if (key === '+') {
      const v = clamp(Number(intervalInput.value) + 5, 5, 600);
      intervalInput.value = v; validateInterval(); resetCountdown();
    }
    else if (key === '-') {
      const v = clamp(Number(intervalInput.value) - 5, 5, 600);
      intervalInput.value = v; validateInterval(); resetCountdown();
    }
    else if (key === 'r'){
      intervalInput.value = 60; validateInterval();
      if (!shuffleOn) shuffleBtn.click();  // ONへ戻し & 並び替え
      if (entries.length){
        reshuffleKeepCurrent();
      }
    }
  });

  // ==== 終了音イベント ====
  pickAudioBtn.addEventListener('click', () => hiddenAudio.click());
  hiddenAudio.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setSfxFromFile(f);
  });

  sfxToggleBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    sfxToggleBtn.setAttribute('aria-pressed', String(sfx.enabled));
    sfxToggleBtn.textContent = `音: ${sfx.enabled ? 'ON' : 'OFF'}`;
  });

  sfxModeSel.addEventListener('change', (e) => {
    const v = String(e.target.value);
    sfx.mode = (v === 'last') ? 'last' : 'every';
  });

  sfxVolumeRange.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    sfx.vol = clamp(v, 0, 1);
    if (sfx.audio) sfx.audio.volume = sfx.vol;
  });

  sfxTestBtn.addEventListener('click', () => {
    // ユーザー操作での再生（ブラウザの自動再生制限を満たす）
    if (!sfx.audio) { alert('先に音声ファイルを選択してください。'); return; }
    try {
      sfx.audio.currentTime = 0;
      sfx.audio.volume = sfx.vol;
      sfx.audio.play().catch(err => {
        console.warn('試聴に失敗:', err);
      });
    } catch (e) {
      console.warn('試聴に失敗:', e);
    }
  });

  // ==== 初期UI ====
  validateInterval();
  updateStat();
  updateShuffleUI();

  // 破棄時
  window.addEventListener('beforeunload', () => {
    revokeAllImages();
    revokeSfxUrl();
  });
})();
