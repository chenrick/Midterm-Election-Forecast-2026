// ---------------------------------------------------------------------------
// YOUR SITE SETTINGS. This is the only file you need to edit (plus your CSVs).
// Edit it on github.com: open this file, click the pencil icon, change the
// text between the quotation marks, then click "Commit changes".
// ---------------------------------------------------------------------------

window.SITE_CONFIG = {

  // The name shown at the top of your site. A nickname or made-up forecaster
  // name is fine and recommended. Do not put your real name, email, photo,
  // or anything else that identifies you on this site.
  forecaster_name: "Rick Chen",

  // One short line under the name (optional).
  tagline: "",

  // A plain-language description of YOUR model, in your own words. Each line in
  // quotes is one paragraph, followed by a comma. Two or three short paragraphs:
  // what your forecast is built from, how you set the national environment,
  // and how you handled uncertainty. Until you fill this in, your site shows a
  // reminder in this spot.
  //
  // For example, the class model could be described like this (describe your
  // own model):
  //   "A fundamentals-only model (no polls). Each race's predicted Democratic share combines the district's partisan lean, incumbency, and a forecast of the national House vote from presidential approval, gas prices, income and the midterm penalty.",
  //   "Uncertainty combines one national error shared by every race with a separate error for each race. Seat totals come from 10,000 simulated elections.",
  method: [
    "Each race is built the way we built it in class: the district's normal vote (its PVI, recomputed on current lines), plus the year's national shift, plus contest-specific effects. Those effects are incumbency, how the district ran compared with the nation last time (where the lines didn't change), and the gap between Democratic and Republican spending (the log ratio of FEC disbursements). The spending effect is capped at 2 points in the House and 3 in the Senate, and no prediction lands more than 6 points from the national number plus PVI. The Senate has its own model, fit on 2018-2024 Senate races, with no last-result term.",
    "I forecast the national vote with my own regression on 35 elections (1956-2024) instead of the class model. It predicts the change in the president's party's House share from the midterm penalty, presidential approval (36%), gas prices ($3.85) and the party's prior House share, since a party that won big last time has more seats to lose. I chose the variables by leave-one-election-out error and dropped income growth, which adds nothing once gas prices and approval are in. It has Republicans falling from 51.3% to 45.3%, so Democrats get 54.7% of the House vote, a D+9.4 environment.",
    "There are no polls anywhere in the model. Each race's error combines one national miss shared by every race (1.93 points) with its chamber's own race-level miss (3.0 points in the House, 4.1 in the Senate). Ten thousand simulated Election Days give the seat totals, and because every race shares the national draw, the two chambers move together. In backtests, 85% of House and 81% of Senate results landed inside the 80% ranges. The weakest link is the Senate: a pooled House-and-Senate model fit better in backtests and would flip Ohio, and control rests on five races within two points of 50%."
  ],



  // Your data files. Leave these alone unless you renamed your files.
  forecast_file: "forecast.csv",
  sims_file: "seat_sims.csv",

  // Course links. Leave these as they are.
  links: {
    class_forecast: "https://kevinmdeluca.com/forecast/class/",
    tracker: "https://kevinmdeluca.com/forecast/",
    gallery: "https://kevin-deluca-polisci.github.io/plsc2219-forecasts/gallery.html"
  }
};
