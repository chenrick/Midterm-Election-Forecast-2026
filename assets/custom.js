/* =====================================================================================
   REDESIGN (v2) SCRIPT  -  assets/custom.js
   Adds the flip-clock countdown, sticky section nav, honeycomb hexagons, seat hemicycles,
   Senate path-to-control bar, upgraded seat-distribution charts, "races that decide control"
   (ladder + ranges), a sortable/filterable table, richer tooltips, a state panel and
   cross-highlighting.

   How it stays safe and reversible:
   - It never edits core.js, app.js, config.js or style.css. It reads the SAME CSVs through the
     SAME FC.analyze() pipeline, so whenever forecast.csv / seat_sims.csv change, every visual here
     updates with them (it adapts to whichever columns your file has).
   - It only runs when <html class="v2"> is set (see index.html). With ?classic=1 it does nothing
     except show a small "New design" pill.
   - Every feature below can be switched off individually in OPTS.
   ===================================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ feature switches */
  var OPTS = {
    viewSwitch: true,          // "Classic view" link in the nav (and a "New design" pill in classic mode)
    compareLabels: true,       // small NEW / CURRENT tags on panels while you compare designs
    flipClock: true,
    stickyNav: true,
    honeycomb: true,
    hemicycle: true,           // House + Senate seat hemicycles (placed above the current maps)
    pathToControl: true,       // Senate holdovers + contested seats bar
    betterDistributions: true,
    keepOriginalCharts: true,  // keep the original histograms in a collapsed "for comparison" box
    decisiveRaces: true,       // control ladder + forecast ranges
    betterTable: true,         // sortable, filterable table (replaces the original table visually)
    stateDrawer: true,         // click a state for a detail panel
    richTooltips: true,
    crossHighlight: true
  };
  var POLLS_CLOSE = Date.UTC(2026, 10, 3, 23, 0, 0);   // Tue Nov 3, 2026, 6:00 pm Eastern (EST = UTC-5)

  var root = document.documentElement;
  var IS_V2 = root.classList.contains("v2");
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ------------------------------------------------------------------ classic-mode pill */
  function viewHref(toClassic) {
    var q = new URLSearchParams(location.search);
    if (toClassic) q.set("classic", "1"); else q.delete("classic");
    var s = q.toString();
    return location.pathname + (s ? "?" + s : "") + location.hash;
  }
  if (!IS_V2) {
    if (OPTS.viewSwitch) {
      var pill = el("a", "v2-pill", "Switch to new design");
      pill.href = viewHref(false);
      document.body.appendChild(pill);
    }
    return;
  }
  if (!window.FC) { console.error("custom.js: core.js (FC) is not loaded; redesign skipped."); return; }

  var FC = window.FC, esc = FC.esc, isFixed = FC.isFixed, quant = FC.quant;
  var CFG = window.SITE_CONFIG || {};

  /* ------------------------------------------------------------------ constants (mirror app.js) */
  var HOUSE_MAJ = 218, SENATE_MAJ = 51;
  var MARGIN_CUTS = [3, 8, 15], PROB_CUTS = [0.60, 0.80, 0.95];
  var RATINGS = [
    { key: "safe-d", label: "Safe D" }, { key: "likely-d", label: "Likely D" }, { key: "lean-d", label: "Lean D" },
    { key: "toss", label: "Toss-up" },
    { key: "lean-r", label: "Lean R" }, { key: "likely-r", label: "Likely R" }, { key: "safe-r", label: "Safe R" }
  ];
  var STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};

  function pct(x, d) { return (100 * x).toFixed(d == null ? 0 : d) + "%"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function safe(name, fn) { try { return fn(); } catch (e) { console.error("custom.js: " + name + " failed", e); } }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =====================================================================================
     1. FLIP CLOCK (days : hours : minutes : seconds until the first polls close)
     ===================================================================================== */
  function buildFlipClock() {
    var host = document.querySelector(".site-head .wrap");
    if (!host) return;
    var box = el("div", "fc"); box.id = "fc-wrap"; box.setAttribute("role", "timer");
    host.appendChild(box);
    var mode = "", digitsByUnit = {}, lastSec = null, lastLabelMin = null;
    var UNITS = [["d", "Days"], ["h", "Hours"], ["m", "Minutes"], ["s", "Seconds"]];

    function makeDigit(ch) {
      var root = el("div", "fd");
      root.innerHTML = "<div class='fd-top'><span></span></div><div class='fd-bot'><span></span></div><div class='fd-ft'><span></span></div><div class='fd-fb'><span></span></div>";
      var d = { root: root, spans: root.querySelectorAll("span"), cur: ch, timer: null };
      // spans order: top, bot, ft, fb
      d.spans[0].textContent = d.spans[1].textContent = d.spans[2].textContent = d.spans[3].textContent = ch;
      return d;
    }
    function finish(d) {
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      d.root.classList.remove("flip");
      d.spans[0].textContent = d.spans[1].textContent = d.cur;
    }
    function setDigit(d, ch) {
      if (d.cur === ch) return;
      if (d.timer) finish(d);
      var old = d.cur; d.cur = ch;
      if (reduceMotion || document.hidden) { d.spans[0].textContent = d.spans[1].textContent = ch; return; }
      d.spans[0].textContent = ch;     // top half already shows the new value (revealed as the old one folds away)
      d.spans[2].textContent = old;    // flap folding down shows the old value
      d.spans[3].textContent = ch;     // flap folding in shows the new value
      d.root.classList.remove("flip"); void d.root.offsetWidth; d.root.classList.add("flip");
      d.timer = setTimeout(function () { finish(d); }, 700);
    }
    function buildUnits(dayDigits) {
      box.innerHTML = "<p class='fc-title'>First polls close in</p><div class='fc-units'></div><div class='fc-sub'>Tuesday, Nov. 3, 2026 &middot; 6:00 pm Eastern</div>";
      var units = box.querySelector(".fc-units");
      digitsByUnit = {};
      UNITS.forEach(function (u, i) {
        if (i) units.appendChild(el("div", "fc-sep", ":"));
        var wrap = el("div", "fc-unit"), dg = el("div", "fc-digits");
        var n = u[0] === "d" ? dayDigits : 2;
        digitsByUnit[u[0]] = [];
        for (var k = 0; k < n; k++) { var d = makeDigit("0"); digitsByUnit[u[0]].push(d); dg.appendChild(d.root); }
        wrap.appendChild(dg); wrap.appendChild(el("div", "fc-label", u[1]));
        units.appendChild(wrap);
      });
      mode = "units:" + dayDigits;
    }
    function setUnit(key, value, width) {
      var s = String(value); while (s.length < width) s = "0" + s;
      var ds = digitsByUnit[key];
      for (var i = 0; i < ds.length; i++) setDigit(ds[i], s.charAt(i));
    }
    function tick() {
      var ms = POLLS_CLOSE - Date.now();
      if (ms <= 0) {
        if (mode !== "live") {
          box.innerHTML = "<p class='fc-title'>Election Day</p><div class='fc-live'><span class='fc-dot' aria-hidden='true'></span><b>Results are coming in</b></div>";
          box.setAttribute("aria-label", "Results are coming in"); mode = "live";
        }
        return;
      }
      var tot = Math.floor(ms / 1000);
      if (tot === lastSec) return;
      lastSec = tot;
      var d = Math.floor(tot / 86400), h = Math.floor((tot % 86400) / 3600), m = Math.floor((tot % 3600) / 60), s = tot % 60;
      var dd = Math.max(2, String(d).length);
      if (mode !== "units:" + dd) buildUnits(dd);
      setUnit("d", d, dd); setUnit("h", h, 2); setUnit("m", m, 2); setUnit("s", s, 2);
      var lm = Math.floor(tot / 60);
      if (lm !== lastLabelMin) {   // screen readers: update once a minute, not every second
        lastLabelMin = lm;
        box.setAttribute("aria-label", d + " days, " + h + " hours and " + m + " minutes until the first polls close");
      }
    }
    tick();
    setInterval(tick, 200);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { lastSec = null; tick(); } });
  }

  /* =====================================================================================
     2. DATA (same files + same pipeline as app.js)
     ===================================================================================== */
  var M = null;   // model, set once data is analysed
  function loadModel() {
    var demo = (new URLSearchParams(location.search)).get("demo");
    var fFile = CFG.forecast_file || "forecast.csv", sFile = CFG.sims_file || "seat_sims.csv";
    if (demo === "prelim") { fFile = "examples/forecast_prelim_example.csv"; sFile = null; }
    if (demo === "probs") { fFile = "examples/forecast_final_example.csv"; sFile = null; }
    if (demo === "final") { fFile = "examples/forecast_final_example.csv"; sFile = "examples/seat_sims_example.csv"; }
    return Promise.all([
      FC.getCSV("data/races_2026.csv"),
      FC.getCSV("data/senate_seats_not_up_2026.csv"),
      FC.getCSV(fFile).catch(function () { return null; }),
      sFile ? FC.getCSV(sFile).catch(function () { return null; }) : Promise.resolve(null),
      FC.getCSV("data/races_money_2026.csv").catch(function () { return null; })   // optional: fundraising in tooltips
    ]).then(function (res) {
      if (!res[2]) return null;   // no forecast yet: app.js shows its "No forecast yet" message
      var A = FC.analyze(res[0], res[1], res[2], res[3], sFile);
      var races = A.races;
      races.forEach(function (r) { r.rating = rate(r, A.useP); });
      var house = races.filter(function (r) { return r.office === "house"; });
      var senate = races.filter(function (r) { return r.office === "senate"; });
      var byId = {}, byName = {}, byState = {};
      races.forEach(function (r) {
        byId[r.race_id] = r; byName[raceName(r)] = r;
        var b = byState[r.state] = byState[r.state] || { house: [], senate: [] };
        b[r.office].push(r);
      });
      Object.keys(byState).forEach(function (s) { byState[s].house.sort(function (a, b) { return a.dist - b.dist; }); });
      var money = {};
      (res[4] || []).forEach(function (m) {
        money[m.race_id] = { dr: FC.num(m.dem_receipts), dd: FC.num(m.dem_disbursements), rr: FC.num(m.rep_receipts), rd: FC.num(m.rep_disbursements), end: m.fec_coverage_end || "" };
      });
      var repNotUp = 100 - A.demNotUp - senate.length;
      return { races: races, house: house, senate: senate, byId: byId, byName: byName, byState: byState, money: money,
               useP: A.useP, useI: A.useI, S: A.S, demNotUp: A.demNotUp, repNotUp: repNotUp, hasMoney: !!res[4] };
    });
  }

  /* ---- helpers copied from app.js so ratings/labels match exactly ---- */
  function margin(r) { return r.share == null ? null : (2 * r.share - 1) * 100; }
  function rate(r, useP) {
    if (r.share == null) return null;
    if (useP) {
      var p = r.p, fav = Math.max(p, 1 - p), d = p >= 0.5;
      if (fav < PROB_CUTS[0]) return RATINGS[3];
      if (fav < PROB_CUTS[1]) return RATINGS[d ? 2 : 4];
      if (fav < PROB_CUTS[2]) return RATINGS[d ? 1 : 5];
      return RATINGS[d ? 0 : 6];
    }
    var m = margin(r), a = Math.abs(m);
    if (a < MARGIN_CUTS[0]) return RATINGS[3];
    if (a < MARGIN_CUTS[1]) return RATINGS[m > 0 ? 2 : 4];
    if (a < MARGIN_CUTS[2]) return RATINGS[m > 0 ? 1 : 5];
    return RATINGS[m > 0 ? 0 : 6];
  }
  function raceName(r) {
    if (r.office === "senate") return STATE_NAMES[r.state] + " Senate" + (r.special === "1" ? " (special)" : "");
    return r.state + "-" + (r.dist < 10 ? "0" : "") + r.dist;
  }
  function sideLabel(name, party, fallback) {
    if (!name) return "<span class='note'>" + fallback + "</span>";
    return esc(name) + (party && party !== "D" && party !== "R" ? " (" + esc(party) + ")" : "");
  }
  function marginText(r) {
    var m = margin(r);
    if (m == null) return "n/a";
    if (Math.abs(m) < 0.05) return "Even";
    return (m > 0 ? "D +" : "R +") + Math.abs(m).toFixed(1);
  }
  function fixedText(r) {
    if (r.race_type === "no_R_side") return "No Republican-side candidate";
    if (r.race_type === "same_party_D") return "Two Democrats; seat stays Democratic";
    if (r.race_type === "same_party_R") return "Two Republicans; seat stays Republican";
    return "Not scored";
  }
  /* ---- extra helpers ---- */
  function rcolor(r) { return "var(--" + (r.rating ? r.rating.key : "toss") + ")"; }
  function valOf(r) { return M.useP ? r.p : r.share; }                    // "how Democratic" for ordering
  function byDem(a, b) { return (valOf(b) - valOf(a)) || (b.share - a.share); }
  function pviText(r) {
    var v = FC.num(r.pvi); if (v == null || isNaN(v)) return null;
    if (Math.abs(v) < 0.05) return "Even";
    return (v > 0 ? "D +" : "R +") + Math.abs(v).toFixed(1);
  }
  function incText(r) {
    var held = r.incumbent_party === "D" ? "Democrats" : r.incumbent_party === "R" ? "Republicans" : "";
    if (r.open_seat === "1") return "Open seat" + (held ? ", held by " + held : "");
    if (r.incumbent_name) return esc(r.incumbent_name) + " (" + esc(r.incumbent_party) + ")" + (r.incumbent_lost_primary === "1" ? ", lost primary" : "");
    return held ? held + " hold the seat" : "";
  }
  function incShort(r) {
    if (r.open_seat === "1") return "Open seat";
    return r.incumbent_party ? r.incumbent_party + " incumbent" : "";
  }
  function money$(x) {
    if (x == null || isNaN(x)) return "n/a";
    if (x >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return "$" + Math.round(x / 1e3) + "K";
    return "$" + Math.round(x);
  }
  function moneyRow(r) {
    var m = M.money[r.race_id];
    if (!m || (m.dr == null && m.rr == null)) return "";
    return "D " + money$(m.dr) + " &middot; R " + money$(m.rr);
  }
  function sectionByTitle(t) {
    var hs = document.querySelectorAll("#content section.block > .block-head h2"), i;
    for (i = 0; i < hs.length; i++) if (hs[i].textContent.trim() === t) return hs[i].closest("section");
    return null;
  }

  /* =====================================================================================
     3. TOOLTIP, HIGHLIGHT REGISTRY, EVENT WIRING
     ===================================================================================== */
  var tip = null, reg = {};
  function placeTip(target) {
    var b = target.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = Math.min(Math.max(8, b.left + b.width / 2 - tw / 2), window.innerWidth - tw - 8);
    var y = b.top - th - 10; if (y < 8) y = b.bottom + 10;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function tipHTML(r) {
    var h = "<b>" + esc(raceName(r)) + "</b>";
    h += "<div class='tsub'>" + (r.office === "senate" ? "U.S. Senate" : "U.S. House") + " &middot; " + esc(STATE_NAMES[r.state] || r.state) + (r.special === "1" ? " &middot; special election" : "") + "</div>";
    h += "<div class='row'><span>D side</span><span>" + sideLabel(r.dem_candidate, r.d_side_party, "none") + "</span></div>";
    h += "<div class='row'><span>R side</span><span>" + sideLabel(r.rep_candidate, r.r_side_party, "none") + "</span></div>";
    if (isFixed(r)) {
      h += "<div class='row'><span>Forecast</span><span>" + fixedText(r) + "</span></div>";
    } else {
      if (M.useP && r.p != null) {
        h += "<div class='pb' aria-hidden='true'><i style='width:" + (100 * r.p).toFixed(1) + "%;background:var(--likely-d)'></i><i style='flex:1;background:var(--likely-r)'></i></div>";
        h += "<div class='row'><span>Democrats win</span><span class='num'><b style='display:inline;font:700 13px var(--sans)'>" + pct(r.p) + "</b></span></div>";
      }
      h += "<div class='row'><span>Margin</span><span class='num'>" + marginText(r) + "</span></div>";
      if (M.useP && r.lo != null) h += "<div class='row'><span>D share, 80%</span><span class='num'>" + pct(r.lo, 1) + " to " + pct(r.hi, 1) + "</span></div>";
      if (r.rating) h += "<div class='row'><span>Rating</span><span><i class='sw r-" + r.rating.key + "'></i>" + r.rating.label + "</span></div>";
    }
    var ex = "", pv = pviText(r), inc = incText(r), mo = moneyRow(r);
    if (pv) ex += "<div class='row'><span>Partisan lean (PVI)</span><span class='num'>" + pv + "</span></div>";
    if (inc) ex += "<div class='row'><span>" + (r.open_seat === "1" ? "Seat" : "Incumbent") + "</span><span>" + inc + "</span></div>";
    if (r.redrawn_since_2024 === "1") ex += "<div class='row'><span>Lines</span><span>Redrawn since 2024</span></div>";
    if (mo) ex += "<div class='row'><span>Raised</span><span class='num'>" + mo + "</span></div>";
    if (ex) h += "<hr>" + ex;
    return h;
  }
  function showTip(target, r) { tip.innerHTML = tipHTML(r); tip.hidden = false; placeTip(target); }
  function hideTip() { if (tip) tip.hidden = true; }

  function hl(r, on) {
    var list = reg[r.race_id]; if (!list) return;
    for (var i = 0; i < list.length; i++) list[i].classList.toggle("hl", on);
  }
  /* Wire one element to one race: tooltip, cross-highlight, click / Enter opens the state panel. */
  function wire(target, r, o) {
    o = o || {};
    (reg[r.race_id] = reg[r.race_id] || []).push(target);
    var over = function () {
      if (OPTS.richTooltips || o.force) showTip(target, r);
      if (OPTS.crossHighlight) hl(r, true);
    };
    var out = function () { hideTip(); if (OPTS.crossHighlight) hl(r, false); };
    target.addEventListener("mouseenter", over); target.addEventListener("focus", over);
    target.addEventListener("mouseleave", out); target.addEventListener("blur", out);
    if (OPTS.stateDrawer) {
      var open = function (ev) { hideTip(); openDrawer(r.state, r, target); if (ev) ev.stopPropagation(); };
      target.addEventListener("click", open);
      if (o.keys) target.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(ev); }
      });
    }
  }

  /* =====================================================================================
     4. HONEYCOMB + MAP WIRING
     ===================================================================================== */
  function honeycomb() {
    var KMAX = 15;
    document.querySelectorAll("#house-grid .tiles").forEach(function (box) {
      var tiles = [].slice.call(box.children).filter(function (c) { return c.classList.contains("t"); });
      var n = tiles.length; if (!n) return;
      var rows = Math.ceil(n / KMAX), per = Math.ceil(n / rows), frag = document.createDocumentFragment();
      for (var i = 0; i < rows; i++) {
        var row = el("div", "hexrow" + (i % 2 ? " odd" : ""));
        tiles.slice(i * per, (i + 1) * per).forEach(function (t) { row.appendChild(t); });
        frag.appendChild(row);
      }
      box.appendChild(frag);
    });
  }
  function wireTiles() {
    var all = [].slice.call(document.querySelectorAll("#house-grid .t, #senate-map .st.race"));
    all.forEach(function (t) {
      var a = t.getAttribute("aria-label") || "", k = a.indexOf(": "), name = k > 0 ? a.slice(0, k) : a;
      var r = M.byName[name]; if (!r) return;
      t.setAttribute("role", "button");
      t.setAttribute("aria-label", a + (OPTS.stateDrawer ? ". Press Enter for the state details." : ""));
      wire(t, r, { keys: true });
    });
    document.querySelectorAll("#house-grid .srow").forEach(function (row) {
      var sl = row.querySelector(".sl"); if (!sl || !OPTS.stateDrawer) return;
      var st = sl.textContent.trim();
      sl.setAttribute("role", "button"); sl.tabIndex = 0; sl.setAttribute("aria-label", "Open details for " + (STATE_NAMES[st] || st));
      sl.addEventListener("click", function (ev) { openDrawer(st, null, sl); ev.stopPropagation(); });
      sl.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDrawer(st, null, sl); } });
      row.dataset.state = st;
    });
  }

  /* =====================================================================================
     5. HEMICYCLES
     ===================================================================================== */
  var hatchN = 0;
  function layoutHemi(n, W, H, a) {
    var cx = W / 2, cy = H - 22, R = Math.min(W / 2 - 16, H - 52);
    a = a || 0.42;
    var coef = (Math.PI / 2) * (1 + a) / (1 - a);
    var k = Math.max(3, Math.round((1 + Math.sqrt(1 + 4 * n / coef)) / 2));
    var radii = [], sum = 0, i, j;
    for (i = 0; i < k; i++) { radii[i] = R * (a + (1 - a) * (k === 1 ? 1 : i / (k - 1))); sum += radii[i]; }
    var counts = radii.map(function (r) { return Math.round(n * r / sum); });
    var diff = n - counts.reduce(function (x, y) { return x + y; }, 0), idx = k - 1;
    while (diff !== 0) { counts[idx] += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1; idx = (idx - 1 + k) % k; }
    var pts = [], minArc = Infinity, d = R * (1 - a) / (k - 1);
    for (i = 0; i < k; i++) {
      var c = counts[i];
      if (c > 1) minArc = Math.min(minArc, Math.PI * radii[i] / (c - 1));
      for (j = 0; j < c; j++) {
        var ang = c === 1 ? Math.PI / 2 : Math.PI - Math.PI * j / (c - 1);
        pts.push({ ang: ang, rad: radii[i], x: cx + radii[i] * Math.cos(ang), y: cy - radii[i] * Math.sin(ang) });
      }
    }
    pts.sort(function (p, q) { return (q.ang - p.ang) || (p.rad - q.rad); });
    return { pts: pts, cx: cx, cy: cy, R: R, inner: R * a, dot: Math.min(d, minArc) * 0.43 };
  }
  function ratingLegend(extra) {
    var h = RATINGS.map(function (k) { return "<span class='key'><i class='sw r-" + k.key + "'></i>" + k.label + "</span>"; }).join("");
    return h + "<span class='key'><i class='sw r-safe-d fixed'></i>Hatched: fixed by the race file</span>" + (extra || "");
  }
  function hemicycle(opts) {
    // opts: seats[], W, H, kicker, big (html), sub, sub2, majLabel, aria
    var L = layoutHemi(opts.seats.length, opts.W, opts.H, opts.a), id = "hx" + (++hatchN);
    var s = "<svg viewBox='0 0 " + opts.W + " " + opts.H + "' role='img' aria-label='" + esc(opts.aria) + "'>";
    s += "<defs><pattern id='" + id + "' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><line x1='0' y1='0' x2='0' y2='5' stroke='rgba(255,255,255,.55)' stroke-width='1.7'/></pattern></defs>";
    opts.seats.forEach(function (seat, i) {
      var p = L.pts[i], cls, extra = "";
      if (seat.hold) cls = "d hold " + (seat.hold === "d" ? "f-safe-d" : "f-safe-r");
      else { cls = "d f-" + (seat.r.rating ? seat.r.rating.key : "toss"); }
      s += "<circle class='" + cls + "' data-i='" + i + "' cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + L.dot.toFixed(2) + "'/>";
      if (seat.r && isFixed(seat.r)) s += "<circle cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + L.dot.toFixed(2) + "' fill='url(#" + id + ")' pointer-events='none'/>";
    });
    var top = L.cy - L.R - L.dot - 6;
    s += "<line class='maj' x1='" + L.cx + "' x2='" + L.cx + "' y1='" + (top + 6) + "' y2='" + (L.cy - L.inner + L.dot * 0.4).toFixed(1) + "'/>";
    s += "<text class='majlab' x='" + L.cx + "' y='" + (top - 4) + "' text-anchor='middle'>" + esc(opts.majLabel) + "</text>";
    var by = L.cy - L.inner * 0.30;
    s += "<text class='hc-kick' x='" + L.cx + "' y='" + (L.cy - L.inner * 0.74).toFixed(1) + "' text-anchor='middle'>" + esc(opts.kicker) + "</text>";
    s += "<text class='hc-big' x='" + L.cx + "' y='" + by.toFixed(1) + "' text-anchor='middle'>" + opts.big + "</text>";
    s += "<text class='hc-sub' x='" + L.cx + "' y='" + (by + 24).toFixed(1) + "' text-anchor='middle'>" + esc(opts.sub) + "</text>";
    (opts.sub2 || []).forEach(function (line, i) {
      s += "<text class='hc-sub' x='" + L.cx + "' y='" + (by + 44 + i * 17).toFixed(1) + "' text-anchor='middle'>" + esc(line) + "</text>";
    });
    s += "</svg>";
    var wrap = el("div", "hemi", s);
    if (opts.cap) wrap.appendChild(el("p", "hemi-cap", esc(opts.cap)));   // shown instead of the small centre text on phones
    wrap.querySelectorAll("circle.d").forEach(function (c) {
      var seat = opts.seats[+c.getAttribute("data-i")];
      if (seat.r) { c.setAttribute("tabindex", "-1"); wire(c, seat.r); }
      else {
        c.addEventListener("mouseenter", function () {
          tip.innerHTML = "<b>" + (seat.hold === "d" ? "Democratic" : "Republican") + " seat, not up in 2026</b><div class='tsub'>Already decided: this seat is not on the ballot this year</div>";
          tip.hidden = false; placeTip(c);
        });
        c.addEventListener("mouseleave", hideTip);
      }
    });
    return wrap;
  }
  function pMajority(xs, maj) { return xs.filter(function (x) { return x >= maj; }).length / xs.length; }
  function stage(title, tag, note) {
    var s = el("div", "stage");
    var head = el("div", "stage-head");
    head.innerHTML = "<h3>" + title + "</h3>" +
      (OPTS.compareLabels && tag ? "<span class='cmp " + (tag === "New" ? "new" : "cur") + "'>" + tag + "</span>" : "") +
      (note ? "<p>" + note + "</p>" : "");
    s.appendChild(head);
    return s;
  }

  function buildHouseHemicycle() {
    var sec = sectionByTitle("House"); if (!sec) return;
    var rs = M.house.slice().sort(byDem);
    var hD = M.house.filter(function (r) { return r.share != null && r.share > 0.5; }).length;
    var hR = M.house.filter(function (r) { return r.share != null && r.share < 0.5; }).length;
    var sub2 = M.S ? ["Democrats win a majority in " + pct(pMajority(M.S.h, HOUSE_MAJ)) + " of simulations"] : [];
    var st = stage("Seat chart", "New", "Each dot is one of the 435 districts, ordered from most Democratic (left) to most Republican (right). The dashed line marks the 218-seat majority.");
    st.id = "v2-house-seats";
    st.appendChild(hemicycle({
      seats: rs.map(function (r) { return { r: r }; }), W: 820, H: 450,
      kicker: "PROJECTED SEATS", big: "<tspan class='hc-d'>" + hD + "</tspan><tspan fill='#98a0b0'> &#8211; </tspan><tspan class='hc-r'>" + hR + "</tspan>",
      sub: "Democratic &#8211; Republican".replace(/&#8211;/, "–"), sub2: sub2, majLabel: "218 = MAJORITY", cap: "Projected: Democratic " + hD + ", Republican " + hR + (sub2.length ? ". " + sub2[0] + "." : "."),
      aria: "House seat chart. Projected Democratic " + hD + ", Republican " + hR + "."
    }));
    st.appendChild(el("div", "legend", ratingLegend()));
    var head = sec.querySelector(".block-head");
    head.parentNode.insertBefore(st, head.nextSibling);
    return st;
  }

  function buildSenateHemicycle() {
    var sec = sectionByTitle("Senate"); if (!sec) return;
    var contested = M.senate.slice().sort(byDem), seats = [], i;
    for (i = 0; i < M.demNotUp; i++) seats.push({ hold: "d" });
    contested.forEach(function (r) { seats.push({ r: r }); });
    for (i = 0; i < M.repNotUp; i++) seats.push({ hold: "r" });
    var sD = M.demNotUp + M.senate.filter(function (r) { return r.share != null && r.share > 0.5; }).length;
    var sR = M.repNotUp + M.senate.filter(function (r) { return r.share != null && r.share < 0.5; }).length;
    var sub2 = M.S ? ["Democrats win control in", pct(pMajority(M.S.s, SENATE_MAJ)) + " of simulations"] : [];
    var st = stage("Seat chart", "New", "All 100 seats. Faded dots are the " + (M.demNotUp + M.repNotUp) + " seats not up in 2026; solid dots are the " + M.senate.length + " races on the ballot, ordered from most Democratic to most Republican.");
    st.id = "v2-senate-seats";
    st.appendChild(hemicycle({
      seats: seats, W: 700, H: 410, a: 0.5,
      kicker: "PROJECTED SEATS", big: "<tspan class='hc-d'>" + sD + "</tspan><tspan fill='#98a0b0'> &#8211; </tspan><tspan class='hc-r'>" + sR + "</tspan>",
      sub: "Democratic – Republican", sub2: sub2, majLabel: "51 FOR DEMOCRATIC CONTROL", cap: "Projected: Democratic " + sD + ", Republican " + sR + (sub2.length ? ". " + sub2.join(" ") + "." : "."),
      aria: "Senate seat chart. Projected Democratic " + sD + ", Republican " + sR + "."
    }));
    st.appendChild(el("div", "legend", ratingLegend("<span class='key'><i class='sw r-safe-d' style='opacity:.45'></i>Faded: not up in 2026</span>")));
    if (OPTS.pathToControl) st.appendChild(pathToControl(contested));
    var head = sec.querySelector(".block-head");
    head.parentNode.insertBefore(st, head.nextSibling);
  }
  function pathToControl(contested) {
    var n = contested.length, dNeed = SENATE_MAJ - M.demNotUp, rNeed = 50 - M.repNotUp;   // VP breaks 50-50 ties for Republicans
    var wrap = el("div", "pathbar");
    var cells = "", i;
    for (i = 0; i < M.demNotUp; i++) cells += "<span class='pb-cell hold-d'></span>";
    contested.forEach(function (r, k) { cells += "<span class='pb-cell c r-" + (r.rating ? r.rating.key : "toss") + "' data-k='" + k + "'></span>"; });
    for (i = 0; i < M.repNotUp; i++) cells += "<span class='pb-cell hold-r'></span>";
    var favD = contested.filter(function (r) { return r.share > 0.5; }).length;
    wrap.innerHTML =
      "<div class='pb-track' role='img' aria-label='Path to Senate control: " + M.demNotUp + " Democratic seats not up, " + n + " contested races, " + M.repNotUp + " Republican seats not up'>" + cells +
      "<span class='pb-mid'></span><span class='pb-midlab'>51 = D control</span></div>" +
      "<div class='pb-labels' style='grid-template-columns:" + M.demNotUp + "fr " + n + "fr " + M.repNotUp + "fr'>" +
      "<div><b>" + M.demNotUp + " Democratic</b>seats not up</div>" +
      "<div class='mid'><b>" + n + " races on the ballot</b>most Democratic to most Republican</div>" +
      "<div class='r'><b>" + M.repNotUp + " Republican</b>seats not up</div></div>" +
      "<p class='pb-need'>" +
      (dNeed > 0 ? "Democrats need <b>" + dNeed + " of the " + n + "</b> races for control (51 seats)" : "Democrats already hold a majority from seats not up") +
      (rNeed > 0 ? "; Republicans need <b>" + rNeed + "</b> (50 seats, since the vice president breaks ties for Republicans)." : "; Republicans already hold control from seats not up.") +
      " The forecast favors Democrats in <b>" + favD + "</b> and Republicans in <b>" + (n - favD) + "</b>.</p>";
    wrap.querySelectorAll(".pb-cell.c").forEach(function (c) { wire(c, contested[+c.getAttribute("data-k")]); });
    return wrap;
  }

  /* =====================================================================================
     6. UPGRADED SEAT DISTRIBUTIONS
     ===================================================================================== */
  function hist2(lab, xs, maj, what) {
    var card = el("div", "card hist2"), n = xs.length, counts = {}, v;
    xs.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    var lo = Math.floor(quant(xs, 0.002)), hi = Math.ceil(quant(xs, 0.998));
    lo = Math.min(lo, maj - 1); hi = Math.max(hi, maj);
    var span = hi - lo + 1, W = 520, H = 200, padL = 6, padR = 6, padT = 40, padB = 70;
    var maxC = 0; for (v = lo; v <= hi; v++) maxC = Math.max(maxC, counts[v] || 0);
    var bw = (W - padL - padR) / span, gap = bw > 4 ? 1.6 : (bw > 2 ? 0.8 : 0);
    var pm = pMajority(xs, maj), p10 = quant(xs, 0.1), p50 = quant(xs, 0.5), p90 = quant(xs, 0.9);
    var cum = {}, run = 0; for (v = hi; v >= lo; v--) { run += counts[v] || 0; cum[v] = run / n; }
    var X = function (val) { return padL + (val - lo + 0.5) * bw; };
    var mx = padL + (maj - lo) * bw;
    var s = "<svg viewBox='0 0 " + W + " " + (padT + H + padB) + "' role='img' aria-label='" + lab + " seat distribution: Democrats win " + what + " in " + pct(pm) + " of simulations. Median " + Math.round(p50) + " seats, 80% range " + Math.round(p10) + " to " + Math.round(p90) + ".'>";
    s += "<rect class='tint-r' x='" + padL + "' y='" + padT + "' width='" + (mx - padL) + "' height='" + H + "'/><rect class='tint-d' x='" + mx + "' y='" + padT + "' width='" + (W - padR - mx) + "' height='" + H + "'/>";
    [0.25, 0.5, 0.75].forEach(function (f) { var y = padT + H - H * f; s += "<line class='gridl' x1='" + padL + "' x2='" + (W - padR) + "' y1='" + y + "' y2='" + y + "'/>"; });
    for (v = lo; v <= hi; v++) {
      var c = counts[v] || 0; if (!c) continue;
      var h = Math.max(1, (H - 4) * c / maxC), x = padL + (v - lo) * bw, y = padT + H - h;
      s += "<rect class='b' x='" + (x + gap / 2).toFixed(2) + "' y='" + y.toFixed(2) + "' width='" + Math.max(0.6, bw - gap).toFixed(2) + "' height='" + h.toFixed(2) +
        "' rx='" + Math.min(1.8, (bw - gap) / 2).toFixed(2) + "' fill='" + (v >= maj ? "var(--likely-d)" : "var(--likely-r)") + "' data-v='" + v + "' data-c='" + c + "'/>";
    }
    s += "<line class='base' x1='" + padL + "' x2='" + (W - padR) + "' y1='" + (padT + H) + "' y2='" + (padT + H) + "'/>";
    s += "<line class='maj' x1='" + mx + "' x2='" + mx + "' y1='" + (padT - 12) + "' y2='" + (padT + H) + "'/>";
    s += "<text class='majlab' x='" + mx + "' y='" + (padT - 26) + "' text-anchor='middle'>Majority: " + maj + " seats</text>";
    s += "<text class='sidelab r' x='" + (mx - 8) + "' y='" + (padT - 8) + "' text-anchor='end'>Republicans " + pct(1 - pm) + "</text>";
    s += "<text class='sidelab d' x='" + (mx + 8) + "' y='" + (padT - 8) + "' text-anchor='start'>Democrats " + pct(pm) + "</text>";
    var step = span > 60 ? 10 : (span > 25 ? 5 : (span > 10 ? 2 : 1));
    s += "<g class='axis'>";
    for (v = Math.ceil(lo / step) * step; v <= hi; v += step) s += "<text x='" + X(v) + "' y='" + (padT + H + 15) + "' text-anchor='middle'>" + v + "</text>";
    s += "</g>";
    var mxm = X(p50);   // median marker
    s += "<polygon class='med' points='" + (mxm - 5) + "," + (padT + H + 24) + " " + (mxm + 5) + "," + (padT + H + 24) + " " + mxm + "," + (padT + H + 17) + "'/>";
    s += "<text class='medlab' x='" + mxm + "' y='" + (padT + H + 36) + "' text-anchor='middle'>Median " + Math.round(p50) + "</text>";
    var bx1 = X(p10), bx2 = X(p90), by = padT + H + 52;
    s += "<path class='brk' d='M" + bx1 + "," + (by - 5) + " V" + by + " H" + bx2 + " V" + (by - 5) + "'/>";
    s += "<text class='brklab' x='" + ((bx1 + bx2) / 2) + "' y='" + (by + 14) + "' text-anchor='middle'>80% of simulations: " + Math.round(p10) + " to " + Math.round(p90) + " seats</text>";
    s += "</svg>";
    card.innerHTML = "<h3>" + lab + "</h3><div class='kpis'>" +
      "<div class='kpi d'><b>" + pct(pm) + "</b><span>Democrats win</span></div>" +
      "<div class='kpi r'><b>" + pct(1 - pm) + "</b><span>Republicans win</span></div>" +
      "<div class='kpi'><b>" + Math.round(p50) + "</b><span>Median Dem. seats</span></div></div>" + s;
    card.querySelectorAll("rect.b").forEach(function (rc) {
      var f = function () {
        var vv = +rc.getAttribute("data-v");
        tip.innerHTML = "<b>" + vv + " Democratic seats</b><div class='row'><span>Share of simulations</span><span class='num'>" + pct(rc.getAttribute("data-c") / n, 1) + "</span></div>" +
          "<div class='row'><span>Chance of " + vv + " or more</span><span class='num'>" + pct(cum[vv], 1) + "</span></div>";
        tip.hidden = false; placeTip(rc);
      };
      rc.addEventListener("mouseenter", f); rc.addEventListener("click", function (e) { f(); e.stopPropagation(); }); rc.addEventListener("mouseleave", hideTip);
    });
    return card;
  }
  function betterDistributions() {
    var box = $("dist"); if (!box || !M.S) return;
    var wrap = el("div", "dist2"); wrap.id = "dist-v2";
    wrap.appendChild(hist2("House", M.S.h, HOUSE_MAJ, "the House"));
    wrap.appendChild(hist2("Senate", M.S.s, SENATE_MAJ, "the Senate"));
    box.parentNode.insertBefore(wrap, box);
    if (OPTS.keepOriginalCharts) {
      var d = el("details", "orig", "<summary>Original histograms (for comparison)</summary>");
      box.parentNode.insertBefore(d, box); d.appendChild(box);
    } else box.classList.add("v2-orig");
  }

  /* =====================================================================================
     7. RACES THAT DECIDE CONTROL: ladder + ranges
     ===================================================================================== */
  var decideState = { ladder: "house", ranges: "house" };
  function segHTML(group, cur) {
    return "<div class='seg' role='group' aria-label='Chamber'>" +
      ["house", "senate"].map(function (c) { return "<button type='button' data-g='" + group + "' data-c='" + c + "'" + (c === cur ? " class='on'" : "") + ">" + (c === "house" ? "House" : "Senate") + "</button>"; }).join("") + "</div>";
  }
  function renderLadder(box) {
    var chamber = decideState.ladder, rs = (chamber === "house" ? M.house : M.senate).filter(function (r) { return r.share != null; }).slice().sort(byDem);
    var base = chamber === "house" ? 0 : M.demNotUp, maj = chamber === "house" ? HOUSE_MAJ : SENATE_MAJ;
    var tipIdx = maj - base - 1, hasTip = tipIdx >= 0 && tipIdx < rs.length;
    var idxs = [], i;
    for (i = 0; i < rs.length; i++) {
      var comp = chamber === "senate" ? true : (M.useP ? (rs[i].p > 0.04 && rs[i].p < 0.96) : Math.abs(margin(rs[i])) < 12);
      if (comp || (hasTip && i === tipIdx)) idxs.push(i);
    }
    if (idxs.length > 90 && hasTip) {
      var pos = idxs.indexOf(tipIdx); var a = Math.max(0, pos - 45); idxs = idxs.slice(a, a + 90);
    }
    var rows = "";
    idxs.forEach(function (ix) {
      var r = rs[ix], isTip = hasTip && ix === tipIdx, v, w, side, label;
      if (M.useP) { v = r.p; side = v >= 0.5 ? "d" : "r"; w = Math.abs(v - 0.5) / 0.5 * 50; label = (side === "d" ? "D " : "R ") + pct(side === "d" ? v : 1 - v); }
      else { var m = margin(r); side = m >= 0 ? "d" : "r"; w = Math.min(50, Math.abs(m) / 20 * 50); label = marginText(r); }
      var left = side === "d" ? 50 : 50 - w;
      var incCol = r.incumbent_party === "D" ? "var(--safe-d)" : r.incumbent_party === "R" ? "var(--safe-r)" : "var(--toss)";
      rows += "<div class='lad-row" + (isTip ? " tip-row" : "") + "' tabindex='0' role='button' data-rid='" + esc(r.race_id) + "' aria-label='" + esc(raceName(r)) + ", " + label + (isTip ? ", tipping point" : "") + "'>" +
        "<span class='rk'>#" + (base + ix + 1) + "</span>" +
        "<span class='nm'><i" + (r.open_seat === "1" ? " class='open'" : "") + " style='background:" + incCol + "'></i>" + esc(chamber === "senate" ? STATE_NAMES[r.state] : raceName(r)) + "</span>" +
        "<span class='tr'><b style='left:" + left.toFixed(1) + "%;width:" + Math.max(w, 1.2).toFixed(1) + "%;background:" + rcolor(r) + "'></b></span>" +
        "<span class='vl num'>" + label + "</span>" +
        (isTip ? "<span class='lad-flag'>Tipping point</span>" : "") + "</div>";
    });
    var foot;
    if (hasTip) {
      var tr = rs[tipIdx];
      foot = "The tipping point is <b>" + esc(raceName(tr)) + "</b> (" + (M.useP ? (tr.p >= 0.5 ? "D " + pct(tr.p) : "R " + pct(1 - tr.p)) : marginText(tr)) + "): rank the " +
        (chamber === "house" ? "435 districts" : "35 races") + " from most to least Democratic, and this is where Democrats reach " + maj + " seats" +
        (chamber === "senate" ? " (counting the " + M.demNotUp + " they already hold)" : "") + ". Races above it are what Democrats must win; races below it are what Republicans need.";
    } else {
      foot = chamber === "senate" ? "The seats not up already settle the majority question for one party, so there is no tipping-point race among the " + rs.length + " on the ballot." : "No tipping point is available for this forecast.";
    }
    box.innerHTML = "<div class='axis-cap'><span></span><span></span><span class='cap'><span class='l'>&larr; Republicans</span><span class='r'>Democrats &rarr;</span></span><span></span></div>" +
      "<div class='lad-scroll'>" + rows + "</div><p class='lad-foot'>" + foot + " <span class='note'>Left square: incumbent party (hollow = open seat). Seat numbers count Democratic seats if every race above that row goes their way.</span></p>";
    box.querySelectorAll(".lad-row").forEach(function (row) {
      var r = M.byId[row.getAttribute("data-rid")]; wire(row, r, { keys: true, force: true });
    });
    var sc = box.querySelector(".lad-scroll"), tr2 = box.querySelector(".tip-row");
    if (sc && tr2) sc.scrollTop = Math.max(0, tr2.offsetTop - sc.clientHeight / 2 + tr2.offsetHeight / 2);
  }
  function renderRanges(box) {
    var chamber = decideState.ranges;
    var rs = (chamber === "house" ? M.house : M.senate).filter(function (r) { return !isFixed(r) && r.share != null && r.lo != null && r.hi != null && !isNaN(r.lo) && !isNaN(r.hi); });
    var close = function (r) { return M.useP ? Math.abs(r.p - 0.5) : Math.abs(r.share - 0.5); };
    rs.sort(function (a, b) { return close(a) - close(b); });
    rs = rs.slice(0, 40).sort(function (a, b) { return b.share - a.share; });
    if (!rs.length) { box.innerHTML = "<p class='note'>No races with an 80% range for this chamber.</p>"; return; }
    var half = 0.04; rs.forEach(function (r) { half = Math.max(half, Math.abs(r.lo - 0.5), Math.abs(r.hi - 0.5)); });
    half = Math.min(0.25, Math.ceil((half + 0.005) * 100) / 100);
    var dmin = 0.5 - half, dmax = 0.5 + half, P = function (v) { return Math.max(0, Math.min(100, (v - dmin) / (dmax - dmin) * 100)); };
    var rows = rs.map(function (r) {
      return "<div class='rng-row' tabindex='0' role='button' data-rid='" + esc(r.race_id) + "' aria-label='" + esc(raceName(r)) + ", Democratic share " + pct(r.lo, 1) + " to " + pct(r.hi, 1) + "'>" +
        "<span class='nm'>" + esc(chamber === "senate" ? r.state + " Senate" : raceName(r)) + "</span>" +
        "<span class='tr'><b style='left:" + P(r.lo).toFixed(1) + "%;width:" + (P(r.hi) - P(r.lo)).toFixed(1) + "%;background:" + rcolor(r) + "'></b><u style='left:" + P(r.share).toFixed(1) + "%;background:" + rcolor(r) + "'></u></span>" +
        "<span class='vl num'>" + pct(r.lo, 1) + " &ndash; " + pct(r.hi, 1) + "</span></div>";
    }).join("");
    box.innerHTML = "<div class='rng-axis'><span></span><span class='a'><span>" + pct(dmin) + "</span><span>50%</span><span>" + pct(dmax) + "</span></span><span style='text-align:right'>80% range</span></div>" +
      "<div class='rng-scroll'>" + rows + "</div><p class='lad-foot'>Bars show the 80% range for the Democratic share of the two-party vote; the dot is the point forecast. Showing the " + rs.length + " closest " + (chamber === "house" ? "House" : "Senate") + " races. <span class='note'>Races whose bar crosses 50% could go either way.</span></p>";
    box.querySelectorAll(".rng-row").forEach(function (row) {
      var r = M.byId[row.getAttribute("data-rid")]; wire(row, r, { keys: true, force: true });
    });
  }
  function buildDecisive() {
    var closest = sectionByTitle("Closest races"); if (!closest) return;
    var sec = el("section", "block"); sec.id = "v2-decisive";
    sec.innerHTML = "<div class='block-head'><h2>Races that decide control</h2><p class='note'>Which races tip the chamber, and how much each could move. Hover or tap any row for race details.</p></div><div class='decide'></div>";
    var grid = sec.querySelector(".decide");
    var c1 = el("div", "card vcard"), c2 = el("div", "card vcard");
    c1.innerHTML = "<div class='vcard-head'><h3>Control ladder</h3>" + segHTML("ladder", decideState.ladder) + "</div><p class='note'>Every race ranked from most to least Democratic, with the seat that tips the majority highlighted.</p><div class='lb'></div>";
    grid.appendChild(c1);
    if (M.useI) {
      c2.innerHTML = "<div class='vcard-head'><h3>Forecast ranges</h3>" + segHTML("ranges", decideState.ranges) + "</div><p class='note'>How wide each close race's 80% range is, in Democratic vote share.</p><div class='rb'></div>";
    } else {
      c2.innerHTML = "<div class='vcard-head'><h3>Forecast ranges</h3></div><div class='placeholder'><strong>Forecast ranges.</strong> Adding <code>p_dem_win</code>, <code>lo_80</code> and <code>hi_80</code> columns to your forecast file shows each close race's 80% range here.</div>";
    }
    grid.appendChild(c2);
    closest.parentNode.insertBefore(sec, closest);
    var lb = c1.querySelector(".lb"), rb = c2.querySelector(".rb");
    renderLadder(lb); if (rb) renderRanges(rb);
    sec.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-g"), c = b.getAttribute("data-c");
        decideState[g] = c;
        b.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
        if (g === "ladder") renderLadder(lb); else renderRanges(rb);
      });
    });
  }

  /* =====================================================================================
     8. RACES TABLE (sortable, filterable)
     ===================================================================================== */
  var tableApi = null;
  function buildTable() {
    var sec = sectionByTitle("Closest races"); if (!sec) return;
    ["controls", "table-wrap"].forEach(function (c) { var e = sec.querySelector("." + c); if (e) e.classList.add("v2-orig"); });
    if ($("show-all")) $("show-all").classList.add("v2-orig");
    var scored = M.races.filter(function (r) { return !isFixed(r) && r.share != null; });
    var st = { office: "all", q: "", all: false, state: null, ratings: {}, sort: "close", dir: 1, N: 30 };
    var close = function (r) { return M.useP ? Math.abs(r.p - 0.5) : Math.abs(r.share - 0.5); };
    var KEYS = {
      close: function (r) { return close(r); },
      margin: function (r) { return r.share; },
      p: function (r) { return r.p; },
      rating: function (r) { return RATINGS.indexOf(r.rating); },
      name: function (r) { return raceName(r); }
    };
    var DEF_DIR = { close: 1, margin: -1, p: -1, rating: 1, name: 1 };
    var ui = el("div", "v2-table");
    ui.innerHTML =
      "<div class='tctl'><div class='seg' role='group' aria-label='Chamber'>" +
      "<button type='button' data-o='all' class='on'>All</button><button type='button' data-o='house'>House</button><button type='button' data-o='senate'>Senate</button></div>" +
      "<input id='search2' type='search' placeholder='Search state, district or candidate' aria-label='Search races'>" +
      "<span class='tcount' aria-live='polite'></span></div>" +
      "<div class='tctl'><div class='chips' role='group' aria-label='Filter by rating'>" +
      RATINGS.map(function (k) { return "<button type='button' class='chip' data-r='" + k.key + "'><i class='r-" + k.key + "'></i>" + k.label + "</button>"; }).join("") +
      "<span class='chip-state'></span></div></div>" +
      "<div class='table-wrap'><table id='races-table2'></table></div>" +
      "<button type='button' class='link-btn tall'></button> <button type='button' class='link-btn treset' hidden>Reset to closest first</button>";
    sec.appendChild(ui);
    var table = ui.querySelector("table");

    function draw() {
      var rows = scored.filter(function (r) {
        if (st.office !== "all" && r.office !== st.office) return false;
        if (st.state && r.state !== st.state) return false;
        var anyR = Object.keys(st.ratings).some(function (k) { return st.ratings[k]; });
        if (anyR && !(r.rating && st.ratings[r.rating.key])) return false;
        if (!st.q) return true;
        var hay = (raceName(r) + " " + r.state + " " + STATE_NAMES[r.state] + " " + r.dem_candidate + " " + r.rep_candidate).toLowerCase();
        return hay.indexOf(st.q) >= 0;
      });
      var f = KEYS[st.sort];
      rows.sort(function (a, b) { var x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : close(a) - close(b)) * st.dir; });
      var filtered = !!(st.q || st.state || Object.keys(st.ratings).some(function (k) { return st.ratings[k]; }));
      var shown = (st.all || filtered) ? rows : rows.slice(0, st.N);
      var arrow = function (k) { return "<span class='ar'>" + (st.sort === k ? (st.dir === 1 ? "▲" : "▼") : "") + "</span>"; };
      var th = function (k, label, cls) { return "<th" + (cls ? " class='" + cls + "'" : "") + " data-k='" + k + "' aria-sort='" + (st.sort === k ? (st.dir === 1 ? "ascending" : "descending") : "none") + "'>" + label + arrow(k) + "</th>"; };
      var head = "<thead><tr>" + th("name", "Race") + "<th>D side</th><th>R side</th>" + th("margin", "Margin", "r") +
        (M.useP ? th("p", "D win chance", "r") : "") + (M.useI ? "<th class='r'>D share, 80% range</th>" : "") + th("rating", "Rating") + "</tr></thead>";
      var P35 = function (v) { return Math.max(0, Math.min(100, (v - 0.35) / 0.30 * 100)); };
      var body = shown.map(function (r) {
        return "<tr tabindex='0' role='button' data-rid='" + esc(r.race_id) + "'><td><b>" + esc(raceName(r)) + "</b><span class='sub'>" + esc(incShort(r)) + "</span></td>" +
          "<td class='cand'>" + sideLabel(r.dem_candidate, r.d_side_party, "none") + "</td><td class='cand'>" + sideLabel(r.rep_candidate, r.r_side_party, "none") + "</td>" +
          "<td class='r num'>" + marginText(r) + "</td>" +
          (M.useP ? "<td class='r num'><span class='pbar'><i style='width:" + (100 * r.p).toFixed(0) + "%'></i></span>" + pct(r.p) + "</td>" : "") +
          (M.useI ? "<td class='r num'><span class='mini'><b style='left:" + P35(r.lo).toFixed(1) + "%;width:" + (P35(r.hi) - P35(r.lo)).toFixed(1) + "%'></b><u style='left:calc(" + P35(r.share).toFixed(1) + "% - 1px)'></u></span>" + pct(r.lo, 1) + " to " + pct(r.hi, 1) + "</td>" : "") +
          "<td><span class='pill r-" + r.rating.key + "'>" + r.rating.label + "</span></td></tr>";
      }).join("");
      table.innerHTML = head + "<tbody>" + (body || "<tr><td colspan='7' class='note'>No matching races.</td></tr>") + "</tbody>";
      table.querySelectorAll("tbody tr[data-rid]").forEach(function (tr) { wire(tr, M.byId[tr.getAttribute("data-rid")], { keys: true, force: true }); });
      table.querySelectorAll("th[data-k]").forEach(function (h) {
        h.addEventListener("click", function () {
          var k = h.getAttribute("data-k");
          if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = DEF_DIR[k]; }
          draw();
        });
      });
      var btn = ui.querySelector(".tall");
      btn.hidden = filtered || rows.length <= st.N;
      btn.textContent = st.all ? "Show only the " + st.N + " closest" : "Show all " + rows.length + " contested races";
      ui.querySelector(".treset").hidden = st.sort === "close" && st.dir === 1;
      ui.querySelector(".tcount").textContent = "Showing " + shown.length + " of " + rows.length + " races";
      var chip = ui.querySelector(".chip-state");
      chip.innerHTML = st.state ? "<button type='button' class='chip state' aria-label='Remove state filter'>" + esc(STATE_NAMES[st.state]) + " ✕</button>" : "";
      if (st.state) chip.querySelector("button").addEventListener("click", function () { st.state = null; draw(); });
    }
    ui.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        ui.querySelectorAll(".seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
        st.office = b.getAttribute("data-o"); draw();
      });
    });
    ui.querySelectorAll(".chip[data-r]").forEach(function (c) {
      c.addEventListener("click", function () { var k = c.getAttribute("data-r"); st.ratings[k] = !st.ratings[k]; c.classList.toggle("on", st.ratings[k]); draw(); });
    });
    ui.querySelector("#search2").addEventListener("input", function (e) { st.q = e.target.value.trim().toLowerCase(); draw(); });
    ui.querySelector(".tall").addEventListener("click", function () { st.all = !st.all; draw(); });
    ui.querySelector(".treset").addEventListener("click", function () { st.sort = "close"; st.dir = 1; draw(); });
    draw();
    tableApi = {
      filterState: function (s) { st.state = s; st.office = "all"; ui.querySelectorAll(".seg button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-o") === "all"); }); draw(); },
      el: sec
    };
  }

  /* =====================================================================================
     9. STATE DRAWER
     ===================================================================================== */
  var drawer = null, backdrop = null, lastFocus = null;
  function buildDrawer() {
    backdrop = el("div", "drawer-bd"); drawer = el("aside", "drawer");
    drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-modal", "true"); drawer.setAttribute("aria-label", "State details"); drawer.tabIndex = -1;
    document.body.appendChild(backdrop); document.body.appendChild(drawer);
    backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (ev) {
      if (!drawer.classList.contains("open")) return;
      if (ev.key === "Escape") { closeDrawer(); return; }
      if (ev.key === "Tab") {
        var f = drawer.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])"); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
  }
  function raceCard(r) {
    var h = "<div class='dr-race' data-rid='" + esc(r.race_id) + "'><div class='t1'><b>" + esc(raceName(r)) + "</b>" +
      (r.rating ? "<span class='pill r-" + r.rating.key + "'>" + r.rating.label + "</span>" : "") + "</div>";
    if (isFixed(r)) h += "<div class='cands'>" + fixedText(r) + "</div>";
    else {
      if (M.useP && r.p != null) h += "<div class='pb'><i style='width:" + (100 * r.p).toFixed(1) + "%;background:var(--likely-d)'></i><i style='flex:1;background:var(--likely-r)'></i></div>" +
        "<div class='meta'><span>Democrats win <b class='num'>" + pct(r.p) + "</b></span><span>Margin <b class='num'>" + marginText(r) + "</b></span>" +
        (r.lo != null ? "<span>80% range <b class='num'>" + pct(r.lo, 1) + " to " + pct(r.hi, 1) + "</b></span>" : "") + "</div>";
      else h += "<div class='meta'><span>Margin <b class='num'>" + marginText(r) + "</b></span></div>";
    }
    h += "<div class='cands'>" + sideLabel(r.dem_candidate, r.d_side_party, "No Democratic-side candidate") + " <span style='color:var(--ink-3)'>vs</span> " + sideLabel(r.rep_candidate, r.r_side_party, "No Republican-side candidate") + "</div>";
    var meta = [], pv = pviText(r), mo = moneyRow(r), mm = M.money[r.race_id];
    if (pv) meta.push("PVI " + pv);
    var inc = incText(r); if (inc) meta.push(inc);
    if (r.redrawn_since_2024 === "1") meta.push("Lines redrawn since 2024");
    if (mo) meta.push("Raised " + mo + (mm && mm.end ? " (through " + esc(mm.end) + ")" : ""));
    if (meta.length) h += "<div class='meta'>" + meta.map(function (m) { return "<span>" + m + "</span>"; }).join("") + "</div>";
    return h + "</div>";
  }
  function openDrawer(st, focusRace, trigger) {
    var b = M.byState[st]; if (!b) return;
    lastFocus = trigger || document.activeElement;
    var hs = b.house, dN = hs.filter(function (r) { return r.share > 0.5; }).length, rN = hs.filter(function (r) { return r.share < 0.5; }).length;
    var tossN = hs.filter(function (r) { return r.rating && r.rating.key === "toss"; }).length;
    var html = "<div class='dr-top'><div><div class='abbr'>" + esc(st) + "</div><h3>" + esc(STATE_NAMES[st] || st) + "</h3></div><button type='button' class='dr-x' aria-label='Close state details'>✕</button></div>";
    var chips = [];
    if (b.senate.length) chips.push(b.senate.length + " Senate race" + (b.senate.length > 1 ? "s" : ""));
    if (hs.length) chips.push(hs.length + " House district" + (hs.length > 1 ? "s" : ""));
    if (hs.length) chips.push("Favored: " + dN + " D, " + rN + " R" + (tossN ? " (" + tossN + " toss-up" + (tossN > 1 ? "s" : "") + ")" : ""));
    html += "<div class='dr-sum'>" + chips.map(function (c) { return "<span>" + c + "</span>"; }).join("") + "</div>";
    if (b.senate.length) html += "<div class='dr-h'>Senate</div>" + b.senate.map(raceCard).join("");
    else html += "<div class='dr-h'>Senate</div><div class='cands' style='color:var(--ink-3);font-size:13px'>No Senate race in " + esc(STATE_NAMES[st]) + " in 2026.</div>";
    if (hs.length) html += "<div class='dr-h'>House districts</div>" + hs.map(raceCard).join("");
    html += "<button type='button' class='dr-btn'>Show these races in the table</button>";
    drawer.innerHTML = html;
    drawer.querySelector(".dr-x").addEventListener("click", closeDrawer);
    drawer.querySelector(".dr-btn").addEventListener("click", function () {
      closeDrawer();
      if (tableApi) { tableApi.filterState(st); tableApi.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); }
    });
    drawer.querySelectorAll(".dr-race").forEach(function (c) {
      var r = M.byId[c.getAttribute("data-rid")];
      c.addEventListener("mouseenter", function () { if (OPTS.crossHighlight) hl(r, true); });
      c.addEventListener("mouseleave", function () { if (OPTS.crossHighlight) hl(r, false); });
    });
    document.querySelectorAll("#house-grid .srow.sel").forEach(function (x) { x.classList.remove("sel"); });
    var row = document.querySelector("#house-grid .srow[data-state='" + st + "']"); if (row) row.classList.add("sel");
    backdrop.classList.add("open"); drawer.classList.add("open"); drawer.scrollTop = 0;
    drawer.querySelector(".dr-x").focus();
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); backdrop.classList.remove("open");
    document.querySelectorAll("#house-grid .srow.sel").forEach(function (x) { x.classList.remove("sel"); });
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); } }
  }

  /* =====================================================================================
     10. STICKY NAV
     ===================================================================================== */
  function buildNav() {
    var main = document.querySelector("main"); if (!main) return;
    var content = $("content"), items = [];
    var tl = content.querySelector(".topline"); if (tl) { tl.id = tl.id || "overview"; items.push(["overview", "Overview"]); }
    [["Senate", "senate", "Senate"], ["House", "house", "House"], ["Seat distribution", "distribution", "Distribution"]].forEach(function (d) {
      var s = sectionByTitle(d[0]); if (s) { s.id = s.id || d[1]; items.push([s.id, d[2]]); }
    });
    var dec = $("v2-decisive"); if (dec) items.push(["v2-decisive", "Decisive races"]);
    var cl = sectionByTitle("Closest races"); if (cl) { cl.id = cl.id || "races"; items.push([cl.id, "Closest races"]); }
    var me = $("method-block"); if (me) items.push(["method-block", "Method"]);
    var nav = el("nav", "v2-nav"); nav.setAttribute("aria-label", "Sections");
    var w = el("div", "wrap"); var ul = el("ul");
    items.forEach(function (it) { ul.appendChild(el("li", null, "<a href='#" + it[0] + "' data-t='" + it[0] + "'>" + it[1] + "</a>")); });
    w.appendChild(ul);
    if (OPTS.viewSwitch) { var a = el("a", "v2-switch", "Classic view"); a.href = viewHref(true); a.title = "See the previous design"; w.appendChild(a); }
    nav.appendChild(w);
    main.parentNode.insertBefore(nav, main);
    var links = [].slice.call(nav.querySelectorAll("a[data-t]")), ticking = false;
    function onScroll() {
      ticking = false;
      var cur = links[0], y = 110;
      links.forEach(function (l) { var t = $(l.getAttribute("data-t")); if (t && t.getBoundingClientRect().top <= y) cur = l; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = links[links.length - 1];
      links.forEach(function (l) { l.classList.toggle("on", l === cur); if (l === cur) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current"); });
      if (cur) { var li = cur.parentNode, u = li.parentNode; if (u.scrollWidth > u.clientWidth) u.scrollLeft = li.offsetLeft - u.clientWidth / 2 + li.offsetWidth / 2; }
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  /* =====================================================================================
     11. WIRING IT ALL TOGETHER
     ===================================================================================== */
  function enhance() {
    tip = $("tip");
    if (OPTS.stateDrawer) safe("drawer", buildDrawer);
    if (OPTS.honeycomb) safe("honeycomb", honeycomb);
    safe("tiles", wireTiles);
    // Stage panels: wrap the CURRENT maps in a dark panel (labelled "Current") so they sit under the new seat charts.
    [["Senate", "senate-map", "legend-senate", "State map"], ["House", "house-grid", "legend-house", "District map"]].forEach(function (d) {
      safe("stage " + d[0], function () {
        var sec = sectionByTitle(d[0]), m = $(d[1]), lg = $(d[2]); if (!sec || !m) return;
        var st = stage(d[3], "Current", d[0] === "House" ? "One hexagon per district, grouped by state. Hover for details; click a state label or hexagon for the state panel." : "Click a state for the state panel.");
        m.parentNode.insertBefore(st, m); st.appendChild(m); if (lg) st.appendChild(lg);
      });
    });
    if (OPTS.hemicycle) { safe("house hemicycle", buildHouseHemicycle); safe("senate hemicycle", buildSenateHemicycle); }
    if (OPTS.betterDistributions) safe("distributions", betterDistributions);
    if (OPTS.decisiveRaces) safe("decisive", buildDecisive);
    if (OPTS.betterTable) safe("table", buildTable);
    if (OPTS.stickyNav) safe("nav", buildNav);
    // keep the tooltip from lingering when the page scrolls
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  if (OPTS.flipClock) safe("flip clock", buildFlipClock);

  var contentReady = new Promise(function (resolve) {
    var c = $("content");
    if (!c) return;
    if (!c.hidden) { resolve(); return; }
    var mo = new MutationObserver(function () { if (!c.hidden) { mo.disconnect(); resolve(); } });
    mo.observe(c, { attributes: true, attributeFilter: ["hidden"] });
  });
  Promise.all([loadModel(), contentReady]).then(function (res) {
    M = res[0]; if (!M) return;
    enhance();
  }).catch(function (e) { console.error("custom.js: could not start the redesign layer", e); });
})();
