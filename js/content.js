/* Static content used by the dashboard: default supplement checklist,
   exercise suggestions, and meal ideas. All figures reflect ACOG / CDC /
   NIH Office of Dietary Supplements guidance cited in the Guide. */

export const DEFAULT_SUPPLEMENTS = [
  { id: "folate",  name: "Folic acid / folate",  note: "400–800 mcg daily · start 1–3 months before" },
  { id: "prenatal",name: "Prenatal multivitamin", note: "Covers iron 18–27 mg, B12, zinc" },
  { id: "vitd",    name: "Vitamin D",             note: "600–2000 IU daily (per your levels)" },
  { id: "omega3",  name: "Omega-3 (DHA)",         note: "250–300 mg DHA daily" },
  { id: "iodine",  name: "Iodine",                note: "150–250 mcg daily" },
  { id: "water",   name: "Hydration",             note: "~8–10 cups of water" },
];

export const EXERCISE_SUGGESTIONS = [
  { title: "Brisk walk",           mins: 30, intensity: "Moderate", tags: ["Cardio", "Beginner-friendly"],
    why: "ACOG's baseline: 30 min of moderate activity, most days. Supports insulin sensitivity and mood." },
  { title: "Full-body strength",   mins: 40, intensity: "Moderate", tags: ["Strength", "2×/week"],
    why: "Resistance training lowers free-androgen index and improves insulin sensitivity — especially valuable with PCOS." },
  { title: "Yoga / mobility flow", mins: 25, intensity: "Light",    tags: ["Stress", "Recovery"],
    why: "Lowers cortisol and supports sleep — chronic stress can suppress ovulation." },
  { title: "Cycling intervals",    mins: 35, intensity: "Vigorous", tags: ["Cardio", "Metabolic"],
    why: "Counts double toward the 75–150 min/week vigorous target. Keep it moderate overall to avoid overtraining." },
  { title: "Swim or aqua session", mins: 40, intensity: "Moderate", tags: ["Cardio", "Low-impact"],
    why: "Joint-friendly full-body cardio; easy to sustain 5 days a week." },
  { title: "Pilates core & pelvic",mins: 30, intensity: "Light",    tags: ["Strength", "Pelvic floor"],
    why: "Builds core and pelvic-floor strength that supports pregnancy and recovery." },
];

export const MEAL_IDEAS = [
  { title: "Lentil & spinach bowl", tags: ["Folate", "Iron", "Fiber"],
    desc: "Lentils, sautéed spinach, roasted sweet potato, tahini. Plant iron + folate powerhouse — pair with citrus for absorption." },
  { title: "Salmon + leafy greens", tags: ["Omega-3", "Vitamin D", "Iodine"],
    desc: "Baked salmon, kale, quinoa. DHA for the omega-3 target plus vitamin D and iodine from seafood." },
  { title: "Greek yogurt & berries", tags: ["Calcium", "Choline", "Protein"],
    desc: "Plain Greek yogurt, walnuts, berries, chia. Calcium + protein with antioxidant-rich fruit." },
  { title: "Egg & avocado toast",   tags: ["Choline", "Folate", "Healthy fat"],
    desc: "Two eggs (top choline source), avocado, whole-grain toast, tomato. Choline supports neural-tube closure." },
  { title: "Bean & veggie chili",   tags: ["Fiber", "Iron", "Folate"],
    desc: "Black beans, peppers, tomato, cumin. Steady blood sugar and plant iron; batch-cook for the week." },
  { title: "Sardine & white-bean salad", tags: ["Omega-3", "Calcium", "Iron"],
    desc: "Sardines, cannellini beans, parsley, lemon, olive oil. Small fish = big omega-3 and calcium." },
];

/* Weekly targets used for progress rings & tiles. */
export const GOALS = {
  activeMinutes: 150,   // ACOG / WHO moderate-activity weekly target
  strengthSessions: 2,  // resistance sessions per week
  supplementDays: 7,    // days this week supplements were logged complete
};
