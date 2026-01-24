(() => {
  const $ = (id) => document.getElementById(id);

  const body = document.body;

  // Drawer
  const menuBtn = $("menuBtn");
  const drawer = $("drawer");
  const backdrop = $("backdrop");
  const closeDrawer = $("closeDrawer");

  // Buttons / inputs
  const fileInput = $("fileInput");
  const pickBtn = $("pickBtn");
  const pickBtn2 = $("pickBtn2");
  const clearBtn = $("clearBtn");
  const clearBtn2 = $("clearBtn2");

  const secInput = $("secInput");
  const secInput2 = $("secInput2");
  const countInput = $("countInput");
  const countInput2 = $("countInput2");
  const applySettings = $("applySettings");

  const shuffleChk = $("shuffleChk");

  const startBtn = $("startBtn");
  const startBtn2 = $("startBtn2");
  const playBtn = $("playBtn");
  const stopBtn = $("stopBtn");
  const nextBtn = $("nextBtn");
  const prevBtn = $("prevBtn");

  const pickEndImgBtn = $("pickEndImgBtn");
  const pickEndAudioBtn = $("pickEndAudioBtn");
  const endImgInput = $("endImgInput");
  const endAudioInput = $("endAudioInput");

  // UI labels
  const img = $("img");
  const hint = $("hint");
  const timeNum = $("timeNum");
  const shownNum = $("shownNum");
  const targetNum = $("targetNum");

  const pickedCount = $("pickedCount");
  const posLabel = $("posLabel");

  const countdownBox = $("countdownBox");
  const countdownNum = $("countdownNum");

  const endImgName = $("endImgName");
  const endAudioName = $("endAudioName");

  // ===== State =====
  /** images: [{name, url}] */
  let images = [];
  let currentIndex = 0;

  // session settings
  let totalSec = 60;
  let targetCount = 10;     // 規定枚数（表示する枚数）
  const COUNTDOWN_SEC = 3;  // 3秒固定

  // running
  let phase = "idle";       // "idle" | "show" | "countdown" | "ended"
  let remain = totalSec;
  let countdown = COUNTDOWN_SEC;
  let timerId = null;
  let running = false;

  // progress
  let shownCount = 0;       // 何枚“表示し終えたか”（次へ進むたび +1）

  // end assets
  let endImageUrl = null;
  let endAudioUrl = null;
  let endAudio = null;

  // ===== Drawer open/close =====
  const openDrawer = () => {
    drawer.classList.add("open");
    backdrop.classList.add("open");
    menuBtn.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  };

  menuBtn.addEventListener("click", () => drawer.classList.contains("open") ? close() : openDrawer());
  backdrop.addEventListener("click", close);
  closeDrawer.addEventListener("click", close);

  // ===== Helpers =====
  const clampSeconds = (v) => {
    const n = Number.isFinite(v) ? v : 60;
    const snapped = Math.round(n / 5) * 5;
    return Math.max(5, Math.min(600, snapped));
  };
  const clampCount = (v) => {
    const n = Number.isFinite(v) ? v : 1;
    return Math.max(1, Math.min(9999, Math.floor(n)));
  };

  const setRunningUI = (on) => {
    running = on;
    body.classList.toggle("running", on);
  };

  const render = () => {
    timeNum.textContent = (phase === "idle") ? "--" : String(remain);
    shownNum.textContent = (phase === "idle") ? "--" : String(shownCount);
    targetNum.textContent = String(targetCount);

    pickedCount.textContent = String(images.length);
    posLabel.textContent = images.length ? `${currentIndex + 1}/${images.length}  ${images[currentIndex]?.name ?? ""}` : "-";
  };

  const showImageOnly = () => {
    countdownBox.classList.remove("show");
    if (!images.length) {
      img.hidden = true;
      img.removeAttribute("src");
      hint.style.display = "";
      return;
    }
    hint.style.display = "none";
    img.hidden = false;
    img.src = images[currentIndex].url;
  };

  const showCountdownOnly = () => {
    // 「画像→カウント→画像」なので、カウント中は画像を隠す
    img.hidden = true;
    countdownBox.classList.add("show");
    countdownNum.textContent = String(countdown);
  };

  const cleanupAllUrls = () => {
    for (const it of images) {
      try { URL.revokeObjectURL(it.url); } catch {}
    }
    if (endImageUrl) {
      try { URL.revokeObjectURL(endImageUrl); } catch {}
      endImageUrl = null;
    }
    if (endAudioUrl) {
      try { URL.revokeObjectURL(endAudioUrl); } catch {}
      endAudioUrl = null;
    }
  };

  const stopInterval = () => {
    if (timerId) clearInterval(timerId);
    timerId = null;
  };

  // ===== Image picking (add) =====
  const pick = () => fileInput.click();
  pickBtn.addEventListener("click", pick);
  pickBtn2.addEventListener("click", pick);

  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const f of files) {
      const url = URL.createObjectURL(f);
      images.push({ name: f.name, url });
    }

    // 初回選択時は先頭表示
    if (images.length && img.hidden && phase === "idle") {
      currentIndex = 0;
      showImageOnly();
    }
    fileInput.value = "";
    render();
  });

  // ===== End assets =====
  pickEndImgBtn.addEventListener("click", () => endImgInput.click());
  endImgInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (endImageUrl) URL.revokeObjectURL(endImageUrl);
    endImageUrl = URL.createObjectURL(f);
    endImgName.textContent = f.name;
    endImgInput.value = "";
  });

  pickEndAudioBtn.addEventListener("click", () => endAudioInput.click());
  endAudioInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (endAudioUrl) URL.revokeObjectURL(endAudioUrl);
    endAudioUrl = URL.createObjectURL(f);
    endAudioName.textContent = f.name;
    endAudioInput.value = "";

    endAudio = new Audio(endAudioUrl);
    endAudio.preload = "auto";
  });

  // ===== Clear =====
  const clearAll = () => {
    stop(true);
    cleanupAllUrls();
    images = [];
    currentIndex = 0;
    phase = "idle";
    remain = totalSec;
    shownCount = 0;

    // end assetsは残したい場合はここで消さない（今回は残す）
    img.hidden = true;
    img.removeAttribute("src");
    countdownBox.classList.remove("show");
    hint.style.display = "";

    setRunningUI(false);
    render();
    close();
  };
  clearBtn.addEventListener("click", clearAll);
  clearBtn2.addEventListener("click", clearAll);

  // ===== Shuffle (ONにするたび) =====
  const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  let lastShuffleChecked = false;
  shuffleChk.addEventListener("change", () => {
    const now = shuffleChk.checked;
    if (!lastShuffleChecked && now && images.length > 1) {
      shuffleArray(images);
      currentIndex = 0;
      if (phase === "idle") showImageOnly();
      render();
    }
    lastShuffleChecked = now;
  });

  // ===== Settings =====
  const apply = () => {
    totalSec = clampSeconds(Number(secInput2.value));
    targetCount = clampCount(Number(countInput2.value));

    secInput.value = totalSec;
    secInput2.value = totalSec;
    countInput.value = targetCount;
    countInput2.value = targetCount;

    if (phase === "idle") {
      remain = totalSec;
      shownCount = 0;
    }
    render();
  };

  // 初期値反映
  totalSec = clampSeconds(Number(secInput.value));
  targetCount = clampCount(Number(countInput.value));
  secInput2.value = totalSec;
  countInput2.value = targetCount;
  render();

  secInput.addEventListener("change", () => {
    totalSec = clampSeconds(Number(secInput.value));
    secInput2.value = totalSec;
    if (phase === "idle") remain = totalSec;
    render();
  });
  countInput.addEventListener("change", () => {
    targetCount = clampCount(Number(countInput.value));
    countInput2.value = targetCount;
    render();
  });
  applySettings.addEventListener("click", () => { apply(); close(); });

  // ===== Navigation (manual) =====
  const prev = () => {
    if (!images.length) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    if (phase === "idle") showImageOnly();
    render();
  };
  const nextManual = () => {
    if (!images.length) return;
    currentIndex = (currentIndex + 1) % images.length;
    if (phase === "idle") showImageOnly();
    render();
  };
  prevBtn.addEventListener("click", () => { prev(); close(); });
  nextBtn.addEventListener("click", () => { nextManual(); close(); });

  // ===== Core: session control =====
  const start = () => {
    if (!images.length) { alert("先に画像を追加してください"); return; }

    stop(true); // 念のため完全停止（状態だけ初期化）
    setRunningUI(true);

    // セッション初期化
    phase = "show";
    remain = totalSec;
    countdown = COUNTDOWN_SEC;
    shownCount = 0;

    // 先頭を表示
    if (currentIndex < 0 || currentIndex >= images.length) currentIndex = 0;
    showImageOnly();
    render();

    timerId = setInterval(tick, 1000);
  };

  const stop = (hard=false) => {
    stopInterval();
    setRunningUI(false);

    if (hard) {
      // hard stop: 状態だけ初期化（終了演出は出さない）
      phase = "idle";
      remain = totalSec;
      countdown = COUNTDOWN_SEC;
      shownCount = 0;
      countdownBox.classList.remove("show");
      if (images.length) showImageOnly();
      else {
        img.hidden = true;
        img.removeAttribute("src");
        hint.style.display = "";
      }
    } else {
      // normal stop: 途中停止（次回再生で新セッション）
      phase = "idle";
      remain = totalSec;
      countdown = COUNTDOWN_SEC;
      countdownBox.classList.remove("show");
      if (images.length) showImageOnly();
    }

    render();
  };

  const endSession = async () => {
    stopInterval();
    phase = "ended";
    setRunningUI(false);

    // 終了画像を表示（あれば）
    if (endImageUrl) {
      hint.style.display = "none";
      countdownBox.classList.remove("show");
      img.hidden = false;
      img.src = endImageUrl;
    } else {
      // 終了画像がない場合、いったんヒント表示（好みで調整可）
      img.hidden = true;
      img.removeAttribute("src");
      countdownBox.classList.remove("show");
      hint.style.display = "";
      hint.textContent = "終了しました（終了画像未設定）";
    }

    // 終了音声（あれば）再生
    try {
      if (endAudio) {
        await endAudio.play();
      }
    } catch {
      // ブラウザの自動再生制限等で失敗する場合あり
      // その場合でもアプリは終了表示だけ行う
    }

    // 停止状態へ戻す（見た目は終了画像のまま）
    phase = "idle";
    remain = totalSec;
    countdown = COUNTDOWN_SEC;
    render();
  };

  // 「1枚表示し終えた」時の処理（時間切れ→カウント→次へ の“次へ確定”で +1）
  const advanceImageAfterCountdown = () => {
    // 規定枚数に達したら終了
    shownCount += 1;
    if (shownCount >= targetCount) {
      render();
      endSession();
      return;
    }

    // 次画像へ（リスト終端なら先頭に戻して継続）
    currentIndex = (currentIndex + 1) % images.length;
    showImageOnly();

    // 次の表示フェーズ開始
    phase = "show";
    remain = totalSec;
    render();
  };

  // ===== Tick: state machine =====
  const tick = () => {
    if (phase === "show") {
      remain -= 1;
      if (remain <= 0) {
        remain = 0;
        // 画像→カウントへ
        phase = "countdown";
        countdown = COUNTDOWN_SEC;
        showCountdownOnly();
        render();
        return;
      }
      render();
      return;
    }

    if (phase === "countdown") {
      countdown -= 1;
      if (countdown <= 0) {
        // カウント完了→次画像へ
        countdown = 0;
        countdownNum.textContent = "0";
        advanceImageAfterCountdown();
        return;
      }
      countdownNum.textContent = String(countdown);
      return;
    }
  };

  // Buttons
  startBtn.addEventListener("click", start);
  startBtn2.addEventListener("click", () => { start(); close(); });
  playBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", () => stop(false));

  // Hotkeys
  window.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Escape") close();
    if (e.key === " ") { e.preventDefault(); running ? stop(false) : start(); }
    if (e.key.toLowerCase() === "m") drawer.classList.contains("open") ? close() : openDrawer();
  });

  // Initial
  if (!images.length) {
    img.hidden = true;
    hint.style.display = "";
  }
  render();

  // Cleanup
  window.addEventListener("beforeunload", () => cleanupAllUrls());
})();
