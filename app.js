(() => {
  "use strict";

  // ======================================================================
  //  Profile + goals. Single user for now; later the AI preferences chat
  //  fills this object per account.
  // ======================================================================
  const ME = {
    first: "Claudio",
    major: "Mechanical Engineering",
    school: "University of Arkansas",
    hometowns: ["the woodlands", "houston", "spring, tx", "conroe"],
    collegeTown: ["fayetteville", "rogers", "bentonville", "springdale"],
    homeStates: ["tx", "texas", "ar", "arkansas"],
    goal: "Motorsports",
    clubs: ["formula sae", "fsae", "formula student", "baja sae"],
    languages: ["spanish", "german"],
    sports: ["rugby", "swim", "lifeguard"],
    skills: ["solidworks", "cad"]
  };

  // ---------- Feed ----------
  let BASE = window.CONQUER_JOBS || [];
  let PEOPLE = window.CONQUER_PEOPLE || {};
  let LOGOS = window.CONQUER_LOGOS || {};
  let FEED_UPDATED = window.CONQUER_FEED_UPDATED || "";
  let JOBS = [], byId = {};

  // ---------- State (device + cloud) ----------
  const KEY = "conquer.v1";
  const blank = () => ({ decisions: {}, apps: {}, history: [], extraJobs: [], lastSearch: 0, sort: "match" });
  let state = load();
  function load() {
    try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return blank(); }
  }
  let cloudRef = null, saveTimer = null, saving = false, dirty = false;
  function save() {
    state.history = state.history.slice(-50);
    state.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!cloudRef) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
  }
  async function flush() {
    if (!cloudRef) return;
    if (saving) { dirty = true; return; }
    saving = true;
    try { await cloudRef.set(JSON.parse(JSON.stringify(state))); setSync("Synced across your devices"); }
    catch (e) { setSync(e && e.code === "invalid_argument" ? "Saved on this device" : "Sync paused. Saved on this device"); }
    saving = false;
    if (dirty) { dirty = false; flush(); }
  }
  function setSync(t) { const el = document.getElementById("syncNote"); if (el) el.textContent = t; }

  // ======================================================================
  //  Relevance: goals pipeline, major fit, location, pay, freshness
  // ======================================================================
  const INDUSTRIES = [
    { name: "Motorsports", re: /motorsport|racing|speedway|nascar|indycar|performance power units|\bf1\b|formula 1|race team/ },
    { name: "Automotive & Mobility", re: /automotive|vehicle|brake|powertrain|chassis|bosch|\bfev\b|knorr|\bgm\b|general motors|ford|toyota|tesla|stellantis|leggett|rivian/ },
    { name: "Aerospace & Defense", re: /aerospace|defense|aviation|space|missile|castelion|lockheed|boeing|spacex/ },
    { name: "Energy", re: /energy|oil|gas|drilling|petro|nabors|slb|schlumberger|flowco|power plant|solar/ },
    { name: "Robotics & Electronics", re: /robot|electronic|semiconductor|hardware|instruments|keysight|\bai\b/ },
    { name: "Construction & Infrastructure", re: /construction|civil|structural|infrastructure|building|hvac|electric,? inc|kimley|jacobs|enfra|helix|s&b/ },
    { name: "Manufacturing & Materials", re: /manufactur|materials|steel|plant|industrial|kion|marshalltown|ascend/ }
  ];
  const industryOf = j => j.industry || (INDUSTRIES.find(i => i.re.test(`${j.title} ${j.company} ${j.summary || ""}`.toLowerCase())) || { name: "Other engineering" }).name;

  function payMid(j) {
    const nums = String(j.pay || "").replace(/,/g, "").match(/\d+(\.\d+)?/g);
    if (!nums) return null;
    const v = nums.map(Number);
    const mid = v.length > 1 ? (v[0] + v[1]) / 2 : v[0];
    return mid > 500 ? mid / 2080 : mid;
  }
  function score(j) {
    const t = `${j.title} ${j.company} ${j.summary || ""}`.toLowerCase();
    const loc = (j.location || "").toLowerCase();
    const ind = industryOf(j);
    const reasons = [];
    // 1) Goals pipeline (35)
    const pipe = { "Motorsports": 35, "Automotive & Mobility": 28, "Aerospace & Defense": 18, "Robotics & Electronics": 14,
      "Manufacturing & Materials": 10, "Energy": 10, "Construction & Infrastructure": 7 }[ind] ?? 6;
    if (pipe >= 28) reasons.push(ind === "Motorsports" ? "Motorsports pipeline" : "Path to motorsports");
    // 2) Major fit (20)
    let major = /mechanical/.test(t) ? 20 : /systems|hardware|test|benchmark|design|robot/.test(t) ? 14
      : /engineer/.test(t) ? 11 : /structural|industrial|civil|project/.test(t) ? 8 : 3;
    if (/brake|chassis|suspension|vehicle/.test(t)) { major = 20; reasons.push("Uses your FSAE skills"); }
    else if (major === 20) reasons.push("Mechanical role");
    // 3) Location (20)
    let where = 6;
    if (ME.hometowns.some(h => loc.includes(h))) { where = 20; reasons.push("Near home"); }
    else if (ME.collegeTown.some(h => loc.includes(h))) { where = 20; reasons.push("Near campus"); }
    else if (/, tx|texas/.test(loc)) where = 14;
    else if (/, ar|arkansas/.test(loc)) where = 14;
    else if (/remote/.test(loc)) where = 12;
    // 4) Pay (15)
    const p = payMid(j);
    const pay = p == null ? 4 : p >= 25 ? 15 : p >= 20 ? 12 : p >= 17 ? 9 : 6;
    if (p != null && p >= 20) reasons.push("Strong pay");
    // 5) Freshness (10)
    const d = j.days ?? 14;
    const fresh = d <= 3 ? 10 : d <= 10 ? 7 : d <= 20 ? 4 : 2;
    if (d <= 3) reasons.push("Just posted");
    // Bonus: German companies + your German
    if (/knorr|bosch|fev|kion/.test(t)) reasons.push("German company");
    const total = Math.min(99, pipe + major + where + pay + fresh);
    return { total, reasons: reasons.slice(0, 3), industry: ind };
  }

  function rebuildJobs() {
    const seen = new Set();
    JOBS = [...BASE, ...(state.extraJobs || [])].filter(j => {
      const k = (j.company + "|" + j.title).toLowerCase();
      if (seen.has(j.id) || seen.has(k)) return false;
      seen.add(j.id); seen.add(k); return true;
    }).map(j => Object.assign({}, j, { _s: score(j) }));
    JOBS.sort((a, b) => b._s.total - a._s.total);
    JOBS.forEach((j, i) => j._rank = i + 1);
    byId = Object.fromEntries(JOBS.map(j => [j.id, j]));
  }
  rebuildJobs();

  // ======================================================================
  //  People ranked by what you have in common
  // ======================================================================
  function commonWith(p) {
    const t = `${p.headline || ""} ${p.location || ""} ${(p.about || "")} ${(p.schools || []).join(" ")} ${(p.tags || []).join(" ")}`.toLowerCase();
    const hits = [];
    if (/university of arkansas|razorback|\buark\b/.test(t)) hits.push({ w: 40, label: "Arkansas Razorback", phrase: "you're a fellow Razorback" });
    else if (/arkansas/.test(t)) hits.push({ w: 30, label: "Arkansas connection", phrase: "you have an Arkansas connection" });
    if (ME.clubs.some(c => t.includes(c))) hits.push({ w: 30, label: "Formula SAE", phrase: "you did Formula SAE too" });
    if (ME.hometowns.some(h => t.includes(h))) hits.push({ w: 20, label: "Houston area", phrase: "you're connected to the Houston area like me" });
    else if (/\btexas\b|texas a&m|texas ex/.test(t)) hits.push({ w: 12, label: "Texas", phrase: "you have Texas roots like me" });
    if (/founder|ceo|director|head of/.test(t)) hits.push({ w: 6, label: "Decision maker", phrase: "you lead the team" });
    if (/mechanical/.test(t)) hits.push({ w: 10, label: "Mechanical engineer", phrase: "you studied mechanical engineering" });
    if (/motorsport|racing|nascar|indycar/.test(t)) hits.push({ w: 15, label: "Motorsports", phrase: "you've worked in motorsports" });
    if (/spanish|español|mexic|latin/.test(t)) hits.push({ w: 10, label: "Spanish speaker", phrase: "we both speak Spanish" });
    if (/german|deutsch|germany/.test(t)) hits.push({ w: 10, label: "German", phrase: "we share a German connection" });
    if (/rugby/.test(t)) hits.push({ w: 10, label: "Rugby", phrase: "you played rugby" });
    if (/\bintern\b|incoming|co-op|student|recent grad|early career/.test(t)) hits.push({ w: 8, label: "Student or new hire", phrase: "you were in my shoes recently" });
    if (/recruit|talent acquisition|university relations|campus/.test(t)) hits.push({ w: 12, label: "Recruiter", phrase: "you lead hiring there" });
    return { score: hits.reduce((s, h) => s + h.w, 0), hits: hits.sort((a, b) => b.w - a.w) };
  }
  function draftMessage(p, j) {
    const first = (p.name || "").split(" ")[0] || "there";
    const c = commonWith(p).hits[0];
    const hook = c ? `I saw ${c.phrase}, ` : "";
    const msg = `Hi ${first}, I'm Claudio, a first-year Mechanical Engineering student at the University of Arkansas on our Formula SAE suspension and brakes team. ${hook}and I'm applying to ${j.company}'s ${j.title.replace(/\s*\(.*?\)/g, "")} role. Could I ask you a couple of questions about how you got started there?`;
    return msg.length > 300 ? msg.replace(" on our Formula SAE suspension and brakes team", "") : msg;
  }
  function peopleFor(j) {
    return (PEOPLE[j.company.toLowerCase()] || [])
      .map(p => Object.assign({}, p, { _c: commonWith(p) }))
      .sort((a, b) => b._c.score - a._c.score);
  }
  function peopleSearches(j) {
    const co = j.company;
    const s = k => `https://www.linkedin.com/search/results/people/?keywords=${enc(k)}`;
    return [
      { w: 40, label: "Razorbacks", why: "University of Arkansas alumni. The strongest thing you can have in common", href: s(`${co} University of Arkansas`) },
      { w: 30, label: "Formula SAE alumni", why: "They did what you're doing now", href: s(`${co} Formula SAE`) },
      { w: 20, label: "From the Houston area", why: "Same hometown", href: s(`${co} The Woodlands Houston`) },
      { w: 12, label: "Campus recruiters", why: "They screen intern applications", href: s(`${co} university recruiter`) },
      { w: 10, label: "Spanish or German speakers", why: "Shared language", href: s(`${co} engineer Spanish German`) },
      { w: 8, label: "Recent interns", why: "Can tell you what the interview is like", href: s(`${co} engineering intern`) }
    ];
  }

  // ======================================================================
  //  Helpers
  // ======================================================================
  const STEPS = ["Research the company", "Tailor resume to this role", "Message someone there", "Fill out the application", "Submit application", "Follow up in 1–2 weeks"];
  const STATUSES = [["inprogress", "In progress"], ["submitted", "Submitted"], ["interview", "Interviewing"], ["offer", "Offer"], ["rejected", "Closed"]];
  const statusLabel = s => (STATUSES.find(x => x[0] === s) || [, "Not started"])[1];
  function app(id) { if (!state.apps[id]) state.apps[id] = { status: null, steps: {}, notes: "" }; return state.apps[id]; }
  function progress(id) { const a = state.apps[id]; if (!a) return 0; return Math.round(STEPS.filter((_, i) => a.steps[i]).length / STEPS.length * 100); }

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;
  const initials = name => name.replace(/[^A-Za-z& ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const PALETTE = ["#0E2240", "#1D4ED8", "#14A35A", "#B45309", "#7C3AED", "#0F766E", "#BE123C", "#334155"];
  function logoHTML(j, size = "") {
    const src = LOGOS[j.company.toLowerCase()] || j.logoData;
    if (src) return `<div class="logo ${size}"><img src="${esc(src)}" alt="${esc(j.company)} logo"></div>`;
    let h = 0; for (const c of j.company) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `<div class="logo mono ${size}" style="background:${PALETTE[h % PALETTE.length]}" aria-hidden="true">${esc(initials(j.company))}</div>`;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1700);
  }
  function applyLinks(j) {
    const q = `${j.company} ${j.title.replace(/\(.*?\)/g, "")}`.trim();
    return [
      { primary: true, c: j.source === "Indeed" ? "#2557A7" : "#14A35A", t: j.source[0], label: `Apply on ${j.source}`, sub: "Original listing", href: j.url },
      { c: "#0A66C2", t: "in", label: "LinkedIn Jobs", sub: "Same role, Easy Apply if offered", href: `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}` },
      { c: "#F38B00", t: "W", label: "Workday", sub: "If they hire through Workday", href: `https://www.google.com/search?q=${enc(`site:myworkdayjobs.com "${j.company}" intern`)}` },
      { c: "#0E2240", t: "⌂", label: "Company careers site", sub: j.domain, href: `https://www.google.com/search?q=${enc(`${j.company} careers internship site:${j.domain}`)}` },
      { c: "#2557A7", t: "i", label: "Indeed", sub: "Same role on Indeed", href: `https://www.indeed.com/jobs?q=${enc(q)}&l=${enc(j.location)}` },
      { c: "#0E8A7E", t: "H", label: "Handshake", sub: "Through the University of Arkansas", href: `https://app.joinhandshake.com/stu/postings?query=${enc(j.company)}` }
    ];
  }

  // ======================================================================
  //  Tabs
  // ======================================================================
  let current = "explore", openIndustry = null;
  function show(tab) {
    current = tab;
    if (tab !== "more") openIndustry = null;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === `tab-${tab}`));
    document.querySelectorAll(".tabbar button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
    render(); window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabbar button").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
  function render() {
    if (current === "home") renderHome();
    if (current === "explore") renderExplore();
    if (current === "more") renderMore();
    const liked = Object.values(state.decisions).filter(d => d === "like").length;
    $("#topbarSub").textContent = liked ? `${liked} saved` : "";
  }

  // ---------- HOME ----------
  function renderHome() {
    const tracked = Object.entries(state.apps).filter(([id, a]) => a.status && byId[id]);
    const count = s => tracked.filter(([, a]) => a.status === s).length;
    const liked = Object.values(state.decisions).filter(d => d === "like").length;
    const next = tracked.map(([id, a]) => {
      const i = STEPS.findIndex((_, k) => !a.steps[k]);
      return i === -1 || a.status === "rejected" ? null : { id, step: STEPS[i] };
    }).filter(Boolean).slice(0, 3);
    const rows = tracked.sort((a, b) => progress(a[0]) - progress(b[0])).map(([id, a]) => {
      const j = byId[id];
      return `<button class="row" data-open="${id}">${logoHTML(j)}<span class="grow">
        <span class="t">${esc(j.title)}</span><span class="s">${esc(j.company)}</span>
        <span class="bar"><i style="width:${progress(id)}%"></i></span></span>
        <span class="chip st-${a.status}">${statusLabel(a.status)}</span></button>`;
    }).join("");
    $("#tab-home").innerHTML = `
      <h1 class="h1">Your applications</h1>
      <div class="stats">
        <div><b>${liked}</b><span>Saved</span></div>
        <div><b>${count("inprogress")}</b><span>In progress</span></div>
        <div><b>${count("submitted")}</b><span>Submitted</span></div>
        <div><b>${count("interview") + count("offer")}</b><span>Interviews</span></div>
      </div>
      ${next.length ? `<h2 class="h2">Do next</h2><div class="list">${next.map(n =>
        `<button class="row" data-open="${n.id}">${logoHTML(byId[n.id])}<span class="grow"><span class="t">${esc(n.step)}</span><span class="s">${esc(byId[n.id].company)}</span></span></button>`).join("")}</div>` : ""}
      <h2 class="h2">Tracking</h2>
      ${rows ? `<div class="list">${rows}</div>` : `<div class="empty"><h3>Nothing tracked yet</h3>
        <p>Save an internship in Explore, open it from Find Out More, then tap <b>Start application</b>.</p>
        <button class="btn primary" data-go="explore">Go to Explore</button></div>`}`;
  }

  // ---------- EXPLORE ----------
  const queue = () => JOBS.filter(j => !state.decisions[j.id]);
  let searching = false, searchStatus = "";
  function renderExplore() {
    const q = queue();
    const el = $("#tab-explore");
    const bar = `<div class="explore-bar"><span>${q.length} left · ranked for you${searchStatus ? `<br><em>${esc(searchStatus)}</em>` : ""}</span>
      <button class="pill" data-find ${searching ? "disabled" : ""}>${searching ? "Searching…" : "Find new"}</button></div>`;
    if (!q.length) {
      el.innerHTML = bar + `<div class="empty"><h3>You've seen every internship</h3>
        <p>Tap <b>Find new</b> for fresh listings from ZipRecruiter and Indeed.${FEED_UPDATED ? ` The feed last refreshed ${esc(FEED_UPDATED)}.` : ""}</p>
        <button class="btn primary" data-find>Find new internships</button>
        <button class="btn" data-go="more">Open saved internships</button>
        <button class="btn quiet" data-reset-passed>Show ones I passed on</button></div>`;
      return;
    }
    const cards = q.slice(0, 2).reverse().map((j, i, arr) => {
      const top = i === arr.length - 1, s = j._s;
      return `<article class="swipe-card ${top ? "" : "behind"}" ${top ? `data-id="${j.id}"` : ""} aria-label="${esc(j.title)} at ${esc(j.company)}">
        <div class="stamp like">Interested</div><div class="stamp nope">Pass</div>
        <div class="card-top">${logoHTML(j, "lg")}
          <div class="grid-pos" title="Rank by match"><span>P${j._rank}</span><small>${s.total}% match</small></div></div>
        <div class="co-name">${esc(j.company)}</div>
        <h2 class="title">${esc(j.title)}</h2>
        <div class="facts"><span class="pay">${esc(j.pay)}</span><span>${esc(j.location)}</span></div>
        <p class="summary">${esc(j.summary)}</p>
        <div class="reasons">${s.reasons.map(r => `<span>${esc(r)}</span>`).join("")}</div>
        ${peopleFor(j).length ? `<div class="ppl">${peopleFor(j).length} people to message here. Tap the card</div>` : ""}
        <div class="meta"><span>${esc(s.industry)}</span><span>${esc(j.source)}, ${esc(j.posted)}</span></div>
      </article>`;
    }).join("");
    el.innerHTML = bar + `<div class="deck">${cards}</div>
      <div class="actions">
        <button class="round nope" data-swipe="pass" aria-label="Pass"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <button class="round small" data-undo aria-label="Undo last swipe"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>
        <button class="round like" data-swipe="like" aria-label="Interested"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></button>
      </div>`;
    attachDrag(el.querySelector(".swipe-card[data-id]"));
  }
  function decide(id, choice, card) {
    state.decisions[id] = choice; state.history.push(id); save();
    const go = () => { render(); if (choice === "like") toast(`Saved to ${industryOf(byId[id]).split(" ")[0]}`); };
    if (card) {
      card.style.transform = `translateX(${choice === "like" ? 140 : -140}vw) rotate(${choice === "like" ? 24 : -24}deg)`;
      card.style.opacity = "0"; setTimeout(go, 220);
    } else go();
  }
  function attachDrag(card) {
    if (!card) return;
    let sx = 0, sy = 0, dx = 0, dragging = false, moved = false;
    const like = card.querySelector(".stamp.like"), nope = card.querySelector(".stamp.nope");
    card.addEventListener("pointerdown", e => { dragging = true; moved = false; sx = e.clientX; sy = e.clientY; dx = 0; card.setPointerCapture(e.pointerId); card.classList.add("dragging"); });
    card.addEventListener("pointermove", e => {
      if (!dragging) return;
      dx = e.clientX - sx; const dy = e.clientY - sy;
      if (Math.abs(dx) > 6) moved = true;
      card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 20}deg)`;
      like.style.opacity = Math.max(0, Math.min(1, dx / 90)); nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const end = () => {
      if (!dragging) return; dragging = false; card.classList.remove("dragging");
      if (dx > 100) return decide(card.dataset.id, "like", card);
      if (dx < -100) return decide(card.dataset.id, "pass", card);
      card.style.transform = ""; like.style.opacity = 0; nope.style.opacity = 0;
      if (!moved) openProfile(card.dataset.id, { preview: true });
    };
    card.addEventListener("pointerup", end); card.addEventListener("pointercancel", end);
  }

  // ---------- LIVE SEARCH ----------
  const PREFS = {
    searches: [
      ["ZipRecruiter", { job_role: "mechanical engineering intern", location: "Houston, TX" }],
      ["ZipRecruiter", { job_role: "engineering intern", location: "Fayetteville, AR" }],
      ["ZipRecruiter", { job_role: "motorsports engineering intern", location: "Charlotte, NC" }],
      ["ZipRecruiter", { job_role: "vehicle engineering intern", location: "Detroit, MI" }],
      ["ZipRecruiter", { job_role: "mechanical engineering intern", location: "Dallas, TX" }],
      ["Indeed", { search: "motorsports intern", location: "United States" }],
      ["Indeed", { search: "mechanical engineering intern", location: "Houston, TX" }]
    ]
  };
  const ERR = {
    server_not_connected: s => `Add ${s} in claude.ai Settings → Connectors`,
    needs_reauth: s => `Reconnect ${s} in claude.ai Settings → Connectors`,
    not_in_manifest: s => `${s} is turned off for this app`,
    approval_required: s => `${s} needs your OK. Tap Find new again`,
    blocked_by_policy: s => `${s} is blocked by your organization`
  };
  const hourly = (min, max) => {
    if (!min) return "Pay not listed";
    const h = v => Math.round(v / 2080);
    return max ? `~$${h(min)}–${h(max)}/hr (est.)` : `~$${h(min)}/hr+ (est.)`;
  };
  function fitFor(t, loc) {
    const s = (t + " " + loc).toLowerCase();
    if (/motorsport|racing|speedway|nascar/.test(s)) return "Direct line into motorsports, your long-term goal.";
    if (/brake|automotive|vehicle|chassis|powertrain/.test(s)) return "Lines up with your FSAE suspension/brakes work and automotive apprenticeship.";
    if (ME.collegeTown.some(c => s.includes(c))) return "Near campus, so it could work around your classes.";
    if (/mechanical/.test(s) && ME.hometowns.some(c => s.includes(c))) return "Mechanical engineering role in your home area.";
    if (/mechanical/.test(s)) return "Matches your Mechanical Engineering major. Lead with SolidWorks and FSAE.";
    return "Engineering internship open to students. Good for building first experience.";
  }
  function fromZip(r) {
    return {
      id: "zr-" + r.listing_key, title: r.title, company: r.company || "Company", location: r.location || "",
      pay: hourly(r.salary && r.salary.min_annual, r.salary && r.salary.max_annual), source: "ZipRecruiter",
      posted: r.days_ago != null ? `${r.days_ago} days ago` : "", days: r.days_ago, url: r.job_redirect_url,
      domain: (r.company || "").toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
      summary: `${r.job_type || "Internship"}${r.benefits ? `. Benefits: ${r.benefits}` : ""}${r.is_remote ? ". Remote" : ""}.`,
      fit: fitFor(r.title + " " + (r.company || ""), r.location || ""), live: true
    };
  }
  function fromIndeed(md) {
    const out = [];
    for (const block of String(md).split(/\n\s*\n/)) {
      const g = k => (block.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.+)`)) || [])[1]?.trim();
      const title = g("Job Title"), url = g("View Job URL");
      if (!title || !url) continue;
      const comp = g("Compensation"), company = g("Company") || "Company", loc = g("Location") || "";
      const posted = g("Posted on") || "", pd = Date.parse(posted);
      out.push({
        id: "in-" + url.split("/").pop(), title, company, location: loc,
        pay: comp && comp !== "N/A" ? comp.replace(" an hour", "/hr").replace(" a year", "/yr") : "Pay not listed",
        source: "Indeed", posted, days: isNaN(pd) ? null : Math.max(0, Math.round((Date.now() - pd) / 864e5)), url,
        domain: company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com",
        summary: `${g("Job Type") || "Internship"} role at ${company}${loc ? " in " + loc : ""}.`,
        fit: fitFor(title + " " + company, loc), live: true
      });
    }
    return out;
  }
  async function findNew(auto) {
    if (searching) return;
    const mcp = await claude_use("mcp");
    if (!mcp) { if (!auto) { searchStatus = "Live search works when the app is opened in Claude"; render(); } return; }
    searching = true; searchStatus = ""; if (current === "explore") render();
    const found = [], errors = {};
    await Promise.all(PREFS.searches.map(([server, q]) => {
      const input = server === "ZipRecruiter"
        ? Object.assign({ country_admin_code: "US", employment_types: ["INTERNSHIP"] }, q)
        : Object.assign({ country_code: "US", job_type: "internship" }, q);
      return mcp.callTool(server, "search_jobs", input, { cache: { staleTime: 6 * 3600000, gcTime: 86400000 } })
        .then(r => {
          if (server === "ZipRecruiter") { const p = r.payload || {}; ((p.structuredContent || p).results || []).forEach(x => found.push(fromZip(x))); }
          else { const t = typeof r.payload === "string" ? r.payload : (r.content || []).map(b => b.text || "").join("\n\n"); fromIndeed(t).forEach(x => found.push(x)); }
        })
        .catch(e => { errors[server] = e; });
    }));
    const before = JOBS.length;
    state.extraJobs = [...(state.extraJobs || []), ...found].slice(-150);
    state.lastSearch = Date.now();
    rebuildJobs();
    const added = JOBS.length - before;
    const errMsg = Object.entries(errors).map(([s, e]) => (ERR[e && e.code] || (() => `${s} didn't respond. Try again shortly`))(s)).join(". ");
    searchStatus = errMsg || (added ? `${added} new, ranked into your deck` : "No new listings since last check");
    searching = false; save(); render();
    if (added) toast(`${added} new internships`);
  }
  const claude_use = name => (window.claude && typeof window.claude.use === "function")
    ? Promise.race([window.claude.use(name), new Promise(r => setTimeout(() => r(null), 10000))]).catch(() => null)
    : Promise.resolve(null);

  // ---------- FIND OUT MORE (by industry) ----------
  function renderMore() {
    const liked = JOBS.filter(j => state.decisions[j.id] === "like");
    const el = $("#tab-more");
    if (!liked.length) {
      el.innerHTML = `<h1 class="h1">Find out more</h1><div class="empty"><h3>No saved internships yet</h3>
        <p>Swipe right in Explore. Each one you save lands in a folder for its industry.</p>
        <button class="btn primary" data-go="explore">Go to Explore</button></div>`;
      return;
    }
    const groups = {};
    liked.forEach(j => (groups[j._s.industry] = groups[j._s.industry] || []).push(j));
    const order = Object.keys(groups).sort((a, b) => Math.max(...groups[b].map(j => j._s.total)) - Math.max(...groups[a].map(j => j._s.total)));
    if (openIndustry && groups[openIndustry]) {
      const list = groups[openIndustry];
      el.innerHTML = `<button class="back" data-industry="">Back to industries</button>
        <h1 class="h1">${esc(openIndustry)}</h1><p class="lede">${list.length} saved, best match first.</p>
        <div class="list">${list.map(j => {
          const a = state.apps[j.id];
          return `<button class="row" data-open="${j.id}">${logoHTML(j)}<span class="grow">
            <span class="t">${esc(j.title)}</span><span class="s">${esc(j.company)}, ${esc(j.location)}</span>
            <span class="s">${esc(j.pay)}</span>${peopleFor(j).length ? `<span class="ppl">${peopleFor(j).length} people to message</span>` : ""}</span>
            <span class="row-end"><span class="score">${j._s.total}%</span>${a && a.status ? `<span class="chip st-${a.status}">${statusLabel(a.status)}</span>` : ""}</span></button>`;
        }).join("")}</div>`;
      return;
    }
    el.innerHTML = `<h1 class="h1">Find out more</h1>
      <p class="lede">Your saved internships, grouped by industry. Open one to see where to apply and who to message.</p>
      <div class="folders">${order.map(name => {
        const list = groups[name], top = list[0];
        return `<button class="folder" data-industry="${esc(name)}">
          <span class="stack">${list.slice(0, 3).map(j => logoHTML(j, "sm")).join("")}</span>
          <span class="grow"><span class="t">${esc(name)}</span><span class="s">${list.length} saved. Top pick: ${esc(top.company)}</span>${list.reduce((n, j) => n + peopleFor(j).length, 0) ? `<span class="ppl">${list.reduce((n, j) => n + peopleFor(j).length, 0)} people to message</span>` : ""}</span>
          <span class="count">${list.length}</span></button>`;
      }).join("")}</div>`;
  }

  // ---------- DEEP PROFILE ----------
  function openProfile(id, opts = {}) {
    const j = byId[id]; if (!j) return;
    const liked = state.decisions[id] === "like", a = state.apps[id], s = j._s;
    const people = peopleFor(j);
    const applyBox = `<section class="box"><h3>Where to apply</h3><div class="links">
      ${applyLinks(j).map(l => `<a class="link ${l.primary ? "primary" : ""}" href="${esc(l.href)}" target="_blank" rel="noopener">
        <span class="ico" style="background:${l.c}">${esc(l.t)}</span><span>${esc(l.label)}<small>${esc(l.sub)}</small></span></a>`).join("")}
    </div><p class="note">The first link is the verified listing. The rest search each site for this role.</p></section>`;

    const peopleBox = `<section class="box people-box" id="people"><h3>Who to message at ${esc(j.company)}</h3>
      <p class="note top">Ranked by what you have in common, best first.</p>
      ${people.length ? people.map((p, i) => `<div class="person">
          <div class="person-head"><span class="avatar">${esc(initials(p.name))}</span>
            <span class="grow"><b>${esc(p.name)}</b><span class="s">${esc(p.headline || "")}</span></span>
            <span class="score" title="Match points">${p._c.score} pts</span></div>
          <div class="tags">${p._c.hits.map(h => `<span>${esc(h.label)}</span>`).join("") || "<span>Works there</span>"}</div>
          <div class="person-actions">
            <a class="btn small" href="${esc(p.linkedin)}" target="_blank" rel="noopener">Open profile</a>
            <button class="btn small primary" data-copy="${id}|${i}">Copy message</button></div>
        </div>`).join("") : ""}
      ${peopleSearches(j).map(p => `<a class="search-row" href="${esc(p.href)}" target="_blank" rel="noopener">
        <span class="grow"><b>${esc(p.label)} at ${esc(j.company)}</b><span class="s">${esc(p.why)}</span></span><span class="chev">›</span></a>`).join("")}
      ${people.length ? "" : `<p class="note">These open LinkedIn already filtered. To get named people ranked here, ask Claude: "find people at ${esc(j.company)} for Conquer."</p>`}
    </section>`;

    const trackBox = a && a.status ? `<section class="box"><h3>Your progress: ${progress(id)}%</h3>
        <div class="bar big"><i style="width:${progress(id)}%"></i></div>
        <label class="field">Status<select class="status" data-status="${id}">
          ${STATUSES.map(([k, l]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="steps">${STEPS.map((st, i) => `<button class="step ${a.steps[i] ? "done" : ""}" data-step="${id}:${i}" aria-pressed="${!!a.steps[i]}"><span class="cb"></span><span>${esc(st)}</span></button>`).join("")}</div>
        <label class="field">Notes<textarea class="notes" data-notes="${id}" placeholder="Who you talked to, deadlines, portal login…">${esc(a.notes)}</textarea></label>
      </section>` : "";

    $("#sheetBody").innerHTML = `
      <div class="p-head">${logoHTML(j, "lg")}<div class="grow"><div class="co-name">${esc(j.company)}</div><div class="s">${esc(j.location)}</div></div>
        <div class="grid-pos"><span>P${j._rank}</span><small>${s.total}% match</small></div></div>
      <h2 class="p-title">${esc(j.title)}</h2>
      <div class="facts"><span class="pay">${esc(j.pay)}</span><span>${esc(s.industry)}</span></div>
      <div class="reasons">${s.reasons.map(r => `<span>${esc(r)}</span>`).join("")}</div>
      <section class="box"><h3>About the role</h3><p>${esc(j.summary)}</p></section>
      <section class="box fit"><h3>Why it fits you</h3><p>${esc(j.fit)}</p></section>
      ${opts.preview && !liked ? `${peopleBox}
        <button class="btn primary" data-like-from-sheet="${id}">Save this internship</button>
        <button class="btn" data-close>Keep swiping</button>` : `
        ${!(a && a.status) ? `<button class="btn primary" data-start="${id}">Start application</button>` : ""}
        ${trackBox}${peopleBox}${applyBox}
        <button class="btn quiet" data-remove="${id}">Remove from saved</button>`}`;
    $("#sheet").classList.add("open"); $("#sheet").setAttribute("aria-hidden", "false");
    $(".sheet-panel").scrollTop = 0;
  }
  function closeSheet() { $("#sheet").classList.remove("open"); $("#sheet").setAttribute("aria-hidden", "true"); render(); }

  // ---------- Events ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-open],[data-go],[data-swipe],[data-undo],[data-close],[data-start],[data-step],[data-remove],[data-like-from-sheet],[data-reset-passed],[data-find],[data-industry],[data-copy]");
    if (!t) return;
    const d = t.dataset;
    if ("find" in d) findNew();
    else if ("industry" in d) { openIndustry = d.industry || null; renderMore(); window.scrollTo(0, 0); }
    else if (d.copy) {
      const [id, i] = d.copy.split("|"); const j = byId[id]; const p = peopleFor(j)[+i];
      const msg = draftMessage(p, j);
      Promise.resolve().then(() => navigator.clipboard.writeText(msg)).then(() => toast("Message copied. Paste it into LinkedIn"))
        .catch(() => { const ta = document.createElement("textarea"); ta.value = msg; t.after(ta); ta.select(); toast("Select and copy the message"); });
    }
    else if (d.open) openProfile(d.open);
    else if (d.go) show(d.go);
    else if (d.swipe) { const c = $(".swipe-card[data-id]"); if (c) decide(c.dataset.id, d.swipe, c); }
    else if ("undo" in d) { const id = state.history.pop(); if (id) { delete state.decisions[id]; save(); render(); toast("Brought it back"); } else toast("Nothing to undo"); }
    else if ("close" in d) closeSheet();
    else if (d.start) { app(d.start).status = "inprogress"; save(); openProfile(d.start); toast("Tracking on Home"); }
    else if (d.step) {
      const [id, i] = d.step.split(":"); const a = app(id); a.steps[i] = !a.steps[i];
      if (+i === 4 && a.steps[i] && a.status === "inprogress") a.status = "submitted";
      save(); const y = $(".sheet-panel").scrollTop; openProfile(id); $(".sheet-panel").scrollTop = y;
    }
    else if (d.remove) { delete state.decisions[d.remove]; delete state.apps[d.remove]; save(); closeSheet(); toast("Removed"); }
    else if (d.likeFromSheet) { closeSheet(); const c = $(".swipe-card[data-id]"); decide(d.likeFromSheet, "like", c && c.dataset.id === d.likeFromSheet ? c : null); }
    else if ("resetPassed" in d) { for (const k in state.decisions) if (state.decisions[k] === "pass") delete state.decisions[k]; save(); render(); }
  });
  document.addEventListener("change", e => { if (e.target.dataset.status) { app(e.target.dataset.status).status = e.target.value; save(); toast("Status updated"); } });
  document.addEventListener("input", e => { if (e.target.dataset.notes) { app(e.target.dataset.notes).notes = e.target.value; save(); } });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("#sheet").classList.contains("open")) closeSheet();
    if (current === "explore" && !$("#sheet").classList.contains("open") && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      const c = $(".swipe-card[data-id]");
      if (c && e.key === "ArrowRight") decide(c.dataset.id, "like", c);
      if (c && e.key === "ArrowLeft") decide(c.dataset.id, "pass", c);
    }
  });
  (() => {
    const panel = $(".sheet-panel"); let y0 = null;
    panel.addEventListener("touchstart", e => { y0 = panel.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    panel.addEventListener("touchend", e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 90) closeSheet(); y0 = null; });
  })();

  // ---------- Boot ----------
  show("explore");
  (async () => {
    const [db, user] = await Promise.all([claude_use("db"), claude_use("user")]);
    if (!db) { setSync("Saved on this device"); return; }
    // Shared feed: Claude's daily refresh writes jobs, logos and people here.
    try {
      const [f, lg, pp] = await Promise.all(["feed/current", "feed/logos", "feed/people"].map(p => db.doc(p).get()));
      if (f.exists) { const d = f.data(); if (Array.isArray(d.jobs)) BASE = [...(window.CONQUER_JOBS || []), ...d.jobs]; if (d.updated) FEED_UPDATED = d.updated; }
      if (lg.exists) LOGOS = Object.assign({}, LOGOS, lg.data());
      if (pp.exists) PEOPLE = Object.assign({}, PEOPLE, pp.data());
      rebuildJobs(); render();
    } catch {}
    const uid = user && await user.id().catch(() => null);
    if (!uid) { setSync("Saved on this device"); return; }
    const ref = db.doc("trackers/" + uid);
    try {
      const snap = await ref.get();
      if (snap.exists) { const remote = snap.data(); if ((remote.updatedAt || 0) >= (state.updatedAt || 0)) state = Object.assign(blank(), JSON.parse(JSON.stringify(remote))); }
      cloudRef = ref; rebuildJobs(); render();
      if (!snap.exists || (state.updatedAt || 0) > ((snap.data() || {}).updatedAt || 0)) flush(); else setSync("Synced across your devices");
    } catch { setSync("Saved on this device"); }
    // Stay current: refresh live listings at most every 12 hours.
    if (Date.now() - (state.lastSearch || 0) > 12 * 3600000) findNew(true);
  })();
})();
