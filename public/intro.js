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
  if (
    !dialog ||
    !mobile.matches ||
    new URLSearchParams(location.search).has("screen")
  )
    return;
  try {
    if (sessionStorage.getItem(storageKey) === "done") return;
  } catch {}
  if (typeof dialog.showModal !== "function") return;
  const scenes = [...dialog.querySelectorAll(".prologue-scene")];
  const skip = document.getElementById("prologue-skip");
  const loads = new Map();
  const duration = 4800;
  let finished = false,
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
      document.querySelector(".hero-cta")?.focus({ preventScroll: true });
    };
    if (immediate || reduced.matches) close();
    else setTimeout(close, 350);
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
    if (!mobile.matches) finish(true);
  }
  skip.addEventListener("click", () => finish());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    finish();
  });
  document.addEventListener("visibilitychange", visibility);
  mobile.addEventListener("change", resize);
  window.addEventListener("pagehide", () => finish(true), { once: true });
  dialog.showModal();
  dialog.focus({ preventScroll: true });
  show(0);
})();
