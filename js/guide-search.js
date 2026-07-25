/* Instant client-side search for the guide.
   Indexes the rendered chapters at load — no build step, no external library,
   and the index always matches what's actually on the page. */
(function () {
  const content = document.querySelector(".guide-content");
  const nav = document.querySelector(".guide-nav");
  if (!content || !nav) return;

  /* ---------- Build the index ---------- */
  // Each entry is a heading plus the prose that follows it, so a hit can point
  // at the nearest anchor rather than the whole chapter.
  const entries = [];
  content.querySelectorAll("section[id]").forEach((section) => {
    const chapter = section.querySelector("h2")?.textContent.trim() || section.id;

    // The chapter intro: everything before the first h3.
    let intro = "";
    for (const node of section.children) {
      if (node.tagName === "H3") break;
      if (["P", "UL", "OL", "TABLE", "DIV"].includes(node.tagName)) intro += " " + node.textContent;
    }
    entries.push({ chapter, heading: chapter, id: section.id, text: normalize(intro) });

    // Each h3 subsection.
    section.querySelectorAll("h3").forEach((h3, i) => {
      let text = "";
      let node = h3.nextElementSibling;
      while (node && node.tagName !== "H3") {
        text += " " + node.textContent;
        node = node.nextElementSibling;
      }
      // Give subsections a stable anchor so results can deep-link to them.
      if (!h3.id) h3.id = `${section.id}-${i}`;
      entries.push({
        chapter,
        heading: h3.textContent.trim(),
        id: h3.id,
        text: normalize(text),
      });
    });
  });

  function normalize(s) { return s.replace(/\s+/g, " ").trim(); }

  /* ---------- UI ---------- */
  const box = document.createElement("div");
  box.className = "guide-search";
  box.innerHTML = `
    <label class="sr-only" for="guideSearch">Search the guide</label>
    <input id="guideSearch" type="search" class="input" placeholder="Search the guide…"
           autocomplete="off" role="combobox" aria-expanded="false"
           aria-controls="guideSearchResults" aria-describedby="guideSearchHint">
    <p id="guideSearchHint" class="sr-only">Results appear below as you type. Press Escape to clear.</p>
    <div id="guideSearchResults" class="guide-search-results" role="listbox" hidden></div>`;
  nav.prepend(box);

  const input = box.querySelector("#guideSearch");
  const results = box.querySelector("#guideSearchResults");
  const navList = nav.querySelector("ul");

  let active = -1;
  let current = [];

  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; run(""); input.blur(); return; }
    if (!current.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = e.key === "ArrowDown"
        ? Math.min(active + 1, current.length - 1)
        : Math.max(active - 1, 0);
      paintActive();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      results.querySelectorAll("a")[active]?.click();
    }
  });

  // Clicking a result should behave like normal navigation, then reset.
  results.addEventListener("click", (e) => {
    if (e.target.closest("a")) setTimeout(() => { input.value = ""; run(""); }, 0);
  });

  function run(raw) {
    const q = raw.trim().toLowerCase();
    active = -1;
    if (q.length < 2) {
      current = [];
      results.hidden = true;
      results.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      navList.hidden = false;
      return;
    }

    const terms = q.split(/\s+/).filter(Boolean);
    current = entries
      .map((entry) => ({ entry, score: score(entry, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    navList.hidden = true;
    input.setAttribute("aria-expanded", "true");
    results.hidden = false;

    if (!current.length) {
      results.innerHTML = `<p class="guide-search-empty">No matches for “${escapeHtml(raw.trim())}”.</p>`;
      return;
    }

    results.innerHTML = current.map(({ entry }, i) => `
      <a href="#${entry.id}" role="option" aria-selected="false" data-i="${i}">
        <span class="gs-heading">${highlight(entry.heading, terms)}</span>
        ${entry.heading !== entry.chapter ? `<span class="gs-chapter">${escapeHtml(entry.chapter)}</span>` : ""}
        <span class="gs-snippet">${snippet(entry.text, terms)}</span>
      </a>`).join("");
  }

  function score(entry, terms) {
    const heading = entry.heading.toLowerCase();
    const text = entry.text.toLowerCase();
    let total = 0;
    for (const t of terms) {
      // Every term must appear somewhere, so multi-word queries narrow results.
      if (!heading.includes(t) && !text.includes(t)) return 0;
      if (heading.includes(t)) total += 10;
      total += Math.min(text.split(t).length - 1, 5);
    }
    return total;
  }

  function snippet(text, terms) {
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) {
      const i = lower.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    if (at === -1) return escapeHtml(text.slice(0, 110)) + (text.length > 110 ? "…" : "");
    const start = Math.max(0, at - 40);
    const raw = text.slice(start, start + 130);
    return (start > 0 ? "…" : "") + highlight(raw, terms) + (start + 130 < text.length ? "…" : "");
  }

  function highlight(text, terms) {
    let out = escapeHtml(text);
    for (const t of terms) {
      out = out.replace(new RegExp(`(${escapeRegExp(escapeHtml(t))})`, "ig"), "<mark>$1</mark>");
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function paintActive() {
    results.querySelectorAll("a").forEach((a, i) => {
      const on = i === active;
      a.classList.toggle("active", on);
      a.setAttribute("aria-selected", on ? "true" : "false");
      if (on) a.scrollIntoView({ block: "nearest" });
    });
  }

  // "/" focuses search, the way most docs sites behave.
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
})();
