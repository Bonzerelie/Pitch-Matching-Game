/* /script.js
   Pitch Matching Test (single-note)
   - Squarespace iframe sizing + scroll forwarding preserved
*/
(() => {
  "use strict";

  const AUDIO_DIR = "audio";
  const LS_KEY_NAME = "pm_player_name";

  // UI Sounds
  const UI_SND_SELECT = "select1.mp3";
  const UI_SND_BACK = "back1.mp3";
  const UI_SND_CORRECT = "correct1.mp3";
  const UI_SND_INCORRECT = "incorrect1.mp3";

  // Keyboard rendering
  const OUTER_H = 320;
  const BORDER_PX = 19;

  const WHITE_W = 40;
  const WHITE_H = OUTER_H - (BORDER_PX * 2);
  const BLACK_W = Math.round(WHITE_W * 0.62);
  const BLACK_H = Math.round(WHITE_H * 0.63);

  const RADIUS = 18;
  const WHITE_CORNER_R = 10;

  // Fixed colors for the standardized series Look
  const HIGHLIGHT_COLOR = "#4da3ff";
  const CORRECT_COLOR = "#1f9d55";
  const WRONG_COLOR = "#d13b3b";

  const STOP_FADE_SEC = 0.04;

  const PC_TO_STEM = {
    0: "c", 1: "csharp", 2: "d", 3: "dsharp", 4: "e", 5: "f",
    6: "fsharp", 7: "g", 8: "gsharp", 9: "a", 10: "asharp", 11: "b",
  };

  const PC_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const PC_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  const KEYBOARD_PRESETS = {
    "4oct-c2": { label: "4 octaves", startOctave: 2, octaves: 4, endOnFinalC: true },
    "3oct-c3": { label: "3 octaves", startOctave: 3, octaves: 3, endOnFinalC: true },
    "2oct-c3": { label: "2 octaves", startOctave: 3, octaves: 2, endOnFinalC: true },
    "1oct-c4": { label: "1 octave", startOctave: 4, octaves: 1, endOnFinalC: true },
  };

  const $ = (id) => document.getElementById(id);

  const mount = $("mount");

  const titleWrap = $("titleWrap");
  const titleImgWide = $("titleImgWide");
  const titleImgWrapped = $("titleImgWrapped");

  const beginBtn = $("beginBtn");
  const replayBtn = $("replayBtn");
  const submitBtn = $("submitBtn");
  const nextBtn = $("nextBtn");

  const settingsBtn = $("settingsBtn");
  const infoBtn = $("infoBtn");
  const downloadScoreBtn = $("downloadScoreBtn");

  const actionHint = $("actionHint");
  const feedbackOut = $("feedbackOut");
  const scoreOut = $("scoreOut");

  // Modals
  const introModal = $("introModal");
  const introBeginBtn = $("introBeginBtn");
  const introRangeSelect = $("introRangeSelect");

  const settingsModal = $("settingsModal");
  const settingsRangeSelect = $("settingsRangeSelect");
  const settingsRestartBtn = $("settingsRestartBtn");
  const settingsCancelBtn = $("settingsCancelBtn");

  const infoModal = $("infoModal");
  const infoClose = $("infoClose");

  const scoreModal = $("scoreModal");
  const scoreModalContinueBtn = $("scoreModalContinueBtn");
  const modalDownloadScorecardBtn = $("modalDownloadScorecardBtn");

  const streakModal = $("streakModal");
  const modalTitleRecord = $("modalTitleRecord");
  const modalBodyRecord = $("modalBodyRecord");
  const modalCloseRecord = $("modalCloseRecord");
  const modalDownloadRecord = $("modalDownloadRecord");

  const scoreMeta = $("scoreMeta");
  const modalScoreMeta = $("modalScoreMeta");
  const playerNameInput = $("playerNameInput");
  const modalPlayerNameInput = $("modalPlayerNameInput");

  if (!mount || !beginBtn || !replayBtn || !submitBtn || !nextBtn) {
    const msg = "UI mismatch: some required elements are missing.";
    if (feedbackOut) feedbackOut.textContent = msg;
    else alert(msg);
    return;
  }

  let svg = null;
  const pitchToKey = new Map();
  let allPitches = [];

  let started = false;
  let targetPitch = null;
  let pickedPitch = null;
  let lastTargetPitch = null;
  let awaitingNext = false;
  let currentRangeMode = "2oct-c3"; 

  const score = { asked: 0, correct: 0, streak: 0, longestStored: 0 };

  // ---------- dynamic title resizing ----------
  function setTitleMode(mode) {
    if (!titleWrap) return;
    titleWrap.classList.toggle("titleModeWide", mode === "wide");
    titleWrap.classList.toggle("titleModeWrapped", mode === "wrapped");
  }
  function computeDesiredWideWidthPx() {
    const cssMax = 600;
    const natural = titleImgWide?.naturalWidth || cssMax;
    return Math.min(cssMax, natural);
  }
  function updateTitleForWidth() {
    if (!titleWrap || !titleImgWide || !titleImgWrapped) return;
    const available = Math.floor(titleWrap.getBoundingClientRect().width);
    const desiredWide = computeDesiredWideWidthPx();
    if (available + 1 < desiredWide) setTitleMode("wrapped");
    else setTitleMode("wide");
  }

  // ---------- iframe sizing + scroll forwarding ----------
  let lastHeight = 0;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height = Math.ceil(entry.contentRect.height);
      if (height !== lastHeight) {
        parent.postMessage({ iframeHeight: height }, "*");
        lastHeight = height;
      }
    }
  });
  ro.observe(document.documentElement);

  function postHeightNow() {
    try {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ iframeHeight: h }, "*");
    } catch {}
  }
  window.addEventListener("load", () => {
    postHeightNow();
    setTimeout(postHeightNow, 250);
    setTimeout(postHeightNow, 1000);
  });
  window.addEventListener("orientationchange", () => {
    setTimeout(postHeightNow, 100);
    setTimeout(postHeightNow, 500);
  });

  function enableScrollForwardingToParent() {
    const SCROLL_GAIN = 6.0;

    const isVerticallyScrollable = () =>
      document.documentElement.scrollHeight > window.innerHeight + 2;

    const isInteractiveTarget = (t) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, label");

    const isInPianoStrip = (t) =>
      t instanceof Element && !!t.closest("#mount, .mount, svg, .key");

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lockedMode = null;

    let lastMoveTs = 0;
    let vScrollTop = 0;

    window.addEventListener("touchstart", (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.target;
      lockedMode = null;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastY = startY;

      lastMoveTs = e.timeStamp || performance.now();
      vScrollTop = 0;

      if (isInteractiveTarget(t) || isInPianoStrip(t)) lockedMode = "x";
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      if (isVerticallyScrollable()) return;

      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - startX;
      const dy = y - startY;

      if (!lockedMode) {
        if (Math.abs(dy) > Math.abs(dx) + 4) lockedMode = "y";
        else if (Math.abs(dx) > Math.abs(dy) + 4) lockedMode = "x";
        else return;
      }
      if (lockedMode !== "y") return;

      const nowTs = e.timeStamp || performance.now();
      const dt = Math.max(8, nowTs - lastMoveTs);
      lastMoveTs = nowTs;

      const fingerStep = (y - lastY) * SCROLL_GAIN;
      lastY = y;
      const scrollTopDelta = -fingerStep;
      const instV = scrollTopDelta / dt;
      vScrollTop = vScrollTop * 0.75 + instV * 0.25;

      e.preventDefault();
      parent.postMessage({ scrollTopDelta }, "*");
    }, { passive: false });

    function endGesture() {
      if (lockedMode === "y" && Math.abs(vScrollTop) > 0.05) {
        const capped = Math.max(-5.5, Math.min(5.5, vScrollTop));
        parent.postMessage({ scrollTopVelocity: capped }, "*");
      }
      lockedMode = null;
      vScrollTop = 0;
    }

    window.addEventListener("touchend", endGesture, { passive: true });
    window.addEventListener("touchcancel", endGesture, { passive: true });
    window.addEventListener("wheel", (e) => {
      if (isVerticallyScrollable()) return;
      parent.postMessage({ scrollTopDelta: e.deltaY }, "*");
    }, { passive: true });
  }
  enableScrollForwardingToParent();

  // ---------- audio ----------
  let audioCtx = null;
  let masterGain = null;
  const bufferPromiseCache = new Map();
  const activeVoices = new Set();
  const activeUiAudios = new Set();
  let synthFallbackWarned = false;

  function ensureAudioGraph() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.92;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -10;   
    compressor.knee.value = 12;         
    compressor.ratio.value = 12;        
    compressor.attack.value = 0.002;    
    compressor.release.value = 0.25;

    masterGain.connect(compressor);
    compressor.connect(audioCtx.destination);

    return audioCtx;
  }

  async function resumeAudioIfNeeded() {
    const ctx = ensureAudioGraph();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch {}
    }
  }

  function trackVoice(src, gain, startTime) {
    const voice = { src, gain, startTime };
    activeVoices.add(voice);
    src.onended = () => activeVoices.delete(voice);
    return voice;
  }

  function stopAllNotes(fadeSec = STOP_FADE_SEC) {
    const ctx = ensureAudioGraph();
    if (!ctx) return;

    const now = ctx.currentTime;
    const fade = Math.max(0.01, Number.isFinite(fadeSec) ? fadeSec : STOP_FADE_SEC);

    for (const v of Array.from(activeVoices)) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fade / 6);
        const stopAt = Math.max(now + fade, (v.startTime || now) + 0.001);
        v.src.stop(stopAt + 0.02);
      } catch {}
    }
    activeVoices.clear();
  }

  function stopAllUiSounds() {
    for (const a of Array.from(activeUiAudios)) {
      try { a.pause(); a.currentTime = 0; } catch {}
      activeUiAudios.delete(a);
    }
  }

  function stopAllAudio() {
    stopAllNotes(0.04);
    stopAllUiSounds();
  }

  function noteUrl(stem, octaveNum) {
    return `${AUDIO_DIR}/${stem}${octaveNum}.mp3`;
  }

  function loadBuffer(url) {
    if (bufferPromiseCache.has(url)) return bufferPromiseCache.get(url);
    const p = (async () => {
      const ctx = ensureAudioGraph();
      if (!ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch { return null; }
    })();
    bufferPromiseCache.set(url, p);
    return p;
  }

  function pitchToFrequency(pitch) {
    const A4 = pitchFromPcOct(9, 4);
    return 440 * Math.pow(2, (pitch - A4) / 12);
  }

  function playSynthToneWindowed(pitch, whenSec, playSec, fadeOutSec, gain = 0.65) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return null;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitchToFrequency(pitch), whenSec);

    const g = ctx.createGain();
    const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 0.65);
    const fadeIn = 0.01;
    const endAt = whenSec + Math.max(0.05, playSec);

    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);
    const fade = Math.max(0.015, Number.isFinite(fadeOutSec) ? fadeOutSec : 0.06);
    const fadeStart = Math.max(whenSec + 0.02, endAt - fade);
    g.gain.setValueAtTime(safeGain, fadeStart);
    g.gain.linearRampToValueAtTime(0, endAt);

    osc.connect(g);
    g.connect(masterGain);

    trackVoice(osc, g, whenSec);
    osc.start(whenSec);
    osc.stop(endAt + 0.03);
    return osc;
  }

  function maybeWarnSynthFallback(missingUrl) {
    if (synthFallbackWarned) return;
    synthFallbackWarned = true;
    console.warn("Audio sample missing; using synthesized tones instead:", missingUrl);
  }

  function playBufferAt(buffer, whenSec, gain = 1) {
    const ctx = ensureAudioGraph();
    if (!ctx || !masterGain) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const safeGain = Math.max(0, Number.isFinite(gain) ? gain : 1);
    const fadeIn = 0.004;

    g.gain.setValueAtTime(0, whenSec);
    g.gain.linearRampToValueAtTime(safeGain, whenSec + fadeIn);

    src.connect(g);
    g.connect(masterGain);
    trackVoice(src, g, whenSec);

    src.start(whenSec);
    return src;
  }

  function pitchFromPcOct(pc, oct) { return (oct * 12) + pc; }
  function pcFromPitch(pitch) { return ((pitch % 12) + 12) % 12; }
  function octFromPitch(pitch) { return Math.floor(pitch / 12); }
  function getStemForPc(pc) { return PC_TO_STEM[(pc + 12) % 12] || null; }

  async function playPitch(pitch, gain = 1) {
    const key = pitchToKey.get(pitch);
    if (!key) return;

    const pc = Number(key.getAttribute("data-pc"));
    const oct = Number(key.getAttribute("data-oct"));
    const stem = getStemForPc(pc);
    if (!stem) return;

    await resumeAudioIfNeeded();

    const url = noteUrl(stem, oct);
    const buf = await loadBuffer(url);

    const ctx = ensureAudioGraph();
    if (!ctx) return;

    stopAllAudio(); // Ensures that old pitches stop before the new one starts

    if (!buf) {
      maybeWarnSynthFallback(url);
      playSynthToneWindowed(pitch, ctx.currentTime, 0.85, 0.08, gain * 0.7);
      return;
    }
    playBufferAt(buf, ctx.currentTime, gain);
  }

  async function playUiSound(filename) {
    try {
      stopAllAudio(); // Cut off everything else before a UI sound
      
      const url = `${AUDIO_DIR}/${filename}`;
      const buffer = await loadBuffer(url);
      if (!buffer) return;
      const ctx = ensureAudioGraph();
      if (!ctx) return;
      
      const when = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(2.0, when);

      src.connect(g);
      g.connect(masterGain);
      trackVoice(src, g, when);
      src.start(when);
    } catch (e) { console.error("UI Sound error:", e); }
  }

  // ---------- game logic ----------
  function randomInt(min, max) {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function pickRandomPitchAvoidRepeat() {
    if (!allPitches.length) return null;
    if (allPitches.length === 1) return allPitches[0];

    for (let i = 0; i < 7; i++) {
      const p = allPitches[randomInt(0, allPitches.length - 1)];
      if (p !== lastTargetPitch) return p;
    }
    return allPitches[randomInt(0, allPitches.length - 1)];
  }

  function scorePercent() {
    if (score.asked <= 0) return 0;
    return Math.round((score.correct / score.asked) * 1000) / 10;
  }

  function displayLongest() {
    return Math.max(score.longestStored, score.streak);
  }

  function gameModeLabel() {
    return KEYBOARD_PRESETS[currentRangeMode]?.label || "Custom";
  }

  function updateScoreMetaText() {
    const metaText = `Mode: ${gameModeLabel()}`;
    if (scoreMeta) scoreMeta.textContent = metaText;
    if (modalScoreMeta) modalScoreMeta.textContent = metaText;
  }

  function renderScore() {
    const items = [
      ["Questions asked", score.asked],
      ["Answers correct", score.correct],
      ["Correct in a row", score.streak],
      ["Longest correct streak", displayLongest()],
      ["Percentage correct", `${scorePercent()}%`],
    ];

    scoreOut.innerHTML = items.map(([k, v]) =>
        `<div class="scoreItem"><span class="scoreK">${k}</span><span class="scoreV">${v}</span></div>`
    ).join("");
    
    updateScoreMetaText();
  }

  function setResult(html) { feedbackOut.innerHTML = html || ""; }

  function clearAllHighlights() {
    if (!svg) return;
    svg.querySelectorAll(".key").forEach(k => k.classList.remove("selected", "handL", "correct", "wrong"));
  }

  function setKeyPreselected(pitch, on) {
    const k = pitchToKey.get(pitch);
    if (!k) return;
    k.classList.toggle("selected", on);
    k.classList.toggle("handL", on);
  }

  function showKeyCorrect(pitch) {
    const k = pitchToKey.get(pitch);
    if (!k) return;
    k.classList.remove("selected", "handL", "wrong");
    k.classList.add("correct");
  }

  function showKeyWrong(pitch) {
    const k = pitchToKey.get(pitch);
    if (!k) return;
    k.classList.remove("selected", "handL", "correct");
    k.classList.add("wrong");
  }

  function pitchLabel(pitch) {
    const pc = pcFromPitch(pitch);
    const oct = octFromPitch(pitch);
    const isAcc = [1, 3, 6, 8, 10].includes(pc);
    if (!isAcc) return `${PC_NAMES_SHARP[pc]}${oct}`;
    return `${PC_NAMES_SHARP[pc]}${oct} / ${PC_NAMES_FLAT[pc]}${oct}`;
  }

  function updateBeginButton() {
    beginBtn.textContent = started ? "End / Restart Game" : "Begin Game";
    beginBtn.classList.toggle("pulse", !started);
    beginBtn.classList.toggle("primary", !started);
    beginBtn.classList.toggle("isRestart", started);
  }

  function updateControlsEnabled() {
    const isModalOpen = isVisible(introModal) || isVisible(settingsModal) || isVisible(infoModal) || isVisible(scoreModal) || isVisible(streakModal);

    if (replayBtn) replayBtn.disabled = !started || targetPitch == null || isModalOpen;
    
    const canNext = started && awaitingNext && !isModalOpen;
    if (nextBtn) {
      nextBtn.disabled = !canNext;
      nextBtn.classList.toggle("nextReady", canNext);
    }
    
    const canSubmit = started && !awaitingNext && pickedPitch != null && targetPitch != null && !isModalOpen;
    if (submitBtn) {
      submitBtn.disabled = !canSubmit;
      submitBtn.classList.toggle("pulse", canSubmit);
    }
    
    if (beginBtn) beginBtn.disabled = isModalOpen;
    if (downloadScoreBtn) downloadScoreBtn.disabled = isModalOpen || score.asked === 0;
  }

  async function startGame() {
    await resumeAudioIfNeeded();
    stopAllAudio();
    clearAllHighlights();
    
    started = true;
    pickedPitch = null;
    awaitingNext = false;
    
    score.asked = 0;
    score.correct = 0;
    score.streak = 0;
    score.longestStored = 0;
    
    renderScore();
    updateBeginButton();
    updateControlsEnabled();
    
    await startNewQuestion({ autoplay: true });
  }

  function returnToStartScreen({ openIntro = false } = {}) {
    stopAllAudio();
    clearAllHighlights();

    started = false;
    awaitingNext = false;
    pickedPitch = null;
    targetPitch = null;
    lastTargetPitch = null;

    score.asked = 0;
    score.correct = 0;
    score.streak = 0;
    score.longestStored = 0;
    
    renderScore();
    updateBeginButton();
    
    if (openIntro) {
      setResult("Press <strong>Begin Game</strong> to start.");
      if (actionHint) actionHint.innerHTML = "";
      updateControlsEnabled();
      
      openModal(introModal);
      try { introBeginBtn.focus(); } catch {}
    } else {
      // Re-trigger game immediately if requested to bypass intro
      setResult("");
      if (actionHint) actionHint.innerHTML = "Tip: press <strong>R</strong> to replay, <strong>Space</strong>/<strong>Enter</strong> to submit.";
      started = true;
      updateBeginButton();
      updateControlsEnabled();
      startNewQuestion({ autoplay: true });
    }
  }

  async function startNewQuestion({ autoplay = true } = {}) {
    if (!started) return;
  
    clearAllHighlights();
    pickedPitch = null;
    awaitingNext = false;
    updateControlsEnabled();
  
    targetPitch = pickRandomPitchAvoidRepeat();
    lastTargetPitch = targetPitch;
  
    renderScore();
  
    if (autoplay && targetPitch != null) {
      setResult("Which pitch was that? Press <strong>R</strong> or <strong>Replay Note</strong> to hear again! 🔉");
      await new Promise(requestAnimationFrame); 
      await playPitch(targetPitch, 1);
    } else {
      setResult("Which pitch was that? Press <strong>R</strong> or <strong>Replay Note</strong> to hear again! 🔉");
    }
    
    updateControlsEnabled();
  }

  async function replayTarget() {
    if (!started || targetPitch == null) return;
    await playPitch(targetPitch, 1);
  }

  function clearPick() {
    if (pickedPitch == null) return;
    setKeyPreselected(pickedPitch, false);
    pickedPitch = null;
    awaitingNext = false;
    updateControlsEnabled();
  }

  async function handleKeyClick(keyEl) {
    if (!started || awaitingNext) return;

    const pitch = Number(keyEl.getAttribute("data-abs"));
    if (!Number.isFinite(pitch)) return;

    if (pickedPitch === pitch) {
      clearPick();
      return;
    }

    if (pickedPitch != null) setKeyPreselected(pickedPitch, false);
    pickedPitch = pitch;

    setKeyPreselected(pitch, true);
    updateControlsEnabled();

    await playPitch(pitch, 0.95);
  }

  // Modals framework
  let lastFocusEl = null;
  function openModal(modalEl) {
    lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalEl.classList.remove("hidden");
    postHeightNow();
    updateControlsEnabled();
  }

  function closeModal(modalEl) {
    modalEl.classList.add("hidden");
    postHeightNow();
    updateControlsEnabled();
    if (lastFocusEl) {
      try { lastFocusEl.focus(); } catch {}
    }
  }

  function isVisible(modalEl) { return !modalEl.classList.contains("hidden"); }

  function showRecordPopup(title, message, { showDownload = false } = {}) {
    if (!streakModal || !modalTitleRecord || !modalBodyRecord || !modalDownloadRecord || !modalCloseRecord) return;
    modalTitleRecord.textContent = title;
    modalBodyRecord.textContent = message;
    modalDownloadRecord.classList.toggle("hidden", !showDownload);
    openModal(streakModal);
    modalCloseRecord.focus();
  }

  let scoreModalContinueCallback = null;
  function showScoreModal(onContinue) {
    scoreModalContinueCallback = onContinue;
    
    if ($("modalAsked")) $("modalAsked").textContent = score.asked;
    if ($("modalCorrect")) $("modalCorrect").textContent = score.correct;
    if ($("modalStreak")) $("modalStreak").textContent = score.streak;
    if ($("modalLongest")) $("modalLongest").textContent = displayLongest();
    if ($("modalPercent")) $("modalPercent").textContent = `${scorePercent()}%`;
    
    updateScoreMetaText();
    openModal(scoreModal);
    try { scoreModalContinueBtn.focus(); } catch {}
  }

  function considerStreakForLongestOnFail(prevStreak) {
    if (prevStreak > score.longestStored) {
      score.longestStored = prevStreak;
      showRecordPopup(
        "New Longest Streak!",
        `New Longest Streak! That's ${prevStreak} correct in a row!`,
        { showDownload: true }
      );
    }
  }

  async function submitAnswer() {
    if (!started || targetPitch == null || pickedPitch == null) return;

    stopAllAudio(); // Stop target pitch & preview immediately upon submission

    score.asked += 1;
    renderScore();

    const isCorrect = pickedPitch === targetPitch;
    clearAllHighlights();

    if (isCorrect) {
      setTimeout(() => playUiSound(UI_SND_CORRECT), 20); // Small timeout allows full sound clearance
      score.correct += 1;
      score.streak += 1;
      renderScore();

      const noteName = pitchLabel(targetPitch);
      setResult(`Correct! ✅ That was the note <strong>${noteName}</strong>. Nice one!`);
      showKeyCorrect(pickedPitch);

      pickedPitch = null;
      awaitingNext = true;
      
      updateControlsEnabled();
      if (actionHint) actionHint.innerHTML = "Correct! Press <strong>Next</strong> (or <strong>Space</strong>) for the next note.";
      return;
    }

    playUiSound(UI_SND_INCORRECT);
    const prevStreak = score.streak;
    score.streak = 0;

    const noteName = pitchLabel(targetPitch);
    setResult(`Incorrect ❌ The note played was <strong>${noteName}</strong>.`);

    showKeyWrong(pickedPitch);
    showKeyCorrect(targetPitch);

    pickedPitch = null;
    awaitingNext = true;
    renderScore();

    considerStreakForLongestOnFail(prevStreak);
    updateControlsEnabled();
    if (actionHint) actionHint.innerHTML = "Press <strong>Next</strong> (or <strong>Space</strong>) for the next note.";
  }

  async function goNext() {
    if (!started || !awaitingNext) return;
    setResult("");
    if (actionHint) actionHint.innerHTML = "Tip: press <strong>R</strong> to replay, <strong>Space</strong>/<strong>Enter</strong> to submit.";
    awaitingNext = false;
    stopAllAudio();
    updateControlsEnabled();
    await startNewQuestion({ autoplay: true });
  }

  // Settings syncing logic
  function isSettingsDirty() {
    return settingsRangeSelect.value !== currentRangeMode;
  }
  
  function updateSettingsDirtyUi() {
    const dirty = isSettingsDirty();
    if (settingsRestartBtn) {
      settingsRestartBtn.disabled = !dirty;
      settingsRestartBtn.classList.toggle("is-disabled", !dirty);
    }
  }
  
  function applyRangeMode(newMode) {
    currentRangeMode = newMode;
    initKeyboard();
    updateScoreMetaText();
  }

  // Name input sync
  function loadInitialName() {
    const saved = localStorage.getItem(LS_KEY_NAME);
    const v = String(saved || "").trim();
    return v.slice(0, 32);
  }

  function saveName(name) { try { localStorage.setItem(LS_KEY_NAME, String(name || "").trim().slice(0, 32)); } catch {} }

  function syncNames(val) {
    if (playerNameInput && playerNameInput.value !== val) playerNameInput.value = val;
    if (modalPlayerNameInput && modalPlayerNameInput.value !== val) modalPlayerNameInput.value = val;
  }
  if (playerNameInput) playerNameInput.addEventListener("input", (e) => syncNames(e.target.value));
  if (modalPlayerNameInput) modalPlayerNameInput.addEventListener("input", (e) => syncNames(e.target.value));


  // ---------- PNG downloads ----------
  async function loadImage(src) {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  
  function drawImageContain(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const r = Math.min(w / iw, h / ih);
    const dw = Math.max(1, iw * r);
    const dh = Math.max(1, ih * r);
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    return { w: dw, h: dh, x: dx, y: dy };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function sanitizeFilenamePart(s) {
    const v = String(s || "").trim().replace(/\s+/g, "_");
    const cleaned = v.replace(/[^a-zA-Z0-9_\-]+/g, "");
    return cleaned.slice(0, 32) || "";
  }
  
  function safeText(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(); }

  async function downloadScorecardPng(nameInputEl) {
    const LAYOUT = {
      gapAfterImage: 32,           
      gapAfterUrl: 36,             
      gapAfterTitle: 30,           
      gapAfterMeta: 28,            
      gapAfterName: 22,            
      gapNoNameCompensation: 12,   
      mainGridRowGap: 14,          
    };

    const name = safeText(nameInputEl?.value);
    if (nameInputEl) saveName(name);

    const W = 720;
    const rowsCount = 5;
    const rowH = 58;
    const baseContentH = 340; 
    const H = baseContentH + (rowsCount * (rowH + LAYOUT.mainGridRowGap)) + 80; 
    
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const pad = 34;
    const cardX = pad;
    const cardY = pad;
    const cardW = W - pad * 2;
    const cardH = H - pad * 2;

    ctx.fillStyle = "#f9f9f9";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.stroke();

    const titleSrc = titleImgWide?.getAttribute("src") || "images/title.png";
    const titleImg = await loadImage(titleSrc);

    let yCursor = cardY + 26;

    if (titleImg) {
      const imgMaxW = Math.min(520, cardW - 40);
      const imgMaxH = 92;
      drawImageContain(ctx, titleImg, (W - imgMaxW) / 2, yCursor, imgMaxW, imgMaxH);
      yCursor += imgMaxH + LAYOUT.gapAfterImage;
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "800 18px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("www.eartraininglab.com", W / 2, yCursor);
    yCursor += LAYOUT.gapAfterUrl;

    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.font = "700 26px Arial, Helvetica, sans-serif";
    ctx.fillText("Score Card", W / 2, yCursor);
    yCursor += LAYOUT.gapAfterTitle;

    ctx.font = "800 18px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.fillText(`Mode: ${gameModeLabel()}`, W / 2, yCursor);
    yCursor += LAYOUT.gapAfterMeta;

    if (name) {
      ctx.fillText(`Name: ${name}`, W / 2, yCursor);
      yCursor += LAYOUT.gapAfterName;
    } else {
      yCursor += LAYOUT.gapNoNameCompensation; 
    }

    ctx.fillStyle = "#111";
    ctx.textAlign = "left";

    const rowX = cardX + 26;
    const rowW = cardW - 52;
    
    const rows = [
      ["Questions asked", String(score.asked)],
      ["Answers correct", String(score.correct)],
      ["Correct in a row", String(score.streak)],
      ["Longest correct streak", String(displayLongest())],
      ["Percentage correct", `${scorePercent()}%`],
    ];

    for (const [k, v] of rows) {
      ctx.fillStyle = "#ffffff";
      drawRoundRect(ctx, rowX, yCursor, rowW, rowH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.70)";
      ctx.font = "900 18px Arial, Helvetica, sans-serif";
      ctx.fillText(k, rowX + 16, yCursor + 33);

      ctx.fillStyle = "#111";
      ctx.font = "900 22px Arial, Helvetica, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v, rowX + rowW - 16, yCursor + 37);
      ctx.textAlign = "left";

      yCursor += rowH + LAYOUT.mainGridRowGap;
    }

    ctx.textAlign = "center";
    ctx.font = "800 14px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText("Match The Pitch! - www.eartraininglab.com", W / 2, cardY + cardH - 24);

    const fileBase = name ? `${sanitizeFilenamePart(name)}_scorecard` : "scorecard";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function drawCardBaseOld(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfbfc";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#111";
    ctx.fillRect(8, 8, w - 16, 74);
  }

  function drawWrappedTextOld(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  async function downloadRecordPng(streakValue, playerName) {
    const w = 980;
    const h = 420;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawCardBaseOld(ctx, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "900 30px Arial";
    ctx.fillText("Match The Pitch! — Record", 28, 56);

    ctx.fillStyle = "#111";
    ctx.font = "900 28px Arial";
    ctx.fillText(`${streakValue} correct in a row!`, 28, 142);

    ctx.font = "700 22px Arial";
    ctx.fillStyle = "#111";
    const msg = `${playerName} just scored ${streakValue} correct answers in a row on the Match The Pitch! game 🎉🎶🥳`;
    drawWrappedTextOld(ctx, msg, 28, 200, w - 56, 34);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.font = "700 16px Arial";
    ctx.fillText("Downloaded from www.eartraininglab.com 🎶", 28, h - 36);

    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Match The Pitch Record.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
  }

  // ---------- Keyboard SVG ----------
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, children = []) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const c of children) n.appendChild(c);
    return n;
  }

  function hexToRgba(hex, alpha) {
    const m = String(hex).replace("#", "").trim();
    const rgb = (m.length === 3)
      ? [m[0] + m[0], m[1] + m[1], m[2] + m[2]].map(x => parseInt(x, 16))
      : [m.slice(0, 2), m.slice(2, 4), m.slice(4, 6)].map(x => parseInt(x, 16));
    const a = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0.28));
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  }

  function darken(hex, amt) {
    const m = String(hex).replace("#", "").trim();
    const rgb = (m.length === 3)
      ? [m[0] + m[0], m[1] + m[1], m[2] + m[2]].map(x => parseInt(x, 16))
      : [m.slice(0, 2), m.slice(2, 4), m.slice(4, 6)].map(x => parseInt(x, 16));
    const to = (c) => Math.max(0, Math.min(255, Math.round(c)));
    const out = rgb.map(c => to(c * (1 - amt)));
    return `rgb(${out[0]},${out[1]},${out[2]})`;
  }

  function outerRoundedWhitePath(x, y, w, h, r, roundLeft) {
    const rr = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
    if (roundLeft) {
      return [
        `M ${x + rr} ${y}`,
        `H ${x + w}`,
        `V ${y + h}`,
        `H ${x + rr}`,
        `A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
        `V ${y + rr}`,
        `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
        `Z`
      ].join(" ");
    }
    return [
      `M ${x} ${y}`,
      `H ${x + w - rr}`,
      `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
      `V ${y + h - rr}`,
      `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
      `H ${x}`,
      `V ${y}`,
      `Z`
    ].join(" ");
  }

  const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
  const WHITE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const BLACK_BY_WHITE_INDEX = {
    0: ["C#", "Db", 1],
    1: ["D#", "Eb", 3],
    3: ["F#", "Gb", 6],
    4: ["G#", "Ab", 8],
    5: ["A#", "Bb", 10],
  };

  function cloneShapeForOverlay(shape) {
    const overlay = shape.cloneNode(true);
    overlay.classList.add("hlOverlay");
    return overlay;
  }

  function makeWhiteKey(x, y, w, h, label, pc, pitch, roundLeft, roundRight, octaveNum) {
    const shape = (roundLeft || roundRight)
      ? el("path", { d: outerRoundedWhitePath(x, y, w, h, WHITE_CORNER_R, roundLeft) })
      : el("rect", { x, y, width: w, height: h });

    const noteTextY = y + h - 16;
    const text = el("text", { x: x + w / 2, y: noteTextY, "text-anchor": "middle" });
    text.textContent = label;

    return el("g", {
      class: "key white",
      "data-pc": pc,
      "data-abs": pitch,
      "data-oct": octaveNum,
    }, [shape, text]);
  }

  function makeBlackKey(x, y, w, h, sharpName, flatName, pc, pitch, octaveNum) {
    const rect = el("rect", { x, y, width: w, height: h, rx: 4, ry: 4 });

    const text = el("text", { x: x + w / 2, y: y + Math.round(h * 0.46), "text-anchor": "middle" });
    const t1 = el("tspan", { x: x + w / 2, dy: "-6" }); t1.textContent = sharpName;
    const t2 = el("tspan", { x: x + w / 2, dy: "14" }); t2.textContent = flatName;
    text.appendChild(t1);
    text.appendChild(t2);

    return el("g", {
      class: "key black",
      "data-pc": pc,
      "data-abs": pitch,
      "data-oct": octaveNum,
    }, [rect, text]);
  }

  function buildKeyboardSvg(preset) {
    const { startOctave, octaves, endOnFinalC } = preset;

    const totalWhite = octaves * 7 + (endOnFinalC ? 1 : 0);
    const innerW = totalWhite * WHITE_W;
    const outerW = innerW + (BORDER_PX * 2);

    const s = el("svg", {
      id: "pianoSvg",
      width: outerW,
      height: OUTER_H,
      viewBox: `0 0 ${outerW} ${OUTER_H}`,
      role: "img",
      "aria-label": "Keyboard",
      preserveAspectRatio: "xMidYMid meet",
    });

    s.style.width = `${outerW}px`;
    s.style.width = "100%";
    s.style.height = "auto";

    const style = el("style");
    style.textContent = `
      :root { --hlL:${HIGHLIGHT_COLOR}; --hlTextL:#ffffff; --correct:${CORRECT_COLOR}; --wrong:${WRONG_COLOR}; }

      @keyframes keyPulse {
        0%   { filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
        45%  { filter: drop-shadow(0 0 9px rgba(0,0,0,0.0)) drop-shadow(0 0 10px rgba(77,163,255,0.45)); }
        100% { filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
      }

      .white rect, .white path { fill:#fff; stroke:#222; stroke-width:1; }
      .white text { font-family: Arial, Helvetica, sans-serif; font-size:14px; fill:#9a9a9a; pointer-events:none; user-select:none; }

      .black rect { fill: url(#blackGrad); stroke:#111; stroke-width:1; }
      .black text { font-family: Arial, Helvetica, sans-serif; font-size:12px; fill:#fff; pointer-events:none; user-select:none; opacity:0; }

      .key { cursor:pointer; }

      .white.selected.handL rect, .white.selected.handL path { fill: var(--hlL); animation:keyPulse 1.05s ease-in-out infinite; }
      .white.selected.handL text { fill: var(--hlTextL); font-weight:700; }
      .black.selected.handL rect { fill: url(#hlBlackGradL); animation:keyPulse 1.05s ease-in-out infinite; }
      .black.selected.handL text { opacity:1; }

      .white.correct rect, .white.correct path { fill: var(--correct); }
      .white.correct text { fill: rgba(255,255,255,0.95); font-weight:800; }
      .black.correct rect { fill: url(#hlBlackCorrect); }
      .black.correct text { opacity:1; }

      .white.wrong rect, .white.wrong path { fill: var(--wrong); }
      .white.wrong text { fill: rgba(255,255,255,0.95); font-weight:800; }
      .black.wrong rect { fill: url(#hlBlackWrong); }
      .black.wrong text { opacity:1; }
    `;
    s.appendChild(style);

    const defs = el("defs");

    const blackGrad = el("linearGradient", { id: "blackGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      el("stop", { offset: "0%", "stop-color": "#3a3a3a" }),
      el("stop", { offset: "100%", "stop-color": "#000000" }),
    ]);

    const hlBlackGradL = el("linearGradient", { id: "hlBlackGradL", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      el("stop", { offset: "0%", "stop-color": HIGHLIGHT_COLOR }),
      el("stop", { offset: "100%", "stop-color": darken(HIGHLIGHT_COLOR, 0.45) }),
    ]);

    const hlBlackCorrect = el("linearGradient", { id: "hlBlackCorrect", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      el("stop", { offset: "0%", "stop-color": CORRECT_COLOR }),
      el("stop", { offset: "100%", "stop-color": darken(CORRECT_COLOR, 0.35) }),
    ]);

    const hlBlackWrong = el("linearGradient", { id: "hlBlackWrong", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      el("stop", { offset: "0%", "stop-color": WRONG_COLOR }),
      el("stop", { offset: "100%", "stop-color": darken(WRONG_COLOR, 0.35) }),
    ]);

    defs.appendChild(blackGrad);
    defs.appendChild(hlBlackGradL);
    defs.appendChild(hlBlackCorrect);
    defs.appendChild(hlBlackWrong);
    s.appendChild(defs);

    s.appendChild(el("rect", {
      x: BORDER_PX / 2,
      y: BORDER_PX / 2,
      width: outerW - BORDER_PX,
      height: OUTER_H - BORDER_PX,
      rx: RADIUS,
      ry: RADIUS,
      fill: "#ffffff",
      stroke: "#000000",
      "stroke-width": BORDER_PX,
    }));

    const gWhite = el("g", { id: "whiteKeys" });
    const gBlack = el("g", { id: "blackKeys" });
    s.appendChild(gWhite);
    s.appendChild(gBlack);

    const startX = BORDER_PX;
    const startY = BORDER_PX;

    for (let i = 0; i < totalWhite; i++) {
      const x = startX + (i * WHITE_W);
      const noteName = WHITE_NOTES[i % 7];
      const pc = WHITE_PC[noteName];
      const octIndex = Math.floor(i / 7);
      const octaveNum = startOctave + octIndex;
      const pitch = pitchFromPcOct(pc, octaveNum);

      const label = (noteName === "C" && octaveNum === 4) ? "C4" : noteName;
      const isFirst = (i === 0);
      const isLast = (i === totalWhite - 1);

      gWhite.appendChild(makeWhiteKey(x, startY, WHITE_W, WHITE_H, label, pc, pitch, isFirst, isLast, octaveNum));
    }

    for (let oct = 0; oct < octaves; oct++) {
      const baseWhite = oct * 7;
      const octaveNum = startOctave + oct;

      for (const [whiteI, info] of Object.entries(BLACK_BY_WHITE_INDEX)) {
        const wi = Number(whiteI);
        const [sharpName, flatName, pc] = info;

        const leftWhiteX = startX + ((baseWhite + wi) * WHITE_W);
        const x = leftWhiteX + WHITE_W - (BLACK_W / 2);

        const pitch = pitchFromPcOct(pc, octaveNum);
        gBlack.appendChild(makeBlackKey(x, startY, BLACK_W, BLACK_H, sharpName, flatName, pc, pitch, octaveNum));
      }
    }

    return s;
  }

  function initKeyboard() {
    const preset = KEYBOARD_PRESETS[currentRangeMode] || KEYBOARD_PRESETS["2oct-c3"];

    mount.innerHTML = "";
    pitchToKey.clear();

    svg = buildKeyboardSvg(preset);
    mount.appendChild(svg);

    const keys = [...svg.querySelectorAll(".key")];
    for (const g of keys) {
      const pc = Number(g.getAttribute("data-pc"));
      const oct = Number(g.getAttribute("data-oct"));
      const pitch = pitchFromPcOct(pc, oct);
      pitchToKey.set(pitch, g);
    }

    allPitches = [...pitchToKey.keys()].sort((a, b) => a - b);

    keys.forEach(g => {
      g.addEventListener("click", (e) => {
        e.preventDefault();
        handleKeyClick(g);
      });
    });
  }


  // ---------- Events ----------

  function bind() {

    // Intro modal
    function handleIntroContinue() {
      playUiSound(UI_SND_SELECT);
      const newMode = String(introRangeSelect.value || "2oct-c3");
      applyRangeMode(newMode);
      if (settingsRangeSelect) settingsRangeSelect.value = newMode;
      
      closeModal(introModal);
      setResult("Press <strong>Begin Game</strong> to start.");
      try { beginBtn.focus(); } catch {}
    }
    introBeginBtn.addEventListener("click", handleIntroContinue);
    
    // Settings modal
    settingsBtn.addEventListener("click", () => {
        playUiSound(UI_SND_SELECT);
        stopAllAudio();
        if (settingsRangeSelect) settingsRangeSelect.value = currentRangeMode;
        openModal(settingsModal);
        updateSettingsDirtyUi();
        try { settingsRangeSelect.focus(); } catch {}
    });
    
    settingsCancelBtn.addEventListener("click", () => {
        playUiSound(UI_SND_BACK);
        if (settingsRangeSelect) settingsRangeSelect.value = currentRangeMode;
        updateSettingsDirtyUi();
        closeModal(settingsModal);
    });
    
    settingsRangeSelect.addEventListener("change", updateSettingsDirtyUi);
    
    settingsRestartBtn.addEventListener("click", () => {
      if (settingsRestartBtn.disabled) return;
      playUiSound(UI_SND_SELECT);
      const newMode = String(settingsRangeSelect.value || "2oct-c3");
      
      closeModal(settingsModal);

      showScoreModal(() => {
        applyRangeMode(newMode);
        if (introRangeSelect) introRangeSelect.value = newMode;
        returnToStartScreen({ openIntro: false });
      });
    });

    // Info Modal
    infoBtn.addEventListener("click", () => {
        playUiSound(UI_SND_SELECT);
        stopAllAudio();
        openModal(infoModal);
        try { infoClose.focus(); } catch {}
    });

    infoClose.addEventListener("click", () => {
        playUiSound(UI_SND_BACK);
        closeModal(infoModal);
    });

    // Score modal
    scoreModalContinueBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      closeModal(scoreModal);
      if (scoreModalContinueCallback) scoreModalContinueCallback();
    });

    beginBtn.addEventListener("click", async () => {
      if (!started) {
        if (introModal && !introModal.classList.contains("hidden")) closeModal(introModal);
        await startGame();
      } else {
        showScoreModal(() => {
          returnToStartScreen({ openIntro: true });
        });
      }
    });

    replayBtn.addEventListener("click", replayTarget);
    submitBtn.addEventListener("click", submitAnswer);
    nextBtn.addEventListener("click", goNext);

    downloadScoreBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(playerNameInput);
    });
    modalDownloadScorecardBtn.addEventListener("click", () => {
      playUiSound(UI_SND_SELECT);
      downloadScorecardPng(modalPlayerNameInput);
    });
    
    modalDownloadRecord.addEventListener("click", () => {
        const name = safeText(playerNameInput.value) || "Player";
        downloadRecordPng(score.longestStored || displayLongest(), name);
    });

    // Modals closing overrides
    modalCloseRecord?.addEventListener("click", () => {
        playUiSound(UI_SND_BACK);
        closeModal(streakModal);
    });
    streakModal?.addEventListener("click", (e) => { 
        if (e.target === streakModal) {
            playUiSound(UI_SND_BACK);
            closeModal(streakModal); 
        }
    });
    introModal?.addEventListener("click", (e) => { 
        if (e.target === introModal) {
            playUiSound(UI_SND_BACK);
            closeModal(introModal); 
        }
    });
    settingsModal?.addEventListener("click", (e) => { 
        if (e.target === settingsModal) {
            playUiSound(UI_SND_BACK);
            if (settingsRangeSelect) settingsRangeSelect.value = currentRangeMode;
            closeModal(settingsModal);
        }
    });
    infoModal?.addEventListener("click", (e) => { 
        if (e.target === infoModal) {
            playUiSound(UI_SND_BACK);
            closeModal(infoModal);
        }
    });

    window.addEventListener("resize", () => {
      updateTitleForWidth();
    });

    document.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") {
        if (isVisible(settingsModal)) {
          playUiSound(UI_SND_BACK);
          if (settingsRangeSelect) settingsRangeSelect.value = currentRangeMode;
          closeModal(settingsModal);
          return;
        }
        if (isVisible(infoModal)) {
          playUiSound(UI_SND_BACK);
          closeModal(infoModal);
          return;
        }
        if (isVisible(streakModal)) { 
          playUiSound(UI_SND_BACK);
          closeModal(streakModal); 
          return; 
        }
        return;
      }

      if (isVisible(settingsModal) || isVisible(introModal) || isVisible(scoreModal) || isVisible(streakModal) || isVisible(infoModal)) return;

      if (!started) return;

      if (e.code === "KeyR") {
        await replayTarget();
        return;
      }

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        
        // Block submit via keyboard if we are in state where they haven't picked a pitch
        if (awaitingNext && !nextBtn.disabled) {
           await goNext();
        } else if (!awaitingNext && pickedPitch != null && !submitBtn.disabled) {
           await submitAnswer();
        }
      }
    });
  }

  function initTitleSwap() {
    if (!titleWrap || !titleImgWide || !titleImgWrapped) return;

    const tryUpdate = () => updateTitleForWidth();

    if (titleImgWide.complete) tryUpdate();
    else titleImgWide.addEventListener("load", tryUpdate, { once: true });

    if (titleImgWrapped.complete) tryUpdate();
    else titleImgWrapped.addEventListener("load", tryUpdate, { once: true });

    const tro = new ResizeObserver(() => updateTitleForWidth());
    tro.observe(titleWrap);
  }

  function init() {
    bind();
    initTitleSwap();

    const initialName = loadInitialName();
    if (playerNameInput) playerNameInput.value = initialName;
    if (modalPlayerNameInput) modalPlayerNameInput.value = initialName;

    applyRangeMode("2oct-c3");

    renderScore();
    updateBeginButton();
    updateControlsEnabled();
    updateTitleForWidth();

    setResult("Press <strong>Begin Game</strong> to start.");

    openModal(introModal);
    try { introBeginBtn.focus(); } catch {}
  }

  init();
})();