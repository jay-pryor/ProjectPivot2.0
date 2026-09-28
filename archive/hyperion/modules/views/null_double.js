/**
 * Null double of views, contract version 11.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when VIEWS_IMPL=null through a specifier held in a variable, so it is never built
 * into pivot.html. It returns fixed, valid-looking data of the declared types and enforces
 * nothing: no argument is read or checked, nothing is thrown, no other module is called, and
 * every operation resolves with the same empty folder screen. Written from the contract
 * surface alone; the conformance suite must fail against it in every file but operations.
 */

/** @typedef {import('./contract.js').ViewsImplementation} Impl */
/** @typedef {import('./contract.js').FolderScreen} FolderScreen */

/** @returns {FolderScreen} */
function screen() {
  return { kind: 'folder', topBar: { folderName: null, profileName: null }, messages: [] };
}

/** @type {Impl['start']} */
export const start = async () => ({ screen: screen() });

/** @type {Impl['chooseFolder']} */
export const chooseFolder = async (app) => screen();

/** @type {Impl['openFolder']} */
export const openFolder = async (app, handle) => screen();

/** @type {Impl['acknowledgeCheck']} */
export const acknowledgeCheck = async (app) => screen();

/** @type {Impl['createProfile']} */
export const createProfile = async (app, name) => screen();

/** @type {Impl['selectProfile']} */
export const selectProfile = async (app, id) => screen();

/** @type {Impl['acceptRecovery']} */
export const acceptRecovery = async (app) => screen();

/** @type {Impl['declineRecovery']} */
export const declineRecovery = async (app) => screen();

/** @type {Impl['addHazard']} */
export const addHazard = async (app, fields) => screen();

/** @type {Impl['save']} */
export const save = async (app) => screen();

/** @type {Impl['beginRestore']} */
export const beginRestore = async (app) => screen();

/** @type {Impl['chooseSaveState']} */
export const chooseSaveState = async (app) => screen();

/** @type {Impl['prepareRestore']} */
export const prepareRestore = async (app, source) => screen();

/** @type {Impl['confirmRestore']} */
export const confirmRestore = async (app) => screen();

/** @type {Impl['cancelRestore']} */
export const cancelRestore = async (app) => screen();

/** @type {Impl['openHazard']} */
export const openHazard = async (app, id) => screen();

/** @type {Impl['renameHazard']} */
export const renameHazard = async (app, fields) => screen();

/** @type {Impl['addCausalFactor']} */
export const addCausalFactor = async (app, fields) => screen();

/** @type {Impl['addConsequence']} */
export const addConsequence = async (app, fields) => screen();

/** @type {Impl['linkControlToHazard']} */
export const linkControlToHazard = async (app, controlId, controlKind) => screen();

/** @type {Impl['retireHazard']} */
export const retireHazard = async (app) => screen();

/** @type {Impl['openControls']} */
export const openControls = async (app) => screen();

/** @type {Impl['createControl']} */
export const createControl = async (app, fields) => screen();

/** @type {Impl['retireControl']} */
export const retireControl = async (app, controlId) => screen();

/** @type {Impl['openPlatforms']} */
export const openPlatforms = async (app) => screen();

/** @type {Impl['createPlatform']} */
export const createPlatform = async (app, fields) => screen();

/** @type {Impl['retirePlatform']} */
export const retirePlatform = async (app, platformId) => screen();

/** @type {Impl['setPlatformOwner']} */
export const setPlatformOwner = async (app, platformId, ownerProfileId) => screen();

/** @type {Impl['openPlatform']} */
export const openPlatform = async (app, id) => screen();

/** @type {Impl['linkHazardToPlatform']} */
export const linkHazardToPlatform = async (app, hazardId) => screen();

/** @type {Impl['openAssessment']} */
export const openAssessment = async (app, hazardId) => screen();

/** @type {Impl['setReportId']} */
export const setReportId = async (app, reportId) => screen();

/** @type {Impl['enterRating']} */
export const enterRating = async (app, stage, values) => screen();

/** @type {Impl['confirmControlForPlatform']} */
export const confirmControlForPlatform = async (app, controlId) => screen();

/** @type {Impl['excludeControlFromPlatform']} */
export const excludeControlFromPlatform = async (app, controlId, text) => screen();

/** @type {Impl['openBowtie']} */
export const openBowtie = async (app) => screen();

/** @type {Impl['chooseExportTarget']} */
export const chooseExportTarget = async (app) => screen();

/** @type {Impl['exportBowtie']} */
export const exportBowtie = async (app, target) => screen();

/** @type {Impl['openReports']} */
export const openReports = async (app) => screen();

/** @type {Impl['createTemplate']} */
export const createTemplate = async (app, fields) => screen();

/** @type {Impl['beginReport']} */
export const beginReport = async (app, fields) => screen();

/** @type {Impl['produceReport']} */
export const produceReport = async (app, bowtieHazardIds) => screen();

/** @type {Impl['openReport']} */
export const openReport = async (app, id) => screen();

/** @type {Impl['chooseReportExportTarget']} */
export const chooseReportExportTarget = async (app, format) => screen();

/** @type {Impl['exportReport']} */
export const exportReport = async (app, target, format) => screen();

/** @type {Impl['openFilter']} */
export const openFilter = async (app) => screen();

/** @type {Impl['applyFilter']} */
export const applyFilter = async (app, filter) => screen();

/** @type {Impl['openDashboard']} */
export const openDashboard = async (app) => screen();

/** @type {Impl['openOpenItems']} */
export const openOpenItems = async (app) => screen();

/** @type {Impl['openHistory']} */
export const openHistory = async (app) => screen();

/** @type {Impl['openAcknowledgements']} */
export const openAcknowledgements = async (app) => screen();

/** @type {Impl['acknowledgeChange']} */
export const acknowledgeChange = async (app, entryId, platformId) => screen();

/** @type {Impl['setReviewTempo']} */
export const setReviewTempo = async (app, fields) => screen();

/** @type {Impl['openReferences']} */
export const openReferences = async (app) => screen();

/** @type {Impl['createReference']} */
export const createReference = async (app, fields) => screen();

/** @type {Impl['openReference']} */
export const openReference = async (app, id) => screen();

/** @type {Impl['linkReference']} */
export const linkReference = async (app, ref) => screen();

/** @type {Impl['openWorkflows']} */
export const openWorkflows = async (app) => screen();

/** @type {Impl['startWorkflow']} */
export const startWorkflow = async (app, fields) => screen();

/** @type {Impl['openWorkflow']} */
export const openWorkflow = async (app, id) => screen();

/** @type {Impl['submitStep']} */
export const submitStep = async (app, submission) => screen();

/** @type {Impl['advanceStep']} */
export const advanceStep = async (app) => screen();

/** @type {Impl['completeWorkflow']} */
export const completeWorkflow = async (app, fields) => screen();

/** @type {Impl['abandonWorkflow']} */
export const abandonWorkflow = async (app) => screen();

/** @type {Impl['confirmEdit']} */
export const confirmEdit = async (app) => screen();

/** @type {Impl['cancelEdit']} */
export const cancelEdit = async (app) => screen();

/** @type {Impl['back']} */
export const back = async (app) => screen();
