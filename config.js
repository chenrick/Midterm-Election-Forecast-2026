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
    "Each race starts from how Democratic the district or state normally votes (its PVI), whether an incumbent is running, and a national environment shared by all races. I add the gap between Democratic and Republican campaign spending (the log ratio of FEC disbursements) and, in the House, how the district voted last time compared with the nation. The Senate averages two models 50/50: one fit on Senate races only, one pooled with House races.",
    "I set the national environment with my own model rather than the class number. It predicts the change in the president's party's House vote from presidential approval (38% in the latest averages), gas prices, the midterm penalty, and how well the president's party did last time, since big past wins tend to fade. I dropped income growth because it adds little once approval and gas prices are in. The result is about 54% of the national House vote for Democrats, roughly a D+9 environment.",
    "Uncertainty has two parts: one national miss that moves every race together, and a separate miss for each race. I draw 10,000 simulated elections from them, and the seat totals, win probabilities and 80% ranges on this page all come from those simulations. A typical race has an 80% range of about plus or minus 6 points in the House and 8 in the Senate."
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
