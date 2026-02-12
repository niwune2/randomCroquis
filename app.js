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

  // 設定（drawerのみ）
  const secInput2 = $("secInput2");
  const countInput2 = $("countInput2");
  const applySettings = $("applySettings");
  const shuffleChk = $("shuffleChk");

  const presetGrid = $("presetGrid");

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

  const countdownOverlay = $("countdownOverlay");
  const countdownNum = $("countdownNum");

  const endImgName = $("endImgName");
  const endAudioName = $("endAudioName");

  // ===== State =====
  /** images: [{name, url}] */
  let images = [];
  let currentIndex = 0;

  // settings
  let totalSec = 60;
  let targetCount = 10;
  const COUNTDOWN_SEC = 3;

  // running
  let phase = "idle"; // "idle" | "show" | "countdown" | "ended"
  let remain = totalSec;
  let countdown = COUNTDOWN_SEC;
  let timerId = null;
  let running = false;

  // progress
  let shownCount = 0; // 内部は0始まり（完了数）

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
    // ✅ 上限撤廃。分単位も長時間もOK
    const n = Number.isFinite(v) ? v : 60;
    return Math.max(1, Math.floor(n));
  };
  const clampCount = (v) => {
    const n = Number.isFinite(v) ? v : 1;
    return Math.max(1, Math.min(9999, Math.floor(n)));
  };

  const setRunningUI = (on) => {
    running = on;
    body.classList.toggle("running", on);
  };

  // ✅ 時分秒表示（1時間未満は mm:ss、以上は h:mm:ss）
  const formatTime = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;

    const pad2 = (x) => String(x).padStart(2, "0");

    if (h > 0) return `${h}:${pad2(m)}:${pad2(r)}`;
    return `${pad2(m)}:${pad2(r)}`;
  };

  const render = () => {
    timeNum.textContent = (phase === "idle") ? "--" : formatTime(remain);

    // 進捗は1始まり表示
    if (phase === "idle") {
      shownNum.textContent = "--";
    } else {
      const displayProgress = Math.min(shownCount + 1, targetCount);
      shownNum.textContent = String(displayProgress);
    }
    targetNum.textContent = String(targetCount);

    pickedCount.textContent = String(images.length);
    posLabel.textContent = images.length
      ? `${currentIndex + 1}/${images.length}  ${images[currentIndex]?.name ?? ""}`
      : "-";
  };

  const showImage = () => {
    countdownOverlay.classList.remove("show");

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

  const showCountdownOverlay = () => {
    countdownOverlay.classList.add("show");
    countdownNum.textContent = String(countdown);
  };

  // ===== Shuffle =====
  const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  let lastShuffleChecked = true;
  shuffleChk.addEventListener("change", () => {
    const now = shuffleChk.checked;
    if (!lastShuffleChecked && now && images.length > 1) {
      shuffleArray(images);
      currentIndex = 0;
      if (phase === "idle") showImage();
      render();
    }
    lastShuffleChecked = now;
  });

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

    if (shuffleChk.checked && images.length > 1) {
      shuffleArray(images);
      currentIndex = 0;
    } else if (images.length === files.length) {
      currentIndex = 0;
    }

    if (phase === "idle") showImage();

    fileInput.value = "";
    render();
  });

  // ===== Preset buttons =====
  if (presetGrid) {
    presetGrid.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-seconds]");
      if (!btn) return;
      const seconds = clampSeconds(Number(btn.dataset.seconds));
      secInput2.value = String(seconds);
      // 反映は自動でやる（ミス防止）
      totalSec = seconds;
      if (phase === "idle") {
        remain = totalSec;
        shownCount = 0;
      }
      render();
    });
  }

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
  const stopInterval = () => {
    if (timerId) clearInterval(timerId);
    timerId = null;
  };

  const stop = (hard = false) => {
    stopInterval();
    setRunningUI(false);

    phase = "idle";
    remain = totalSec;
    countdown = COUNTDOWN_SEC;
    if (hard) shownCount = 0;

    countdownOverlay.classList.remove("show");

    if (images.length) showImage();
    else {
      img.hidden = true;
      img.removeAttribute("src");
      hint.style.display = "";
    }
    render();
  };

  const clearAll = () => {
    stop(true);
    for (const it of images) {
      try { URL.revokeObjectURL(it.url); } catch { }
    }
    images = [];
    currentIndex = 0;

    phase = "idle";
    remain = totalSec;
    shownCount = 0;
    countdownOverlay.classList.remove("show");

    img.hidden = true;
    img.removeAttribute("src");
    hint.style.display = "";

    setRunningUI(false);
    render();
    close();
  };
  clearBtn.addEventListener("click", clearAll);
  clearBtn2.addEventListener("click", clearAll);

  // ===== Settings =====
  const apply = () => {
    totalSec = clampSeconds(Number(secInput2.value));
    targetCount = clampCount(Number(countInput2.value));

    secInput2.value = String(totalSec);
    countInput2.value = String(targetCount);

    if (phase === "idle") {
      remain = totalSec;
      shownCount = 0;
    }
    render();
  };
  applySettings.addEventListener("click", () => { apply(); close(); });

  // 初期値（drawerのみ）
  totalSec = clampSeconds(Number(secInput2.value));
  targetCount = clampCount(Number(countInput2.value));
  secInput2.value = String(totalSec);
  countInput2.value = String(targetCount);

  // ===== Navigation (manual) =====
  const prev = () => {
    if (!images.length) return;
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    if (phase === "idle") showImage();
    render();
  };
  const nextManual = () => {
    if (!images.length) return;
    currentIndex = (currentIndex + 1) % images.length;
    if (phase === "idle") showImage();
    render();
  };
  prevBtn.addEventListener("click", () => { prev(); close(); });
  nextBtn.addEventListener("click", () => { nextManual(); close(); });

  // ===== Core: session control =====
  const endSession = async () => {
    stopInterval();
    phase = "ended";
    setRunningUI(false);

    countdownOverlay.classList.remove("show");

    if (endImageUrl) {
      hint.style.display = "none";
      img.hidden = false;
      img.src = endImageUrl;
    } else {
      img.hidden = true;
      img.removeAttribute("src");
      hint.style.display = "";
      hint.textContent = "終了しました（終了画像未設定）";
    }

    try {
      if (endAudio) await endAudio.play();
    } catch { }

    phase = "idle";
    remain = totalSec;
    countdown = COUNTDOWN_SEC;
    shownCount = 0;
    render();
  };

  const advanceAfterCountdown = () => {
    shownCount += 1;

    if (shownCount >= targetCount) {
      render();
      endSession();
      return;
    }

    currentIndex = (currentIndex + 1) % images.length;
    showImage();

    phase = "show";
    remain = totalSec;
    render();
  };

  const tick = () => {
    if (phase === "show") {
      remain -= 1;

      if (remain <= 0) {
        remain = 0;

        // ✅ 最後の画像は 3カウント無しで即終了
        const isLast = (shownCount + 1) >= targetCount;
        if (isLast) {
          render();
          endSession();
          return;
        }

        phase = "countdown";
        countdown = COUNTDOWN_SEC;
        showCountdownOverlay();
        render();
        return;
      }

      render();
      return;
    }

    if (phase === "countdown") {
      countdown -= 1;

      if (countdown <= 0) {
        countdown = 0;
        countdownNum.textContent = "0";
        countdownOverlay.classList.remove("show");
        advanceAfterCountdown();
        return;
      }

      countdownNum.textContent = String(countdown);
      return;
    }
  };

  const start = () => {
    if (!images.length) { alert("先に画像を追加してください"); return; }

    stop(true);
    setRunningUI(true);

    phase = "show";
    remain = totalSec;
    countdown = COUNTDOWN_SEC;
    shownCount = 0;

    if (currentIndex < 0 || currentIndex >= images.length) currentIndex = 0;
    showImage();
    render();

    timerId = setInterval(tick, 1000);
  };

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
})();
