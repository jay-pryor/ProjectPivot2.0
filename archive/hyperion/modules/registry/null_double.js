/**
 * Null double of registry, contract version 5.0 (CORE-TST-002, rung 1). Test-only:
 * contract.js selects it when REGISTRY_IMPL=null through a specifier held in a variable, so it
 * is never built into pivot.html. It returns fixed, valid-looking data of the declared types
 * and enforces nothing: no argument is read or checked, nothing is thrown, no change is
 * recorded, and every body it returns is a fresh empty one. Written from the contract surface
 * alone; the conformance suite must fail against it in every file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import {
  causalFactorId, consequenceId, controlId, hazardId, justificationId, linkId, platformId,
  platformReportId, ratingId, timestampAest, userProfileId,
} from '../../baseline/types.js';

/** @typedef {import('./contract.js').RegistryImplementation} Impl */
/** @typedef {import('./contract.js').RegistryHeader} RegistryHeader */
/** @typedef {import('./contract.js').Hazard} Hazard */
/** @typedef {import('./contract.js').Control} Control */
/** @typedef {import('./contract.js').Platform} Platform */
/** @typedef {import('./contract.js').Justification} Justification */
/** @typedef {import('./contract.js').HazardPlatformLink} HazardPlatformLink */
/** @typedef {import('./contract.js').ControlPlatformLink} ControlPlatformLink */
/** @typedef {import('./contract.js').RatingValues} RatingValues */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');
const HAZARD_ID = hazardId.parse('H-0001');
const CONTROL_ID = controlId.parse('00000000-0000-4000-8000-000000000002');
const PLATFORM_ID = platformId.parse('00000000-0000-4000-8000-000000000003');
const LINK_ID = linkId.parse('00000000-0000-4000-8000-000000000004');

/** @returns {RegistryHeader} */
function header() {
  return { status: 'live', createdBy: PROFILE_ID, createdAtAest: AT, updatedBy: PROFILE_ID, updatedAtAest: AT };
}

/** @returns {Hazard} */
function hazard() {
  return { ...header(), id: HAZARD_ID, kind: 'hazard', title: 'Hazard' };
}

/** @returns {Control} */
function control() {
  return { ...header(), id: CONTROL_ID, kind: 'control', title: 'Control' };
}

/** @returns {Platform} */
function platform() {
  return { ...header(), id: PLATFORM_ID, kind: 'platform', name: 'Platform', ownerProfileId: PROFILE_ID };
}

/** @returns {Justification} */
function justification() {
  return {
    ...header(),
    id: justificationId.parse('00000000-0000-4000-8000-000000000005'),
    kind: 'justification',
    hazardId: HAZARD_ID,
    controlId: CONTROL_ID,
    platformId: PLATFORM_ID,
    text: 'Not applicable to this platform',
  };
}

/** @returns {HazardPlatformLink} */
function hazardPlatformLink() {
  return {
    ...header(),
    id: LINK_ID,
    kind: 'link',
    linkKind: 'hazard-platform',
    hazardId: HAZARD_ID,
    platformId: PLATFORM_ID,
    reportId: platformReportId('HAZ-1'),
  };
}

/** @returns {ControlPlatformLink} */
function controlPlatformLink() {
  return { ...header(), id: LINK_ID, kind: 'link', linkKind: 'control-platform', hazardId: HAZARD_ID, controlId: CONTROL_ID, platformId: PLATFORM_ID };
}

/** @returns {RatingValues} */
function uncategorised() {
  return { consequence: null, likelihood: null };
}

/** @type {Impl['createHazard']} */
export const createHazard = async (body, act, fields) => ({ body: emptyDataBody(), hazard: hazard() });

/** @type {Impl['updateHazard']} */
export const updateHazard = async (body, act, id, fields) => ({ body: emptyDataBody(), hazard: hazard() });

/** @type {Impl['listHazards']} */
export const listHazards = async (body) => [];

/** @type {Impl['getHazard']} */
export const getHazard = async (body, id) => null;

/** @type {Impl['getHazardDetail']} */
export const getHazardDetail = async (body, id) => null;

/** @type {Impl['deleteHazard']} */
export const deleteHazard = async (body, act, id) => ({ body: emptyDataBody(), hazard: hazard() });

/** @type {Impl['retireHazard']} */
export const retireHazard = async (body, act, id) => ({ body: emptyDataBody(), hazard: hazard() });

/** @type {Impl['addCausalFactor']} */
export const addCausalFactor = async (body, act, hazardId, fields) => ({
  body: emptyDataBody(),
  causalFactor: {
    ...header(),
    id: causalFactorId.parse('00000000-0000-4000-8000-000000000006'),
    kind: 'causal-factor',
    hazardId: HAZARD_ID,
    text: 'Causal factor',
  },
});

/** @type {Impl['addConsequence']} */
export const addConsequence = async (body, act, hazardId, fields) => ({
  body: emptyDataBody(),
  consequence: {
    ...header(),
    id: consequenceId.parse('00000000-0000-4000-8000-000000000007'),
    kind: 'consequence',
    hazardId: HAZARD_ID,
    text: 'Consequence',
  },
});

/** @type {Impl['createControl']} */
export const createControl = async (body, act, fields) => ({ body: emptyDataBody(), control: control() });

/** @type {Impl['listControls']} */
export const listControls = async (body) => [];

/** @type {Impl['retireControl']} */
export const retireControl = async (body, act, id) => ({ body: emptyDataBody(), control: control() });

/** @type {Impl['linkControlToHazard']} */
export const linkControlToHazard = async (body, act, fields) => ({
  body: emptyDataBody(),
  link: { ...header(), id: LINK_ID, kind: 'link', linkKind: 'hazard-control', hazardId: HAZARD_ID, controlId: CONTROL_ID, controlKind: 'preventative' },
});

/** @type {Impl['createPlatform']} */
export const createPlatform = async (body, act, fields) => ({ body: emptyDataBody(), platform: platform() });

/** @type {Impl['listPlatforms']} */
export const listPlatforms = async (body) => [];

/** @type {Impl['retirePlatform']} */
export const retirePlatform = async (body, act, id) => ({ body: emptyDataBody(), platform: platform() });

/** @type {Impl['setPlatformOwner']} */
export const setPlatformOwner = async (body, act, fields) => ({ body: emptyDataBody(), platform: platform() });

/** @type {Impl['linkHazardToPlatform']} */
export const linkHazardToPlatform = async (body, act, fields) => ({ body: emptyDataBody(), link: hazardPlatformLink() });

/** @type {Impl['setPlatformReportId']} */
export const setPlatformReportId = async (body, act, fields) => ({ body: emptyDataBody(), link: hazardPlatformLink() });

/** @type {Impl['confirmControlForPlatform']} */
export const confirmControlForPlatform = async (body, act, fields) => ({
  body: emptyDataBody(),
  link: controlPlatformLink(),
  clearedJustification: null,
});

/** @type {Impl['excludeControlFromPlatform']} */
export const excludeControlFromPlatform = async (body, act, fields) => ({
  body: emptyDataBody(),
  justification: justification(),
  removedLink: null,
});

/** @type {Impl['setRating']} */
export const setRating = async (body, act, fields) => ({
  body: emptyDataBody(),
  rating: {
    ...header(),
    id: ratingId.parse('00000000-0000-4000-8000-000000000008'),
    kind: 'rating',
    hazardId: HAZARD_ID,
    platformId: PLATFORM_ID,
    stage: 'residual',
    ...uncategorised(),
  },
});

/** @type {Impl['getRatings']} */
export const getRatings = async (body, hazardId, platformId) => ({ initial: uncategorised(), residual: uncategorised() });

/** @type {Impl['listPlatformHazards']} */
export const listPlatformHazards = async (body, platformId) => ({ platform: platform(), rows: [], omitted: [] });

/** @type {Impl['platformsAffected']} */
export const platformsAffected = async (body, ref) => [];

/** @type {Impl['listAllHazards']} */
export const listAllHazards = async (body) => [];

/** @type {Impl['listAllControls']} */
export const listAllControls = async (body) => [];

/** @type {Impl['listAllPlatforms']} */
export const listAllPlatforms = async (body) => [];

/** @type {Impl['listLinks']} */
export const listLinks = async (body, ref) => [];
