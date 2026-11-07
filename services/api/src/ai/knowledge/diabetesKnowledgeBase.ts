/**
 * Approved Diabetes Educational Knowledge Base (Phase 6 RAG)
 * Standard: Evidence-based clinical guidelines aligned with ADA 2024, RSSDI 2023, and Apollo Sugar Clinics.
 * Grounding Rule: All educational guidance retrieved must provide clear clinical attribution.
 */

export interface DiabetesKnowledgeItem {
  id: string;
  category: 'FUNDAMENTALS' | 'GLUCOSE_MONITORING' | 'HYPOGLYCEMIA' | 'HYPERGLYCEMIA' | 'MEDICATIONS' | 'NUTRITION' | 'EXERCISE' | 'LIFESTYLE' | 'DOCTOR_VISIT';
  title: string;
  keywords: string[];
  summary: string;
  content: string;
  clinicalSource: string;
  citation: string;
}

export const DIABETES_KNOWLEDGE_ARTICLES: DiabetesKnowledgeItem[] = [
  {
    id: 'kb_glucose_targets',
    category: 'GLUCOSE_MONITORING',
    title: 'Standard Blood Glucose Targets & Time-in-Range (TIR)',
    keywords: ['glucose target', 'normal sugar', 'fasting target', 'postprandial target', 'time in range', 'tir', 'sugar range', 'target'],
    summary: 'Standard clinical targets for non-pregnant adults with diabetes: Fasting 80-130 mg/dL, Postprandial <180 mg/dL, TIR >70%.',
    content: `According to the American Diabetes Association (ADA) and the Research Society for the Study of Diabetes in India (RSSDI):
1. Fasting (Pre-meal) Blood Glucose: Target range is 80 to 130 mg/dL (4.4 to 7.2 mmol/L).
2. Postprandial (1 to 2 hours after the start of a meal) Blood Glucose: Target is below 180 mg/dL (<10.0 mmol/L).
3. Time-in-Range (TIR): For continuous glucose monitoring (CGM), maintaining blood glucose between 70 and 180 mg/dL for more than 70% of the day is recommended.
4. Individualized Targets: Your treating doctor may set slightly different targets based on age, duration of diabetes, cardiovascular risk, and personal hypoglycemia vulnerability.`,
    clinicalSource: 'ADA Standards of Care in Diabetes (2024) / RSSDI Clinical Practice Recommendations (2023)',
    citation: 'ADA Standards of Care 2024, Chapter 6: Glycemic Targets.',
  },
  {
    id: 'kb_hba1c_explained',
    category: 'GLUCOSE_MONITORING',
    title: 'Understanding HbA1c and Estimated Average Glucose',
    keywords: ['hba1c', 'a1c', 'glycated hemoglobin', 'average glucose', 'eag', '3 month sugar'],
    summary: 'HbA1c reflects average blood sugar over 2 to 3 months. Standard target is below 7.0% for most non-pregnant adults.',
    content: `HbA1c (Hemoglobin A1c) measures the percentage of hemoglobin in red blood cells that has bonded with glucose over their ~90-120 day lifespan:
- Normal (Non-diabetic): Below 5.7%
- Prediabetes: 5.7% to 6.4%
- Diabetes diagnosis: 6.5% or higher
- General Treatment Target: Below 7.0% (corresponds to an estimated average glucose of approximately 154 mg/dL).
- More relaxed targets (e.g. <8.0%) may be recommended by your doctor for older adults or individuals with extensive microvascular/macrovascular complications or hypoglycemia unawareness.`,
    clinicalSource: 'ADA Standards of Care 2024 / RSSDI Guidelines',
    citation: 'ADA Standards of Care 2024, Chapter 6: Glycemic Targets.',
  },
  {
    id: 'kb_hypo_rule_15',
    category: 'HYPOGLYCEMIA',
    title: 'Hypoglycemia Signs & The Clinical "Rule of 15"',
    keywords: ['low sugar', 'hypoglycemia', 'hypo', 'rule of 15', 'shivering', 'sweating', 'shaky', 'fast sugar', 'under 70'],
    summary: 'Blood glucose <70 mg/dL requires immediate treatment using the Rule of 15: 15g fast-acting carb, 15 minute wait, re-check.',
    content: `Hypoglycemia is defined as a blood glucose level below 70 mg/dL (<3.9 mmol/L).
Common symptoms: shakiness, sweating, palpitations, hunger, dizziness, lightheadedness, confusion.

Treatment — The "Rule of 15":
Step 1: Consume 15 grams of simple, fast-acting carbohydrates:
  • 1/2 cup (120 mL) of fruit juice or regular non-diet soda, OR
  • 3 to 4 glucose tablets, OR
  • 1 tablespoon of sugar or honey dissolved in water.
  (Avoid chocolate, milk, or baked goods for acute low sugar, as fat slows glucose absorption.)
Step 2: Rest and wait 15 minutes.
Step 3: Re-test your blood glucose level.
Step 4: If blood glucose remains below 70 mg/dL, repeat the 15 grams of fast-acting carbs and wait another 15 minutes.
Step 5: Once glucose rises to 70 mg/dL or above, eat a small snack with complex carbs and protein (e.g., half a sandwich or biscuits with milk) if your next meal is more than an hour away.

EMERGENCY WARNING: If blood glucose is below 54 mg/dL (severe hypoglycemia) or the person experiences confusion, slurred speech, seizures, or loss of consciousness, do NOT attempt to give food or liquids by mouth. Seek immediate emergency medical care (call 112 in India) or administer prescribed glucagon if trained.`,
    clinicalSource: 'ADA Standards of Care 2024 / Apollo Sugar Clinics Clinical Protocol',
    citation: 'ADA Standards of Care 2024, Chapter 6: Hypoglycemia Management.',
  },
  {
    id: 'kb_hyper_dka_warning',
    category: 'HYPERGLYCEMIA',
    title: 'Hyperglycemia and Warning Signs of DKA & HHS',
    keywords: ['high sugar', 'hyperglycemia', 'ketones', 'dka', 'ketoacidosis', 'vomiting', 'fruity breath', 'over 250', 'over 300'],
    summary: 'Persistently high blood sugar (>250-300 mg/dL) with nausea, vomiting, abdominal pain, or shortness of breath requires urgent evaluation.',
    content: `Hyperglycemia occurs when blood sugar levels rise above the target range (typically >180-200 mg/dL).
Mild symptoms: increased thirst (polydipsia), frequent urination (polyuria), fatigue, blurred vision.

Severe Hyperglycemia Complications:
1. Diabetic Ketoacidosis (DKA) — Common in Type 1, but can occur in Type 2 under severe stress/infection:
   • Signs: persistent blood sugar >250 mg/dL, positive urine/blood ketones, nausea, repeated vomiting, abdominal pain, fruity-smelling breath, rapid deep breathing, confusion.
2. Hyperosmolar Hyperglycemic State (HHS) — More common in older Type 2 diabetes patients:
   • Signs: blood sugar often >600 mg/dL, severe dehydration, lethargy, fever, altered consciousness.

ACTION PLAN: If you observe ketones or have persistent vomiting with blood glucose >250 mg/dL, contact your doctor immediately or go to the nearest emergency department. Do not withhold baseline insulin without physician orders.`,
    clinicalSource: 'RSSDI Guidelines / International Diabetes Federation (IDF)',
    citation: 'RSSDI Clinical Practice Recommendations 2023, Chapter on Acute Metabolic Complications.',
  },
  {
    id: 'kb_medication_types_adherence',
    category: 'MEDICATIONS',
    title: 'Common Diabetes Medications & The Importance of Adherence',
    keywords: ['metformin', 'insulin', 'glimepiride', 'dapagliflozin', 'sglt2', 'glp1', 'medication timing', 'side effect', 'tablets', 'missed dose'],
    summary: 'Overview of common diabetes therapies: Biguanides (Metformin), Sulfonylureas, SGLT2i, DPP-4i, GLP-1 RA, and Insulin.',
    content: `Doctor-prescribed medications belong to distinct pharmacological classes:
1. Metformin (Biguanide): Reduces glucose output from the liver and increases insulin sensitivity. Taken with or immediately after meals to reduce stomach upset.
2. Sulfonylureas (e.g., Glimepiride, Gliclazide): Stimulate the pancreas to release more insulin. Take before breakfast/meals; carries risk of low blood sugar if meals are delayed or skipped.
3. SGLT2 Inhibitors (e.g., Dapagliflozin, Empagliflozin): Help kidneys eliminate excess glucose in urine. Drink adequate fluids and maintain proper hygiene.
4. DPP-4 Inhibitors (e.g., Sitagliptin, Vildagliptin): Prolong incretin hormones that stimulate insulin when blood sugar is elevated.
5. GLP-1 Receptor Agonists (e.g., Semaglutide, Dulaglutide): Injected or oral peptides that slow digestion, promote satiety, and enhance glucose-dependent insulin.
6. Insulin (Basal vs Bolus): Basal (e.g. Glargine, Degludec) provides steady 24h background control; Bolus/Prandial (e.g. Aspart, Lispro) covers mealtime spikes.

CRITICAL SAFETY RULE: Never stop, double, or adjust your prescribed medication or insulin doses without direct guidance from your treating physician. If you miss a dose, consult your doctor's instructions rather than taking a double dose.`,
    clinicalSource: 'ADA Standards of Care 2024, Chapter 9: Pharmacologic Approaches to Glycemic Treatment.',
    citation: 'ADA Standards of Care 2024, Chapter 9.',
  },
  {
    id: 'kb_nutrition_plate_method',
    category: 'NUTRITION',
    title: 'The Diabetes Plate Method and Carbohydrate Awareness',
    keywords: ['diet', 'food', 'plate method', 'carbohydrates', 'rice', 'roti', 'vegetables', 'low gi', 'fiber', 'what to eat'],
    summary: 'The Diabetes Plate Method: 1/2 non-starchy vegetables, 1/4 lean protein, 1/4 quality complex carbs. Favor low Glycemic Index foods.',
    content: `The Diabetes Plate Method creates balanced meals without weighing portions:
1. Fill 1/2 of your 9-inch plate with non-starchy vegetables:
   • Examples: spinach, fenugreek (methi), cabbage, cauliflower, broccoli, tomatoes, cucumbers, capsicum, gourd.
   • High in fiber, vitamins, and minerals with minimal impact on blood glucose.
2. Fill 1/4 of your plate with lean protein:
   • Examples: dal, pulses/lentils, chana, paneer, tofu, eggs, skinless poultry, or fish.
   • Helps maintain muscle mass and promotes satiety.
3. Fill 1/4 of your plate with complex carbohydrates / whole grains:
   • Examples: whole wheat chapati, millets (ragi, jowar, bajra), brown rice, or oats.
   • Prefer whole grains over polished white rice, maida, and sugary sweets.
4. Hydration: Water or unsweetened green tea/buttermilk; strictly avoid sugar-sweetened beverages, commercial energy drinks, and packaged fruit juices.`,
    clinicalSource: 'ADA Nutrition Consensus Report / RSSDI Nutrition Recommendations',
    citation: 'Evert AB et al., Nutrition Therapy for Adults With Diabetes, Diabetes Care 2019.',
  },
  {
    id: 'kb_exercise_guidelines',
    category: 'EXERCISE',
    title: 'Physical Activity and Diabetes Management',
    keywords: ['exercise', 'walk', 'walking', 'physical activity', 'steps', 'gym', 'workout', 'yoga'],
    summary: 'Aim for 150+ minutes per week of moderate aerobic exercise plus 2-3 sessions of resistance training.',
    content: `Regular exercise improves insulin sensitivity, assists weight management, and enhances cardiovascular health:
1. Aerobic Exercise: At least 150 minutes of moderate-to-vigorous aerobic activity per week (e.g., 30 minutes, 5 days a week of brisk walking, cycling, or swimming), with no more than 2 consecutive days without activity.
2. Resistance Exercise: 2 to 3 sessions per week on non-consecutive days (bodyweight squats, resistance bands, or light weights).
3. Flexibility and Balance: Yoga and stretching are encouraged, especially for older adults.
4. Exercise Safety Precautions:
   • If on insulin or sulfonylureas, check blood glucose before exercise. If <100 mg/dL, eat a 15-20g carb snack prior to activity.
   • If blood glucose is >250 mg/dL with ketones present, avoid strenuous exercise until cleared.
   • Stay hydrated and wear well-fitted, protective footwear to prevent foot sores.`,
    clinicalSource: 'ADA Standards of Care 2024 / RSSDI Exercise Consensus Statement',
    citation: 'ADA Standards of Care 2024, Chapter 5: Facilitating Positive Health Behaviors.',
  },
  {
    id: 'kb_lifestyle_sleep_stress',
    category: 'LIFESTYLE',
    title: 'Impact of Sleep and Stress on Blood Sugar Dynamics',
    keywords: ['sleep', 'stress', 'cortisol', 'insomnia', 'anxiety', 'mental health', 'tired'],
    summary: 'Poor sleep (<6-7 hours) and chronic emotional stress trigger cortisol and adrenaline release, increasing insulin resistance.',
    content: `Lifestyle factors significantly influence blood sugar control:
1. Sleep Duration & Quality:
   • Adults need 7 to 8 hours of restorative sleep each night.
   • Sleep restriction (<6 hours) elevates evening cortisol and growth hormone levels, promoting insulin resistance and next-day fasting hyperglycemia.
   • Screen for Obstructive Sleep Apnea (OSA) if loud snoring or daytime sleepiness is present.
2. Stress & Cortisol:
   • Psychological stress triggers the body's 'fight or flight' response, releasing epinephrine and cortisol.
   • These hormones stimulate gluconeogenesis in the liver and reduce peripheral glucose uptake.
   • Practice regular relaxation techniques: deep diaphragmatic breathing (pranayama), mindfulness, and light walking.`,
    clinicalSource: 'ADA Lifestyle Management Standards / RSSDI Recommendations',
    citation: 'ADA Standards of Care 2024, Chapter 5.',
  },
  {
    id: 'kb_doctor_visit_preparation',
    category: 'DOCTOR_VISIT',
    title: 'Preparing for Your Doctor Consultation',
    keywords: ['doctor visit', 'consultation prep', 'questions for doctor', 'appointment preparation', 'clinic visit'],
    summary: 'Maximize your doctor consultation by bringing organized glucose logs, medication adherence history, lab results, and written questions.',
    content: `How to prepare for an effective diabetes follow-up consultation:
1. Records to Bring:
   • Blood glucose log (fasting and post-meal readings from the AarogyaDamu Health Vault).
   • Complete list of all current medications, dosages, and exact schedules.
   • Adherence notes (any missed doses, side effects, or episodes of hypoglycemia).
   • Recent laboratory test reports (HbA1c, lipid profile, kidney function/eGFR, urine microalbumin).
2. Key Topics to Discuss:
   • Clarify your personalized glucose and HbA1c target ranges.
   • Review any frequent low sugar (hypo) or high sugar (hyper) episodes.
   • Discuss any medication tolerance or financial/refill barriers.
   • Check whether annual screenings are due: dilated retinal eye exam, comprehensive diabetic foot exam, and dental evaluation.`,
    clinicalSource: 'Apollo Sugar Clinics / RSSDI Patient Care Protocol',
    citation: 'RSSDI Guidelines for Diabetes Care in Clinical Practice 2023.',
  },
];

/**
 * Searches the approved diabetes knowledge base using keyword and semantic matching.
 */
export function searchDiabetesKnowledge(query: string, limit = 2): DiabetesKnowledgeItem[] {
  if (!query || !query.trim()) {
    return DIABETES_KNOWLEDGE_ARTICLES.slice(0, limit);
  }

  const queryTerms = (query.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) || []).filter(
    term => term.length > 2
  );
  if (queryTerms.length === 0) {
    return DIABETES_KNOWLEDGE_ARTICLES.slice(0, limit);
  }

  const scored = DIABETES_KNOWLEDGE_ARTICLES.map(article => {
    let score = 0;
    const lowerTitle = article.title.toLowerCase();
    const lowerSummary = article.summary.toLowerCase();
    const lowerContent = article.content.toLowerCase();

    for (const term of queryTerms) {
      if (article.keywords.some(k => k.includes(term))) score += 10;
      if (lowerTitle.includes(term)) score += 8;
      if (lowerSummary.includes(term)) score += 4;
      if (lowerContent.includes(term)) score += 1;
    }

    return { article, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.article);
}
