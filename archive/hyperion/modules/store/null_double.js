/**
 * Null double of store, contract version 4.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when STORE_IMPL=null through a specifier held in a variable, so it is never
 * built into pivot.html. It returns fixed, valid-looking data of the declared types and
 * enforces nothing: no argument is read or checked, nothing is thrown, and no folder, browser
 * storage, or file is read or written. Written from the contract surface alone; the
 * conformance suite must fail against it in every file but operations.
 */

import { emptyDataBody } from '../../baseline/schema.js';
import { saveToken, timestampAest, userProfileId } from '../../baseline/types.js';

/** @typedef {import('./contract.js').StoreImplementation} Impl */
/** @typedef {import('./contract.js').SaveOutcome} SaveOutcome */
/** @typedef {import('./contract.js').ExportFileHandle} ExportFileHandle */
/** @typedef {import('../../baseline/schema.js').SaveStamp} SaveStamp */

const SAVED_AT = timestampAest('2026-01-01T09:00:00+10:00');

/** @returns {SaveStamp} */
function stamp() {
  return {
    savedByProfileId: userProfileId.parse('00000000-0000-4000-8000-000000000001'),
    savedAtAest: SAVED_AT,
    token: saveToken('00000000000000000000000000000000'),
  };
}

/** @returns {SaveOutcome} */
function saveOutcome() {
  return { stamp: stamp(), superseded: null, keptAs: null, mirrorError: null };
}

/** @type {Impl['chooseDataFolder']} */
export const chooseDataFolder = async () => ({ folderName: 'Pivot data' });

/** @type {Impl['openDataFolder']} */
export const openDataFolder = async (handle) => ({ folderName: 'Pivot data' });

/** @type {Impl['readProfiles']} */
export const readProfiles = async (store) => [];

/** @type {Impl['putProfile']} */
export const putProfile = async (store, profile) => {};

/** @type {Impl['load']} */
export const load = async (store) => ({ body: emptyDataBody(), lastSave: null });

/** @type {Impl['checkFolder']} */
export const checkFolder = async (store) => [];

/** @type {Impl['save']} */
export const save = async (store, profile, body) => saveOutcome();

/** @type {Impl['unsavedChanges']} */
export const unsavedChanges = async (store, body) => [];

/** @type {Impl['putStoredFile']} */
export const putStoredFile = async (store, profile, file) => 'files/stored-file';

/** @type {Impl['checkStoredFiles']} */
export const checkStoredFiles = async (store, locations) => [];

/** @type {Impl['noteChange']} */
export const noteChange = async (store, profile, body) => ({ changed: false, backupFile: null, backupError: null, mirrorError: null });

/** @type {Impl['readRecoverable']} */
export const readRecoverable = async (store) => null;

/** @type {Impl['recoverWorkingState']} */
export const recoverWorkingState = async (store, state) => emptyDataBody();

/** @type {Impl['discardWorkingState']} */
export const discardWorkingState = async (store) => {};

/** @type {Impl['listBackups']} */
export const listBackups = async (store) => [];

/** @type {Impl['chooseSaveStateFile']} */
export const chooseSaveStateFile = async () => ({ name: 'pivot-save-state.json', text: '' });

/** @type {Impl['prepareRestore']} */
export const prepareRestore = async (store, source) => ({
  source: { kind: 'backup', file: 'backups/data-20260101-090000.json' },
  body: emptyDataBody(),
  stampInFile: stamp(),
  replaces: null,
});

/** @type {Impl['restore']} */
export const restore = async (store, profile, plan) => saveOutcome();

/** @type {Impl['chooseExportFile']} */
export const chooseExportFile = async (suggestedName) => {
  // A browser file handle cannot be constructed outside a browser; this is the part of one the
  // contract names, with a writable that accepts and discards whatever it is given.
  const writable = { write: async () => {}, close: async () => {} };
  return /** @type {ExportFileHandle} */ (/** @type {unknown} */ ({ name: 'export.txt', createWritable: async () => writable }));
};

/** @type {Impl['writeExportFile']} */
export const writeExportFile = async (target, text) => {};
