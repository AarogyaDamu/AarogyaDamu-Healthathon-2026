# AarogyaDamu — LOINC & UCUM Clinical Terminology Specification

**Standard Version:** LOINC 2.77 / 2.78 (Regenstrief Institute, Inc.)
**UCUM Version:** Unified Code for Units of Measure 2.1
**Target Domain:** Type 2 Diabetes Glycemic Monitoring, Hypertension Comorbidities & Lifestyle Care

---

## 1. Principles of Terminology Mapping

1. **Exact Clinical Concept Representation:** Code selection is determined by actual Analyte/Component, Specimen (e.g. Capillary Blood vs. Venous Plasma), Timing (Fasting, Postprandial, Bedtime), and Measurement Method (Point-of-care glucometer vs. Laboratory automated analyzer).
2. **Zero Code Invention:** Every LOINC code corresponds strictly to an active, verified entry in the official Regenstrief LOINC database (https://loinc.org/).
3. **No Code Overloading:** Point-of-care capillary glucose readings are strictly differentiated from venous laboratory measurements.
4. **Official UCUM Units:** All measurement values are bound to syntactically correct UCUM case-sensitive unit codes (e.g. `mg/dL`, `mm[Hg]`, `kg`, `%`, `/min`).
5. **Context Preservation:** Clinical timing (fasting, 2-hour postprandial, bedtime) and origin provenance (patient-entered, glucometer Bluetooth, voice-logged, clinician-verified) are preserved in FHIR Observation components and notes.

---

## 2. Core Diabetes Observation Mappings

| Clinical Observation | LOINC Code | Official LOINC Long Display | Specimen | Method / Context | UCUM Unit | Clinical Target Range | Mapping Authority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Fasting Blood Glucose (Lab)** | `1558-6` | Fasting glucose [Mass/volume] in Serum or Plasma | Serum/Plasma | Venous blood draw after 8-12 hr fast | `mg/dL` | 80–130 mg/dL (ADA 2026 Target) | Regenstrief / LOINC |
| **Point-of-Care Blood Glucose** | `14771-0` | Glucose [Mass/volume] in Blood by Glucometer | Capillary blood | Handheld glucometer strip | `mg/dL` | 80–130 mg/dL (Fasting) | Regenstrief / LOINC |
| **Postprandial Glucose (2h)** | `88365-2` | Glucose [Mass/volume] in Blood at 2 hours post-meal | Whole blood / Capillary | Exactly 2 hours after meal start | `mg/dL` | < 180 mg/dL (ADA 2026 Target) | Regenstrief / LOINC |
| **Pre-Meal Glucose** | `72171-2` | Glucose [Mass/volume] in Blood pre-meal | Whole blood / Capillary | Immediately prior to meal | `mg/dL` | 80–130 mg/dL | Regenstrief / LOINC |
| **Bedtime Glucose** | `74774-1` | Glucose [Mass/volume] in Blood at bedtime | Whole blood / Capillary | Pre-sleep safety check | `mg/dL` | 100–140 mg/dL | Regenstrief / LOINC |
| **Random / Spot Glucose** | `2339-0` | Glucose [Mass/volume] in Blood | Whole blood | Any time of day | `mg/dL` | 70–140 mg/dL (Normal) | Regenstrief / LOINC |
| **Hemoglobin A1c (HbA1c)** | `4548-4` | Hemoglobin A1c/Hemoglobin.total in Blood | Whole blood | HPLC / Immunoassay | `%` | < 7.0% (Glycemic Target) | Regenstrief / IFCC / ADA |
| **HbA1c (IFCC Standard)** | `59261-8` | Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol | Whole blood | IFCC reference method | `mmol/mol` | < 53 mmol/mol | IFCC / LOINC |

---

## 3. Vital Signs & Comorbidity Mappings

| Measurement | LOINC Code | Official LOINC Display | Property | UCUM Unit | Clinical Normal / Target Range |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Blood Pressure Panel** | `85354-9` | Blood pressure panel with all children optional | Panel | `mm[Hg]` | Panel container |
| **Systolic Blood Pressure** | `8480-6` | Systolic blood pressure | Pressure | `mm[Hg]` | < 120 (Normal), < 130 (Diabetes Target) |
| **Diastolic Blood Pressure** | `8462-4` | Diastolic blood pressure | Pressure | `mm[Hg]` | < 80 (Normal), < 80 (Diabetes Target) |
| **Body Weight** | `29463-7` | Body weight | Mass | `kg` | Individualized BMI target |
| **Body Mass Index (BMI)** | `39156-5` | Body mass index (BMI) [Ratio] | Ratio | `kg/m2` | 18.5–22.9 kg/m2 (Asian Indian) |
| **Heart Rate / Pulse** | `8867-4` | Heart rate | Frequency | `/min` | 60–100 /min resting |

---

## 4. Diabetic Nephropathy & Renal Monitoring (Laboratory)

| Test Name | LOINC Code | Official LOINC Display | Specimen | UCUM Unit | Reference Interval |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Estimated GFR (CKD-EPI 2021)** | `98979-8` | Glomerular filtration rate/1.73 sq M.predicted in Serum/Plasma (CKD-EPI 2021) | Serum/Plasma | `mL/min/{1.73_m2}` | > 60 mL/min/1.73m2 (Normal) |
| **Urine Albumin/Creatinine Ratio** | `9318-7` | Albumin/Creatinine [Mass Ratio] in Urine | Random urine | `mg/g` | < 30 mg/g (Normal), 30-300 (Microalbuminuria) |
| **Serum Creatinine** | `2160-0` | Creatinine [Mass/volume] in Serum or Plasma | Serum/Plasma | `mg/dL` | 0.6–1.2 mg/dL |

---

## 5. UCUM Unit Canonicalization Reference Table

| Raw / User String | Canonical UCUM Syntax | UCUM Concept Description |
| :--- | :--- | :--- |
| `mg/dL`, `mg/dl` | `mg/dL` | milligram per deciliter |
| `mmol/L`, `mmol/l` | `mmol/L` | millimole per liter |
| `%`, `percent` | `%` | percent |
| `mmHg`, `mm Hg` | `mm[Hg]` | millimeter of mercury |
| `kg`, `kgs` | `kg` | kilogram |
| `lbs`, `lb` | `[lb_av]` | pound (avoirdupois) |
| `/min`, `bpm` | `/min` | count per minute |
| `kg/m2`, `kg/m^2` | `kg/m2` | kilogram per square meter |
| `mL/min/1.73m2` | `mL/min/{1.73_m2}` | milliliter per minute per 1.73 square meters |
| `mg/g` | `mg/g` | milligram per gram |

---

## 6. Implementation & Validation Verification

In AarogyaDamu, observation ingestion automatically executes `resolveLoincCoding()` and `toCanonicalUcum()`. When serialized to HL7 FHIR R4:
1. `Observation.code.coding` contains `system: "http://loinc.org"`, `code: <LOINC>`, `display: <Official Name>`.
2. `Observation.valueQuantity` contains `value: <Numeric>`, `unit: <Display Unit>`, `system: "http://unitsofmeasure.org"`, `code: <Canonical UCUM>`.
3. Clinical context is encapsulated in `Observation.extension` and `Observation.note`.
