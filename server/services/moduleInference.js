/**
 * Fallback bucketing when a ticket's ALIS Module field is blank (~90% of
 * escalations, confirmed live Sep 2026). Keyword rules over subject,
 * description, and next step, mapped onto the portal's own alis_module
 * option values. Subject hits weigh 3x — subjects follow a "Client - What
 * broke" convention, so they're the strongest signal. Earlier rules win
 * ties, so more specific modules come first. Always surfaced as "inferred",
 * never written back to HubSpot.
 */
const RULES = [
  // GL and Reports first: people labeled "GL - Deposit Duplicated" as GL and
  // "Rent Roll"/"… Report not working" as Reports, not Billing/ALIS Pay.
  ['GL', /\bgl\b|general ledger|quickbooks|intacct|journal entr/i],
  ['Reports', /reports?\b|rent roll|\bexport|\b5177\b|\bdss\b/i],
  ['ALISPay', /\balis ?pay\b|payment gateway|bluepay|cardpointe|\bach\b|pulling (funds|\$)|deposits?\b/i],
  ['Alis Connect', /\balis connect\b|family portal/i],
  ['Drug Count', /drug count|narcotic|controlled substance/i],
  ['MAR', /\bmars?\b|\bemar\b|med ?pass|\bq\d+h\b|\bprn\b/i],
  ['Medications', /medications?|\bmeds?\b|orders? tab|\bdiscontinued\b/i],
  ['Pharmacy', /pharmacy/i],
  ['Eval/Service Plan', /care ?plan|service plan|evaluations?|care packages?|assessment/i],
  ['Care tracking', /recorded care|care track|care items?|community tasks|\btasks?\b/i],
  ['Observations', /vitals?\b|observations?|monitoring event/i],
  ['Incidents', /\bincidents?\b/i],
  ['Compliance', /compliance|\bdoh\b|state (form|report)|\bsurvey\b|e-?sign/i],
  ['Insights', /\binsights\b|alis hq|\bdomo\b|welltower/i],
  ['Billing', /billing|invoic|\brent\b|recurring|charges?\b|medicaid|daily rate|statements?\b|payer|financial move/i],
  ['Prospects', /prospects?|\btours?\b|\bleads?\b|\bapfm\b|applicants?|inquir/i],
  ['Move in/Move out', /move[- ]?ins?\b|move[- ]?outs?\b|admits?\b|admission|discharge/i],
  ['On Leave', /on leave|\bleaves?\b/i],
  ['Resident Transfer', /resident transfer|\btransfer/i],
  ['Contacts/Facesheet', /contacts?\b|face ?sheet|insurance|diagnos|demographic/i],
  ['Login', /log ?in\b|locked|lock by ip|password|\bsso\b|\b2fa\b/i],
  ['Staff', /\bstaff\b|employees?|third party access|associate users?/i],
  ['Alerts', /alerts?\b|notifications?/i],
  ['Calendar', /calendar|schedul/i],
  ['Chromebooks', /chromebook|swipe ?card/i],
  ['Outage/Downtime', /outage|downtime|\bis down\b|not loading|unavailable/i],
  ['Resident Data', /resident (settings|profile|data)|\bsync|migration|\bimport|inbound documents?/i],
  ['Settings', /settings?\b|permissions?|\broles?\b/i],
  ['RET', /\bret\b/i],
];

function inferModule({ subject, description, nextStep }) {
  let best = null;
  let bestScore = 0;
  for (const [module, re] of RULES) {
    const score = (re.test(subject || '') ? 3 : 0) + (re.test(description || '') ? 1 : 0) + (re.test(nextStep || '') ? 1 : 0);
    if (score > bestScore) {
      best = module;
      bestScore = score;
    }
  }
  return best;
}

module.exports = { inferModule };
