/**
 * Null double of reports, contract version 1.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when REPORTS_IMPL=null through a specifier held in a variable, so it is never
 * built into pivot.html. It returns fixed, valid-looking data of the declared types and
 * enforces nothing: no argument is read or checked, nothing is thrown, no other module is
 * asked, no change is recorded, and every body it returns is a fresh empty one. Written from
 * the contract surface alone; the conformance suite must fail against it in every file but
 * operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { platformId, reportId, reportTemplateId, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').ReportsImplementation} Impl */
/** @typedef {import('./contract.js').ReportTemplate} ReportTemplate */
/** @typedef {import('./contract.js').Report} Report */

const PROFILE_ID = userProfileId.parse('00000000-0000-4000-8000-000000000001');
const AT = timestampAest('2026-01-01T09:00:00+10:00');
const TEMPLATE_ID = reportTemplateId.parse('00000000-0000-4000-8000-000000000002');
const STAMPS = /** @type {const} */ ({ status: 'live', createdBy: PROFILE_ID, createdAtAest: AT, updatedBy: PROFILE_ID, updatedAtAest: AT });

/** @returns {ReportTemplate} */
function template() {
  return { ...STAMPS, id: TEMPLATE_ID, kind: 'report-template', name: 'Template', title: 'Report', sections: [{ sectionKind: 'hazards' }] };
}

/** @returns {Report} */
function report() {
  return {
    ...STAMPS,
    id: reportId.parse('00000000-0000-4000-8000-000000000003'),
    kind: 'report',
    templateId: TEMPLATE_ID,
    templateName: 'Template',
    title: 'Report',
    sections: [{ sectionKind: 'hazards' }],
    platformId: platformId.parse('00000000-0000-4000-8000-000000000004'),
    platformName: 'Platform',
    hazards: [],
    omitted: [],
    bowties: [],
    outOfDate: [],
  };
}

/** @type {Impl['createTemplate']} */
export const createTemplate = async (body, act, fields) => ({ body: emptyDataBody(), template: template() });

/** @type {Impl['getTemplate']} */
export const getTemplate = async (body, id) => null;

/** @type {Impl['listTemplates']} */
export const listTemplates = async (body) => [];

/** @type {Impl['outOfDateFor']} */
export const outOfDateFor = async (body, platformId) => [];

/** @type {Impl['produceReport']} */
export const produceReport = async (body, act, fields) => ({ body: emptyDataBody(), report: report() });

/** @type {Impl['getReport']} */
export const getReport = async (body, id) => null;

/** @type {Impl['listReports']} */
export const listReports = async (body) => [];

/** @type {Impl['includesOf']} */
export const includesOf = async (report) => ({ platformIds: [], hazardIds: [], omittedHazardIds: [], controlIds: [] });

/** @type {Impl['reportsIncluding']} */
export const reportsIncluding = async (body, ref) => [];

/** @type {Impl['renderReportHtml']} */
export const renderReportHtml = async (report) => '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Report</title></head><body></body></html>\n';

/** @type {Impl['renderReportMarkdown']} */
export const renderReportMarkdown = async (report) => '# Report\n';
