import { emptyData } from '../../core/data.js';
import { addDays, addMonths } from '../../core/time.js';
import { createHazard, updateHazard, addCausalFactor, addConsequence, assignNumbers } from '../../core/ops/hazards.js';
import { createControl, linkControl, setImplementedBy, setControlTargets } from '../../core/ops/controls.js';
import { createPlatform, linkHazard } from '../../core/ops/platforms.js';
import { createPlatformGroup, tagPlatform } from '../../core/ops/platform-groups.js';
import { setAssessment, setControlStatus, setSfarp } from '../../core/ops/assessment.js';
import { createSafetyReport } from '../../core/ops/safety-reports.js';
import { createReference, linkReference } from '../../core/ops/references.js';
import { createReviewPolicy, updateReviewPolicy, setRule } from '../../core/ops/reviews.js';
import { startWorkflow, setStep } from '../../core/ops/workflows.js';
import { createBowtieView } from '../../core/ops/bowtie-views.js';
import { DEFAULT_FILTERS } from '../../core/bowtie.js';
import { startAcks } from '../../core/acks.js';

/** The made-up second person in the tutorial: owns the range, and has changed something of yours. */
export const SAMPLE_PROFILE = Object.freeze({ id: 'sample-sam', name: 'Sam (sample)', createdAt: '' });

/** @param {string} day @param {string} [time] */
const at = (day, time = '09:00') => `${day}T${time}:00+10:00`;

/**
 * A small made-up register for the tutorial, dated from today so its reviews are always due soon
 * and overdue: the patrol boat (yours, on a policy) and the range (Sam's, fixed); four hazards,
 * rated and justified but for one gap; controls in each status; a reference, a safety report, a
 * change of Sam's waiting for you, your review of the boat under way, and a saved bow-tie.
 * @param {string} me the profile taking the tutorial @param {string} today YYYY-MM-DD
 */
export function sampleRegister(me, today) {
  const a = { by: me, at: at(addDays(today, -40)) };
  const sam = { by: SAMPLE_PROFILE.id, at: at(addDays(today, -40)) };
  let d = emptyData();
  d = createPlatform(d, a, { id: 'tour-p1', name: 'Harbour Patrol Boat', ownerId: me });
  d = createPlatform(d, a, { id: 'tour-p2', name: 'Training Range', ownerId: SAMPLE_PROFILE.id });
  d = createPlatformGroup(d, a, { id: 'tour-g1', name: 'Maritime' });
  d = tagPlatform(d, a, { platformId: 'tour-p1', groupId: 'tour-g1' });

  d = createHazard(d, a, { id: 'tour-h1', title: 'Person overboard', description: 'A crew member falls into the water while under way.' });
  d = createHazard(d, a, { id: 'tour-h2', title: 'Engine room fire', description: 'Fire in the engine compartment.' });
  d = createHazard(d, a, { id: 'tour-h3', title: 'Collision with another vessel', description: 'Contact with another vessel in busy water.' });
  d = createHazard(d, a, { id: 'tour-h4', title: 'Ricochet on the range', description: 'A round deflects outside the safe area.' });
  for (const [h, p] of [['tour-h1', 'tour-p1'], ['tour-h2', 'tour-p1'], ['tour-h3', 'tour-p1'], ['tour-h1', 'tour-p2'], ['tour-h4', 'tour-p2']]) d = linkHazard(d, a, { hazardId: h, platformId: p });
  d = addCausalFactor(d, a, { id: 'tour-cf1', hazardId: 'tour-h1', platformId: 'tour-p1', text: 'Working on deck in heavy seas' });
  d = addCausalFactor(d, a, { id: 'tour-cf2', hazardId: 'tour-h2', platformId: 'tour-p1', text: 'Fuel leak onto a hot surface' });
  d = addCausalFactor(d, a, { id: 'tour-cf3', hazardId: 'tour-h3', platformId: 'tour-p1', text: 'Poor visibility at night' });
  d = addCausalFactor(d, a, { id: 'tour-cf4', hazardId: 'tour-h1', platformId: 'tour-p1', text: 'Stepping across from the jetty' });
  d = addCausalFactor(d, a, { id: 'tour-cf5', hazardId: 'tour-h1', platformId: 'tour-p1', text: 'Guardrail gate left open' });
  d = addConsequence(d, a, { id: 'tour-cq1', hazardId: 'tour-h1', text: 'Drowning' });
  d = addConsequence(d, a, { id: 'tour-cq4', hazardId: 'tour-h1', text: 'Hypothermia' });
  d = addConsequence(d, a, { id: 'tour-cq5', hazardId: 'tour-h1', text: 'Injury from striking the hull' });
  d = addConsequence(d, a, { id: 'tour-cq2', hazardId: 'tour-h2', text: 'Burns and loss of propulsion' });
  d = addConsequence(d, a, { id: 'tour-cq3', hazardId: 'tour-h3', text: 'Hull damage and injury' });

  // Ratings: [hazard, platform, stage, consequence, likelihood] for every receptor, each justified.
  const rate = (/** @type {string} */ h, /** @type {string} */ p, /** @type {string} */ stage, /** @type {number} */ c, /** @type {string} */ l) => {
    for (const receptor of ['personnel', 'environment', 'capability']) {
      d = setAssessment(d, a, { hazardId: h, platformId: p, stage, receptor, consequence: c, likelihood: l, likelihoodWhy: 'Based on the crew’s operating history.', consequenceWhy: 'Worst credible outcome for this receptor.' });
    }
  };
  rate('tour-h1', 'tour-p1', 'initial', 1, 'C'); rate('tour-h1', 'tour-p1', 'residual', 2, 'C');
  rate('tour-h2', 'tour-p1', 'initial', 2, 'C'); rate('tour-h2', 'tour-p1', 'residual', 3, 'D');
  rate('tour-h3', 'tour-p1', 'initial', 2, 'D'); rate('tour-h3', 'tour-p1', 'residual', 3, 'D');
  rate('tour-h1', 'tour-p2', 'initial', 2, 'D'); rate('tour-h1', 'tour-p2', 'residual', 3, 'E');
  rate('tour-h4', 'tour-p2', 'initial', 1, 'D'); rate('tour-h4', 'tour-p2', 'residual', 2, 'E');
  // The gap Home shows: the engine room fire's residual personnel rating has no justification.
  d = setAssessment(d, a, { hazardId: 'tour-h2', platformId: 'tour-p1', stage: 'residual', receptor: 'personnel', likelihoodWhy: '', consequenceWhy: '' });
  for (const h of ['tour-h1', 'tour-h2', 'tour-h3']) d = setSfarp(d, a, { hazardId: h, platformId: 'tour-p1', justification: 'All reasonably practicable controls are in place.', conclusion: 'Risk is SFARP.', conditions: 'Valid while the crew is trained and the controls are maintained.' });
  for (const h of ['tour-h1', 'tour-h4']) d = setSfarp(d, a, { hazardId: h, platformId: 'tour-p2', justification: 'Controls in place.', conclusion: 'Risk is SFARP.', conditions: 'Valid while range orders are followed.' });

  // Controls: [id, title, tier, kind, hazard, status on the boat, implemented by]
  const controls = [
    ['tour-c1', 'Lifejackets worn on deck', 'PPE', 'mitigating', 'tour-h1', 'implemented', 'customer'],
    ['tour-c2', 'Fixed fire suppression', 'Engineering', 'mitigating', 'tour-h2', 'implemented', 'oem'],
    ['tour-c3', 'Hot-work permits', 'Administrative', 'preventative', 'tour-h2', 'planned', 'highcom'],
    ['tour-c4', 'AIS collision alerting', 'Engineering', 'preventative', 'tour-h3', 'recommended', 'oem'],
    ['tour-c5', 'Deck harness and jackstays', 'Engineering', 'preventative', 'tour-h1', 'implemented', 'oem'],
    ['tour-c6', 'Boarding only by the gangway', 'Administrative', 'preventative', 'tour-h1', 'implemented', 'customer'],
    ['tour-c7', 'Recovery drill and boat hook', 'Administrative', 'mitigating', 'tour-h1', 'implemented', 'customer'],
  ];
  for (const [id, title, tier, kind, h, status, by] of controls) {
    d = createControl(d, a, { id, title, tier, kind, origin: 'Sample', description: `${title} on the boat.` });
    d = linkControl(d, a, { hazardId: h, controlId: id, kind });
    if (status !== 'recommended') d = setControlStatus(d, a, { hazardId: h, controlId: id, platformId: 'tour-p1', status });
    d = setImplementedBy(d, a, { controlId: id, platformId: 'tour-p1', implementedBy: by });
  }
  // What each control on person overboard acts on, on the boat: so its bow-tie joins up.
  /** @type {[string, string[]][]} */
  const acts = [['tour-c5', ['tour-cf1', 'tour-cf5']], ['tour-c6', ['tour-cf4']], ['tour-c1', ['tour-cq1', 'tour-cq4']], ['tour-c7', ['tour-cq4', 'tour-cq5']]];
  for (const [controlId, targets] of acts) {
    d = setControlTargets(d, a, { hazardId: 'tour-h1', controlId, platformId: 'tour-p1', targets });
  }
  // On the range, the lifejackets (linked to the person-overboard hazard there too) are rejected: no water.
  d = setControlStatus(d, sam, { hazardId: 'tour-h1', controlId: 'tour-c1', platformId: 'tour-p2', status: 'rejected', reason: 'No open water on the range.' });

  d = createReference(d, a, { id: 'tour-r1', title: 'Patrol Boat Operator Manual', docNumber: 'PB-OM-01', revision: 'B', url: 'https://example.org/pb-om' });
  d = linkReference(d, a, { referenceId: 'tour-r1', targetKind: 'hazard', targetId: 'tour-h1' });
  d = createSafetyReport(d, a, { id: 'tour-s1', hazardId: 'tour-h1', platformId: 'tour-p1', reportType: 'Near miss', date: addDays(today, -60), summary: 'Crew member slipped at the gunwale; caught by the guardrail.' });

  // Reviews: the boat on a policy (Serious every 6 months), due in 14 days; the range fixed yearly, a month overdue.
  d = createReviewPolicy(d, a, { id: 'tour-pol1', name: 'Sample policy' });
  for (const receptor of ['personnel', 'environment', 'capability']) {
    d = updateReviewPolicy(d, a, { id: 'tour-pol1', receptor, band: 'Serious', months: 6, unit: 'months' });
    d = updateReviewPolicy(d, a, { id: 'tour-pol1', receptor, band: 'Medium', months: 24, unit: 'months' });
  }
  d = setRule(d, a, { platformId: 'tour-p1', kind: 'policy', policyId: 'tour-pol1', start: addMonths(addDays(today, 14), -6) });
  d = setRule(d, sam, { platformId: 'tour-p2', kind: 'fixed', months: 12, unit: 'months', start: addMonths(addDays(today, -30), -12) });

  // From here, changes by someone other than a platform's owner wait for them.
  d = startAcks(d, { by: me, at: at(addDays(today, -20)) });
  d = updateHazard(d, { by: SAMPLE_PROFILE.id, at: at(addDays(today, -2), '14:30') }, { id: 'tour-h1', description: 'A crew member falls into the water while under way, or while boarding from the jetty.' });

  const now = { by: me, at: at(addDays(today, -1)) };
  d = startWorkflow(d, now, { id: 'tour-w1', type: 'platformReview', platformId: 'tour-p1' });
  d = setStep(d, now, { workflowId: 'tour-w1', hazardId: 'tour-h3', check: 'safetyReports', checked: true, note: 'No reports for this one.' });
  d = createBowtieView(d, now, { id: 'tour-bv1', name: 'Person overboard on the boat', hazardId: 'tour-h1', platformId: 'tour-p1', filters: DEFAULT_FILTERS });
  return assignNumbers(d);
}
