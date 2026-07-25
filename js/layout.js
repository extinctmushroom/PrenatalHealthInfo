/* Shared layout: header, footer, theme toggle, mobile nav.
   Non-module so it runs everywhere. Auth-aware bits are wired by auth.js. */
(function () {
  const path = location.pathname.split("/").pop() || "index.html";
  const base = document.body.dataset.base || "";

  const links = [
    { href: "index.html",     label: "Home" },
    { href: "guide.html",     label: "Guide" },
    { href: "dashboard.html", label: "Dashboard" },
    { href: "about.html",     label: "About" },
  ];

  const navLinks = links.map(l => {
    const active = l.href === path ? " active" : "";
    return `<a href="${base}${l.href}" class="${active.trim()}">${l.label}</a>`;
  }).join("");

  const header = `
  <header class="site-header">
    <nav class="nav">
      <a class="brand" href="${base}index.html">
        <span class="mark">❀</span> Willow
      </a>
      <div class="nav-links" id="navLinks">${navLinks}</div>
      <div class="nav-spacer"></div>
      <div class="nav-right">
        <span id="authSlot"></span>
        <button class="icon-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme">☾</button>
        <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      </div>
    </nav>
  </header>`;

  const year = new Date().getFullYear();
  const footer = `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="brand" href="${base}index.html" style="margin-bottom:12px"><span class="mark">❀</span> Willow</a>
        <p>Evidence-based preconception health — nutrition, movement, supplements, and hormone care, with every claim sourced to public health authorities and peer-reviewed research.</p>
      </div>
      <div>
        <h4>Explore</h4>
        <a href="${base}guide.html">Full guide</a>
        <a href="${base}guide.html#hormones">Hormone optimization</a>
        <a href="${base}guide.html#nutrition">Nutrition</a>
        <a href="${base}guide.html#exercise">Exercise</a>
        <a href="${base}guide.html#vitamins">Vitamins</a>
        <a href="${base}guide.html#wellbeing">Emotional wellbeing</a>
      </div>
      <div>
        <h4>Account</h4>
        <a href="${base}dashboard.html">Dashboard</a>
        <a href="${base}login.html">Sign in</a>
        <a href="${base}about.html">About &amp; sources</a>
        <a href="${base}about.html#disclaimer">Medical disclaimer</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p style="margin:0">© ${year} Willow · Educational information only — not medical advice. Always consult your clinician.</p>
    </div>
  </footer>`;

  const headMount = document.getElementById("site-header");
  const footMount = document.getElementById("site-footer");
  if (headMount) headMount.outerHTML = header;
  if (footMount) footMount.outerHTML = footer;

  if (document.getElementById("main-content")) {
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#main-content">Skip to content</a>`);
  }

  // Theme
  const root = document.documentElement;
  const saved = localStorage.getItem("willow-theme");
  if (saved) root.setAttribute("data-theme", saved);
  function currentDark() {
    const t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function paintThemeBtn() {
    const b = document.getElementById("themeBtn");
    if (b) b.textContent = currentDark() ? "☀" : "☾";
  }
  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = currentDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("willow-theme", next);
      paintThemeBtn();
    });
  }
  paintThemeBtn();

  // Mobile nav
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("navLinks");
  if (toggle && nav) toggle.addEventListener("click", () => nav.classList.toggle("open"));

  // Active guide-nav scrollspy (only on guide page). Scoped to the chapter
  // list so injected search-result links are never treated as nav items.
  const spy = document.querySelectorAll(".guide-nav ul a");
  if (spy.length) {
    const sections = [...spy].map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const onScroll = () => {
      let cur = sections[0];
      const y = window.scrollY + 100;
      for (const s of sections) if (s.offsetTop <= y) cur = s;
      spy.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + cur.id));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
