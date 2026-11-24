// Pure KPI derivation from authorized officialInbox metrics. No guesses
// from paginated/filtered record lists.
const n=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function calculateCaseIndicators(metrics){
 if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))return null;
 const total=Object.values(metrics).reduce((acc,count)=>acc+n(count),0);
 return {
  total,review:n(metrics.received)+n(metrics.reviewing)+n(metrics.storage_review),
  corrections:n(metrics.needs_documents),toCertificate:n(metrics.awaiting_certificate),
  resolved:n(metrics.delivered)+n(metrics.closed)+n(metrics.not_proceed),
  sent:n(metrics.delivered)
 };
}
