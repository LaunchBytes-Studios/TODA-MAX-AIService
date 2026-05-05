import { SupportedLanguage } from "../types/language";

// Generic fallback reply when no specific metric is detected.
export const normalValueFallbackReplies: Record<SupportedLanguage, string> = {
  hiligaynon:
    "Ang normal nga reference values mahimo maglain depende sa test kag sa laboratoryo. Kon gusto mo, pwede ko ihatag ang mas eksakto nga range para sa specific nga metric.",
  filipino:
    "Ang normal na reference values ay maaaring mag-iba depende sa test at laboratoryo. Kung gusto mo, maibibigay ko ang mas eksaktong range para sa partikular na metric.",
  bisaya:
    "Ang normal nga reference values mahimong magkalahi depende sa test ug laboratoryo. Kung gusto nimo, mahimo nako ihatag ang mas tukmang range para sa specific nga metric.",
  english:
    "Normal reference values can vary depending on the test and laboratory. If you like, I can give the exact range for a specific metric.",
};

export const medicationFallbackReplies: Record<
  SupportedLanguage,
  { general: string }
> = {
  hiligaynon: {
    general:
      "May mga klase sang bulong nga ginagamitan para sa diabetes kag hypertension. Para sa diabetes, kasagaran nga ginahambal ang metformin (biguanide), insulin, sulfonylureas, SGLT2 inhibitors, kag GLP-1 receptor agonists. Para sa high blood pressure, kasagaran ang ACE inhibitors, ARBs, calcium channel blockers, kag thiazide diuretics. Indi ko mahimo maghatag sang dose o mag-prescribe; palihog konsulta sa imo doktor para sa eksakto nga tambal kag dosis.",
  },
  filipino: {
    general:
      "May mga klase ng gamot na karaniwang ginagamit para sa diabetes at hypertension. Para sa diabetes, kabilang dito ang metformin (biguanide), insulin, sulfonylureas, SGLT2 inhibitors, at GLP-1 receptor agonists. Para sa high blood pressure, kabilang ang ACE inhibitors, ARBs, calcium channel blockers, at thiazide diuretics. Hindi ako maaaring magbigay ng dosis o magreseta; kumunsulta sa doktor para sa tamang gamot at dosis.",
  },
  bisaya: {
    general:
      "Adunay mga klase sa tambal nga kasagarang gamiton para sa diabetes ug hypertension. Para sa diabetes: metformin (biguanide), insulin, sulfonylureas, SGLT2 inhibitors, ug GLP-1 receptor agonists. Para sa high blood pressure: ACE inhibitors, ARBs, calcium channel blockers, ug thiazide diuretics. Dili ko mahimong muhatag og dosage o magreseta; palihug konsultaha ang imong doktor para sa tukmang tambal ug dosis.",
  },
  english: {
    general:
      "There are common medication classes used for diabetes and hypertension. For diabetes: metformin (a biguanide), insulin, sulfonylureas, SGLT2 inhibitors, and GLP-1 receptor agonists. For high blood pressure: ACE inhibitors, ARBs, calcium channel blockers, and thiazide diuretics. I cannot provide dosing or prescribe; please talk to your healthcare provider for the right medication and dose.",
  },
};
