(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const copy = document.getElementById("intro-copy");
  if (copy && !reduced.matches) {
    [
      [1600, "아득한 시간, 금서에 남겨진 한 사람의 기운."],
      [3300, "그 안에 그대의 이야기가 잠들어 있느니라."],
      [5000, "이제, 그대의 이야기를 펼칠 시간."],
    ].forEach(([time, text]) =>
      setTimeout(() => {
        copy.textContent = text;
      }, time),
    );
  }
  const dialog = document.getElementById("mobile-prologue");
  const mobile = matchMedia("(max-width: 700px)");
  const storageKey = "gumseo-prologue-v1";
  if (!dialog || new URLSearchParams(location.search).has("screen")) return;
  if (typeof dialog.showModal !== "function") return;
  const replay = document.getElementById("prologue-replay");
  const scenes = [...dialog.querySelectorAll(".prologue-scene")];
  const skip = document.getElementById("prologue-skip");
  const loads = new Map();
  const duration = 4600;
  let finished = true,
    automatic = false,
    returnFocus,
    closeTimer = 0,
    loading = false,
    current = -1,
    timer = 0,
    startedAt = 0,
    remaining = duration,
    version = 0;
  function load(index) {
    if (loads.has(index)) return loads.get(index);
    const img = scenes[index].querySelector("img");
    const promise = new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = img.dataset.storySrc;
      if (img.complete && img.naturalWidth) resolve(true);
    });
    loads.set(index, promise);
    return promise;
  }
  function finish(immediate = false) {
    if (finished) return;
    finished = true;
    version++;
    clearTimeout(timer);
    try {
      sessionStorage.setItem(storageKey, "done");
    } catch {}
    document.removeEventListener("visibilitychange", visibility);
    mobile.removeEventListener("change", resize);
    dialog.classList.add("is-leaving");
    const close = () => {
      dialog.close();
      returnFocus?.focus({ preventScroll: true });
    };
    if (immediate || reduced.matches) close();
    else closeTimer = setTimeout(close, 350);
  }
  function arm() {
    if (finished || loading || current < 0 || document.hidden) return;
    startedAt = performance.now();
    timer = setTimeout(() => show(current + 1), remaining);
  }
  async function show(index) {
    if (finished) return;
    if (index >= scenes.length) {
      finish();
      return;
    }
    clearTimeout(timer);
    timer = 0;
    const token = ++version;
    loading = true;
    let timeout;
    const ready = await Promise.race([
      load(index),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(false), 4000);
      }),
    ]);
    clearTimeout(timeout);
    if (finished || token !== version) return;
    loading = false;
    if (!ready) {
      finish(true);
      return;
    }
    scenes.forEach((scene, i) => {
      scene.hidden = i !== index;
      scene.classList.toggle("is-active", i === index);
    });
    current = index;
    remaining = duration;
    dialog.dataset.scene = String(index + 1);
    dialog.setAttribute("aria-busy", "false");
    dialog.classList.toggle("is-paused", document.hidden);
    if (index + 1 < scenes.length) load(index + 1);
    arm();
  }
  function visibility() {
    dialog.classList.toggle("is-paused", document.hidden);
    if (document.hidden) {
      if (timer)
        remaining = Math.max(0, remaining - (performance.now() - startedAt));
      clearTimeout(timer);
      timer = 0;
    } else arm();
  }
  function resize() {
    if (automatic && !mobile.matches) finish(true);
  }
  function start(manual = false) {
    if (dialog.open) return;
    clearTimeout(closeTimer);
    clearTimeout(timer);
    finished = false;
    automatic = !manual;
    loading = false;
    current = -1;
    remaining = duration;
    version++;
    returnFocus = manual ? replay : document.querySelector(".hero-cta");
    dialog.classList.remove("is-leaving", "is-paused");
    delete dialog.dataset.scene;
    dialog.setAttribute("aria-busy", "true");
    scenes.forEach((scene) => {
      scene.hidden = true;
      scene.classList.remove("is-active");
    });
    document.addEventListener("visibilitychange", visibility);
    mobile.addEventListener("change", resize);
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    void dialog.offsetWidth;
    show(0);
  }
  skip.addEventListener("click", () => finish());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish();
  });
  window.addEventListener("pagehide", () => finish(true));
  if (replay) {
    replay.hidden = false;
    if (copy) copy.hidden = true;
    replay.addEventListener("click", () => start(true));
  }
  let seen = false;
  try {
    seen = sessionStorage.getItem(storageKey) === "done";
  } catch {}
  if (mobile.matches && !seen) start();
  const stage = document.querySelector(".landing-stage");
  const ctas = document.querySelector(".landing-cta-stack");
  const legal = document.querySelector(".hero-bottom .landing-links");
  function positionMainLinks() {
    if (!stage || !ctas || !legal || mobile.matches) return;
    const base = stage.getBoundingClientRect(),
      buttons = ctas.getBoundingClientRect(),
      links = legal.getBoundingClientRect();
    stage.style.setProperty(
      "--more-link-top",
      `${buttons.bottom - base.top + 14}px`,
    );
    stage.style.setProperty(
      "--more-link-left",
      `${buttons.left - base.left}px`,
    );
    stage.style.setProperty(
      "--story-link-top",
      `${links.top - base.top - (replay?.offsetHeight || 35) - 12}px`,
    );
    stage.style.setProperty(
      "--story-link-right",
      `${base.right - links.right}px`,
    );
  }
  requestAnimationFrame(positionMainLinks);
  window.addEventListener("resize", positionMainLinks);
  document.fonts?.ready.then(positionMainLinks);
  if (typeof ResizeObserver === "function" && stage && ctas && legal) {
    const observer = new ResizeObserver(positionMainLinks);
    observer.observe(ctas);
    observer.observe(legal);
  }
})();
