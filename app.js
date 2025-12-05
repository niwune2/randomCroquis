(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // DOM 参照
  const art = $('#art');
  const stage = $('#stage');
  const imageWrap = $('#imageWrap');
  const stat = $('#stat');
  const announcer = $('#announce');

  const timeFill = $('#timeFill');
  const timeText = $('#timeText');
  const sessionText = $('#sessionText');

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

  // 表示・セッション設定
  const intervalInput = $('#interval');
  const targetCountInput = $('#targetCount');
  const shuffleBtn = $('#shuffleBtn');
  const reshuffleBtn = $('#reshuffleBtn');
  const fsBtn = $('#fsBtn');

  // 終了画像
  const finishImageBtn = $('#finishImageBtn');
  const finishImageFileInput = $('#finishImageFile');
  const finishImageName = $('#finishImageName');

  // 終了音 UI
  const sfxPanelToggle = $('#sfxPanelToggle');
  const sfxPanel = $('#sfxPanel');
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
  let shuffleOn = true;

  let intervalMs = 60000;
  let endTime = 0;
  let rafId = null;

  // セッション指定枚数＋終了画像
  let targetCount = 0;          // 0 = 無制限
  let sessionCount = 0;         // 今のセッションで自動切替した枚数
  let finished = false;
  let finishImage = { url: null, name: '' };

  // 終了音
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

  const updateTimeBar = (ratio, secLeft) => {
    const r = Math.min(1, Math.max(0, ratio || 0));
    if (timeFill) {
      timeFill.style.transform = `scaleX(${r})`;
    }
    if (timeText) {
      timeText.innerHTML = `<strong>${secLeft}</strong> 秒`;
    }
  };

  const updateSessionInfo = () => {
    if (!sessionText) return;
    if (targetCount > 0) {
      sessionText.textContent = `枚数: ${sessionCount} / ${targetCount}`;
    } else {
      sessionText.textContent = '枚数: 無制限';
    }
  };

  const validateInterval = () => {
    const raw = Number(intervalInput.value);
    const fixed = clamp(isNaN(raw) ? 60 : Math.round(raw / 5) * 5, 5, 600);
    if (fixed !== raw) intervalInput.value = fixed;
    intervalMs = fixed * 1000;
    updateTimeBar(0, fixed);
  };

  const validateTargetCount = () => {
    const raw = Number(targetCountInput.value);
    if (!raw || isNaN(raw) || raw < 0) {
      targetCount = 0;
      targetCountInput.value = 0;
    } else {
      targetCount = Math.floor(raw);
    }
    // セッション中に変更された場合、ラベルだけ更新
    updateSessionInfo();
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
    show(index);
    preloadNext();
    announce('順序を再シャッフルしました');
  };

  // ==== 終了音 ====
  const revokeSfxUrl = () => {
    if (sfx.url) {
      try { URL.revokeObjectURL(sfx.url); } catch (_) {}
      sfx.url = null;
    }
  };
  const setSfxFromFile = (file) => {
    revokeSfxUrl();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = sfx.vol;
    sfx.audio = audio;
    sfx.url = url;
    sfx.name = file.name;
    sfxName.textContent = file.name;
  };
  const playSfxOnce = () => {
    if (!sfx.enabled || !sfx.audio) return;
    try {
      sfx.audio.currentTime = 0;
      sfx.audio.volume = sfx.vol;
      sfx.audio.play().catch(err => console.warn('終了音の再生に失敗:', err));
    } catch (e) {
      console.warn('終了音の再生に失敗:', e);
    }
  };

  // ==== 終了画像 ====
  const revokeFinishImageUrl = () => {
    if (finishImage.url) {
      try { URL.revokeObjectURL(finishImage.url); } catch (_) {}
      finishImage.url = null;
    }
  };

  const setFinishImageFromFile = (file) => {
    revokeFinishImageUrl();
    const url = URL.createObjectURL(file);
    finishImage.url = url;
    finishImage.name = file.name;
    finishImageName.textContent = file.name;
  };

  // ==== 画像読み込み ====
  const revokeAllImages = () => {
    entries.forEach(e => { try { URL.revokeObjectURL(e.url); } catch(_){} });
  };

  const loadFromFileList = async (fileList) => {
    if (!fileList || !fileList.length) return;
    stop();
    finished = false;
    revokeAllImages();
    files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length){
      alert('画像ファイルが選択されていません。');
      return;
    }
    entries = files.map(f => ({ id: uid(), name: f.name, url: URL.createObjectURL(f) }));
    if (shuffleOn && entries.length > 1) shuffleInPlace(entries);
    index = 0;
    show(index);
    preloadNext();
    updateShuffleUI();
  };

  const loadFromDirectory = async () => {
    if (!window.showDirectoryPicker) {
      alert('この機能はChrome系ブラウザでのみ動作します。フォルダではなく複数ファイル選択をご利用ください。');
      return;
    }
    try {
      stop();
      finished = false;
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
      if (shuffleOn && entries.length > 1) shuffleInPlace(entries);
      index = 0;
      show(index);
      preloadNext();
      updateShuffleUI();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      alert('フォルダの読み込みに失敗しました。権限やブラウザ設定を確認してください。');
    }
  };

  // ==== 表示 ====
  const show = (i) => {
    if (!entries.length){
      art.removeAttribute('src');
      art.alt = '画像が未選択です。上部のボタンから読み込んでください。';
      updateStat();
      return;
    }
    index = (i + entries.length) % entries.length;
    const e = entries[index];

    art.onload = () => {
      updateStat();
    };
    art.onerror = () => {
      console.warn('壊れた画像をスキップ:', e.name);
      if (entries.length > 1) {
        entries.splice(index, 1);
        index = 0;
        show(index);
      } else {
        revokeAllImages();
        entries = [];
        index = 0;
        show(0);
      }
    };
    art.src = e.url;
    art.alt = e.name;
  };

  const next = () => {
    if (!entries.length) return;
    index = (index + 1) % entries.length;
    show(index);
    preloadNext();
  };

  const prev = () => {
    if (!entries.length) return;
    index = (index - 1 + entries.length) % entries.length;
    show(index);
    preloadNext();
  };

  const preloadNext = () => {
    if (!entries.length) return;
    const nextIdx = (index + 1) % entries.length;
    const url = entries[nextIdx].url;
    const img = new Image();
    img.src = url;
  };

  // ==== セッション終了処理 ====
  const finishSession = () => {
    playing = false;
    finished = true;
    togglePlayBtn.setAttribute('aria-pressed','false');
    playLabel.textContent = '再生';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    // 終了用画像があれば差し替え
    if (finishImage.url) {
      art.onload = () => { /* 特に何もしない */ };
      art.src = finishImage.url;
      art.alt = finishImage.name || 'セッション終了';
    } else {
      // 終了画像がない場合は、現在の画像のままでも良いが alt だけ更新
      art.alt = 'セッション終了';
    }

    // 終了音（常に1回だけ）
    playSfxOnce();
    announce('セッションを終了しました');
    updateSessionInfo();
  };

  // ==== タイマー ====
  const resetTimerVisual = () => {
    const sec = Math.round(intervalMs/1000);
    updateTimeBar(0, sec);
  };

  const resetCountdown = () => {
    if (!playing) return;
    endTime = performance.now() + intervalMs;
  };

  const autoStep = () => {
    // 指定枚数チェック（0 = 無制限）
    if (targetCount > 0) {
      if (sessionCount >= targetCount) {
        finishSession();
        return;
      }
      sessionCount += 1;
      updateSessionInfo();
    }
    // 終了音モードに従った再生
    if (sfx.enabled && sfx.audio) {
      if (sfx.mode === 'every') {
        playSfxOnce();
      } else if (sfx.mode === 'last') {
        const hasLoop = entries.length > 1;
        if (hasLoop && index === entries.length - 1) {
          playSfxOnce();
        }
      }
    }
    next();
  };

  const tick = (now) => {
    if (!playing) {
      // 停止中は 0 で固定（視覚的にはそのままでもOK）
    } else {
      const msLeft = Math.max(0, endTime - now);
      const secLeft = Math.ceil(msLeft / 1000);
      const ratio = 1 - (msLeft / intervalMs);
      updateTimeBar(ratio, secLeft);

      if (msLeft <= 0) {
        autoStep();
        if (playing) { // finishSession されていなければ継続
          endTime = performance.now() + intervalMs;
        } else {
          resetTimerVisual();
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!entries.length) {
      alert('まず画像を読み込んでください。');
      return;
    }
    if (playing) return;
    playing = true;
    finished = false;
    sessionCount = 0;
    updateSessionInfo();
    togglePlayBtn.setAttribute('aria-pressed','true');
    playLabel.textContent = '停止';
    endTime = performance.now() + intervalMs;
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    playing = false;
    togglePlayBtn.setAttribute('aria-pressed','false');
    playLabel.textContent = '再生';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    resetTimerVisual();
  };

  const togglePlay = () => { playing ? stop() : start(); };

  const enterFullscreen = async () => {
    const el = document.documentElement;
    try { await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.()); } catch(_) {}
  };

  // ==== イベント ====
  pickFilesBtn.addEventListener('click', () => hiddenFile.click());
  hiddenFile.addEventListener('change', (e) => loadFromFileList(e.target.files));
  pickFolderBtn.addEventListener('click', loadFromDirectory);

  clearListBtn.addEventListener('click', () => {
    stop();
    finished = false;
    revokeAllImages();
    entries = [];
    index = 0;
    show(0);
    updateShuffleUI();
  });

  togglePlayBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', () => {
    if (!entries.length) return;
    finished = false;
    next();
    resetCountdown();
  });
  prevBtn.addEventListener('click', () => {
    if (!entries.length) return;
    finished = false;
    prev();
    resetCountdown();
  });

  intervalInput.addEventListener('change', () => {
    validateInterval();
    resetCountdown();
  });
  targetCountInput.addEventListener('change', () => {
    validateTargetCount();
  });

  // シャッフルトグル
  shuffleBtn.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    updateShuffleUI();
    if (shuffleOn) reshuffleKeepCurrent();
  });
  reshuffleBtn.addEventListener('click', () => {
    reshuffleKeepCurrent();
  });

  fsBtn.addEventListener('click', enterFullscreen);

  // 終了画像
  finishImageBtn.addEventListener('click', () => finishImageFileInput.click());
  finishImageFileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFinishImageFromFile(f);
  });

  // 終了音パネル開閉
  sfxPanelToggle.addEventListener('click', () => {
    const isOpen = sfxPanel.classList.toggle('open');
    sfxPanelToggle.setAttribute('aria-expanded', String(isOpen));
    sfxPanelToggle.textContent = isOpen ? '終了音設定 ▲' : '終了音設定 ▾';
  });

  // 終了音 UI
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
    if (!sfx.audio) {
      alert('先に音声ファイルを選択してください。');
      return;
    }
    try {
      sfx.audio.currentTime = 0;
      sfx.audio.volume = sfx.vol;
      sfx.audio.play().catch(err => console.warn('試聴に失敗:', err));
    } catch (e) {
      console.warn('試聴に失敗:', e);
    }
  });

  // キーボード
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const key = e.key.toLowerCase();

    if (key === ' ') {
      e.preventDefault();
      togglePlay();
    } else if (key === 'arrowright') {
      nextBtn.click();
    } else if (key === 'arrowleft') {
      prevBtn.click();
    } else if (key === 'f') {
      enterFullscreen();
    } else if (key === 's') {
      shuffleBtn.click();
    } else if (key === '+') {
      const v = clamp(Number(intervalInput.value) + 5, 5, 600);
      intervalInput.value = v; validateInterval(); resetCountdown();
    } else if (key === '-') {
      const v = clamp(Number(intervalInput.value) - 5, 5, 600);
      intervalInput.value = v; validateInterval(); resetCountdown();
    } else if (key === 'r') {
      intervalInput.value = 60; validateInterval();
      targetCountInput.value = 0; validateTargetCount();
      if (!shuffleOn) shuffleBtn.click();
      if (entries.length) reshuffleKeepCurrent();
      sessionCount = 0;
      finished = false;
      updateSessionInfo();
    }
  });

  // 初期UI
  validateInterval();
  validateTargetCount();
  updateStat();
  updateShuffleUI();
  resetTimerVisual();
  updateSessionInfo();

  // 終了時クリーンアップ
  window.addEventListener('beforeunload', () => {
    revokeAllImages();
    revokeSfxUrl();
    revokeFinishImageUrl();
  });
})();
