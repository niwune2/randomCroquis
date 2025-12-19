(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ===== DOM =====
  const root = document.documentElement;
  const header = $('header');
  const toolbar = $('.toolbar');
  const note = $('#note');
  const footer = $('#footer');

  // mode buttons
  const modeSingleBtn = $('#modeSingle');
  const modeDualBtn = $('#modeDual');
  const fileSingleGroup = $('#fileSingle');
  const fileDualGroup = $('#fileDual');

  // views
  const viewSingle = $('#viewSingle');
  const viewDual = $('#viewDual');

  // common controls
  const togglePlayBtn = $('#togglePlay');
  const playLabel = $('#playLabel');
  const prevBtn = $('#prevBtn');
  const nextBtn = $('#nextBtn');

  const intervalInput = $('#interval');
  const targetCountInput = $('#targetCount');
  const shuffleBtn = $('#shuffleBtn');
  const reshuffleBtn = $('#reshuffleBtn');
  const fsBtn = $('#fsBtn');

  // timebar
  const timeFill = $('#timeFill');
  const timeText = $('#timeText');
  const sessionText = $('#sessionText');

  // countdown overlay
  const countOverlay = $('#countOverlay');
  const countNumber = $('#countNumber');

  // finish overlay
  const finishOverlay = $('#finishOverlay');
  const finishImg = $('#finishImg');
  const finishText = $('#finishText');

  const announcer = $('#announce');

  // single view DOM
  const singleImg = $('#singleImg');
  const singleStat = $('#singleStat');

  // dual view DOM
  const leftImg = $('#leftImg');
  const rightImg = $('#rightImg');
  const leftPlaceholder = $('#leftPlaceholder');
  const rightPlaceholder = $('#rightPlaceholder');
  const leftStat = $('#leftStat');
  const rightStat = $('#rightStat');
  const leftName = $('#leftName');
  const rightName = $('#rightName');

  // file inputs
  const singleFilesInput = $('#singleFiles');
  const leftFilesInput = $('#leftFiles');
  const rightFilesInput = $('#rightFiles');

  // file buttons
  const pickSingleFilesBtn = $('#pickSingleFiles');
  const pickSingleFolderBtn = $('#pickSingleFolder');
  const clearSingleBtn = $('#clearSingle');

  const pickLeftFilesBtn = $('#pickLeftFiles');
  const pickLeftFolderBtn = $('#pickLeftFolder');
  const clearLeftBtn = $('#clearLeft');

  const pickRightFilesBtn = $('#pickRightFiles');
  const pickRightFolderBtn = $('#pickRightFolder');
  const clearRightBtn = $('#clearRight');

  // finish image
  const finishImageBtn = $('#finishImageBtn');
  const finishImageFileInput = $('#finishImageFile');
  const finishImageName = $('#finishImageName');

  // audio UI
  const sfxPanelToggle = $('#sfxPanelToggle');
  const sfxPanel = $('#sfxPanel');
  const pickAudioBtn = $('#pickAudio');
  const audioFileInput = $('#audioFile');
  const sfxToggleBtn = $('#sfxToggle');
  const sfxModeSel = $('#sfxMode');
  const sfxVolume = $('#sfxVolume');
  const sfxTestBtn = $('#sfxTest');
  const sfxName = $('#sfxName');

  // ===== util =====
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const uid = () => Math.random().toString(36).slice(2, 10);

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  const announce = (text) => {
    announcer.textContent = '';
    setTimeout(() => (announcer.textContent = text), 0);
  };

  const setPressed = (btn, yes) => btn.setAttribute('aria-pressed', String(!!yes));

  // ===== layout: 画像がはみ出ないための動的 max-height =====
  const updateImgMaxHeightVar = () => {
    const h = window.innerHeight || 800;
    const headerH = header?.offsetHeight || 0;
    const toolbarH = toolbar?.offsetHeight || 0;
    const noteH = note?.offsetHeight || 0;
    const footerH = footer?.offsetHeight || 0;

    // ステージ内の timebar + padding などの分をざっくり引く
    const reserved = headerH + toolbarH + noteH + footerH + 120;
    const available = Math.max(220, h - reserved);

    // 画像の最大高さとして使う
    root.style.setProperty('--img-max-h', `${available}px`);
  };

  window.addEventListener('resize', updateImgMaxHeightVar);

  // ===== state =====
  let mode = 'single'; // 'single' | 'dual'

  const TRANSITION_MS = 3000;
  let playing = false;
  let shuffleOn = true;

  // 表示モード（自動切替の内部状態）
  let phase = 'image'; // 'image' | 'transition'
  let endTime = 0; // image phase end
  let transitionEnd = 0; // transition phase end
  let rafId = null;

  let intervalMs = 60000;

  // session control
  let targetCount = 0;     // 0 = 無制限
  let sessionCount = 0;    // 自動表示の「何枚目（何ポーズ目）を見ているか」(1始まり)
  let finished = false;

  // finish image
  let finishImage = { url: null, name: '' };

  // audio
  const sfx = { enabled: true, mode: 'every', vol: 1, audio: null, url: null, name: '' };

  // per-mode image lists
  const single = { entries: [], index: 0 }; // entries: {id,name,url}
  const dual = {
    left: { entries: [], index: 0 },
    right: { entries: [], index: 0 }
  };

  // ===== common UI updates =====
  const updateTimeBar = (ratio, secLeft) => {
    const r = clamp(ratio || 0, 0, 1);
    timeFill.style.transform = `scaleX(${r})`;
    timeText.innerHTML = `<strong>${secLeft}</strong> 秒`;
  };

  const updateSessionText = () => {
    if (targetCount > 0) {
      sessionText.textContent = `枚数: ${sessionCount} / ${targetCount}`;
    } else {
      sessionText.textContent = '枚数: 無制限';
    }
  };

  const resetTimeVisual = () => {
    const sec = Math.round(intervalMs / 1000);
    updateTimeBar(0, sec);
  };

  const updateShuffleUI = () => {
    setPressed(shuffleBtn, shuffleOn);
    shuffleBtn.textContent = `シャッフル: ${shuffleOn ? 'ON' : 'OFF'}`;

    const canReshuffle =
      mode === 'single'
        ? single.entries.length > 1
        : (dual.left.entries.length > 1 || dual.right.entries.length > 1);

    reshuffleBtn.disabled = !canReshuffle;
  };

  // ===== finish overlay =====
  const showFinishOverlay = () => {
    finished = true;
    finishOverlay.classList.add('active');
    finishOverlay.setAttribute('aria-hidden', 'false');

    if (finishImage.url) {
      finishImg.hidden = false;
      finishImg.src = finishImage.url;
      finishImg.alt = finishImage.name || '終了画像';
    } else {
      finishImg.hidden = true;
    }

    finishText.textContent = 'セッション終了';
  };

  const hideFinishOverlay = () => {
    finished = false;
    finishOverlay.classList.remove('active');
    finishOverlay.setAttribute('aria-hidden', 'true');
  };

  // ===== countdown overlay =====
  const showCountdown = (sec) => {
    countNumber.textContent = String(sec);
    countOverlay.classList.add('active');
  };
  const updateCountdown = (sec) => {
    countNumber.textContent = String(sec);
  };
  const hideCountdown = () => {
    countOverlay.classList.remove('active');
  };

  const abortTransition = () => {
    phase = 'image';
    hideCountdown();
  };

  // ===== audio =====
  const revokeSfxUrl = () => {
    if (sfx.url) {
      try { URL.revokeObjectURL(sfx.url); } catch (_) {}
      sfx.url = null;
    }
  };
  const playSfxOnce = () => {
    if (!sfx.enabled || !sfx.audio) return;
    try {
      sfx.audio.currentTime = 0;
      sfx.audio.volume = sfx.vol;
      sfx.audio.play().catch(() => {});
    } catch (_) {}
  };

  // ===== object URL cleanup =====
  const revokeEntries = (entries) => {
    entries.forEach(e => { try { URL.revokeObjectURL(e.url); } catch (_) {} });
  };
  const revokeFinishImageUrl = () => {
    if (finishImage.url) {
      try { URL.revokeObjectURL(finishImage.url); } catch (_) {}
      finishImage.url = null;
    }
  };

  // ===== mode switch =====
  const applyModeUI = () => {
    // stop & reset
    stop();

    if (mode === 'single') {
      setPressed(modeSingleBtn, true);
      setPressed(modeDualBtn, false);
      fileSingleGroup.style.display = '';
      fileDualGroup.style.display = 'none';
      viewSingle.classList.add('active');
      viewDual.classList.remove('active');
    } else {
      setPressed(modeSingleBtn, false);
      setPressed(modeDualBtn, true);
      fileSingleGroup.style.display = 'none';
      fileDualGroup.style.display = '';
      viewSingle.classList.remove('active');
      viewDual.classList.add('active');
    }

    updateShuffleUI();
    updateImgMaxHeightVar();
  };

  // ===== build entries =====
  const buildEntriesFromFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    return files.map(f => ({ id: uid(), name: f.name, url: URL.createObjectURL(f) }));
  };

  // ===== display: single =====
  const showSingle = (i) => {
    const n = single.entries.length;
    if (!n) {
      singleImg.removeAttribute('src');
      singleImg.alt = '画像未選択';
      singleStat.textContent = '0 / 0 枚';
      return;
    }
    single.index = (i + n) % n;
    const e = single.entries[single.index];

    singleImg.onload = () => {
      singleStat.textContent = `${single.index + 1} / ${n} 枚`;
    };
    singleImg.onerror = () => {
      // 壊れた画像は除外
      single.entries.splice(single.index, 1);
      showSingle(0);
    };

    singleImg.src = e.url;
    singleImg.alt = e.name;
    singleStat.textContent = `${single.index + 1} / ${n} 枚`;
  };

  const nextSingle = () => showSingle(single.index + 1);
  const prevSingle = () => showSingle(single.index - 1);

  // ===== display: dual =====
  const updateDualPane = (side) => {
    const st = dual[side];
    const imgEl = side === 'left' ? leftImg : rightImg;
    const ph = side === 'left' ? leftPlaceholder : rightPlaceholder;
    const statEl = side === 'left' ? leftStat : rightStat;
    const nameEl = side === 'left' ? leftName : rightName;

    const n = st.entries.length;
    if (!n) {
      imgEl.hidden = true;
      ph.hidden = false;
      statEl.innerHTML = `<strong>0</strong> / 0`;
      nameEl.textContent = '—';
      return;
    }

    st.index = (st.index + n) % n;
    const e = st.entries[st.index];

    imgEl.onload = () => {};
    imgEl.onerror = () => {
      st.entries.splice(st.index, 1);
      st.index = 0;
      updateDualPane(side);
    };

    imgEl.src = e.url;
    imgEl.alt = e.name;
    imgEl.hidden = false;
    ph.hidden = true;

    statEl.innerHTML = `<strong>${st.index + 1}</strong> / ${n}`;
    nameEl.textContent = e.name;
  };

  const showDual = () => {
    updateDualPane('left');
    updateDualPane('right');
  };

  const nextDual = () => {
    if (dual.left.entries.length) dual.left.index = (dual.left.index + 1) % dual.left.entries.length;
    if (dual.right.entries.length) dual.right.index = (dual.right.index + 1) % dual.right.entries.length;
    showDual();
  };

  const prevDual = () => {
    if (dual.left.entries.length) dual.left.index = (dual.left.index - 1 + dual.left.entries.length) % dual.left.entries.length;
    if (dual.right.entries.length) dual.right.index = (dual.right.index - 1 + dual.right.entries.length) % dual.right.entries.length;
    showDual();
  };

  // ===== shuffle =====
  const reshuffleKeepCurrentSingle = () => {
    if (single.entries.length <= 1) return;
    const cur = single.entries[single.index];
    const rest = single.entries.filter((_, idx) => idx !== single.index);
    shuffleInPlace(rest);
    single.entries = [cur, ...rest];
    single.index = 0;
    showSingle(0);
  };

  const reshuffleKeepCurrentSide = (side) => {
    const st = dual[side];
    if (st.entries.length <= 1) return;
    const cur = st.entries[st.index];
    const rest = st.entries.filter((_, idx) => idx !== st.index);
    shuffleInPlace(rest);
    st.entries = [cur, ...rest];
    st.index = 0;
  };

  const reshuffleKeepCurrentDual = () => {
    reshuffleKeepCurrentSide('left');
    reshuffleKeepCurrentSide('right');
    showDual();
  };

  const reshuffleKeepCurrent = () => {
    if (mode === 'single') reshuffleKeepCurrentSingle();
    else reshuffleKeepCurrentDual();
    updateShuffleUI();
    announce('順序を再シャッフルしました');
  };

  // ===== timer logic =====
  const validateInterval = () => {
    const raw = Number(intervalInput.value);
    const fixed = clamp(isNaN(raw) ? 60 : Math.round(raw / 5) * 5, 5, 600);
    if (fixed !== raw) intervalInput.value = fixed;
    intervalMs = fixed * 1000;
    resetTimeVisual();
  };

  const validateTargetCount = () => {
    const raw = Number(targetCountInput.value);
    if (!raw || isNaN(raw) || raw < 0) {
      targetCount = 0;
      targetCountInput.value = 0;
    } else {
      targetCount = Math.floor(raw);
    }
    updateSessionText();
  };

  const hasAnyImages = () => {
    if (mode === 'single') return single.entries.length > 0;
    return dual.left.entries.length > 0 || dual.right.entries.length > 0;
  };

  const startImagePhase = (now = performance.now()) => {
    endTime = now + intervalMs;
    const sec = Math.round(intervalMs / 1000);
    updateTimeBar(0, sec);
  };

  const shouldPlaySfxForStep = () => {
    if (!sfx.enabled || !sfx.audio) return false;
    if (sfx.mode === 'every') return true;

    // last: ループ直前に鳴らす（2枚はどちらかがループ直前なら鳴らす）
    if (mode === 'single') {
      const n = single.entries.length;
      return n > 1 && single.index === n - 1;
    } else {
      const nL = dual.left.entries.length;
      const nR = dual.right.entries.length;
      const loopL = nL > 1 && dual.left.index === nL - 1;
      const loopR = nR > 1 && dual.right.index === nR - 1;
      return loopL || loopR;
    }
  };

  const stepNext = () => {
    if (mode === 'single') nextSingle();
    else nextDual();
  };

  const tick = (now) => {
    if (playing) {
      if (phase === 'image') {
        const msLeft = Math.max(0, endTime - now);
        const secLeft = Math.ceil(msLeft / 1000);
        const ratio = 1 - (msLeft / intervalMs);
        updateTimeBar(ratio, secLeft);

        if (msLeft <= 0) {
          // 指定枚数を「見終えた」なら終了（カウントを挟まず終了画面へ）
          if (targetCount > 0 && sessionCount >= targetCount) {
            // stop
            playing = false;
            setPressed(togglePlayBtn, false);
            playLabel.textContent = '再生';
            showFinishOverlay();
            playSfxOnce(); // 終了音は必ず1回
            resetTimeVisual();
            return; // 次のrafは下で回収
          }

          // 次へ進む前に 3秒カウント
          phase = 'transition';
          transitionEnd = now + TRANSITION_MS;
          showCountdown(3);
        }
      } else {
        const msLeft = Math.max(0, transitionEnd - now);
        const secLeft = Math.ceil(msLeft / 1000);
        updateCountdown(secLeft);

        if (msLeft <= 0) {
          // 次のポーズへ
          hideCountdown();
          phase = 'image';

          // 目標枚数モードならここで「何枚目」+1（手動は増やさない）
          if (targetCount > 0) {
            // 初回再生で1を付与する仕様なので、ここは +1 だけ
            sessionCount += 1;
            updateSessionText();
          }

          // 鳴動（通常ステップ用）
          if (shouldPlaySfxForStep()) playSfxOnce();

          stepNext();
          startImagePhase(now);
        }
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  // ===== play/stop =====
  const start = () => {
    if (!hasAnyImages()) {
      alert('まず画像を読み込んでください。');
      return;
    }

    // 終了画面が出ていたら閉じる
    if (finished) {
      hideFinishOverlay();
      // 新セッションとして開始
      sessionCount = 0;
    }

    // 目標枚数ありなら、再生開始時点の画像を「1枚目」とする
    if (targetCount > 0 && sessionCount === 0) {
      sessionCount = 1;
    }
    updateSessionText();

    playing = true;
    phase = 'image';
    hideCountdown();

    setPressed(togglePlayBtn, true);
    playLabel.textContent = '停止';

    startImagePhase();
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    playing = false;
    phase = 'image';
    hideCountdown();

    setPressed(togglePlayBtn, false);
    playLabel.textContent = '再生';

    resetTimeVisual();
  };

  const togglePlay = () => (playing ? stop() : start());

  // ===== fullscreen =====
  const enterFullscreen = async () => {
    const el = document.documentElement;
    try { await (el.requestFullscreen?.() || el.webkitRequestFullscreen?.()); } catch (_) {}
  };

  // ===== file load helpers =====
  const loadSingle = async (fileList) => {
    stop();
    hideFinishOverlay();
    sessionCount = 0;
    updateSessionText();

    revokeEntries(single.entries);
    single.entries = buildEntriesFromFiles(fileList);
    if (!single.entries.length) return;

    if (shuffleOn && single.entries.length > 1) shuffleInPlace(single.entries);
    single.index = 0;
    showSingle(0);
    updateShuffleUI();
  };

  const loadDualSide = async (side, fileList) => {
    stop();
    hideFinishOverlay();
    sessionCount = 0;
    updateSessionText();

    const st = dual[side];
    revokeEntries(st.entries);
    st.entries = buildEntriesFromFiles(fileList);
    if (!st.entries.length) {
      st.index = 0;
      showDual();
      updateShuffleUI();
      return;
    }

    if (shuffleOn && st.entries.length > 1) shuffleInPlace(st.entries);
    st.index = 0;
    showDual();
    updateShuffleUI();
  };

  const loadFromDirectory = async () => {
    if (!window.showDirectoryPicker) {
      alert('フォルダ読み込みは Chrome 系ブラウザでのみ動作します。複数ファイル選択をご利用ください。');
      return [];
    }
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const picked = [];
    for await (const [, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        const f = await handle.getFile();
        if (f.type.startsWith('image/')) picked.push(f);
      }
    }
    return picked;
  };

  // ===== finish image =====
  const setFinishImage = (file) => {
    revokeFinishImageUrl();
    const url = URL.createObjectURL(file);
    finishImage.url = url;
    finishImage.name = file.name;
    finishImageName.textContent = file.name;
  };

  // ===== init render =====
  const renderInitial = () => {
    // 初期表示：single は未選択
    showSingle(0);
    showDual();

    validateInterval();
    validateTargetCount();
    updateSessionText();
    updateShuffleUI();
    updateImgMaxHeightVar();

    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  // ===== events =====
  modeSingleBtn.addEventListener('click', () => {
    if (mode === 'single') return;
    mode = 'single';
    applyModeUI();
  });
  modeDualBtn.addEventListener('click', () => {
    if (mode === 'dual') return;
    mode = 'dual';
    applyModeUI();
  });

  // file: single
  pickSingleFilesBtn.addEventListener('click', () => singleFilesInput.click());
  singleFilesInput.addEventListener('change', (e) => loadSingle(e.target.files));
  pickSingleFolderBtn.addEventListener('click', async () => {
    try {
      const files = await loadFromDirectory();
      await loadSingle(files);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    }
  });
  clearSingleBtn.addEventListener('click', () => {
    stop();
    hideFinishOverlay();
    sessionCount = 0; updateSessionText();
    revokeEntries(single.entries);
    single.entries = [];
    single.index = 0;
    showSingle(0);
    updateShuffleUI();
  });

  // file: dual left/right
  pickLeftFilesBtn.addEventListener('click', () => leftFilesInput.click());
  leftFilesInput.addEventListener('change', (e) => loadDualSide('left', e.target.files));
  pickLeftFolderBtn.addEventListener('click', async () => {
    try {
      const files = await loadFromDirectory();
      await loadDualSide('left', files);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    }
  });
  clearLeftBtn.addEventListener('click', () => {
    stop();
    hideFinishOverlay();
    sessionCount = 0; updateSessionText();
    revokeEntries(dual.left.entries);
    dual.left.entries = [];
    dual.left.index = 0;
    showDual();
    updateShuffleUI();
  });

  pickRightFilesBtn.addEventListener('click', () => rightFilesInput.click());
  rightFilesInput.addEventListener('change', (e) => loadDualSide('right', e.target.files));
  pickRightFolderBtn.addEventListener('click', async () => {
    try {
      const files = await loadFromDirectory();
      await loadDualSide('right', files);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    }
  });
  clearRightBtn.addEventListener('click', () => {
    stop();
    hideFinishOverlay();
    sessionCount = 0; updateSessionText();
    revokeEntries(dual.right.entries);
    dual.right.entries = [];
    dual.right.index = 0;
    showDual();
    updateShuffleUI();
  });

  // play/stop
  togglePlayBtn.addEventListener('click', togglePlay);

  // manual prev/next (カウント挟まない)
  nextBtn.addEventListener('click', () => {
    if (!hasAnyImages()) return;
    hideFinishOverlay();
    abortTransition();
    if (mode === 'single') nextSingle();
    else nextDual();
    if (playing) startImagePhase();
    else resetTimeVisual();
  });
  prevBtn.addEventListener('click', () => {
    if (!hasAnyImages()) return;
    hideFinishOverlay();
    abortTransition();
    if (mode === 'single') prevSingle();
    else prevDual();
    if (playing) startImagePhase();
    else resetTimeVisual();
  });

  // interval / target
  intervalInput.addEventListener('change', () => {
    validateInterval();
    if (playing && phase === 'image') startImagePhase();
  });
  targetCountInput.addEventListener('change', () => {
    validateTargetCount();
    // 途中変更はラベル反映のみ（セッション継続）
    updateSessionText();
  });

  // shuffle
  shuffleBtn.addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    updateShuffleUI();
    if (shuffleOn) reshuffleKeepCurrent();
  });
  reshuffleBtn.addEventListener('click', () => reshuffleKeepCurrent());

  // fullscreen
  fsBtn.addEventListener('click', enterFullscreen);

  // finish image
  finishImageBtn.addEventListener('click', () => finishImageFileInput.click());
  finishImageFileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFinishImage(f);
  });

  // audio panel toggle
  sfxPanelToggle.addEventListener('click', () => {
    const isOpen = sfxPanel.classList.toggle('open');
    sfxPanelToggle.setAttribute('aria-expanded', String(isOpen));
    sfxPanelToggle.textContent = isOpen ? '終了音設定 ▲' : '終了音設定 ▾';
  });

  // audio file
  pickAudioBtn.addEventListener('click', () => audioFileInput.click());
  audioFileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    revokeSfxUrl();
    const url = URL.createObjectURL(f);
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = sfx.vol;

    sfx.url = url;
    sfx.audio = audio;
    sfx.name = f.name;
    sfxName.textContent = f.name;
  });

  sfxToggleBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    setPressed(sfxToggleBtn, sfx.enabled);
    sfxToggleBtn.textContent = `音: ${sfx.enabled ? 'ON' : 'OFF'}`;
  });

  sfxModeSel.addEventListener('change', (e) => {
    const v = String(e.target.value);
    sfx.mode = (v === 'last') ? 'last' : 'every';
  });

  sfxVolume.addEventListener('input', (e) => {
    sfx.vol = clamp(Number(e.target.value), 0, 1);
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
      sfx.audio.play().catch(() => {});
    } catch (_) {}
  });

  // keyboard
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && ['INPUT','TEXTAREA','SELECT'].includes(t.tagName)) return;

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
      intervalInput.value = v;
      validateInterval();
      if (playing && phase === 'image') startImagePhase();
    } else if (key === '-') {
      const v = clamp(Number(intervalInput.value) - 5, 5, 600);
      intervalInput.value = v;
      validateInterval();
      if (playing && phase === 'image') startImagePhase();
    } else if (key === 'r') {
      // 初期化：停止＋秒数60＋目標0＋シャッフルON＋再シャッフル
      stop();
      hideFinishOverlay();
      sessionCount = 0;
      intervalInput.value = 60; validateInterval();
      targetCountInput.value = 0; validateTargetCount();

      if (!shuffleOn) { shuffleOn = true; }
      if (mode === 'single' && single.entries.length) reshuffleKeepCurrentSingle();
      if (mode === 'dual') reshuffleKeepCurrentDual();

      updateShuffleUI();
      updateSessionText();
      announce('初期化しました');
    }
  });

  // cleanup
  window.addEventListener('beforeunload', () => {
    revokeEntries(single.entries);
    revokeEntries(dual.left.entries);
    revokeEntries(dual.right.entries);
    revokeSfxUrl();
    revokeFinishImageUrl();
  });

  // ===== start =====
  renderInitial();
})();
