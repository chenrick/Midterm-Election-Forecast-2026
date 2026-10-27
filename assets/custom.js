/* =====================================================================================
   REDESIGN (v2) SCRIPT  -  assets/custom.js
   Editorial-light styling is supplied by the final visual-only layer in custom.css.
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
    compareLabels: false,      // small NEW / CURRENT tags on panels (off: you are keeping all the visuals)
    hideMapNotes: true,        // hide the one-line notes under the large "House" and "Senate" titles
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
    crossHighlight: true,
    /* ---- light layer (v2l): all of these only run when <html class="v2l"> is set (off with ?light=0) ---- */
    aboutTop: true,   // move the "About this model" blurb to the very top of the page (false = leave it at the bottom)
    headline: "Rick Chen - PLSC 2219|Election Forecast",   // text of the big title ("|" marks the line break; set to "" to keep the name from config.js)
    geoMaps: true,             // real district (House) and state (Senate) shapes, with the hexagon / tile maps tucked below
    flips: true,               // "Seats most likely to flip" panel
    shareButtons: true,        // Copy link + Print in the nav bar
    tableCsv: true,            // "Download CSV" under the races table
    footerData: true,          // data download links + map credit in the footer
    deepLinks: true            // #state=TX opens that state's panel
  };
  var POLLS_CLOSE = Date.UTC(2026, 10, 3, 23, 0, 0);   // Tue Nov 3, 2026, 6:00 pm Eastern (EST = UTC-5)

  var root = document.documentElement;
  var IS_V2 = root.classList.contains("v2");
  var IS_R = root.classList.contains("v2r");   // refined visual layer (add ?refined=0 to the address to turn it off)
  var IS_L = root.classList.contains("v2l");   // light layer: lighter theme, geographic maps, extra panels (add ?light=0 to turn it off)
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
               useP: A.useP, useI: A.useI, S: A.S, demNotUp: A.demNotUp, repNotUp: repNotUp, hasMoney: !!res[4], hasSims: !!res[3] };
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
  function downloadText(name, text, type) {
    try {
      var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: (type || "text/plain") + ";charset=utf-8" }));
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
    } catch (e) { console.error("download failed", e); }
  }
  function toast(msg) {
    var t = el("div", "v2-toast", esc(msg)); t.setAttribute("role", "status"); document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("on"); });
    setTimeout(function () { t.classList.remove("on"); setTimeout(function () { t.remove(); }, 300); }, 1800);
  }
  function copyText(text) {
    var done = function () { toast("Link copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); }); }
    else { legacyCopy(text); done(); }
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove();
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
  function placeTipAt(x, y) {   // next to the pointer (used by the geographic maps)
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 16), window.innerWidth - tw - 8);
    var top = y - th - 14; if (top < 64) top = Math.min(y + 20, window.innerHeight - th - 8);
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }
  function showTip(target, r, ev) {
    tip.innerHTML = tipHTML(r); tip.hidden = false;
    if (ev && ev.clientX != null && ev.type === "mouseenter") placeTipAt(ev.clientX, ev.clientY); else placeTip(target);
  }
  function hideTip() { if (tip) tip.hidden = true; }

  var ovHooks = [], selHooks = [];   // geographic maps register here (outline of the hovered / selected race or state)
  function hl(r, on) {
    var list = reg[r.race_id]; if (!list) return;
    for (var i = 0; i < list.length; i++) list[i].classList.toggle("hl", on);
    for (i = 0; i < ovHooks.length; i++) ovHooks[i](r, on);
  }
  /* Wire one element to one race: tooltip, cross-highlight, click / Enter opens the state panel. */
  function wire(target, r, o) {
    o = o || {};
    (reg[r.race_id] = reg[r.race_id] || []).push(target);
    var over = function (ev) {
      if (OPTS.richTooltips || o.force) showTip(target, r, o.pointer ? ev : null);
      if (OPTS.crossHighlight) hl(r, true);
    };
    var out = function () { hideTip(); if (OPTS.crossHighlight) hl(r, false); };
    target.addEventListener("mouseenter", over); target.addEventListener("focus", over);
    if (o.pointer) target.addEventListener("mousemove", function (ev) { if (!tip.hidden) placeTipAt(ev.clientX, ev.clientY); });
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
    var cx = W / 2, cy = IS_R ? H - 34 : H - 22, R = IS_R ? Math.min(W / 2 - 46, H - 96) : Math.min(W / 2 - 16, H - 52);
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
    // opts: seats[], W, H, kicker, big (html), d/r (numbers, refined lockup), sub, sub2, majLabel, aria
    var L = layoutHemi(opts.seats.length, opts.W, opts.H, opts.a), id = "hx" + (++hatchN), n = opts.seats.length;
    var vbH = Math.max(opts.H, Math.ceil(L.cy + L.dot + 33));   // always tall enough for the baseline labels under the arc
    var s = "<svg viewBox='0 0 " + opts.W + " " + vbH + "' role='img' aria-label='" + esc(opts.aria) + "'>";
    s += "<defs><pattern id='" + id + "' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><line x1='0' y1='0' x2='0' y2='5' stroke='rgba(255,255,255,.55)' stroke-width='1.7'/></pattern>";
    if (IS_R && !IS_L) s += "<radialGradient id='" + id + "s' cx='34%' cy='28%' r='80%'><stop offset='0' stop-color='#fff' stop-opacity='.34'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.3'/></radialGradient>";
    s += "</defs>";
    var cx = L.cx, cy = L.cy, gr = L.R + L.dot + 13, gi = L.inner - L.dot - 13, i, t;
    if (IS_R) {   // guide rings, baseline and seat-number ticks behind the dots
      s += "<g class='guides'>";
      s += "<path class='gd' d='M" + (cx - gr).toFixed(1) + "," + cy + " A" + gr.toFixed(1) + "," + gr.toFixed(1) + " 0 0 1 " + (cx + gr).toFixed(1) + "," + cy + "'/>";
      if (gi > 30) s += "<path class='gd' d='M" + (cx - gi).toFixed(1) + "," + cy + " A" + gi.toFixed(1) + "," + gi.toFixed(1) + " 0 0 1 " + (cx + gi).toFixed(1) + "," + cy + "'/>";
      s += "<line class='gd' x1='" + (cx - gr).toFixed(1) + "' x2='" + (cx + gr).toFixed(1) + "' y1='" + (cy + L.dot + 12).toFixed(1) + "' y2='" + (cy + L.dot + 12).toFixed(1) + "'/>";
      var step = n > 200 ? 100 : 25;
      for (t = step; t < n; t += step) {
        var pt = L.pts[t - 1], an = pt.ang, c = Math.cos(an), sn = Math.sin(an);
        if (Math.abs(an - Math.PI / 2) < 0.14) continue;   // leave the apex to the majority label
        s += "<line class='gd tk' x1='" + (cx + gr * c).toFixed(1) + "' y1='" + (cy - gr * sn).toFixed(1) + "' x2='" + (cx + (gr + 7) * c).toFixed(1) + "' y2='" + (cy - (gr + 7) * sn).toFixed(1) + "'/>";
        s += "<text class='tklab fit' x='" + (cx + (gr + 13) * c).toFixed(1) + "' y='" + (cy - (gr + 13) * sn + 3).toFixed(1) + "' text-anchor='" + (c < -0.25 ? "end" : (c > 0.25 ? "start" : "middle")) + "'>" + t + "</text>";
      }
      s += "<text class='tklab fit' x='" + (cx - gr).toFixed(1) + "' y='" + (cy + L.dot + 27) + "' text-anchor='start'>Most Democratic</text>";
      s += "<text class='tklab fit' x='" + (cx + gr).toFixed(1) + "' y='" + (cy + L.dot + 27) + "' text-anchor='end'>Most Republican</text>";
      s += "</g>";
    }
    opts.seats.forEach(function (seat, i) {
      var p = L.pts[i], cls;
      if (seat.hold) cls = "d hold " + (seat.hold === "d" ? "f-safe-d" : "f-safe-r");
      else { cls = "d f-" + (seat.r.rating ? seat.r.rating.key : "toss"); }
      s += "<circle class='" + cls + "' data-i='" + i + "' cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + L.dot.toFixed(2) + "'/>";
      if (IS_R && !IS_L && !seat.hold) s += "<circle class='sh' cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + L.dot.toFixed(2) + "' fill='url(#" + id + "s)' pointer-events='none'/>";
      if (seat.r && isFixed(seat.r)) s += "<circle cx='" + p.x.toFixed(1) + "' cy='" + p.y.toFixed(1) + "' r='" + L.dot.toFixed(2) + "' fill='url(#" + id + ")' pointer-events='none'/>";
    });
    var top = IS_R ? cy - gr - 20 : L.cy - L.R - L.dot - 6;
    s += "<line class='maj' x1='" + cx + "' x2='" + cx + "' y1='" + (top + 6) + "' y2='" + (cy - L.inner + L.dot * 0.4).toFixed(1) + "'/>";
    s += "<text class='majlab fit' x='" + cx + "' y='" + (top - 4) + "' text-anchor='middle'>" + esc(opts.majLabel) + "</text>";
    var by = cy - L.inner * 0.30;
    if (!IS_L) s += "<text class='hc-kick' x='" + cx + "' y='" + (cy - L.inner * (IS_R ? 0.68 : 0.74)).toFixed(1) + "' text-anchor='middle'>" + esc(opts.kicker) + "</text>";
    if (IS_R && opts.d != null) {
      var off = Math.min(L.inner * 0.5, 78);
      // size the two big numbers so their outer top corners stay inside the innermost ring of dots
      var ri = L.inner - L.dot - 26, dig = Math.max(String(opts.d).length, String(opts.r).length), fs = 58;
      for (; fs > 24; fs--) {
        var hw = dig * 0.64 * fs / 2, dyTop = L.inner * 0.30 + 0.72 * fs;
        if (Math.sqrt((off + hw) * (off + hw) + dyTop * dyTop) <= ri) break;
      }
      var fsty = " style='font-size:" + fs + "px'";
      s += "<text class='hc-big hc-d'" + fsty + " x='" + (cx - off).toFixed(1) + "' y='" + by.toFixed(1) + "' text-anchor='middle'>" + opts.d + "</text>";
      s += "<text class='hc-dash' x='" + cx + "' y='" + (by - 8).toFixed(1) + "' text-anchor='middle'>&#8212;</text>";
      s += "<text class='hc-big hc-r'" + fsty + " x='" + (cx + off).toFixed(1) + "' y='" + by.toFixed(1) + "' text-anchor='middle'>" + opts.r + "</text>";
      s += "<text class='hc-lab hc-ld' x='" + (cx - off).toFixed(1) + "' y='" + (by + 20).toFixed(1) + "' data-by='" + by.toFixed(1) + "' text-anchor='middle'>Democratic</text>";
      s += "<text class='hc-lab hc-lr' x='" + (cx + off).toFixed(1) + "' y='" + (by + 20).toFixed(1) + "' data-by='" + by.toFixed(1) + "' text-anchor='middle'>Republican</text>";
      (opts.sub2 || []).forEach(function (line, k) {
        s += "<text class='hc-sub' x='" + cx + "' y='" + (by + 46 + k * 17).toFixed(1) + "' text-anchor='middle'>" + esc(line) + "</text>";
      });
    } else {
      s += "<text class='hc-big' x='" + cx + "' y='" + by.toFixed(1) + "' text-anchor='middle'>" + opts.big + "</text>";
      s += "<text class='hc-sub' x='" + cx + "' y='" + (by + 24).toFixed(1) + "' text-anchor='middle'>" + esc(opts.sub) + "</text>";
      (opts.sub2 || []).forEach(function (line, k) {
        s += "<text class='hc-sub' x='" + cx + "' y='" + (by + 44 + k * 17).toFixed(1) + "' text-anchor='middle'>" + esc(line) + "</text>";
      });
    }
    s += "</svg>";
    var wrap = el("div", "hemi", s);
    wrap.hemiFit = true;
    if (opts.capD != null) wrap.appendChild(el("p", "hemi-cap", "<span class='hc-pl'>" + partyLine(opts.capD, opts.capR) + "</span>" + (opts.cap ? "<span class='hc-win'>" + esc(opts.cap) + "</span>" : ""))); else if (opts.cap) wrap.appendChild(el("p", "hemi-cap", esc(opts.cap)));   // shown instead of the small centre text on phones
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
    var sub2 = M.S ? ["Democrats win a majority", "in " + pct(pMajority(M.S.h, HOUSE_MAJ)) + " of simulations"] : [];
    var st = stage("Seat chart", "New", "Each dot is one of the 435 districts, ordered from most Democratic (left) to most Republican (right). The dashed line marks the 218-seat majority.");
    st.id = "v2-house-seats";
    st.appendChild(hemicycle({
      seats: rs.map(function (r) { return { r: r }; }), W: IS_R ? 880 : 820, H: IS_R ? 500 : 450, d: hD, r: hR,
      kicker: "PROJECTED SEATS", big: "<tspan class='hc-d'>" + hD + "</tspan><tspan fill='#98a0b0'> &#8211; </tspan><tspan class='hc-r'>" + hR + "</tspan>",
      sub: "Democratic &#8211; Republican".replace(/&#8211;/, "–"), sub2: sub2, majLabel: "218 = MAJORITY", capD: hD, capR: hR, cap: sub2.length ? sub2[0] + "." : "",
      aria: "House seat chart. Projected Democratic " + hD + ", Republican " + hR + "."
    }));
    st.appendChild(el("div", "legend", ratingLegend()));
    var head = sec.querySelector(".block-head");
    head.parentNode.insertBefore(st, head.nextSibling);
    fitLabels(st); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLabels(st); });
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
      seats: seats, W: IS_R ? 780 : 700, H: IS_R ? 470 : 410, a: 0.5, d: sD, r: sR,
      kicker: "PROJECTED SEATS", big: "<tspan class='hc-d'>" + sD + "</tspan><tspan fill='#98a0b0'> &#8211; </tspan><tspan class='hc-r'>" + sR + "</tspan>",
      sub: "Democratic – Republican", sub2: sub2, majLabel: "51 FOR DEMOCRATIC CONTROL", capD: sD, capR: sR, cap: sub2.length ? sub2.join(" ") + "." : "",
      aria: "Senate seat chart. Projected Democratic " + sD + ", Republican " + sR + "."
    }));
    st.appendChild(el("div", "legend", ratingLegend("<span class='key'><i class='sw r-safe-d' style='opacity:.45'></i>Faded: not up in 2026</span>")));
    if (OPTS.pathToControl) st.appendChild(pathToControl(contested));
    var head = sec.querySelector(".block-head");
    head.parentNode.insertBefore(st, head.nextSibling);
    fitLabels(st); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLabels(st); });
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
    var span = hi - lo + 1, W = 520, H = 200, padL = 8, padR = 8, padT = 58, padB = 84;
    var maxC = 0; for (v = lo; v <= hi; v++) maxC = Math.max(maxC, counts[v] || 0);
    var bw = (W - padL - padR) / span, gap = bw > 4 ? 1.6 : (bw > 2 ? 0.8 : 0);
    var pm = pMajority(xs, maj), p10 = quant(xs, 0.1), p50 = quant(xs, 0.5), p90 = quant(xs, 0.9);
    var cum = {}, run = 0; for (v = hi; v >= lo; v--) { run += counts[v] || 0; cum[v] = run / n; }
    var X = function (val) { return padL + (val - lo + 0.5) * bw; };
    var mx = padL + (maj - lo) * bw;
    var s = "<svg viewBox='0 0 " + W + " " + (padT + H + padB) + "' role='img' aria-label='" + lab + " seat distribution: Democrats win " + what + " in " + pct(pm) + " of simulations. Median " + Math.round(p50) + " seats, 80% range " + Math.round(p10) + " to " + Math.round(p90) + ".'>";
    var gid = "hg" + (++hatchN);
    if (IS_R && !IS_L) s += "<defs><linearGradient id='" + gid + "d' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:var(--likely-d)'/><stop offset='1' style='stop-color:var(--safe-d)'/></linearGradient><linearGradient id='" + gid + "r' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:var(--likely-r)'/><stop offset='1' style='stop-color:var(--safe-r)'/></linearGradient></defs>";
    s += "<rect class='tint-r' x='" + padL + "' y='" + padT + "' width='" + (mx - padL) + "' height='" + H + "'/><rect class='tint-d' x='" + mx + "' y='" + padT + "' width='" + (W - padR - mx) + "' height='" + H + "'/>";
    [0.25, 0.5, 0.75].forEach(function (f) { var y = padT + H - H * f; s += "<line class='gridl' x1='" + padL + "' x2='" + (W - padR) + "' y1='" + y + "' y2='" + y + "'/>"; });
    for (v = lo; v <= hi; v++) {
      var c = counts[v] || 0; if (!c) continue;
      var h = Math.max(1, (H - 4) * c / maxC), x = padL + (v - lo) * bw, y = padT + H - h;
      s += "<rect class='b' x='" + (x + gap / 2).toFixed(2) + "' y='" + y.toFixed(2) + "' width='" + Math.max(0.6, bw - gap).toFixed(2) + "' height='" + h.toFixed(2) +
        "' rx='" + Math.min(1.8, (bw - gap) / 2).toFixed(2) + "' fill='" + (IS_R && !IS_L ? "url(#" + gid + (v >= maj ? "d" : "r") + ")" : (v >= maj ? "var(--likely-d)" : "var(--likely-r)")) + "' data-v='" + v + "' data-c='" + c + "'/>";
    }
    s += "<line class='base' x1='" + padL + "' x2='" + (W - padR) + "' y1='" + (padT + H) + "' y2='" + (padT + H) + "'/>";
    // Labels are placed so they always stay inside the chart: side labels sit in the two top corners,
    // and the majority / median / bracket labels are clamped to the plot (a small post-pass, fitLabels, re-checks real text widths).
    var tw = function (str, px, ls) { return str.length * (px * 0.56 + (ls || 0)); };
    var clampC = function (c, w) { return Math.min(Math.max(c, padL + w / 2), W - padR - w / 2); };
    var mlab = "Majority: " + maj + " seats", mcx = clampC(mx, tw(mlab, 11));
    s += "<line class='maj' x1='" + mx + "' x2='" + mx + "' y1='" + (padT - 12) + "' y2='" + (padT + H) + "'/>";
    s += "<text class='sidelab r fit' x='" + padL + "' y='" + (padT - 38) + "' text-anchor='start'>Republicans " + pct(1 - pm) + "</text>";
    s += "<text class='sidelab d fit' x='" + (W - padR) + "' y='" + (padT - 38) + "' text-anchor='end'>Democrats " + pct(pm) + "</text>";
    s += "<text class='majlab fit' x='" + mcx.toFixed(1) + "' y='" + (padT - 17) + "' text-anchor='middle'>" + mlab + "</text>";
    var step = span > 60 ? 10 : (span > 25 ? 5 : (span > 10 ? 2 : 1));
    s += "<g class='axis'>";
    for (v = Math.ceil(lo / step) * step; v <= hi; v += step) s += "<text x='" + X(v) + "' y='" + (padT + H + 15) + "' text-anchor='middle'>" + v + "</text>";
    s += "</g>";
    var mxm = X(p50);   // median marker
    s += "<polygon class='med' points='" + (mxm - 5) + "," + (padT + H + 24) + " " + (mxm + 5) + "," + (padT + H + 24) + " " + mxm + "," + (padT + H + 17) + "'/>";
    s += "<text class='medlab fit' x='" + clampC(mxm, tw("Median " + Math.round(p50), 11)).toFixed(1) + "' y='" + (padT + H + 36) + "' text-anchor='middle'>Median " + Math.round(p50) + "</text>";
    var bx1 = X(p10), bx2 = X(p90), by = padT + H + 54;
    s += "<path class='brk' d='M" + bx1 + "," + (by - 5) + " V" + by + " H" + bx2 + " V" + (by - 5) + "'/>";
    var blab = "80% of simulations: " + Math.round(p10) + " to " + Math.round(p90) + " seats";
    s += "<text class='brklab fit' x='" + clampC((bx1 + bx2) / 2, tw(blab, 11)).toFixed(1) + "' y='" + (by + 18) + "' text-anchor='middle'>" + blab + "</text>";
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
  /* Re-check every SVG label marked class "fit" against its real rendered width and nudge it back inside the picture. */
  function fitLabels(scope) {
    (scope || document).querySelectorAll("svg").forEach(function (svg) {
      var vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || !vb.width) return;
      svg.querySelectorAll("text.fit").forEach(function (t) {
        t.removeAttribute("transform");
        var b; try { b = t.getBBox(); } catch (e) { return; }
        if (!b.width) return;
        var dx = 0, lo = vb.x + 3, hi = vb.x + vb.width - 3;
        if (b.x < lo) dx = lo - b.x; else if (b.x + b.width > hi) dx = hi - (b.x + b.width);
        if (dx) t.setAttribute("transform", "translate(" + dx.toFixed(1) + ",0)");
      });
    });
  }
  function betterDistributions() {
    var box = $("dist"); if (!box || !M.S) return;
    var wrap = el("div", "dist2"); wrap.id = "dist-v2";
    wrap.appendChild(hist2("House", M.S.h, HOUSE_MAJ, "the House"));
    wrap.appendChild(hist2("Senate", M.S.s, SENATE_MAJ, "the Senate"));
    box.parentNode.insertBefore(wrap, box);
    fitLabels(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitLabels(wrap); });
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
    var lastRows = [];
    var ui = el("div", "v2-table");
    ui.innerHTML =
      "<div class='tctl'><div class='seg' role='group' aria-label='Chamber'>" +
      "<button type='button' data-o='all' class='on'>All</button><button type='button' data-o='house'>House</button><button type='button' data-o='senate'>Senate</button></div>" +
      "<input id='search2' type='search' placeholder='Search state, district or candidate' aria-label='Search races'>" +
      "<span class='tcount' aria-live='polite'></span>" + (IS_L && OPTS.tableCsv ? "<button type='button' class='dl-btn tcsv' title='Download the rows that match the current filters'>Download CSV</button>" : "") + "</div>" +
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
      lastRows = rows;
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
    var csvBtn = ui.querySelector(".tcsv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      var cols = ["race_id", "race", "office", "state", "dem_candidate", "rep_candidate", "holder_party", "pred_dem_share", "p_dem_win", "lo_80", "hi_80", "rating"];
      var q = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var lines = [cols.join(",")].concat(lastRows.map(function (r) {
        return [r.race_id, raceName(r), r.office, r.state, r.dem_candidate, r.rep_candidate, r.incumbent_party, r.share, r.p, r.lo, r.hi, r.rating ? r.rating.label : ""].map(q).join(",");
      }));
      downloadText("races-" + (st.state || st.office) + ".csv", lines.join("\n") + "\n", "text/csv");
    });
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
    if (geoMaps.length) html += "<button type='button' class='dr-btn dr-btn2' data-zoom='" + esc(st) + "'>Zoom the map to " + esc(STATE_NAMES[st] || st) + "</button>";
    drawer.innerHTML = html;
    var zb = drawer.querySelector("[data-zoom]");
    if (zb) zb.addEventListener("click", function () { closeDrawer(); geoZoomTo(st, true); });
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
    selHooks.forEach(function (h) { h(st); });
    setHash(st);
  }
  function setHash(st) {
    if (!IS_L || !OPTS.deepLinks || !window.history || !history.replaceState) return;
    try { history.replaceState(null, "", location.pathname + location.search + (st ? "#state=" + st : "")); } catch (e) {}
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); backdrop.classList.remove("open");
    document.querySelectorAll("#house-grid .srow.sel").forEach(function (x) { x.classList.remove("sel"); });
    selHooks.forEach(function (h) { h(null); });
    if (/^#state=/.test(location.hash)) setHash(null);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); } }
  }

  /* =====================================================================================
     10. STICKY NAV
     ===================================================================================== */
  function buildNav() {
    var main = document.querySelector("main"); if (!main) return;
    var content = $("content"), items = [];
    var abt = $("method-block");
    if (IS_L && OPTS.aboutTop && abt) items.push(["method-block", "About"]);
    var tl = content.querySelector(".topline"); if (tl) { tl.id = tl.id || "overview"; items.push(["overview", "Overview"]); }
    [["Senate", "senate", "Senate"], ["House", "house", "House"], ["Seat distribution", "distribution", "Distribution"]].forEach(function (d) {
      var s = sectionByTitle(d[0]); if (s) { s.id = s.id || d[1]; items.push([s.id, d[2]]); }
    });
    var dec = $("v2-decisive"); if (dec) items.push(["v2-decisive", "Decisive races"]);
    var fl = $("v2-flips"); if (fl) items.push(["v2-flips", "Likely flips"]);
    var cl = sectionByTitle("Closest races"); if (cl) { cl.id = cl.id || "races"; items.push([cl.id, "Closest races"]); }
    var me = $("method-block"); if (me && !(IS_L && OPTS.aboutTop)) items.push(["method-block", "Method"]);
    var nav = el("nav", "v2-nav"); nav.setAttribute("aria-label", "Sections");
    var w = el("div", "wrap"); var ul = el("ul");
    items.forEach(function (it) { ul.appendChild(el("li", null, "<a href='#" + it[0] + "' data-t='" + it[0] + "'>" + it[1] + "</a>")); });
    w.appendChild(ul);
    if (IS_L && OPTS.shareButtons) {
      var tools = el("div", "v2-tools");
      var cp = el("button", "v2-tool", "Copy link"); cp.type = "button"; cp.title = "Copy a link to this page";
      cp.addEventListener("click", function () { copyText(location.href); });
      var pr = el("button", "v2-tool", "Print"); pr.type = "button"; pr.title = "Print or save as PDF";
      pr.addEventListener("click", function () { window.print(); });
      tools.appendChild(cp); tools.appendChild(pr); w.appendChild(tools);
    }
    if (OPTS.viewSwitch && !IS_L) { var a = el("a", "v2-switch", "Classic view"); a.href = viewHref(true); a.title = "See the previous design"; w.appendChild(a); }
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
     10b. SEATS MOST LIKELY TO FLIP (light layer)
     ===================================================================================== */
  function buildFlips() {
    var closest = sectionByTitle("Closest races"); if (!closest) return;
    var holder = function (r) { return r.incumbent_party === "D" || r.incumbent_party === "R" ? r.incumbent_party : null; };
    var winner = function (r) { return r.share == null ? null : (r.share > 0.5 ? "D" : (r.share < 0.5 ? "R" : null)); };
    var score = function (r) {   // higher = more likely to change hands
      var h = holder(r); if (!h || r.share == null) return null;
      var dv = M.useP ? r.p : r.share;
      return h === "D" ? 0.5 - dv : dv - 0.5;
    };
    var sec = el("section", "block"); sec.id = "v2-flips";
    sec.innerHTML = "<div class='block-head'><h2>Seats most likely to flip</h2><p class='note'>Seats the forecast expects to change party, and the seats closest to doing so. A seat counts as held by the party of its current holder (or the holder it replaces, if open).</p></div><div class='decide flips'></div>";
    var grid = sec.querySelector(".flips");
    [["house", "House"], ["senate", "Senate"]].forEach(function (c) {
      var rs = (c[0] === "house" ? M.house : M.senate).filter(function (r) { return score(r) != null; });
      var toD = rs.filter(function (r) { return holder(r) === "R" && winner(r) === "D"; }).length;
      var toR = rs.filter(function (r) { return holder(r) === "D" && winner(r) === "R"; }).length;
      var net = toD - toR;
      var list = rs.slice().sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
      var card = el("div", "card vcard flipcard");
      var head = "<div class='vcard-head'><h3>" + c[1] + "</h3></div>";
      var kp = "<div class='kpis'><div class='kpi d'><b>" + toD + "</b><span>Projected R to D</span></div>" +
        "<div class='kpi r'><b>" + toR + "</b><span>Projected D to R</span></div>" +
        "<div class='kpi'><b>" + (net === 0 ? "even" : (net > 0 ? "D +" : "R +") + Math.abs(net)) + "</b><span>Net change</span></div></div>";
      var rows = list.map(function (r) {
        var h = holder(r), w = winner(r), flipped = w && w !== h;
        var chance = M.useP ? (h === "D" ? 1 - r.p : r.p) : null;
        var vl = chance != null ? pct(chance) : marginText(r);
        var bar = chance != null ? "<span class='tr'><b style='width:" + Math.max(1.5, 100 * chance).toFixed(1) + "%;background:" + (h === "D" ? "var(--safe-r)" : "var(--safe-d)") + "'></b></span>" : "<span class='tr tr0'></span>";
        return "<div class='flip-row" + (flipped ? " is-flip" : "") + "' tabindex='0' role='button' data-rid='" + esc(r.race_id) + "' aria-label='" + esc(raceName(r)) + ", " + h + " seat, " + (chance != null ? pct(chance) + " chance to flip" : marginText(r)) + (flipped ? ", projected flip" : "") + "'>" +
          "<span class='nm'>" + esc(c[0] === "senate" ? STATE_NAMES[r.state] + (r.special === "1" ? " (sp.)" : "") : raceName(r)) + "</span>" +
          "<span class='hd'><i class='r-" + (h === "D" ? "safe-d" : "safe-r") + "'></i>" + h + (flipped ? " <em>&rarr; " + w + "</em>" : " hold") + "</span>" + bar +
          "<span class='vl num'>" + vl + "</span></div>";
      }).join("");
      card.innerHTML = head + kp + "<div class='flip-cap'><span>Seat</span><span>Holder</span><span>" + (M.useP ? "Flip chance" : "Margin") + "</span><span></span></div><div class='flip-list'>" +
        (rows || "<p class='note'>No seats with a known current holder.</p>") + "</div>";
      card.querySelectorAll(".flip-row").forEach(function (row) { wire(row, M.byId[row.getAttribute("data-rid")], { keys: true, force: true }); });
      grid.appendChild(card);
    });
    closest.parentNode.insertBefore(sec, closest);
  }

  /* =====================================================================================
     12. GEOGRAPHIC MAPS  (House: 435 districts; Senate: state shapes)
     Boundaries: amCharts 5 geodata, 120th Congress set (assets/geo-us.json, projected + simplified).
     ===================================================================================== */
  var geo = null, geoMaps = [];
  var OFFSHORE = { VT: [838, 114], NH: [866, 93], MA: [952, 172], RI: [956, 198], CT: [944, 222], NJ: [917, 247], DE: [908, 273], MD: [901, 297] };
  // Label anchor per state, picked so the two-line label box sits well inside the state shape (solved offline from geo-us.json; overrides centroid + LAB_NUDGE).
  var LAB_POS = {"FL":[783.2,516.4],"UT":[227.6,272.9],"TN":[673.5,362.3],"AL":[672.6,432.2],"OH":[720.9,257],"TX":[435.9,468.2],"CA":[73.9,296],"LA":[563.8,478.2],"NC":[817.9,350.7],"AK":[106.3,510.5],"AR":[561.6,390.1],"AZ":[208.9,383.5],"CO":[331.4,290],"IA":[539.9,228.4],"ID":[191.6,163.5],"IL":[612,267.3],"IN":[667.4,270.2],"KS":[456.1,309.4],"KY":[702.3,316.1],"ME":[920.9,91.9],"MI":[691.1,201.9],"MN":[518.6,140.9],"MO":[559.3,315.9],"MS":[616.9,434.7],"MT":[286.8,100.6],"ND":[429,104],"NE":[434,239.9],"NM":[311.5,392.4],"NV":[140,243.9],"OK":[471.6,378.2],"OR":[102.4,136],"PA":[805.8,225.6],"SC":[784.2,394.5],"SD":[429.7,172.3],"VA":[810.3,300.8],"WA":[130.2,58.9],"WI":[595.7,161.8],"WV":[762.7,288.7],"WY":[307.7,195.3],"GA":[737.9,428],"NY":[843.9,166.6]};
  var LAB_NUDGE = { MI: [14, 24], FL: [24, -4], LA: [-12, 0], ID: [0, 18], MN: [-4, 10], KY: [12, 2], WV: [-2, 4], NY: [4, 6], ME: [-2, 12], VA: [8, 2], CA: [-6, 0], HI: [0, 0], WA: [0, 0] };
  var LIGHT_TEXT = { "safe-d": 1, "likely-d": 1, "safe-r": 1, "likely-r": 1 };

  function loadGeo() {
    return fetch("assets/geo-us.json").then(function (r) { if (!r.ok) throw new Error("geo-us.json " + r.status); return r.json(); });
  }
  function shortVal(r) { return M.useP ? pct(r.p) : marginText(r).replace(" ", ""); }

  function makeZoom(svg) {
    var W = geo.w, H = geo.h, vb = [0, 0, W, H], raf = 0;
    function set(v) {
      vb = v; svg.setAttribute("viewBox", v.map(function (n) { return +n.toFixed(2); }).join(" "));
      var z = W / v[2]; svg.classList.toggle("zoomed", z > 1.03); svg.style.setProperty("--zs", z.toFixed(3));
    }
    function clamp(v) {
      var w = Math.min(W, Math.max(W / 14, v[2])), h = w * H / W;
      return [Math.min(Math.max(0, v[0]), W - w), Math.min(Math.max(0, v[1]), H - h), w, h];
    }
    function go(v, instant) {
      v = clamp(v); cancelAnimationFrame(raf);
      if (instant || reduceMotion) { set(v); return; }
      var a = vb.slice(), t0 = performance.now(), D = 420;
      (function step(t) {
        var k = Math.min(1, (t - t0) / D); k = 1 - Math.pow(1 - k, 3);
        set(a.map(function (x, i) { return x + (v[i] - x) * k; }));
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }
    return {
      box: function (bb) {
        var w = Math.max(bb.width * 1.3, bb.height * 1.3 * W / H, 96), h = w * H / W;
        go([bb.x + bb.width / 2 - w / 2, bb.y + bb.height / 2 - h / 2, w, h]);
      },
      reset: function () { go([0, 0, W, H]); },
      step: function (f, cx, cy) {
        cx = cx == null ? vb[0] + vb[2] / 2 : cx; cy = cy == null ? vb[1] + vb[3] / 2 : cy;
        var nw = vb[2] / f, nh = nw * H / W;
        go([cx - (cx - vb[0]) / f, cy - (cy - vb[1]) / f, nw, nh], f !== 1 && false);
      },
      pan: function (dx, dy) { cancelAnimationFrame(raf); set(clamp([vb[0] - dx, vb[1] - dy, vb[2], vb[3]])); },
      view: function () { return vb; }
    };
  }

  function buildGeoMap(kind) {
    var isH = kind === "house", sec = sectionByTitle(isH ? "House" : "Senate"); if (!sec) return;
    var old = (isH ? $("house-grid") : $("senate-map")); old = old && old.closest(".stage");
    var st = stage(isH ? "House map: all 435 districts" : "Senate map by state", "New", null);
    st.classList.add("geo-stage"); st.id = "v2-" + kind + "-map";
    var W = geo.w, H = geo.h, id = "gm" + (++hatchN), defs = "", fills = "", hatch = "", outs = "", labs = "", leaders = "";
    var odById = {}, stateOfPath = {};
    var aria = isH ? "Map of the 435 House districts, colored by forecast rating" : "Map of the states, colored by Senate forecast rating";

    function rcls(r) { return r && r.rating ? "f-" + r.rating.key : "f-none"; }
    if (isH) {
      Object.keys(geo.d).forEach(function (key) {
        var r = M.byName[key], d = geo.d[key];
        fills += "<path class='gp " + rcls(r) + "' " + (r ? "data-r='" + esc(r.race_id) + "' " : "") + "data-s='" + key.slice(0, 2) + "' d='" + d + "'/>";
        if (r) { odById[r.race_id] = d; if (isFixed(r)) hatch += "<path class='gh' d='" + d + "' fill='url(#" + id + "h)'/>"; }
      });
    } else {
      Object.keys(geo.s).forEach(function (stt) {
        var d = geo.s[stt], b = M.byState[stt], rs = ((b && b.senate) || []).slice().sort(function (x, y) { return (x.special === "1") - (y.special === "1"); });
        if (!rs.length) { fills += "<path class='gp f-none notup' data-s='" + stt + "' d='" + d + "'/>"; return; }
        fills += "<path class='gp " + rcls(rs[0]) + "' data-r='" + esc(rs[0].race_id) + "' data-s='" + stt + "' d='" + d + "'/>";
        odById[rs[0].race_id] = d;
        if (isFixed(rs[0])) hatch += "<path class='gh' d='" + d + "' fill='url(#" + id + "h)'/>";
        if (rs[1]) {   // two races in one state (a special election): the second takes the lower-right half
          var c = geo.cen[stt], pts = (c[0] + 400) + "," + (c[1] - 400) + " " + (c[0] + 400) + "," + (c[1] + 400) + " " + (c[0] - 400) + "," + (c[1] + 400);
          defs += "<clipPath id='" + id + "c" + stt + "'><path d='" + d + "'/></clipPath>";
          fills += "<polygon class='gp " + rcls(rs[1]) + " half' data-r='" + esc(rs[1].race_id) + "' data-s='" + stt + "' clip-path='url(#" + id + "c" + stt + ")' points='" + pts + "'/>";
          odById[rs[1].race_id] = d;
          if (isFixed(rs[1])) hatch += "<polygon class='gh' clip-path='url(#" + id + "c" + stt + ")' points='" + pts + "' fill='url(#" + id + "h)'/>";
        }
      });
    }
    Object.keys(geo.s).forEach(function (stt) { outs += "<path class='so' data-s='" + stt + "' d='" + geo.s[stt] + "'/>"; });

    Object.keys(geo.cen).forEach(function (stt) {
      var c = geo.cen[stt].slice(), nd = LAB_NUDGE[stt], off = OFFSHORE[stt], b = M.byState[stt], rs = b ? (isH ? b.house : b.senate) : [];
      if (isH && !rs.length) return;
      if (LAB_POS[stt] && !off) c = LAB_POS[stt].slice(); else if (nd) { c[0] += nd[0]; c[1] += nd[1]; }
      var x = c[0], y = c[1], cls = "lab", sub = "";
      if (off) { leaders += "<line class='ldr' x1='" + geo.cen[stt][0] + "' y1='" + geo.cen[stt][1] + "' x2='" + (off[0] - (off[0] > geo.cen[stt][0] ? 7 : -7)) + "' y2='" + off[1] + "'/>"; x = off[0]; y = off[1]; cls += " ext"; }
      if (!isH) {
        var r0 = rs.slice().sort(function (p, q) { return (p.special === "1") - (q.special === "1"); });
        if (r0.length) {
          sub = r0.map(shortVal).join(" · ");
          cls += LIGHT_TEXT[r0[0].rating && r0[0].rating.key] && !off ? " lt" : " dk";
        } else cls += " mu";
      } else cls += " dk";
      labs += "<g class='" + cls + "' data-s='" + stt + "' transform='translate(" + x.toFixed(1) + "," + y.toFixed(1) + ")'><text class='la' text-anchor='middle' y='" + (sub ? -1 : 3.5) + "'>" + stt + "</text>" +
        (sub ? "<text class='lm num' text-anchor='middle' y='9.5'>" + sub + "</text>" : "") + "</g>";
    });

    var svg = "<svg class='geo geo-" + kind + (isH ? "" : " show-lab") + "' viewBox='0 0 " + W + " " + H + "' role='group' aria-label='" + aria + "' xmlns='http://www.w3.org/2000/svg'>" +
      "<defs><pattern id='" + id + "h' width='5' height='5' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><line x1='0' y1='0' x2='0' y2='5' class='hatch-ln'/></pattern>" + defs + "</defs>" +
      "<g class='g-fill'>" + fills + "</g><g class='g-hatch'>" + hatch + "</g><g class='g-out'>" + outs + "</g>" +
      "<g class='g-top'><path class='sel' d=''/><path class='ov' d=''/></g><g class='g-lab'>" + leaders + labs + "</g></svg>";

    var opts = ["<option value=''>Jump to a state…</option>"].concat(Object.keys(STATE_NAMES).sort(function (a, b) { return STATE_NAMES[a] < STATE_NAMES[b] ? -1 : 1; }).map(function (a) { return "<option value='" + a + "'>" + STATE_NAMES[a] + "</option>"; })).join("");
    var bar = el("div", "geo-bar", "<label class='geo-sel'><span class='sr'>Jump to a state</span><select>" + opts + "</select></label>" +
      "<div class='geo-zoom' role='group' aria-label='Map zoom'><button type='button' data-z='in' aria-label='Zoom in'>+</button><button type='button' data-z='out' aria-label='Zoom out'>&minus;</button><button type='button' data-z='reset' class='txt'>Reset view</button></div>" +
      "<button type='button' class='geo-tog' aria-pressed='" + (!isH) + "'>" + (isH ? "State labels" : "Labels") + "</button>" +
      "<button type='button' class='geo-open' hidden></button>" +
      "<span class='geo-hint'>Hover for details &middot; click for the state panel</span>");
    var wrap = el("div", "geo-wrap", svg);
    st.appendChild(bar); st.appendChild(wrap);
    st.appendChild(el("div", "legend", ratingLegend()));
    var credit = " Boundaries: <a href='https://www.amcharts.com/' rel='noopener'>amCharts</a> geodata, simplified for the web.";
    st.appendChild(el("p", "geo-foot", isH ? "Districts are the lines in force for 2026 (120th Congress set). Louisiana's new lines are shown as published by the map source and may differ from the final enacted plan." + credit : "State shapes follow the same boundary set." + credit));
    var head = sec.querySelector(".block-head");
    if (old) {
      old.parentNode.insertBefore(st, old);
      var d = el("details", "orig prev-map", "<summary>Previous version: " + (isH ? "hexagon map" : "tile map") + "</summary>");
      old.parentNode.insertBefore(d, old); d.appendChild(old);
    } else head.parentNode.insertBefore(st, head.nextSibling);

    var svgEl = wrap.querySelector("svg"), Z = makeZoom(svgEl), ovP = svgEl.querySelector(".ov"), selP = svgEl.querySelector(".sel");
    var focusSt = null, openBtn = bar.querySelector(".geo-open"), hint = bar.querySelector(".geo-hint"), sel = bar.querySelector("select");

    function setFocus(stt) {
      svgEl.querySelectorAll(".in").forEach(function (p) { p.classList.remove("in"); });
      focusSt = stt; svgEl.classList.toggle("focus", !!stt);
      if (stt) svgEl.querySelectorAll(".gp[data-s='" + stt + "'], .lab[data-s='" + stt + "']").forEach(function (p) { p.classList.add("in"); });
      openBtn.hidden = !stt; hint.hidden = !!stt;
      if (stt) openBtn.textContent = STATE_NAMES[stt] + ": open state panel";
      sel.value = stt || "";
    }
    function zoomState(stt) {
      var p = svgEl.querySelector(".so[data-s='" + stt + "']"); if (!p) return;
      Z.box(p.getBBox()); setFocus(stt);
    }
    var api = { kind: kind, svg: svgEl, wrap: wrap, zoomState: zoomState, el: st };
    geoMaps.push(api);

    // wiring: tooltips, click -> state panel, outline of the hovered race
    svgEl.querySelectorAll(".gp").forEach(function (p) {
      var rid = p.getAttribute("data-r"), stt = p.getAttribute("data-s"), r = rid && M.byId[rid];
      p.setAttribute("role", "button");
      if (r) {
        p.setAttribute("aria-label", raceName(r) + ": " + (isFixed(r) ? fixedText(r) : marginText(r)) + ". Press Enter for the state details.");
        p.tabIndex = isH ? -1 : 0;
        wire(p, r, { keys: true, pointer: true });
      } else {
        var nm = STATE_NAMES[stt] || stt;
        p.setAttribute("aria-label", nm + ": no Senate race in 2026. Press Enter for the state details."); p.tabIndex = isH ? -1 : 0;
        p.addEventListener("mouseenter", function (ev) { tip.innerHTML = "<b>" + esc(nm) + "</b><div class='tsub'>No Senate race in 2026</div>"; tip.hidden = false; placeTipAt(ev.clientX, ev.clientY); });
        p.addEventListener("mousemove", function (ev) { if (!tip.hidden) placeTipAt(ev.clientX, ev.clientY); });
        p.addEventListener("mouseleave", hideTip);
        p.addEventListener("click", function (ev) { hideTip(); openDrawer(stt, null, p); ev.stopPropagation(); });
        p.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDrawer(stt, null, p); } });
      }
    });
    ovHooks.push(function (r, on) { var d = odById[r.race_id]; if (d) ovP.setAttribute("d", on ? d : ""); });
    selHooks.push(function (stt) { selP.setAttribute("d", stt ? geo.s[stt] || "" : ""); svgEl.classList.toggle("has-sel", !!stt); });

    // controls
    sel.addEventListener("change", function () { if (sel.value) zoomState(sel.value); else { Z.reset(); setFocus(null); } });
    bar.querySelectorAll(".geo-zoom button").forEach(function (b) {
      b.addEventListener("click", function () {
        var z = b.getAttribute("data-z");
        if (z === "reset") { Z.reset(); setFocus(null); } else Z.step(z === "in" ? 1.7 : 1 / 1.7);
        if (z === "out" && Z.view()[2] * 1.7 >= geo.w) setFocus(null);
      });
    });
    bar.querySelector(".geo-tog").addEventListener("click", function (ev) {
      var on = svgEl.classList.toggle("show-lab"); ev.currentTarget.setAttribute("aria-pressed", on);
    });
    openBtn.addEventListener("click", function () { if (focusSt) openDrawer(focusSt, null, openBtn); });

    // drag to pan when zoomed; ctrl/cmd + wheel (or trackpad pinch) to zoom
    var drag = null, moved = false;
    svgEl.addEventListener("pointerdown", function (ev) {
      if (!svgEl.classList.contains("zoomed") || ev.button !== 0) return;
      drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; moved = false;
    });
    svgEl.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!moved) { moved = true; try { svgEl.setPointerCapture(drag.id); } catch (e) {} svgEl.classList.add("dragging"); hideTip(); }
      var rect = svgEl.getBoundingClientRect(), k = Z.view()[2] / rect.width;
      Z.pan(dx * k, dy * k); drag.x = ev.clientX; drag.y = ev.clientY;
    });
    var endDrag = function () { drag = null; svgEl.classList.remove("dragging"); };
    svgEl.addEventListener("pointerup", endDrag); svgEl.addEventListener("pointercancel", endDrag);
    svgEl.addEventListener("click", function (ev) { if (moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; } }, true);
    svgEl.addEventListener("wheel", function (ev) {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      var rect = svgEl.getBoundingClientRect(), v = Z.view();
      var cx = v[0] + (ev.clientX - rect.left) / rect.width * v[2], cy = v[1] + (ev.clientY - rect.top) / rect.height * v[3];
      Z.step(ev.deltaY < 0 ? 1.25 : 1 / 1.25, cx, cy);
    }, { passive: false });
    return api;
  }
  function geoZoomTo(stt, scroll) {
    if (!geoMaps.length) return;
    // zoom every map to the state; bring the House map (the busiest one) into view
    geoMaps.forEach(function (g) { g.zoomState(stt); });
    var tgt = geoMaps.filter(function (g) { return g.kind === "house"; })[0] || geoMaps[0];
    if (scroll && tgt.el) tgt.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  /* =====================================================================================
     11. WIRING IT ALL TOGETHER
     ===================================================================================== */
  function moveAbout() {
    var me = $("method-block"), content = $("content"), pr = $("method"); if (!me || !content || !pr || me.hidden) return;
    me.classList.add("about-top");
    var wrap = el("div", "ab-wrap");
    var ps = pr.querySelectorAll("p");
    if (ps.length === 3) ["Inputs", "National mood", "Uncertainty"].forEach(function (t, k) { ps[k].insertAdjacentHTML("afterbegin", "<span class='ab-lab'>" + t + "</span>"); });
    wrap.appendChild(pr);
    me.appendChild(wrap);
    content.insertBefore(me, content.firstChild);
  }
  /* "Point forecast: D 215, R 220." -> bold, party-coloured "Democratic 215 – Republican 220" */
  function partyLine(d, r) { return "<b class='pd'>Democratic</b> " + d + " &ndash; <b class='pr'>Republican</b> " + r; }
  function styleSummaries() {
    document.querySelectorAll(".topline .hero").forEach(function (h) {   // "D 215 – R 220" headline (shown when there are no simulations)
      var m = /^\s*D\s+(\d+)\s*[\u2013\u2014-]\s*R\s+(\d+)\s*$/.exec(h.textContent);
      if (m) { h.classList.add("hero-pl"); h.innerHTML = "<span class='nb'><b class='pd'>Democratic</b> " + m[1] + "</span> <span class='nb'>&ndash; <b class='pr'>Republican</b> " + m[2] + "</span>"; }
    });
    document.querySelectorAll(".topline .sub").forEach(function (p) {
      if (/^Projected seats:/.test(p.textContent)) { p.remove(); return; }
      var m = /^Point forecast: D (\d+), R (\d+)/.exec(p.textContent);
      if (m) { p.classList.add("party-line"); p.innerHTML = partyLine(m[1], m[2]); }
    });
  }
  /* centre labels under the two big numbers: full words, sized to stay legible and inside the ring at any width */
  function fitHemiLabels() {
    document.querySelectorAll(".hemi svg").forEach(function (svg) {
      var labs = svg.querySelectorAll("text.hc-lab"); if (!labs.length) return;
      var vb = svg.viewBox.baseVal, sc = svg.getBoundingClientRect().width / vb.width; if (!sc) return;
      [].forEach.call(labs, function (t) {
        var by = parseFloat(t.getAttribute("data-by"));
        if (sc >= 0.75) { t.removeAttribute("style"); t.setAttribute("y", (by + 20).toFixed(1)); t.classList.remove("hc-small"); return; }
        var fs = Math.min(24, Math.max(20, 9.2 / sc));
        t.classList.add("hc-small");
        t.setAttribute("style", "font-size:" + fs.toFixed(1) + "px");
        t.setAttribute("y", (by + fs * 0.95 + 4).toFixed(1));
      });
    });
  }
  window.addEventListener("resize", (function () { var t; return function () { clearTimeout(t); t = setTimeout(fitHemiLabels, 120); }; })());
  function enhance() {
    tip = $("tip");
    if (OPTS.stateDrawer) safe("drawer", buildDrawer);
    if (OPTS.honeycomb) safe("honeycomb", honeycomb);
    safe("tiles", wireTiles);
    if (IS_R) safe("hero", function () {
      document.querySelectorAll(".topline .hero").forEach(function (h) {
        var m = /^\s*(\S.*?)\s+(\d+%)\s*$/.exec(h.textContent); if (!m) return;
        var side = /^Dem/i.test(m[1]) ? "d" : (/^Rep/i.test(m[1]) ? "r" : "");
        h.innerHTML = "<span class='hero-w'>" + esc(m[1]) + "</span> <span class='hero-p " + side + "'>" + m[2] + "</span>";
      });
    });
    if (OPTS.hideMapNotes) ["House", "Senate"].forEach(function (t) {
      var sec = sectionByTitle(t), nt = sec && sec.querySelector(".block-head .note"); if (nt) nt.classList.add("v2-gone");
    });
    // Stage panels: wrap the CURRENT maps in a dark panel (labelled "Current") so they sit under the new seat charts.
    [["Senate", "senate-map", "legend-senate", "State map"], ["House", "house-grid", "legend-house", "District map"]].forEach(function (d) {
      safe("stage " + d[0], function () {
        var sec = sectionByTitle(d[0]), m = $(d[1]), lg = $(d[2]); if (!sec || !m) return;
        var st = stage(d[3], "Current", d[0] === "House" ? "One hexagon per district, grouped by state. Hover for details; click a state label or hexagon for the state panel." : "Click a state for the state panel.");
        m.parentNode.insertBefore(st, m); st.appendChild(m); if (lg) st.appendChild(lg);
      });
    });
    if (OPTS.hemicycle) { safe("house hemicycle", buildHouseHemicycle); safe("senate hemicycle", buildSenateHemicycle); }
    safe("summaries", styleSummaries);
    safe("hemi labels", fitHemiLabels);
    if (OPTS.betterDistributions) safe("distributions", betterDistributions);
    if (OPTS.decisiveRaces) safe("decisive", buildDecisive);
    if (IS_L && OPTS.flips) safe("flips", buildFlips);
    if (OPTS.betterTable) safe("table", buildTable);
    if (IS_L && OPTS.headline) safe("headline", function () {
      var h = $("title"), parts = OPTS.headline.split("|");
      if (h) h.innerHTML = parts.map(function (t) { return "<span class='h1l'>" + esc(t.trim()) + "</span>"; }).join(" ");
      document.title = parts.join(" ").replace(/\s+/g, " ").trim();
    });
    if (IS_L && OPTS.footerData) safe("footer", buildFooterData);
    if (IS_L && OPTS.aboutTop) safe("about", moveAbout);
    if (OPTS.stickyNav) safe("nav", buildNav);
    // keep the tooltip from lingering when the page scrolls
    window.addEventListener("scroll", hideTip, { passive: true });
    // geographic maps load their boundary file separately; if it cannot load, the hexagon / tile maps simply stay as they are
    if (IS_L && OPTS.geoMaps) {
      loadGeo().then(function (g) {
        geo = g;
        safe("senate map", function () { buildGeoMap("senate"); });
        safe("house map", function () { buildGeoMap("house"); });
        var f = document.querySelector(".site-foot .fine");
        if (f && geoMaps.length) f.insertAdjacentHTML("beforeend", " Map boundaries: <a href='https://www.amcharts.com/' rel='noopener'>amCharts</a> 5 geodata (120th Congress set), used under its linkware license; shapes simplified and re-projected for this site.");
        deepLink();
      }).catch(function (e) { console.warn("custom.js: geographic maps unavailable (" + e.message + "); the hexagon / tile maps are shown instead."); deepLink(); });
    } else deepLink();
  }
  function deepLink() {
    if (!IS_L || !OPTS.deepLinks) return;
    var m = /^#state=([A-Za-z]{2})$/.exec(location.hash); if (!m) return;
    var st = m[1].toUpperCase(); if (!M.byState[st]) return;
    setTimeout(function () { openDrawer(st, null, null); }, 250);
  }
  function buildFooterData() {
    var foot = document.querySelector(".site-foot .wrap"); if (!foot) return;
    var files = [["Forecast (CSV)", CFG.forecast_file || "forecast.csv"]];
    if (M.hasSims) files.push(["Seat simulations (CSV)", CFG.sims_file || "seat_sims.csv"]);
    files.push(["Race file (CSV)", "data/races_2026.csv"]);
    var box = el("p", "foot-data"); box.innerHTML = "<span>Data</span>" + files.map(function (f) { return "<a href='" + esc(f[1]) + "' download>" + esc(f[0]) + "</a>"; }).join("");
    var fine = foot.querySelector(".fine"); foot.insertBefore(box, fine);
    if (OPTS.viewSwitch) {
      var q = new URLSearchParams(location.search); q.delete("classic"); q.delete("light");
      var base = location.pathname + (q.toString() ? "?" + q.toString() + "&" : "?");
      var vs = el("p", "foot-data"); vs.innerHTML = "<span>Other views</span><a href='" + esc(base + "light=0") + "'>Previous dark design</a><a href='" + esc(base + "classic=1") + "'>Original class template</a>";
      foot.insertBefore(vs, fine);
    }
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
