/**
 * Null double of workflows, contract version 2.0 (CORE-TST-002, rung 1). Test-only:
 * contract.js selects it when WORKFLOWS_IMPL=null through a specifier held in a variable, so
 * it is never built into pivot.html. It returns fixed, valid-looking data of the declared
 * types and enforces nothing: no argument is read or checked, nothing is thrown, no other
 * module is asked, no act is made or recorded, and every body it returns is a fresh empty one.
 * Written from the contract surface alone; the conformance suite must fail against it in every
 * file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { dateAest, timestampAest, userProfileId, workflowRecordId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').WorkflowsImplementation} Impl */
/** @typedef {import('./contract.js').WorkflowRecord} WorkflowRecord */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');

/** @returns {WorkflowRecord} */
function workflow() {
  return {
    id: workflowRecordId.parse('00000000-0000-4000-8000-000000000002'),
    kind: 'workflow-record',
    status: 'live',
    createdBy: PROFILE_ID,
    createdAtAest: AT,
    updatedBy: PROFILE_ID,
    updatedAtAest: AT,
    workflowKind: 'review-data',
    subject: null,
    state: 'in-progress',
    currentStep: 'review-the-hazards',
    startedOnAest: dateAest('2026-01-01'),
    completedOnAest: null,
    completedBy: null,
    outcome: null,
    entries: [],
  };
}

/** @type {Impl['startWorkflow']} */
export const startWorkflow = async (body, act, fields) => ({ body: emptyDataBody(), workflow: workflow() });

/** @type {Impl['submitStep']} */
export const submitStep = async (body, act, id, submission) => ({ body: emptyDataBody(), workflow: workflow() });

/** @type {Impl['advanceStep']} */
export const advanceStep = async (body, act, id) => ({ body: emptyDataBody(), workflow: workflow() });

/** @type {Impl['completeWorkflow']} */
export const completeWorkflow = async (body, act, id, fields) => ({ body: emptyDataBody(), workflow: workflow() });

/** @type {Impl['abandonWorkflow']} */
export const abandonWorkflow = async (body, act, id) => ({ body: emptyDataBody(), workflow: workflow() });

/** @type {Impl['getWorkflow']} */
export const getWorkflow = async (body, id) => null;

/** @type {Impl['listWorkflows']} */
export const listWorkflows = async (body) => [];

/** @type {Impl['progressOf']} */
export const progressOf = async (body, id) => ({
  record: workflow(),
  steps: ['review-the-hazards', 'record-the-outcome'],
  done: [],
  current: 'review-the-hazards',
  remaining: ['record-the-outcome'],
});

/** @type {Impl['stepDemand']} */
export const stepDemand = async (body, id) => ({ step: 'review-the-hazards', satisfied: true, outstanding: [] });

/** @type {Impl['reviewOmissions']} */
export const reviewOmissions = async (body, id) => [];
