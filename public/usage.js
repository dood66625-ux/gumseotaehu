(() => {
  if (!location.protocol.startsWith("http")) return;
  let last = "",
    disabled = false,
    timer = 0,
    chain = Promise.resolve();
  function stage() {
    const screen = new URLSearchParams(location.search).get("screen");
    const path = location.pathname;
    if (
      /^\/(admin|legal|private-reading|recover|help)(\/|$)/.test(path) ||
      [
        "admin",
        "privacy",
        "terms",
        "content",
        "business",
        "recover",
        "help",
      ].includes(screen)
    )
      return "";
    if (document.querySelector("#mobile-prologue[open]")) return "story";
    const wizard = document.querySelector(".birth-wizard");
    if (wizard)
      return (
        ["name", "birth", "time", "basis", "consent"][
          Number(wizard.dataset.step)
        ] || ""
      );
    if (document.querySelector(".screen-flow")) return "preview";
    if (document.querySelector(".checkout-flow")) return "checkout";
    if (screen === "report" || path.startsWith("/report/")) return "report";
    if (["success", "fail"].includes(screen) || path.startsWith("/checkout/"))
      return "payment";
    if (document.querySelector(".landing-stage") && !screen) return "landing";
    return "";
  }
  let referrer = "";
  try {
    referrer = document.referrer ? new URL(document.referrer).origin : "";
  } catch {}
  async function send(value) {
    if (disabled) return;
    try {
      const response = await fetch("/api/usage", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: value, referrer }),
        keepalive: true,
      });
      if ([404, 405, 503].includes(response.status)) disabled = true;
    } catch {
      /* Logging must never block forms, payment, or report access. */
    }
  }
  function observe() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = stage();
      if (!next || next === last || disabled) return;
      last = next;
      chain = chain.then(() => send(next));
    }, 100);
  }
  function init() {
    const first = stage();
    if (first) {
      last = first;
      chain = chain.then(() => send(first));
    }
    observe();
    new MutationObserver(observe).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-step", "hidden", "open"],
    });
    addEventListener("popstate", observe);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
