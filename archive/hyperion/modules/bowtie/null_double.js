/**
 * Null double of bowtie, contract version 1.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when BOWTIE_IMPL=null through a specifier held in a variable, so it is never
 * built into pivot.html. It returns fixed, valid-looking data of the declared types and
 * enforces nothing: no argument is read or checked, nothing is thrown, and the registry is
 * never asked. Written from the contract surface alone; the conformance suite must fail
 * against it in every file but operations.
 */

import { hazardId as hazardIds, platformId as platformIds, platformReportId, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').BowtieImplementation} Impl */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');
const HAZARD_ID = hazardIds.parse('H-0001');
const PLATFORM_ID = platformIds.parse('00000000-0000-4000-8000-000000000002');
const STAMPS = /** @type {const} */ ({ status: 'live', createdBy: PROFILE_ID, createdAtAest: AT, updatedBy: PROFILE_ID, updatedAtAest: AT });

/** @type {Impl['bowtieFor']} */
export const bowtieFor = async (body, hazardId, platformId) => ({
  platform: { ...STAMPS, id: PLATFORM_ID, kind: 'platform', name: 'Platform', ownerProfileId: PROFILE_ID },
  hazard: { ...STAMPS, id: HAZARD_ID, kind: 'hazard', title: 'Hazard' },
  reportId: platformReportId('HAZ-1'),
  causalFactors: [],
  consequences: [],
  preventativeControls: [],
  mitigatingControls: [],
});

/** @type {Impl['renderBowtieSvg']} */
export const renderBowtieSvg = async (bowtie) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
