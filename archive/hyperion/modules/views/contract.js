/**
 * Contract: views, version 11.0. The module's sole import surface (CORE-CON-003). The one
 * module that draws (DEC-004): it shows the working state as one screen at a time and
 * carries what the user does to the module that owns the data. The surface is the screen
 * as plain data plus the operations the user can perform on it; drawing that data into the
 * page is the implementation's, entered from `src/main.js`, the entry the build names
 * (DEC-003), and verified by demonstration (DEC-010). Clause IDs (C-nnn) are defined in
 * CONTRACT.md beside this file and cited by the conformance suite.
 *
 * At 3.0 the five screens SL-03's record model is entered and read on are added — a
 * hazard's own detail, the control library, the platforms, one platform's hazards, and one
 * hazard's assessment on one platform — and with them this module's two halves of SL-03:
 * every list of a platform's hazards is one `registry.listPlatformHazards` (C-020,
 * REQ-009, HZ-004), and every band shown is `rating.ratingFor` of the values as entered
 * (C-021, REQ-017, HZ-010).
 *
 * At 4.0 each of a hazard's controls is shown against a platform in the one state registry
 * C-021 gives it — `confirmed`, `excluded` with the reason a person wrote, or `awaiting` a
 * ruling — and is moved between those states by the two acts DEC-014 replaced 3.0's
 * `linkControlToPlatform` and `unlinkControlFromPlatform` with, one control per act (C-024,
 * C-025; REQ-002; HZ-001, HZ-007).
 *
 * At 5.0 the history and the queue are read and answered: the whole history of every act on
 * one screen (C-028), the platforms an edit reaches listed and proceeded past before the edit
 * is made (C-027, REQ-011), the queue of every platform the active profile owns with the act
 * that clears one entry of it (C-029), and the three retirements with the refusal that names
 * the platforms in the way (C-030). Every changing `registry` call now carries the `Act` this
 * module builds from the selected profile and the platform the screen holds (C-026, DEC-016);
 * an entry is never written from here, only read — `registry` records its own acts (registry
 * C-023) and `change-log.acknowledge` is the one append this surface makes.
 *
 * At 6.0 every screen that shows a record of a schedulable kind carries that body's review
 * standing — the tempo and the due date a user set for each, and which of them are overdue —
 * as the two lists `review-schedule.listSchedules` and `review-schedule.listOverdue` gave for
 * that body, and from no rule of this module's own (C-031; REQ-019, REQ-023; HZ-012); and one
 * operation, `setReviewTempo`, sets the tempo and the due date of one hazard, control, or
 * platform from the screen that lists it, gated by the platforms it reaches like any other
 * edit (C-032, C-027; DEC-021). Nothing here completes a review: the last reviewed date moves
 * only through `review-schedule.completeReview`, which this surface does not offer and
 * `workflows` calls at SL-07, so editing a record here never sets it (SL-06 criterion 3).
 *
 * At 7.0 the reference register is kept on two screens: the register, every entry as
 * `reference-register.listEntries` gave it with what the user entered shown back and a chosen
 * file carried to the folder with only its location on the entry (C-033; REQ-028, REQ-029), and
 * one entry's own screen, everything that entry is linked to in one list from the entry's own
 * links and from no second place, with one act that adds one more (C-034; REQ-030, REQ-031).
 * Both carry the flag SL-10 criterion 4 asks for, from one `reference-register.checkEntryFiles`
 * of that body and that folder and from no rule of this module's own, so an entry whose stored
 * file has gone is flagged in every list that shows it (C-035; REQ-078) — the file half only,
 * a typed path being one no module can stat under DEC-003 (DEC-022). The platforms a reference
 * act reaches are the union of `registry.platformsAffected` over the entry's links, which is
 * what the `EntryAct` carries and what the confirm-edit screen lists when `linkReference` is
 * gated, C-027's seventh (C-026, DEC-024). A reference entry is flagged overdue here like any
 * other schedulable record (C-031), which answers REQ-023's third kind; setting its tempo is
 * out of SL-10's scope and stays off this surface (C-032).
 *
 * At 8.0 the five guided workflows get their screens: the register of workflows, every live one
 * as `workflows.listWorkflows` gave it and the act that starts one of the five on the record it
 * is performed on (C-036), and one workflow's own screen, the step it is at with the steps done
 * and the steps remaining from one `workflows.progressOf` and what that step still asks from one
 * `workflows.stepDemand` (C-037; REQ-037's visible half, SL-07 criterion 1). A workflow performed
 * on a platform shows that platform's hazards from the one `registry.listPlatformHazards` every
 * other list of them is made from, each row with the band `rating` gave and each omitted hazard
 * named (C-020, C-021, C-024; SL-07 criterion 3), and one performed on a hazard shows that
 * hazard's detail from the one `registry.getHazardDetail` its own screen is built from (C-016).
 * The four acts of a running workflow — submit a step, advance, complete, abandon — are each one
 * call to `workflows` and nothing of this module's own: no step list, no demand, no seal, and no
 * act a step makes (C-038). Completing is where this surface first causes a last reviewed date to
 * move, through `workflows` and never by a call of its own (C-009, C-032, C-038).
 *
 * Every changing workflow operation is gated by C-027 on `registry.platformsAffected` of the
 * workflow's subject, which is the same ref DEC-026 gives the entry each of them appends, so the
 * invariant this contract has kept since 5.0 holds without an exception: an operation is gated
 * exactly when the entry its act appends carries two or more platform ids (DEC-027).
 *
 * At 9.0 one hazard on one platform is shown as its bow-tie, on a screen reached from that pair's
 * assessment screen: the `Bowtie` value `bowtie.bowtieFor` gave for the working body and the SVG
 * document `bowtie.renderBowtieSvg` drew from it, both generated when the screen is built and
 * held nowhere after it (C-039; REQ-059's shown half; SL-08 criteria 1 and 2). Exporting writes
 * that drawing, generated again from the same body, to a file the user chose, through
 * `store.writeExportFile` and nothing else, and the screen it resolves with carries the text that
 * was written (C-040; REQ-060; SL-08 criterion 3, DEC-030, DEC-031). Neither act changes the
 * working body, the data folder, or the browser's storage, so neither is told to `store`, gated,
 * or recorded in the history.
 *
 * At 10.0 reports get their screens: the reports screen, every live template and report as
 * `reports` gave them and the act that saves a template (C-041; REQ-046); the screen before a
 * report, the platform's hazards from the one `registry.listPlatformHazards` to choose bow-ties
 * from, and the warning, with each record's last reviewed date, whenever `reports.outOfDateFor`
 * names a record past its review due date and never otherwise, which is the list the act that
 * produces the report hands back to `reports` (C-042; REQ-016; HZ-009; SL-09 criteria 2, 3 and 5);
 * and one report's own screen, the report as stored with the hazards, platforms, and controls it
 * includes, and its download in either output form through `store.writeExportFile` (C-043;
 * REQ-027; SL-09 criterion 4, DEC-030). A hazard's own screen gains the platforms it is linked to,
 * each with that hazard's controls on it, and the reports that include it (C-044; REQ-026).
 * Producing a report and saving a template are each one call to `reports`, told to `store` and
 * never gated; downloading a report changes nothing (DEC-035).
 *
 * At 11.0 the last three screens: the filter screen, every hazard and control whatever its status,
 * each against every platform whose one `registry.listPlatformHazards` shows it, narrowed by
 * platform, residual band, record status, control state, and reference entry, singly and together
 * (C-045; REQ-047); the dashboard, the overdue reviews, awaiting controls, in-progress workflows,
 * and unacknowledged changes of each live platform the active profile owns and of no other (C-046;
 * REQ-049); and the open-items screen, the same for every live platform whatever its owner, what is
 * on no live platform, and every live record linked to nothing (C-047, C-048; REQ-066, REQ-068).
 * Each only reads; the readings of SL-11's criteria are jay-pryor's rulings in
 * `docs/slices/SL-11.md`, and the reads of every status and every link are `registry` 5.0's
 * (DEC-036, DEC-037).
 *
 * Every operation delegates to the selected implementation: `src/views.js` in production,
 * `null_double.js` when `VIEWS_IMPL=null` is set in the environment (CORE-TST-002, rung 1).
 * The null double is test-only and never embedded in the built pivot.html, which is why
 * its specifier is held in a variable: the build inlines only quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').UserProfile} UserProfile */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').PlatformReportId} PlatformReportId */
/** @typedef {import('../../baseline/types.js').ChangeLogEntryId} ChangeLogEntryId */
/** @typedef {import('../../baseline/types.js').ControlKind} ControlKind */
/** @typedef {import('../../baseline/types.js').RatingStage} RatingStage */
/** @typedef {import('../../baseline/types.js').DateAest} DateAest */
/** @typedef {import('../../baseline/types.js').ReviewTempoMonths} ReviewTempoMonths */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').ReferenceEntryId} ReferenceEntryId */
/** @typedef {import('../../baseline/types.js').WorkflowRecordId} WorkflowRecordId */
/** @typedef {import('../../baseline/schema.js').SaveStamp} SaveStamp */
/** @typedef {import('../../baseline/messages.js').UserMessage} UserMessage */
/** @typedef {import('../store/contract.js').DataFolderHandle} DataFolderHandle */
/** @typedef {import('../store/contract.js').BackupEntry} BackupEntry */
/** @typedef {import('../store/contract.js').RestoreSource} RestoreSource */
/** @typedef {import('../store/contract.js').ExportFileHandle} ExportFileHandle */
/** @typedef {import('../bowtie/contract.js').Bowtie} Bowtie */
/** @typedef {import('../bowtie/contract.js').BowtieSvgText} BowtieSvgText */
/** @typedef {import('../registry/contract.js').Hazard} Hazard */
/** @typedef {import('../registry/contract.js').HazardFields} HazardFields */
/** @typedef {import('../registry/contract.js').TextFields} TextFields */
/** @typedef {import('../registry/contract.js').Control} Control */
/** @typedef {import('../registry/contract.js').ControlFields} ControlFields */
/** @typedef {import('../registry/contract.js').Platform} Platform */
/** @typedef {import('../registry/contract.js').PlatformFields} PlatformFields */
/** @typedef {import('../registry/contract.js').CausalFactor} CausalFactor */
/** @typedef {import('../registry/contract.js').Consequence} Consequence */
/** @typedef {import('../registry/contract.js').HazardControl} HazardControl */
/** @typedef {import('../registry/contract.js').PlatformControl} PlatformControl */
/** @typedef {import('../registry/contract.js').ControlPlatformState} ControlPlatformState */
/** @typedef {import('../registry/contract.js').Confirmation} Confirmation */
/** @typedef {import('../registry/contract.js').Justification} Justification */
/** @typedef {import('../registry/contract.js').PlatformHazardRow} PlatformHazardRow */
/** @typedef {import('../registry/contract.js').OmittedHazard} OmittedHazard */
/** @typedef {import('../registry/contract.js').RatingValues} RatingValues */
/** @typedef {import('../rating/contract.js').Rating} Rating */
/** @typedef {import('../change-log/contract.js').ChangeLogEntry} ChangeLogEntry */
/** @typedef {import('../change-log/contract.js').RecordChangeEntry} RecordChangeEntry */
/** @typedef {import('../change-log/contract.js').ChangedItem} ChangedItem */
/** @typedef {import('../change-log/contract.js').FieldChange} FieldChange */
/** @typedef {import('../change-log/contract.js').ItemAction} ItemAction */
/** @typedef {import('../review-schedule/contract.js').ReviewSchedule} ReviewSchedule */
/** @typedef {import('../review-schedule/contract.js').ReviewState} ReviewState */
/** @typedef {import('../review-schedule/contract.js').ScheduleFields} ScheduleFields */
/** @typedef {import('../reference-register/contract.js').ReferenceEntry} ReferenceEntry */
/** @typedef {import('../reference-register/contract.js').EntryFields} EntryFields */
/** @typedef {import('../reference-register/contract.js').EntryFileState} EntryFileState */
/** @typedef {import('../workflows/contract.js').WorkflowRecord} WorkflowRecord */
/** @typedef {import('../workflows/contract.js').WorkflowProgress} WorkflowProgress */
/** @typedef {import('../workflows/contract.js').StepDemand} StepDemand */
/** @typedef {import('../workflows/contract.js').StartFields} StartFields */
/** @typedef {import('../workflows/contract.js').StepSubmission} StepSubmission */
/** @typedef {import('../workflows/contract.js').CompletionFields} CompletionFields */
/** @typedef {import('../../baseline/types.js').ReportId} ReportId */
/** @typedef {import('../../baseline/types.js').ReportTemplateId} ReportTemplateId */
/** @typedef {import('../reports/contract.js').Report} Report */
/** @typedef {import('../reports/contract.js').ReportTemplate} ReportTemplate */
/** @typedef {import('../reports/contract.js').TemplateFields} TemplateFields */
/** @typedef {import('../reports/contract.js').OutOfDateRecord} OutOfDateRecord */
/** @typedef {import('../reports/contract.js').ReportIncludes} ReportIncludes */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../rating/contract.js').RatingBand} RatingBand */

// ------------------------------------------------------------------ data shapes

/**
 * @typedef {'folder' | 'check' | 'profile' | 'recover' | 'hazards' | 'restore'
 *   | 'confirm-restore' | 'hazard' | 'controls' | 'platforms' | 'platform' | 'assessment'
 *   | 'history' | 'acknowledge' | 'confirm-edit' | 'references' | 'reference'
 *   | 'workflows' | 'workflow' | 'bowtie' | 'reports' | 'prepare-report' | 'report'
 *   | 'filter' | 'dashboard' | 'open-items'
 * } ScreenKind
 */

/**
 * Drawn on every screen (REQ-057). Both null at `start`; `folderName` set by opening a
 * folder (C-003), `profileName` by selecting a profile and never changed after (C-005).
 * @typedef {object} TopBar
 * @property {string | null} folderName the chosen folder's name once one is open
 * @property {string | null} profileName the active profile's name once one is selected
 */

/**
 * One body's review standing, and the only thing any screen of this module says about when a
 * record is next reviewed (C-031; REQ-019, REQ-023). Both lists are exactly what
 * `review-schedule` gave for the body the screen is built from, in its order: nothing here is
 * filtered, reordered, joined, or derived, and this module holds no clock, no month
 * arithmetic, and no overdue boundary of its own (C-009).
 *
 * A record's schedule is the entry of `schedules` whose `ref` is that record's kind and id, or
 * none when no entry has one; it is overdue exactly when an entry of `overdue` has that ref.
 * A screen's `reviews` is null when a schedule in that body could not be read
 * (`MalformedScheduleError`), which is not the same as both lists being empty and is never
 * drawn as a record having no schedule or as not being overdue (HZ-012).
 * @typedef {object} Reviews
 * @property {readonly ReviewSchedule[]} schedules exactly `review-schedule.listSchedules` of this body, ascending `nextDueAest` then id
 * @property {readonly ReviewState[]} overdue exactly `review-schedule.listOverdue` of this body, in its order; every entry has `overdue` true and the same `asAtAest`
 */

/**
 * One register's file standing, and the only thing any screen of this module says about whether
 * a reference entry's stored file is still there (C-035; REQ-078). It is exactly what
 * `reference-register.checkEntryFiles` gave for the body the screen is built from and the folder
 * that app has open, in its order, one per live entry: nothing here is filtered, reordered,
 * joined, or derived, and this module never opens, names, or lists a file itself (C-009).
 *
 * An entry is flagged exactly when the entry of this list with its `entryId` has `flagged` true.
 * An entry whose `fileLocation` is null carries `flagged: false` with `reason: null`, which says
 * the entry has no file and not that a file is there. A screen's `files` is null when the data
 * folder could not be read, which is not the same as an empty list and is never drawn as an
 * entry's file being present (store C-019).
 * @typedef {readonly EntryFileState[]} Files
 */

/**
 * One record a reference entry is linked to (C-034, REQ-031). The ref is the one the entry
 * holds, unchanged and never resolved to anything else; the name is what the entry screen's own
 * `registry` lists give for it, and null when they give none — a kind those lists do not carry,
 * or a record no longer live. A null `name` is a record this module cannot name, never a record
 * it drops.
 * @typedef {object} LinkedRecord
 * @property {RecordRef} ref the ref as the entry holds it (`reference-register` C-008)
 * @property {string | null} name the live hazard's or control's `title`, or the live platform's `name`, with that id; null otherwise
 */

/**
 * The first screen: choose the data folder (REQ-069). `chooseFolder` and `openFolder`
 * belong to it (C-002).
 * @typedef {object} FolderScreen
 * @property {'folder'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages what the last operation had to tell the user
 */

/**
 * The kept backups and superseded saves that failed their check, shown before anything
 * from the folder (C-010). `acknowledgeCheck` belongs to it (C-002).
 * @typedef {object} CheckScreen
 * @property {'check'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per failed file: its name, then the data it affects
 */

/**
 * The profiles stored in the folder, none selected (REQ-054, REQ-073), and the form to
 * create one (REQ-056). `createProfile` and `selectProfile` belong to it (C-002).
 * @typedef {object} ProfileScreen
 * @property {'profile'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order
 */

/**
 * The offer to recover working state the browser holds and the folder does not (REQ-080).
 * `acceptRecovery` and `declineRecovery` belong to it (C-002, C-013).
 * @typedef {object} RecoverScreen
 * @property {'recover'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {TimestampAest} mirroredAtAest when the browser's copy was last written
 * @property {SaveStamp | null} basedOn the stamp of the data that working state was changed from
 * @property {readonly Hazard[]} hazards every live hazard in that working state, in registry C-006's order
 * @property {Reviews | null} reviews that working state's review standing, not the loaded body's (C-031)
 */

/**
 * The hazards the working body holds, above the form to add one, the save, the way to
 * restore, and the way to every other screen (C-015). `addHazard`, `save`, `beginRestore`,
 * `openHazard`, `openControls`, and `openPlatforms` belong to it (C-002); only
 * `selectProfile` leads to it, so nothing on it is offered before a profile is selected
 * (REQ-055).
 * @typedef {object} HazardsScreen
 * @property {'hazards'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly Hazard[]} hazards every live hazard in the working body, in registry C-006's order
 * @property {boolean} unsaved true from any change to the working body, on whichever screen it was made, until a `save` or `confirmRestore` resolves (C-006, C-007, C-013, C-014, C-015)
 * @property {SaveStamp | null} lastSave the stamp of the data this app loaded or last saved or restored; null until the folder has been saved to
 * @property {Reviews | null} reviews the working body's review standing, from the two calls of C-031
 */

/**
 * The kept backups to restore from, and the way to choose a save state file (REQ-064).
 * `chooseSaveState`, `prepareRestore`, and `cancelRestore` belong to it (C-002, C-014).
 * @typedef {object} RestoreScreen
 * @property {'restore'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly BackupEntry[]} backups every kept backup, newest first
 */

/**
 * The warning before a restore, waiting for confirmation (REQ-075). `confirmRestore` and
 * `cancelRestore` belong to it (C-002, C-014).
 * @typedef {object} ConfirmRestoreScreen
 * @property {'confirm-restore'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages exactly one `warning`, whose items name the unsaved changes the restore would discard
 * @property {string} restoring the backup's file, or the save state file's name
 * @property {SaveStamp} stampInFile the stamp the file carries
 * @property {SaveStamp | null} replaces the stamp of the stored data the restore replaces
 * @property {string | null} replacesSavedBy the name of the profile that saved `replaces`, or its id when no stored profile has it
 * @property {readonly Hazard[]} hazards every live hazard in the file, in registry C-006's order
 * @property {Reviews | null} reviews the review standing of the body in the file, not of the one held (C-031)
 */

/**
 * One platform a hazard is linked to, as the hazard's own screen shows it (C-044; REQ-026): the
 * platform and that hazard's row of the one `registry.listPlatformHazards` for it. Exactly one of
 * `controls` and `omitted` is null: `controls` is the row's controls, each in the state registry
 * gave it on that platform (C-024), and `omitted` is the query's entry for the hazard when it could
 * not build the row, which is named and never dropped (HZ-004).
 * @typedef {object} HazardOnPlatform
 * @property {Platform} platform as that `listPlatformHazards` gave it
 * @property {readonly PlatformControl[] | null} controls every one of the hazard's controls on that platform, in the row's order; null when the hazard is omitted there
 * @property {OmittedHazard | null} omitted the query's entry for this hazard when it is omitted there; null otherwise
 */

/**
 * One hazard as stored against the hazard itself: platform-independent, so it is the same
 * whichever platform the hazard is linked to (C-016, registry C-004), with the platforms it is
 * linked to and the reports that include it (C-044). `renameHazard`,
 * `addCausalFactor`, `addConsequence`, `linkControlToHazard`, and `back` belong to it
 * (C-002).
 * @typedef {object} HazardScreen
 * @property {'hazard'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {Hazard} hazard the one record every platform's row reads (C-019)
 * @property {readonly CausalFactor[]} causalFactors every live causal factor of this hazard, in registry C-010's order
 * @property {readonly Consequence[]} consequences every live consequence of this hazard, in registry C-010's order
 * @property {readonly HazardControl[]} controls each of the hazard's controls with the side it sits on, in registry C-012's order
 * @property {readonly Control[]} linkableControls every live library control not yet one of this hazard's, in registry C-011's order
 * @property {readonly HazardOnPlatform[]} platforms one per platform `registry.platformsAffected` gave for this hazard, in its order (C-044)
 * @property {readonly Report[]} reports exactly what `reports.reportsIncluding` gave for this hazard, in its order (C-044)
 * @property {Reviews | null} reviews the working body's review standing; this hazard's schedule is the entry with its ref (C-031, C-032)
 */

/**
 * The control library: one entry per control, naming no hazard and no platform (DEC-013,
 * REQ-032). `createControl` and `back` belong to it (C-002, C-017).
 * @typedef {object} ControlsScreen
 * @property {'controls'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly Control[]} controls every live control, once each, in registry C-011's order
 * @property {Reviews | null} reviews the working body's review standing; each control's schedule is the entry with its ref (C-031, C-032)
 */

/**
 * The platforms, and the profiles one may be owned by (REQ-065). `createPlatform`,
 * `openPlatform`, and `back` belong to it (C-002, C-018).
 * @typedef {object} PlatformsScreen
 * @property {'platforms'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly Platform[]} platforms every live platform, in registry C-014's order
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: whom a platform may be owned by, and how a stored owner is drawn as a name
 * @property {Reviews | null} reviews the working body's review standing; each platform's schedule is the entry with its ref (C-031, C-032)
 */

/**
 * One platform's hazards, as `registry.listPlatformHazards` gave them and from no other
 * list (C-020, REQ-009, HZ-004). `linkHazardToPlatform`, `openAssessment`, and `back`
 * belong to it (C-002).
 * @typedef {object} PlatformScreen
 * @property {'platform'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per omitted hazard: its id, then the omitting record's key
 * @property {Platform} platform
 * @property {readonly PlatformRow[]} rows the query's rows, in its order, each with its band (C-021)
 * @property {readonly OmittedHazard[]} omitted the query's omitted hazards, in its order: named, never dropped
 * @property {readonly Hazard[]} linkableHazards every live hazard not in `rows` or `omitted`, in registry C-006's order; the picker, not a list of this platform's hazards
 * @property {Reviews | null} reviews the working body's review standing, which is how every row and every omitted hazard is flagged overdue (C-031)
 */

/**
 * One row of a platform's hazards: `registry`'s row unchanged, plus the band `rating`
 * gave for that row's residual values (C-021). Nothing of the row is dropped or reordered, so
 * its `controls` carry the state each is in on this platform, with its confirmation or its
 * justification (C-024).
 * @typedef {PlatformHazardRow & { residualRating: Rating }} PlatformRow
 */

/**
 * One hazard on one platform: what it is called in this platform's reports, its controls
 * each in the one state it is in on this platform, and the two ratings as entered with their
 * bands (C-021 to C-025). `setReportId`, `enterRating`, `confirmControlForPlatform`,
 * `excludeControlFromPlatform`, and `back` belong to it (C-002).
 * @typedef {object} AssessmentScreen
 * @property {'assessment'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {Platform} platform
 * @property {Hazard} hazard
 * @property {PlatformReportId} reportId this hazard's ID in this platform's reports (C-023)
 * @property {readonly PlatformControl[]} controls every one of the hazard's controls, in registry C-019's order, each with the `state`, `confirmation`, and `justification` registry gave it; only `confirmed` is on this platform (C-024)
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: how a confirmation's `byProfileId` is drawn as a name, empty when the list could not be read (section 4)
 * @property {RatingValues} initial exactly what the assessor entered, both null when nothing was
 * @property {Rating} initialRating `rating.ratingFor` of `initial`, and nothing else (C-021)
 * @property {RatingValues} residual exactly what the assessor entered; no control link changes it (C-022)
 * @property {Rating} residualRating `rating.ratingFor` of `residual`, and nothing else (C-021)
 * @property {Reviews | null} reviews the working body's review standing, which is how this hazard, this platform, and each control is flagged overdue (C-031)
 */

/**
 * One hazard on one platform as its bow-tie: the value `bowtie.bowtieFor` gave for the working
 * body and the document `bowtie.renderBowtieSvg` drew from that value, both from the calls made
 * to build this screen and neither kept after it (C-039; REQ-059). No rating is on it (C-039).
 * `chooseExportTarget`, `exportBowtie`, and `back` belong to it (C-002).
 * @typedef {object} BowtieScreen
 * @property {'bowtie'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {Bowtie} bowtie exactly what `bowtie.bowtieFor` gave for the hazard and the platform the assessment screen held
 * @property {BowtieSvgText} svg exactly what `bowtie.renderBowtieSvg` gave for `bowtie`; the drawing the page shows, and after `exportBowtie` the text written (C-040)
 * @property {Reviews | null} reviews the working body's review standing, which is how this hazard, this platform, and each control is flagged overdue (C-031)
 */

/**
 * Every act ever recorded in the working body, of both entry kinds, in `change-log` C-009's
 * order and with nothing filtered, grouped, or paged (C-028, REQ-010, REQ-045). Any user
 * reading the body sees the same screen. `back` belongs to it (C-002).
 * @typedef {object} HistoryScreen
 * @property {'history'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly ChangeLogEntry[] } entries exactly what `change-log.listEntries` gave, each with its items and each item's field changes as the entry holds them
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: how an entry's `createdBy` is drawn as a name, empty when the list could not be read (section 4)
 */

/**
 * What one platform has yet to acknowledge: the platform, and exactly the entries
 * `change-log.listAwaiting` gave for it, in its order. `entries` is empty when it awaits
 * nothing, which is a queue with nothing in it and not an absent one (C-029).
 * @typedef {object} PlatformQueue
 * @property {Platform} platform one the active profile owns
 * @property {readonly RecordChangeEntry[]} entries each the whole act: every record it changed, with each field's previous and new value
 */

/**
 * One queue per platform the active profile owns, which is what REQ-012 and REQ-081 ask this
 * module to show and whom to show it to. `acknowledgeChange` and `back` belong to it (C-002).
 * @typedef {object} AcknowledgeScreen
 * @property {'acknowledge'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly PlatformQueue[]} queues one per platform whose `ownerProfileId` is the active profile's, in registry C-014's order; empty when it owns none
 * @property {readonly UserProfile[]} profiles as the history screen's (C-028)
 * @property {Reviews | null} reviews the working body's review standing; each queue's platform is flagged from it (C-031)
 */

/**
 * One platform a change reaches, as `registry.platformsAffected` named it (C-027).
 * @typedef {object} AffectedPlatform
 * @property {PlatformId} id
 * @property {string} name the live platform's `name` with that id, or the id itself when none has it (section 3)
 */

/**
 * The edit the confirm-edit screen is waiting on, carrying the values it was given as the
 * user gave them and untrimmed, and the records the screen it was called on holds. `control`
 * is the entry of that screen's own list with the `controlId` given, and null when no entry
 * of it has one, which `confirmEdit` then carries registry's refusal for (section 4). The
 * `setReviewTempo` variant carries no record: `fields.ref` names it, and C-032 has already
 * refused a ref the screen it was called on does not offer a tempo for (DEC-021). The
 * `linkReference` variant carries the entry its screen holds, as `renameHazard`'s carries the
 * hazard; its `ref` is one of that screen's own linkable lists, C-034 having refused any other
 * before the gate (DEC-024). The four workflow variants each carry the `WorkflowRecord` the
 * workflow screen holds, as `renameHazard`'s carries the hazard, and the values the operation was
 * given; `startWorkflow` has no variant, because a subject that is a platform reaches exactly the
 * one platform it names and one that is null reaches none, so it cannot gate (C-027, DEC-027).
 * @typedef {{ operation: 'renameHazard', hazard: Hazard, title: string }
 *   | { operation: 'addCausalFactor', hazard: Hazard, text: string }
 *   | { operation: 'addConsequence', hazard: Hazard, text: string }
 *   | { operation: 'linkControlToHazard', hazard: Hazard, control: Control | null,
 *       controlId: ControlId, controlKind: ControlKind }
 *   | { operation: 'retireControl', control: Control | null, controlId: ControlId }
 *   | { operation: 'setReviewTempo', fields: ScheduleFields }
 *   | { operation: 'linkReference', entry: ReferenceEntry, ref: RecordRef }
 *   | { operation: 'submitStep', workflow: WorkflowRecord, submission: StepSubmission }
 *   | { operation: 'advanceStep', workflow: WorkflowRecord }
 *   | { operation: 'completeWorkflow', workflow: WorkflowRecord, fields: CompletionFields }
 *   | { operation: 'abandonWorkflow', workflow: WorkflowRecord }
 * } PendingEdit
 */

/**
 * The platforms an edit changes, listed before the edit is made and waiting for the user to
 * proceed past them (REQ-011, HZ-006; SL-05 criterion 3). Nothing has been changed, stored,
 * or recorded while it is shown. `confirmEdit` and `cancelEdit` belong to it, and nothing
 * else does (C-002, C-027).
 * @typedef {object} ConfirmEditScreen
 * @property {'confirm-edit'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {PendingEdit} editing
 * @property {readonly AffectedPlatform[]} affected every platform the edit changes, in `platformsAffected`' order; never fewer than two, because one or none is not a gate
 * @property {Reviews | null} reviews the working body's review standing, unchanged while the edit waits (C-031)
 */

/**
 * The reference register: every live entry, with what the user entered shown back and only the
 * location of a carried file on it (C-033; REQ-028, REQ-029; SL-10 criteria 1 and 2).
 * `createReference`, `openReference`, and `back` belong to it (C-002).
 * @typedef {object} ReferencesScreen
 * @property {'references'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly ReferenceEntry[]} entries every live entry, once each, in `reference-register` C-005's order, each field as stored
 * @property {Files | null} files this register's file standing, which is how every row is flagged (C-035); null when the folder could not be read
 * @property {Reviews | null} reviews the working body's review standing; each entry's schedule is the entry with its ref (C-031)
 */

/**
 * One reference entry as stored and everything it is linked to, in one list from the entry's own
 * links and from no second place (C-034; REQ-030, REQ-031; SL-10 criterion 3). `linkReference`
 * and `back` belong to it (C-002).
 * @typedef {object} ReferenceScreen
 * @property {'reference'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {ReferenceEntry} entry as `reference-register.getEntry` gave it
 * @property {readonly LinkedRecord[]} links one per ref of `entry.links`, all of them, in `reference-register` C-008's order
 * @property {readonly Hazard[]} linkableHazards every live hazard no ref of `entry.links` names, in registry C-006's order; a picker, not a list of what the entry is linked to
 * @property {readonly Control[]} linkableControls every live control no ref of `entry.links` names, in registry C-011's order
 * @property {readonly Platform[]} linkablePlatforms every live platform no ref of `entry.links` names, in registry C-014's order
 * @property {Files | null} files this register's file standing, which is how this entry is flagged (C-035)
 * @property {Reviews | null} reviews the working body's review standing; this entry's schedule is the entry with its ref (C-031)
 */

/**
 * One workflow in the register of workflows: the record as `workflows.listWorkflows` gave it,
 * beside the name of the record it is performed on (C-036). `subjectName` is the `title` of the
 * live hazard or the `name` of the live platform the subject names, from this screen's own
 * `registry` lists, and null in every other case — a subject not yet created, and one naming a
 * record no longer live. A null `subjectName` is a workflow this module cannot name, never a
 * workflow it drops, as a `LinkedRecord`'s null name is (C-034).
 * @typedef {object} WorkflowRow
 * @property {WorkflowRecord} workflow as `workflows.listWorkflows` gave it, every field unchanged
 * @property {string | null} subjectName the live hazard's `title` or the live platform's `name` with the subject's id; null otherwise
 */

/**
 * The register of workflows: every live workflow the working body holds, in progress and
 * complete, and the platforms one may be started on (C-036; SL-07 criterion 1).
 * `startWorkflow`, `openWorkflow`, and `back` belong to it (C-002).
 * @typedef {object} WorkflowsScreen
 * @property {'workflows'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly WorkflowRow[]} workflows every live workflow record, once each, in `workflows` C-012's order; an abandoned one is not listed
 * @property {readonly Platform[]} platforms every live platform, in registry C-014's order: the subject a workflow performed on one is started with
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: how a workflow's `createdBy` and `completedBy` are drawn as names
 * @property {Reviews | null} reviews the working body's review standing; each listed platform's schedule is the entry with its ref (C-031)
 */

/**
 * One workflow as a sequence of named steps, with the step it is at, the steps done, the steps
 * remaining, what that step still asks, and the record the workflow is performed on shown the
 * way that record's own screen shows it (C-037; SL-07 criteria 1, 2, 3 and 5). `submitStep`,
 * `advanceStep`, `completeWorkflow`, `abandonWorkflow`, and `back` belong to it (C-002).
 *
 * The subject fields are read once, by kind: a `platform` subject gives `platform`, `rows`, and
 * `omitted` from the one `registry.listPlatformHazards` every list of a platform's hazards is
 * made from (C-020), and a `hazard` subject gives `hazard`, `causalFactors`, `consequences`, and
 * `controls` from the one `registry.getHazardDetail` the hazard's own screen is built from
 * (C-016). Each group is null for a workflow whose subject is not of that kind, or has none yet,
 * which says the workflow is not performed on such a record and never that the record is empty.
 * @typedef {object} WorkflowScreen
 * @property {'workflow'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per omitted hazard when the subject is a platform, in its order (C-020)
 * @property {WorkflowProgress} progress exactly what `workflows.progressOf` gave: the record, its steps, the steps done, the step current, and the steps remaining (REQ-037)
 * @property {StepDemand | null} demand exactly what `workflows.stepDemand` gave; null exactly when the workflow is complete or abandoned, which asks nothing more (C-037)
 * @property {string | null} subjectName the subject's name as `WorkflowRow`'s rule gives it, from the one read this screen makes for the subject
 * @property {Platform | null} platform the subject platform as `registry.listPlatformHazards` gave it; null when the subject is not a live platform
 * @property {readonly PlatformRow[] | null} rows that platform's hazards, in the query's order, each with its band (C-021); null when the subject is not a live platform
 * @property {readonly OmittedHazard[] | null} omitted the query's omitted hazards, in its order: named, never dropped (HZ-004); null when the subject is not a live platform
 * @property {Hazard | null} hazard the subject hazard as `registry.getHazardDetail` gave it; null when the subject is not a live hazard
 * @property {readonly CausalFactor[] | null} causalFactors that hazard's, in registry C-010's order; null when the subject is not a live hazard
 * @property {readonly Consequence[] | null} consequences that hazard's, in registry C-010's order; null when the subject is not a live hazard
 * @property {readonly HazardControl[] | null} controls that hazard's, in registry C-012's order; null when the subject is not a live hazard
 * @property {readonly Hazard[]} linkableHazards at `select-hazards`, every live hazard no entry of `rows` or `omitted` names, in registry C-006's order; empty at every other step
 * @property {readonly Control[]} linkableControls at `choose-controls`, every live control no entry of `controls` names, in registry C-011's order; empty at every other step
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: the owner a platform is named or transferred to, and how each entry's `byProfileId` is drawn as a name
 * @property {Reviews | null} reviews the working body's review standing, which is how every row, every omitted hazard, and the subject itself is flagged overdue (C-031)
 */

/**
 * The two output forms a report is downloaded in (SL-09's G3 decision): `html` is
 * `reports.renderReportHtml`, `markdown` is `reports.renderReportMarkdown` (C-043).
 * @typedef {'html' | 'markdown'} ReportFormat
 */

/**
 * What a user picks before a report is prepared: a template of the reports screen's list and a
 * platform of its list (C-042).
 * @typedef {object} BeginReportFields
 * @property {ReportTemplateId} templateId
 * @property {PlatformId} platformId
 */

/**
 * The saved templates and the produced reports, and the platforms a report may be produced on
 * (C-041; REQ-046). `createTemplate`, `beginReport`, `openReport`, and `back` belong to it (C-002).
 * @typedef {object} ReportsScreen
 * @property {'reports'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {readonly ReportTemplate[]} templates exactly what `reports.listTemplates` gave, in its order
 * @property {readonly Report[]} reports exactly what `reports.listReports` gave, in its order
 * @property {readonly Platform[]} platforms every live platform, in registry C-014's order: what a report may be produced on
 * @property {Reviews | null} reviews the working body's review standing; each listed platform's schedule is the entry with its ref (C-031)
 */

/**
 * A report not yet produced: the template and the platform picked, the platform's hazards from the
 * one query every list of them is made from with each omitted hazard named, and every record the
 * report would use that is past its review due date (C-042; REQ-016; HZ-009). `produceReport` and
 * `back` belong to it (C-002). Nothing is stored while it is shown.
 * @typedef {object} PrepareReportScreen
 * @property {'prepare-report'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages the one `warning` naming each record of `outOfDate` with its last reviewed date when that list is not empty, then one `error` per omitted hazard (C-020, C-042)
 * @property {ReportTemplate} template the template picked, as `reports.getTemplate` gave it
 * @property {Platform} platform as `registry.listPlatformHazards` gave it
 * @property {readonly PlatformRow[]} rows the query's rows, in its order, each with its band (C-021): the hazards whose bow-tie may be included
 * @property {readonly OmittedHazard[]} omitted the query's omitted hazards, in its order: named, never dropped
 * @property {readonly OutOfDateRecord[]} outOfDate exactly what `reports.outOfDateFor` gave for this platform; empty when nothing the report uses is past due, and then no warning is shown
 * @property {Reviews | null} reviews the working body's review standing (C-031)
 */

/**
 * One produced report as `reports` stored it, and what it includes, read from the report and not
 * from the records it names (C-043; REQ-027). `chooseReportExportTarget`, `exportReport`, and `back`
 * belong to it (C-002). It carries no `reviews`: it shows what a report held when it was produced,
 * not a record as it now is (C-031).
 * @typedef {object} ReportScreen
 * @property {'report'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages
 * @property {Report} report exactly what `reports.getReport` gave
 * @property {ReportIncludes} includes exactly what `reports.includesOf` gave for `report`: the platforms, hazards, omitted hazards, and controls it includes
 */

/**
 * The five filters of SL-11 criterion 1, each null when it is not active (C-045). A non-null value
 * must be one of the filter screen's `platforms` or `entries`, or one of the named values;
 * `applyFilter` refuses any other with nothing called.
 * @typedef {object} ItemFilter
 * @property {PlatformId | null} platformId an item listed against this platform
 * @property {RatingBand | null} band an item whose `residualRating.band` is this band, compared for equality
 * @property {RecordStatus | null} recordStatus a hazard or a control whose own `status` is this
 * @property {ControlPlatformState | null} controlState a control item in this state on its row; no hazard has one, so `hazards` is empty while it is active
 * @property {ReferenceEntryId | null} referenceEntryId a hazard or control this entry links to directly
 */

/**
 * One hazard listed against one platform, or against none (C-045). Against a platform it is a row
 * of that platform's one query, with the band `rating.ratingFor` gave for the row's residual, or a
 * hazard that query omitted, with no band. Against none it is a hazard no query shows, which is
 * every retired and deleted hazard (registry C-019).
 * @typedef {object} HazardItem
 * @property {Hazard} hazard as `registry.listAllHazards` gave it, whatever its status
 * @property {Platform | null} platform the platform whose query shows it; null when none does
 * @property {OmittedHazard | null} omitted that query's entry when it omitted the hazard; null otherwise
 * @property {Rating | null} residualRating the row's residual band (C-021); null when omitted or against no platform, which is never the `Uncategorised` band
 */

/**
 * One control listed against one hazard row of one platform, or against none (C-045).
 * @typedef {object} ControlItem
 * @property {Control} control the row's `PlatformControl.control`, or `registry.listAllControls`' entry when against no row
 * @property {Hazard | null} hazard the row's hazard; null when against no row
 * @property {Platform | null} platform the row's platform; null when against no row
 * @property {PlatformControl | null} platformControl the control's entry of the row's `controls`, unchanged (C-024); null when against no row
 * @property {Rating | null} residualRating the row's residual band, which is the control's band as SL-11 criterion 1 rules; null when against no row
 */

/**
 * Every hazard and control whatever its status, less what fails an active filter, and what a
 * filter is chosen from (C-045; REQ-047; SL-11 criterion 1). `applyFilter` and `back` belong to it
 * (C-002). Nothing is stored while it is shown.
 * @typedef {object} FilterScreen
 * @property {'filter'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per hazard a platform's query omitted, in platform order then query order (C-020)
 * @property {ItemFilter} filter the filter applied; every value null from `openFilter`
 * @property {readonly HazardItem[]} hazards the unfiltered hazard items that satisfy every active filter, in the unfiltered order
 * @property {readonly ControlItem[]} controls the unfiltered control items that satisfy every active filter, in the unfiltered order
 * @property {readonly Platform[]} platforms exactly `registry.listAllPlatforms`: what a platform filter is chosen from
 * @property {readonly ReferenceEntry[]} entries exactly `reference-register.listEntries`: what a reference-entry filter is chosen from
 * @property {Files | null} files the register's file standing, since `entries` lists entries (C-035)
 * @property {Reviews | null} reviews the working body's review standing (C-031)
 */

/**
 * One of a row's controls awaiting a ruling, beside the row's hazard (C-046).
 * @typedef {object} UnconfirmedControl
 * @property {Hazard} hazard the row's hazard
 * @property {PlatformControl} control the row's entry, unchanged, whose `state` is `awaiting`
 */

/**
 * The open items of one live platform (C-046). Every list is a selection, by equality, from what
 * the owning contract gave for that platform or that body; nothing is derived.
 * @typedef {object} PlatformItems
 * @property {Platform} platform as `registry.listPlatforms` gave it
 * @property {readonly ReviewState[] | null} overdue entries of `reviews.overdue` whose ref is in the platform's review set (CONTRACT.md section 3); null when `reviews` is null or the reference entries could not be read
 * @property {readonly UnconfirmedControl[]} unconfirmed every `awaiting` control of the platform's query's rows, in row then control order
 * @property {readonly OmittedHazard[]} omitted exactly the query's `omitted`: hazards whose items could not be read, named, never dropped
 * @property {readonly WorkflowRecord[]} workflows every in-progress workflow whose subject is this platform, in `workflows` C-012's order
 * @property {readonly RecordChangeEntry[]} awaiting exactly `change-log.listAwaiting` for this platform
 */

/**
 * The active profile's dashboard: the open items of each live platform it owns, and nothing of
 * any other (C-046; REQ-049; SL-11 criterion 2). `back` belongs to it (C-002).
 * @typedef {object} DashboardScreen
 * @property {'dashboard'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per omitted hazard, in platform order then query order (C-020)
 * @property {readonly PlatformItems[]} platforms one per live platform whose `ownerProfileId` is the active profile's, in registry C-014's order
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: how an entry's `createdBy` is drawn
 * @property {Reviews | null} reviews the working body's review standing (C-031)
 */

/**
 * The open items on no live platform (C-047).
 * @typedef {object} UnplacedItems
 * @property {readonly ReviewState[] | null} overdue entries of `reviews.overdue` whose ref is in no live platform's review set; null when any platform's `overdue` is
 * @property {readonly WorkflowRow[]} workflows every in-progress workflow whose subject is not a live platform, in `workflows` C-012's order
 */

/**
 * One live record linked to nothing (C-048; REQ-068).
 * @typedef {object} UnlinkedRecord
 * @property {RecordRef} ref its kind — `hazard`, `control`, `platform`, or `reference-entry` — and id
 * @property {string | null} name the hazard's or control's `title`, the platform's `name`, or the entry's `name`
 */

/**
 * Every open item whatever its owner, in a view apart from the dashboard (C-047, C-048; REQ-066,
 * REQ-068; SL-11 criteria 3 and 4). `back` belongs to it (C-002).
 * @typedef {object} OpenItemsScreen
 * @property {'open-items'} kind
 * @property {TopBar} topBar
 * @property {readonly UserMessage[]} messages one `error` per omitted hazard, in platform order then query order (C-020)
 * @property {readonly PlatformItems[]} platforms one per live platform whatever its owner, in registry C-014's order, each as C-046 builds it
 * @property {UnplacedItems} unplaced the overdue reviews and in-progress workflows on no live platform
 * @property {readonly UnlinkedRecord[] | null} unlinked every live hazard, control, platform, and reference entry linked to nothing, in that order; null when a link could not be read, which is never drawn as none
 * @property {readonly UserProfile[]} profiles every stored profile, in profiles C-005's order: how an owner and an entry's `createdBy` are drawn
 * @property {Files | null} files the register's file standing, since `unlinked` may list entries (C-035)
 * @property {Reviews | null} reviews the working body's review standing (C-031)
 */

/**
 * What the page shows now. Plain data and read-only: every field is a string, a boolean,
 * null, or a value another contract made, so a test compares screens by deep equality.
 * @typedef {FolderScreen | CheckScreen | ProfileScreen | RecoverScreen | HazardsScreen
 *   | RestoreScreen | ConfirmRestoreScreen | HazardScreen | ControlsScreen
 *   | PlatformsScreen | PlatformScreen | AssessmentScreen | HistoryScreen
 *   | AcknowledgeScreen | ConfirmEditScreen | ReferencesScreen | ReferenceScreen
 *   | WorkflowsScreen | WorkflowScreen | BowtieScreen | ReportsScreen
 *   | PrepareReportScreen | ReportScreen | FilterScreen | DashboardScreen | OpenItemsScreen
 * } Screen
 */

/**
 * One open of Pivot, from the page's load to its close. Opaque beyond `screen`: consumers
 * hold it and pass it back, and read `screen` after each operation (C-001).
 * @typedef {object} App
 * @property {Screen} screen
 */

// ------------------------------------------------------------------ error conditions

/**
 * C-002: an operation called on a screen it does not belong to. The app is unchanged and
 * no module operation was called. The only rejection this contract has; every failure a
 * module signals becomes a message on the screen instead (section 4, C-008).
 */
export class WrongScreenError extends Error {
  /**
   * @param {string} operation the operation called
   * @param {ScreenKind} screen the kind of screen the app was showing
   */
  constructor(operation, screen) {
    super(`${operation} is not offered on the ${screen} screen`);
    this.name = 'WrongScreenError';
    this.operation = operation;
    this.screen = screen;
  }
}

// ------------------------------------------------------------------ operations: folder and profile

/**
 * A new open of Pivot at the folder screen, with nothing chosen, nothing selected, and
 * nothing read or written. C-001.
 * @returns {Promise<App>}
 */
export async function start() {
  return (await impl()).start();
}

/**
 * Ask the user for the data folder through the browser's directory picker
 * (`store.chooseDataFolder`), then open it as `openFolder` does. Browser only; verified by
 * demonstration on a target machine (SL-01 criterion 1). A cancelled picker or a denied
 * folder resolves with the folder screen and a message (section 4). C-001, C-002, C-003, C-010.
 * @param {App} app on the folder screen
 * @returns {Promise<Screen>}
 */
export async function chooseFolder(app) {
  return (await impl()).chooseFolder(app);
}

/**
 * Open a folder already in hand: check every file Pivot wrote, then load its data and list
 * its profiles. A failed stored data or profiles file, or a folder that cannot be read,
 * resolves with the folder screen, a message naming each file, and nothing kept; a failed
 * backup or superseded save resolves with the check screen; otherwise the profile screen
 * with no one selected. Writes nothing. C-001, C-002, C-003, C-010.
 * @param {App} app on the folder screen
 * @param {DataFolderHandle} handle the data folder (REQ-069)
 * @returns {Promise<Screen>}
 */
export async function openFolder(app, handle) {
  return (await impl()).openFolder(app, handle);
}

/**
 * The user has read which files failed their check: show the profile screen the open
 * would have shown. Calls no module operation. C-003, C-010.
 * @param {App} app on the check screen
 * @returns {Promise<Screen>}
 */
export async function acknowledgeCheck(app) {
  return (await impl()).acknowledgeCheck(app);
}

/**
 * Create a profile named `name` (trimmed) in the folder and show the profile screen with
 * the list re-read; selects nothing. A blank or duplicate name, or a failed write, resolves
 * with the profile screen and a message, nothing written. C-002, C-004.
 * @param {App} app on the profile screen
 * @param {string} name what the user typed (REQ-056)
 * @returns {Promise<Screen>}
 */
export async function createProfile(app, name) {
  return (await impl()).createProfile(app, name);
}

/**
 * Act as the stored profile with this id for the rest of the open. When the browser holds
 * working state never saved, show the recover screen; otherwise the hazards screen: the
 * name in the top bar from here on, the live hazards of the loaded body, nothing unsaved.
 * An id no stored profile has resolves with the profile screen, the list re-read, and a
 * message. C-002, C-004, C-005, C-013.
 * @param {App} app on the profile screen
 * @param {UserProfileId} id one of the listed profiles
 * @returns {Promise<Screen>}
 */
export async function selectProfile(app, id) {
  return (await impl()).selectProfile(app, id);
}

// ------------------------------------------------------------------ operations: recovery

/**
 * Take the browser's unsaved working state as the working body and show it on the hazards
 * screen, marked unsaved. Writes nothing to the folder until `save`. C-002, C-013.
 * @param {App} app on the recover screen
 * @returns {Promise<Screen>}
 */
export async function acceptRecovery(app) {
  return (await impl()).acceptRecovery(app);
}

/**
 * Discard the browser's unsaved working state and show the hazards screen of the loaded
 * body. Writes nothing to the folder. C-002, C-013.
 * @param {App} app on the recover screen
 * @returns {Promise<Screen>}
 */
export async function declineRecovery(app) {
  return (await impl()).declineRecovery(app);
}

// ------------------------------------------------------------------ operations: hazards and save

/**
 * Add a hazard to the working body through `registry.createHazard`, tell `store` of the
 * change (`noteChange`, which mirrors it and backs it up when an hour has passed), and show
 * it in the list, marked unsaved; `data.json` is not written until `save`. A blank title or
 * a sequence that would reuse an id resolves with the hazards screen and a message, nothing
 * changed. C-002, C-006, C-008, C-012.
 * @param {App} app on the hazards screen
 * @param {HazardFields} fields
 * @returns {Promise<Screen>}
 */
export async function addHazard(app, fields) {
  return (await impl()).addHazard(app, fields);
}

/**
 * Write the working body to the folder through `store.save` as the active profile. When
 * another user saved since this app loaded, the screen carries a warning naming that user
 * and the file their data was kept as. A save that did not happen resolves with an error
 * message naming every change not stored, and the working body kept. C-002, C-007, C-008,
 * C-011.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function save(app) {
  return (await impl()).save(app);
}

// ------------------------------------------------------------------ operations: restore

/**
 * Show the kept backups to restore from. Writes nothing. C-002, C-014.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function beginRestore(app) {
  return (await impl()).beginRestore(app);
}

/**
 * Ask the user for a save state file through the browser's file picker
 * (`store.chooseSaveStateFile`), then prepare it as `prepareRestore` does. Browser only;
 * verified by demonstration (SL-02 criterion 4). Writes nothing. C-002, C-014.
 * @param {App} app on the restore screen
 * @returns {Promise<Screen>}
 */
export async function chooseSaveState(app) {
  return (await impl()).chooseSaveState(app);
}

/**
 * Read a kept backup or a save state file already in hand, through the one path both
 * share, and show the warning that the stored data will be replaced, naming the unsaved
 * changes the restore would discard. Writes nothing. C-002, C-014.
 * @param {App} app on the restore screen
 * @param {RestoreSource} source
 * @returns {Promise<Screen>}
 */
export async function prepareRestore(app, source) {
  return (await impl()).prepareRestore(app, source);
}

/**
 * The user confirmed: restore through `store.restore` as the active profile and show the
 * restored hazards. A restore that did not happen resolves with the hazards screen as it
 * was and an error message. C-002, C-007, C-008, C-014.
 * @param {App} app on the confirm-restore screen
 * @returns {Promise<Screen>}
 */
export async function confirmRestore(app) {
  return (await impl()).confirmRestore(app);
}

/**
 * Leave the restore without restoring: show the hazards screen as it was at `beginRestore`.
 * Calls no module operation. C-002, C-014.
 * @param {App} app on the restore or confirm-restore screen
 * @returns {Promise<Screen>}
 */
export async function cancelRestore(app) {
  return (await impl()).cancelRestore(app);
}

// ------------------------------------------------------------------ operations: one hazard

/**
 * Show what is stored against one hazard: its causal factors, its consequences, its
 * controls with the side each sits on, and the library controls it could take. On no
 * platform: the same screen whichever platform the hazard is linked to. Writes nothing.
 * C-002, C-015, C-016.
 * @param {App} app on the hazards screen
 * @param {HazardId} id one of the listed hazards
 * @returns {Promise<Screen>}
 */
export async function openHazard(app, id) {
  return (await impl()).openHazard(app, id);
}

/**
 * Change this hazard's title through `registry.updateHazard` and tell `store`. The change
 * is on the one record, so every platform the hazard is linked to shows the new title — and
 * when that is more than one platform, the act waits on the confirm-edit screen until the
 * user has been past the list of them (C-027, REQ-011). A blank title, or the title already
 * stored, resolves with the screen as before and a message. C-002, C-012, C-016, C-027.
 * @param {App} app on the hazard screen
 * @param {HazardFields} fields
 * @returns {Promise<Screen>}
 */
export async function renameHazard(app, fields) {
  return (await impl()).renameHazard(app, fields);
}

/**
 * Add a causal factor to this hazard through `registry.addCausalFactor` and tell `store`.
 * Shown back as stored. When the hazard is on more than one platform the act waits past the
 * list of them (C-027). A blank text resolves with the screen as before and a message.
 * C-002, C-012, C-016, C-027.
 * @param {App} app on the hazard screen
 * @param {TextFields} fields
 * @returns {Promise<Screen>}
 */
export async function addCausalFactor(app, fields) {
  return (await impl()).addCausalFactor(app, fields);
}

/**
 * Add a consequence to this hazard through `registry.addConsequence` and tell `store`.
 * Shown back as stored. When the hazard is on more than one platform the act waits past the
 * list of them (C-027). A blank text resolves with the screen as before and a message.
 * C-002, C-012, C-016, C-027.
 * @param {App} app on the hazard screen
 * @param {TextFields} fields
 * @returns {Promise<Screen>}
 */
export async function addConsequence(app, fields) {
  return (await impl()).addConsequence(app, fields);
}

/**
 * Link a library control to this hazard, preventative or mitigating, through
 * `registry.linkControlToHazard`, and tell `store`. The library entry is unchanged: the
 * side is a fact about this hazard's use of the control (DEC-013). When the hazard is on more
 * than one platform the act waits past the list of them (C-027). A control already
 * linked, or a kind outside the two, resolves with the screen as before and a message.
 * C-002, C-012, C-017, C-027.
 * @param {App} app on the hazard screen
 * @param {ControlId} controlId one of `linkableControls`
 * @param {ControlKind} controlKind which side of the hazard it sits on (REQ-044)
 * @returns {Promise<Screen>}
 */
export async function linkControlToHazard(app, controlId, controlKind) {
  return (await impl()).linkControlToHazard(app, controlId, controlKind);
}

/**
 * Mark the hazard this screen holds retired through `registry.retireHazard`, tell `store`,
 * and show the hazards screen without it. A hazard linked to any platform is refused, with
 * the platforms named on the screen as before and nothing stored (REQ-076). Nothing is taken
 * off any platform and nothing is un-retired. C-002, C-012, C-030.
 * @param {App} app on the hazard screen
 * @returns {Promise<Screen>}
 */
export async function retireHazard(app) {
  return (await impl()).retireHazard(app);
}

// ------------------------------------------------------------------ operations: the control library

/**
 * Show the control library: every control once, naming no hazard and no platform
 * (REQ-032). Writes nothing. C-002, C-015, C-017.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openControls(app) {
  return (await impl()).openControls(app);
}

/**
 * Add a control to the library through `registry.createControl` and tell `store`. A blank
 * title resolves with the screen as before and a message. C-002, C-012, C-017.
 * @param {App} app on the controls screen
 * @param {ControlFields} fields
 * @returns {Promise<Screen>}
 */
export async function createControl(app, fields) {
  return (await impl()).createControl(app, fields);
}

/**
 * Mark one library control retired through `registry.retireControl` and tell `store`. It
 * leaves this screen and every hazard's `linkableControls`, and stays exactly where a person
 * already put it: every hazard it is linked to still lists it, and every platform it was
 * confirmed for still shows it confirmed (registry C-027). When it is on more than one
 * platform the act waits for the user past the list of them (C-027). C-002, C-012, C-030.
 * @param {App} app on the controls screen
 * @param {ControlId} controlId one of `controls`
 * @returns {Promise<Screen>}
 */
export async function retireControl(app, controlId) {
  return (await impl()).retireControl(app, controlId);
}

// ------------------------------------------------------------------ operations: platforms

/**
 * Show the platforms and the profiles one may be owned by. Writes nothing. C-002, C-015,
 * C-018.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openPlatforms(app) {
  return (await impl()).openPlatforms(app);
}

/**
 * Add a platform with exactly one owner through `registry.createPlatform` and tell
 * `store`. Every existing hazard, control, link, and reference entry is left as it was
 * (registry C-014). A blank name or an owner that is not a profile id resolves with the
 * screen as before and a message. C-002, C-012, C-018.
 * @param {App} app on the platforms screen
 * @param {PlatformFields} fields the name, and the one profile that owns it (REQ-065)
 * @returns {Promise<Screen>}
 */
export async function createPlatform(app, fields) {
  return (await impl()).createPlatform(app, fields);
}

/**
 * Mark one platform retired through `registry.retirePlatform` and tell `store`. It leaves
 * this screen, so it is not opened or linked to again; its rows, its links, and its
 * acknowledgement queue are untouched (registry C-027). C-002, C-012, C-030.
 * @param {App} app on the platforms screen
 * @param {PlatformId} platformId one of `platforms`
 * @returns {Promise<Screen>}
 */
export async function retirePlatform(app, platformId) {
  return (await impl()).retirePlatform(app, platformId);
}

/**
 * Give one platform a different owner, chosen from the stored profiles, through
 * `registry.setPlatformOwner`, and tell `store`. Nothing of that platform's queue is
 * touched, so every change the outgoing owner had not acknowledged is what the incoming owner
 * reads on the acknowledgement screen (REQ-081; `change-log` C-012). The owner the platform
 * already has is refused. C-002, C-012, C-018, C-029.
 * @param {App} app on the platforms screen
 * @param {PlatformId} platformId one of `platforms`
 * @param {UserProfileId} ownerProfileId one of `profiles` (REQ-065)
 * @returns {Promise<Screen>}
 */
export async function setPlatformOwner(app, platformId, ownerProfileId) {
  return (await impl()).setPlatformOwner(app, platformId, ownerProfileId);
}

/**
 * Show one platform's hazards: the one `registry.listPlatformHazards` result, each row
 * with the band `rating` gives for its residual values, every omitted hazard named in a
 * message, and the hazards that could still be linked. Writes nothing. C-002, C-015,
 * C-020, C-021.
 * @param {App} app on the platforms screen
 * @param {PlatformId} id one of the listed platforms
 * @returns {Promise<Screen>}
 */
export async function openPlatform(app, id) {
  return (await impl()).openPlatform(app, id);
}

/**
 * Link a hazard to this platform through `registry.linkHazardToPlatform` and tell `store`.
 * The hazard is stored once: the link copies none of it, and editing its title afterwards
 * changes what every platform shows. A hazard already linked resolves with the screen as
 * before and a message. C-002, C-012, C-019.
 * @param {App} app on the platform screen
 * @param {HazardId} hazardId one of `linkableHazards`
 * @returns {Promise<Screen>}
 */
export async function linkHazardToPlatform(app, hazardId) {
  return (await impl()).linkHazardToPlatform(app, hazardId);
}

// ------------------------------------------------------------------ operations: one hazard on one platform

/**
 * Show one hazard's assessment on this platform: its ID in this platform's reports, every one
 * of its controls in the state it is in on this platform — confirmed by whom and when,
 * excluded with the reason, or awaiting a ruling — the profiles those names are drawn from,
 * and the initial and residual values as entered with their bands. A hazard the query omitted
 * resolves with the platform screen and its message. Writes nothing. C-002, C-015, C-021,
 * C-022, C-024.
 * @param {App} app on the platform screen
 * @param {HazardId} hazardId the hazard of one of the rows
 * @returns {Promise<Screen>}
 */
export async function openAssessment(app, hazardId) {
  return (await impl()).openAssessment(app, hazardId);
}

/**
 * Change this hazard's ID in this platform's reports through
 * `registry.setPlatformReportId` and tell `store`. The hazard's global ID and its ID on
 * every other platform are unchanged. An empty or space-padded value resolves with the
 * screen as before and a message. C-002, C-012, C-023.
 * @param {App} app on the assessment screen
 * @param {PlatformReportId} reportId what the user typed (REQ-052)
 * @returns {Promise<Screen>}
 */
export async function setReportId(app, reportId) {
  return (await impl()).setReportId(app, reportId);
}

/**
 * Enter the consequence and likelihood for one stage of this hazard on this platform,
 * through `registry.setRating`, and tell `store`. Shown back exactly as entered, with the
 * band `rating.ratingFor` gives for them and no other; a value outside the scales is
 * refused by `registry` and shown nowhere. C-002, C-012, C-021, C-022.
 * @param {App} app on the assessment screen
 * @param {RatingStage} stage which of the two ratings is being entered
 * @param {RatingValues} values what the assessor entered; either null is the uncategorised case
 * @returns {Promise<Screen>}
 */
export async function enterRating(app, stage, values) {
  return (await impl()).enterRating(app, stage, values);
}

/**
 * Confirm one of this hazard's controls for this platform, through
 * `registry.confirmControlForPlatform`, and tell `store`. This is the only way a control
 * reaches a platform, and it names one control: the confirmation records the active profile
 * and the time (registry C-022), the control is shown as the platform's from then on, and any
 * reason recorded for leaving it off is superseded. The same control on another platform, and
 * the hazard's own screen, are unchanged; neither rating changes. C-002, C-012, C-024, C-025.
 * @param {App} app on the assessment screen
 * @param {ControlId} controlId one of `controls`, not already `confirmed` on this platform
 * @returns {Promise<Screen>}
 */
export async function confirmControlForPlatform(app, controlId) {
  return (await impl()).confirmControlForPlatform(app, controlId);
}

/**
 * Rule one of this hazard's controls off this platform, with the reason the user wrote,
 * through `registry.excludeControlFromPlatform`, and tell `store`. The reason is required: a
 * blank text is refused and nothing is stored, so a control is never taken off a platform
 * without one (REQ-058). The control stays one of the hazard's and is still shown against the
 * platform, now as `excluded` with its reason; neither rating changes. C-002, C-012, C-024,
 * C-025.
 * @param {App} app on the assessment screen
 * @param {ControlId} controlId one of `controls`, not already `excluded` on this platform
 * @param {string} text why the control is not on this platform, as the user typed it
 * @returns {Promise<Screen>}
 */
export async function excludeControlFromPlatform(app, controlId, text) {
  return (await impl()).excludeControlFromPlatform(app, controlId, text);
}

// ------------------------------------------------------------------ operations: the bow-tie

/**
 * Show this hazard on this platform as its bow-tie: one `bowtie.bowtieFor` of the working body
 * and one `bowtie.renderBowtieSvg` of what it gave, so the drawing is the registry's data as it
 * now is and no copy of it (REQ-018, REQ-059; SL-08 criteria 1 and 2). A bow-tie that cannot be
 * complete is not shown: the assessment screen, or the platform screen for an omitted hazard,
 * carries the message instead. Writes nothing anywhere and keeps nothing after the next screen.
 * C-002, C-015, C-031, C-039.
 * @param {App} app on the assessment screen
 * @returns {Promise<Screen>}
 */
export async function openBowtie(app) {
  return (await impl()).openBowtie(app);
}

/**
 * Ask the user where to write this bow-tie, through `store.chooseExportFile`, then do what
 * `exportBowtie` does with the file they chose. It talks to the browser, so the suite cannot
 * reach it and it is verified by demonstration (SL-08 criterion 3). A cancelled picker writes
 * nothing. C-002, C-040.
 * @param {App} app on the bow-tie screen
 * @returns {Promise<Screen>}
 */
export async function chooseExportTarget(app) {
  return (await impl()).chooseExportTarget(app);
}

/**
 * Write this bow-tie to `target`: generate it again from the working body with one
 * `bowtie.bowtieFor` and one `bowtie.renderBowtieSvg`, write that text through one
 * `store.writeExportFile`, and resolve with the bow-tie screen whose `svg` is the text written,
 * so the exported drawing and the shown one are one string (REQ-060; SL-08 criterion 3). Changes
 * nothing in the working body, the data folder, or the browser's storage: it is not told to
 * `store`, not gated, and not in the history. A write that did not complete leaves `target` as it
 * was and resolves with the screen as before and a message. C-002, C-009, C-040.
 * @param {App} app on the bow-tie screen
 * @param {ExportFileHandle} target the file the user chose; a test supplies an in-memory one
 * @returns {Promise<Screen>}
 */
export async function exportBowtie(app, target) {
  return (await impl()).exportBowtie(app, target);
}

// ------------------------------------------------------------------ operations: reports

/**
 * Show the saved templates, the produced reports, and the platforms a report may be produced on
 * (REQ-046; SL-09 criterion 1). Writes nothing. C-002, C-015, C-041.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openReports(app) {
  return (await impl()).openReports(app);
}

/**
 * Save a template through `reports.createTemplate` and tell `store`, resolving with the reports
 * screen listing it (REQ-046; SL-09 criterion 1). `fields` is passed through untouched. A blank
 * name or title, or sections without exactly one place for the hazards, resolves with the screen
 * as before and a message, nothing stored. Never gated: a template reaches no platform.
 * C-002, C-012, C-026, C-041.
 * @param {App} app on the reports screen
 * @param {TemplateFields} fields the name, the title, and the sections as the user laid them out
 * @returns {Promise<Screen>}
 */
export async function createTemplate(app, fields) {
  return (await impl()).createTemplate(app, fields);
}

/**
 * Prepare a report from a template of this screen's list on a platform of its list: show that
 * platform's hazards from the one `registry.listPlatformHazards`, and, whenever
 * `reports.outOfDateFor` names a record the report would use that is past its review due date,
 * warn with each such record's last reviewed date; with nothing past due, no warning (REQ-016;
 * SL-09 criterion 3). A template or a platform outside the lists resolves with the screen as
 * before and a message, nothing called. Writes nothing. C-002, C-015, C-020, C-021, C-042.
 * @param {App} app on the reports screen
 * @param {BeginReportFields} fields the template and the platform picked
 * @returns {Promise<Screen>}
 */
export async function beginReport(app, fields) {
  return (await impl()).beginReport(app, fields);
}

/**
 * Produce the report this screen prepares through `reports.produceReport`, with the bow-tie of each
 * hazard named and exactly the out-of-date list this screen showed, and tell `store`, resolving with
 * the report's own screen (REQ-007, REQ-016, REQ-061; SL-09 criteria 2, 3 and 5). A hazard not in
 * `rows` resolves with the screen as before and a message, nothing called. When the out-of-date
 * list has changed since this screen was built, nothing is produced and this screen is shown again
 * with the list as it now is. Never gated: a report reaches the one platform it is on.
 * C-002, C-012, C-026, C-042.
 * @param {App} app on the prepare-report screen
 * @param {readonly HazardId[]} bowtieHazardIds hazards of `rows` whose bow-tie the report is to hold; empty for none
 * @returns {Promise<Screen>}
 */
export async function produceReport(app, bowtieHazardIds) {
  return (await impl()).produceReport(app, bowtieHazardIds);
}

/**
 * Show one produced report as stored, with the platforms, hazards, and controls it includes read
 * from the report (REQ-027; SL-09 criterion 4). Writes nothing. C-002, C-015, C-043.
 * @param {App} app on the reports screen
 * @param {ReportId} id one of that screen's reports
 * @returns {Promise<Screen>}
 */
export async function openReport(app, id) {
  return (await impl()).openReport(app, id);
}

/**
 * Ask the user where to write this report, through `store.chooseExportFile`, then do what
 * `exportReport` does with the file they chose. It talks to the browser, so the suite cannot reach
 * it and it is verified by demonstration. A cancelled picker writes nothing. C-002, C-043.
 * @param {App} app on the report screen
 * @param {ReportFormat} format which of the two documents
 * @returns {Promise<Screen>}
 */
export async function chooseReportExportTarget(app, format) {
  return (await impl()).chooseReportExportTarget(app, format);
}

/**
 * Write this report's document in `format` to `target`: one `reports.renderReportHtml` or
 * `reports.renderReportMarkdown` of the report as stored, written through one
 * `store.writeExportFile` (SL-09's G3 decision). Changes nothing in the working body, the data
 * folder, or the browser's storage: not told to `store`, not gated, not in the history. A format
 * outside the two resolves with the screen as before and a message, nothing called; a write that
 * did not complete leaves `target` as it was. C-002, C-009, C-043.
 * @param {App} app on the report screen
 * @param {ExportFileHandle} target the file the user chose; a test supplies an in-memory one
 * @param {ReportFormat} format which of the two documents
 * @returns {Promise<Screen>}
 */
export async function exportReport(app, target, format) {
  return (await impl()).exportReport(app, target, format);
}

// ------------------------------------------------------------------ operations: the history and the queue

/**
 * Show every act ever recorded in the working body: who performed it, when, every record it
 * changed, and each changed field's previous and new value, including of a record since
 * deleted or retired (REQ-010, REQ-045). Takes no profile and no platform: any user reading
 * the body sees this screen. Writes nothing. C-002, C-015, C-028.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openHistory(app) {
  return (await impl()).openHistory(app);
}

/**
 * Show what each platform the active profile owns has yet to acknowledge: one queue per such
 * platform, each entry the whole act and every item it affected (REQ-012). A platform whose
 * owner has just changed carries what the outgoing owner had not acknowledged (REQ-081).
 * Writes nothing. C-002, C-015, C-029.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openAcknowledgements(app) {
  return (await impl()).openAcknowledgements(app);
}

/**
 * Acknowledge one act for one platform this profile owns, through
 * `change-log.acknowledge`, and tell `store`. It clears the entry from that platform's queue
 * and from no other, and hides nothing from the history (`change-log` C-011). An entry or
 * platform the screen has no row for is refused, which is this module's half of who may
 * acknowledge. C-002, C-012, C-029.
 * @param {App} app on the acknowledgement screen
 * @param {ChangeLogEntryId} entryId an entry of that platform's queue
 * @param {PlatformId} platformId the platform it is acknowledged for
 * @returns {Promise<Screen>}
 */
export async function acknowledgeChange(app, entryId, platformId) {
  return (await impl()).acknowledgeChange(app, entryId, platformId);
}

// ------------------------------------------------------------------ operations: when a record is next reviewed

/**
 * Set the review tempo and the due date of one record through `review-schedule.setSchedule`,
 * and tell `store` (REQ-020, REQ-022, REQ-072; SL-06 criterion 1). `fields.ref` names the
 * record, and each screen offers it for one kind and for its own records: the hazard the
 * hazard screen holds, a control of the controls screen's list, or a platform of the platforms
 * screen's list. A ref outside that resolves with the screen as before and a message, with
 * nothing called.
 *
 * The due date is stored as given and is never derived from the last reviewed date, which this
 * call leaves as it was: nothing on this surface sets a last reviewed date, at any version
 * (`review-schedule` C-006, C-007; SL-06 criterion 3). When the record is one more than one
 * platform reads, the act waits on the confirm-edit screen past the list of them, as an edit to
 * the record itself does (C-027, DEC-021). An invalid tempo or due date, or the tempo and due
 * date already stored, resolves with the screen as before and a message, nothing stored.
 * C-002, C-012, C-026, C-027, C-031, C-032.
 * @param {App} app on the hazard, controls, or platforms screen
 * @param {ScheduleFields} fields the record, the tempo in whole calendar months, and the date it next falls due
 * @returns {Promise<Screen>}
 */
export async function setReviewTempo(app, fields) {
  return (await impl()).setReviewTempo(app, fields);
}

// ------------------------------------------------------------------ operations: the reference register

/**
 * Show the reference register: every live entry with the name, link, path, and stored-file
 * location it holds, and the flag on each whose stored file cannot be found (REQ-028, REQ-078;
 * SL-10 criteria 1 and 4). Reads the folder to answer the flag and writes nothing.
 * C-002, C-015, C-033, C-035.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openReferences(app) {
  return (await impl()).openReferences(app);
}

/**
 * Create one reference entry from any combination of a name, a link, a path, and a file, at
 * least one of them given, through `reference-register.createEntry`, and tell `store` (REQ-028,
 * REQ-029; SL-10 criteria 1 and 2). `fields` is passed through untouched. A file given is
 * carried into the data folder and only where it went is stored on the entry; the contents never
 * reach a `Screen` and never enter the working body. A blank field, none of the four, or a file
 * that was not kept resolves with the screen as before and a message, with nothing stored.
 * Never gated: a new entry has no links and reaches no platform. C-002, C-012, C-026, C-033.
 * @param {App} app on the references screen
 * @param {EntryFields} fields the name, link, and path as the user typed them, and the file as they chose it
 * @returns {Promise<Screen>}
 */
export async function createReference(app, fields) {
  return (await impl()).createReference(app, fields);
}

/**
 * Show one entry and everything it is linked to, in one list from the entry's own links, with
 * the live hazards, controls, and platforms a further link may be chosen from (REQ-031; SL-10
 * criterion 3). Writes nothing. C-002, C-015, C-034, C-035.
 * @param {App} app on the references screen
 * @param {ReferenceEntryId} id an entry of that screen's list
 * @returns {Promise<Screen>}
 */
export async function openReference(app, id) {
  return (await impl()).openReference(app, id);
}

/**
 * Link the entry this screen holds to one hazard, control, or platform of its own linkable
 * lists, through `reference-register.linkEntry`, and tell `store` (REQ-030; SL-10 criterion 3).
 * One call, one link: a ref outside those lists is refused with nothing called, and a ref the
 * entry already holds is refused by `reference-register`. Linking copies no field of the record
 * named. When the entry's links reach more than one platform, the act waits on the confirm-edit
 * screen past the list of them, as an edit to a hazard does (C-027, DEC-024).
 * C-002, C-012, C-026, C-027, C-034.
 * @param {App} app on the reference screen
 * @param {RecordRef} ref the record picked, its kind `hazard`, `control`, or `platform`
 * @returns {Promise<Screen>}
 */
export async function linkReference(app, ref) {
  return (await impl()).linkReference(app, ref);
}

// ------------------------------------------------------------------ operations: the guided workflows

/**
 * Show the register of workflows: every live workflow the working body holds, in progress and
 * complete, each named by the record it is performed on, and the platforms a new one may be
 * started on (SL-07 criterion 1). An abandoned workflow is not listed and its record is still in
 * the body (`workflows` C-012). Writes nothing. C-002, C-015, C-036.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openWorkflows(app) {
  return (await impl()).openWorkflows(app);
}

/**
 * Start one of the five workflows through `workflows.startWorkflow` and tell `store`, resolving
 * with that workflow's own screen at its first step (REQ-037; SL-07 criterion 1). `fields` is
 * passed through untouched: `subject` is `{ kind: 'platform', id }` for one of this screen's
 * `platforms` for the three workflows performed on a platform, and null for the two that create
 * the record they are about at their first step. A subject outside that list, a kind outside the
 * five, or a subject the kind does not take resolves with the screen as before and a message,
 * nothing started. Never gated in fact: a platform subject reaches the one platform it names and
 * a null subject reaches none (C-027, DEC-027). C-002, C-012, C-026, C-036.
 * @param {App} app on the workflows screen
 * @param {StartFields} fields the workflow kind, and the record it is performed on or null
 * @returns {Promise<Screen>}
 */
export async function startWorkflow(app, fields) {
  return (await impl()).startWorkflow(app, fields);
}

/**
 * Show one workflow: the step it is at, the steps done and the steps remaining from one
 * `workflows.progressOf`, what that step still asks from one `workflows.stepDemand`, and the
 * record it is performed on — a platform's hazards from the one `registry.listPlatformHazards`,
 * each row with its controls and the band `rating` gave for its residual and each omitted hazard
 * named (SL-07 criterion 3), or a hazard's detail from the one `registry.getHazardDetail`. A
 * complete workflow is shown with `current` null and every step done. Writes nothing.
 * C-002, C-015, C-016, C-020, C-021, C-024, C-037.
 * @param {App} app on the workflows screen
 * @param {WorkflowRecordId} id one of that screen's workflows
 * @returns {Promise<Screen>}
 */
export async function openWorkflow(app, id) {
  return (await impl()).openWorkflow(app, id);
}

/**
 * Record one submission at the step this workflow is at, through `workflows.submitStep`, and tell
 * `store`. The act the step names is made by `workflows` through the contract that owns the data
 * and is recorded on the workflow record in the same call (DEC-025); this module makes none of it
 * and keeps no step list of its own (C-009). `submission` is passed through untouched and its
 * `step` must be the one `progress.current` gives. A submission for another step, a second one
 * for a record the step has already recorded, or whatever the step's own act is refused for
 * resolves with the screen as before and a message, nothing stored. When the workflow's subject
 * is a record more than one platform reads, the act waits on the confirm-edit screen past the
 * list of them (C-027, DEC-027). C-002, C-012, C-026, C-027, C-038.
 * @param {App} app on the workflow screen
 * @param {StepSubmission} submission for the step the workflow is at
 * @returns {Promise<Screen>}
 */
export async function submitStep(app, submission) {
  return (await impl()).submitStep(app, submission);
}

/**
 * Move this workflow to the next step of its sequence, through `workflows.advanceStep`, and tell
 * `store`. A step whose demand is unmet is refused with the records still outstanding named on
 * the screen as before, which at `settle-the-ratings` is REQ-077's refusal and at
 * `review-the-hazards` is criterion 3's; the last step is passed by completing the workflow, not
 * by advancing. Whether the demand is met is `workflows.stepDemand`'s and no rule of this
 * module's (C-009). Gated as `submitStep` is (C-027). C-002, C-012, C-026, C-027, C-038.
 * @param {App} app on the workflow screen
 * @returns {Promise<Screen>}
 */
export async function advanceStep(app) {
  return (await impl()).advanceStep(app);
}

/**
 * Complete this workflow at `record-the-outcome`, through `workflows.completeWorkflow`, and tell
 * `store`: the completing acts its kind names are made, the AEST date, the user, and the outcome
 * are written, and no operation of any contract will change a field of the record again
 * (REQ-038, REQ-039; SL-07 criterion 4). Every act and the sealing are one call, so a completion
 * never leaves half its acts made (`workflows` C-009). This is the only way a screen of this
 * module causes a last reviewed date to move, and it is `workflows` that calls
 * `review-schedule.completeReview`, never this module (C-009, C-032). A blank outcome, or a
 * workflow not at the last step, resolves with the screen as before and a message, nothing
 * stored. Gated as `submitStep` is (C-027). C-002, C-012, C-026, C-027, C-038.
 * @param {App} app on the workflow screen
 * @param {CompletionFields} fields what the workflow produced, as the user typed it
 * @returns {Promise<Screen>}
 */
export async function completeWorkflow(app, fields) {
  return (await impl()).completeWorkflow(app, fields);
}

/**
 * Abandon this workflow through `workflows.abandonWorkflow` and tell `store`, resolving with the
 * workflows screen without it. No act the workflow already made is undone: the records stand as
 * they were at the moment of abandonment, each with its own entry in the history, and the
 * abandoned record keeps every entry it had (`workflows` C-012). There is no undo on this surface
 * or on any contract of this project. Gated as `submitStep` is (C-027).
 * C-002, C-012, C-026, C-027, C-038.
 * @param {App} app on the workflow screen
 * @returns {Promise<Screen>}
 */
export async function abandonWorkflow(app) {
  return (await impl()).abandonWorkflow(app);
}

// ------------------------------------------------------------------ operations: filters, the dashboard, and open items

/**
 * Show every hazard and every control whatever its status, each against every platform whose one
 * `registry.listPlatformHazards` shows it, with no filter active, and the platforms and reference
 * entries a filter is chosen from (REQ-047; SL-11 criterion 1). Writes nothing.
 * C-002, C-015, C-020, C-021, C-045.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openFilter(app) {
  return (await impl()).openFilter(app);
}

/**
 * Show the filter screen rebuilt with `filter`: each list is exactly the unfiltered list's items,
 * in its order, that satisfy every filter whose value is not null, so it is a subset of the
 * unfiltered list. A value outside the screen's own platforms and entries or the named values
 * resolves with the screen as before and a message, nothing called. Writes nothing. C-002, C-045.
 * @param {App} app on the filter screen
 * @param {ItemFilter} filter the five filters, each null when not active
 * @returns {Promise<Screen>}
 */
export async function applyFilter(app, filter) {
  return (await impl()).applyFilter(app, filter);
}

/**
 * Show the active profile's dashboard: for each live platform it owns, the overdue reviews of the
 * platform and of what is on it, the controls awaiting a ruling, the workflows in progress on it,
 * and the changes it has not acknowledged, and nothing of a platform another profile owns (REQ-049;
 * SL-11 criterion 2). Writes nothing. C-002, C-015, C-020, C-024, C-031, C-046.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openDashboard(app) {
  return (await impl()).openDashboard(app);
}

/**
 * Show every open item whatever its owner, on a screen apart from the dashboard: each live
 * platform's items as a dashboard shows them, the overdue reviews and in-progress workflows on no
 * live platform, and every live hazard, control, platform, and reference entry linked to nothing
 * (REQ-066, REQ-068; SL-11 criteria 3 and 4). Writes nothing. C-002, C-015, C-020, C-031, C-035,
 * C-047, C-048.
 * @param {App} app on the hazards screen
 * @returns {Promise<Screen>}
 */
export async function openOpenItems(app) {
  return (await impl()).openOpenItems(app);
}

// ------------------------------------------------------------------ operations: an edit that reaches more than one platform

/**
 * Make the edit this screen lists the platforms for: exactly the call the operation that
 * reached this screen would have made, told to `store`, resolving with the screen that
 * operation's clause gives (REQ-011; SL-05 criterion 3). It is the only way past the list.
 * C-002, C-012, C-027.
 * @param {App} app on the confirm-edit screen
 * @returns {Promise<Screen>}
 */
export async function confirmEdit(app) {
  return (await impl()).confirmEdit(app);
}

/**
 * Leave the edit unmade: show the screen it was asked for on, rebuilt from the working body.
 * Calls no module operation and writes nothing — nothing was changed while the list was
 * shown. C-002, C-027.
 * @param {App} app on the confirm-edit screen
 * @returns {Promise<Screen>}
 */
export async function cancelEdit(app) {
  return (await impl()).cancelEdit(app);
}

// ------------------------------------------------------------------ operations: going back

/**
 * Return along the one edge that led here, rebuilding the screen from the working body as
 * it now is: hazard, controls, platforms, history, acknowledge, references, workflows, and reports
 * to the hazards screen; platform to the platforms screen; assessment to the platform screen;
 * bow-tie to the assessment screen; reference to the references screen; workflow to the workflows
 * screen; prepare-report and report to the reports screen; filter, dashboard, and open-items to the
 * hazards screen. Calls only the reads of the screen
 * it resolves with, and writes nothing. C-002, C-015.
 * @param {App} app on any screen the table in C-015 names an edge back from
 * @returns {Promise<Screen>}
 */
export async function back(app) {
  return (await impl()).back(app);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} ViewsImplementation
 * @property {() => Promise<App>} start
 * @property {(app: App) => Promise<Screen>} chooseFolder
 * @property {(app: App, handle: DataFolderHandle) => Promise<Screen>} openFolder
 * @property {(app: App) => Promise<Screen>} acknowledgeCheck
 * @property {(app: App, name: string) => Promise<Screen>} createProfile
 * @property {(app: App, id: UserProfileId) => Promise<Screen>} selectProfile
 * @property {(app: App) => Promise<Screen>} acceptRecovery
 * @property {(app: App) => Promise<Screen>} declineRecovery
 * @property {(app: App, fields: HazardFields) => Promise<Screen>} addHazard
 * @property {(app: App) => Promise<Screen>} save
 * @property {(app: App) => Promise<Screen>} beginRestore
 * @property {(app: App) => Promise<Screen>} chooseSaveState
 * @property {(app: App, source: RestoreSource) => Promise<Screen>} prepareRestore
 * @property {(app: App) => Promise<Screen>} confirmRestore
 * @property {(app: App) => Promise<Screen>} cancelRestore
 * @property {(app: App, id: HazardId) => Promise<Screen>} openHazard
 * @property {(app: App, fields: HazardFields) => Promise<Screen>} renameHazard
 * @property {(app: App, fields: TextFields) => Promise<Screen>} addCausalFactor
 * @property {(app: App, fields: TextFields) => Promise<Screen>} addConsequence
 * @property {(app: App, controlId: ControlId, controlKind: ControlKind) => Promise<Screen>} linkControlToHazard
 * @property {(app: App) => Promise<Screen>} retireHazard
 * @property {(app: App) => Promise<Screen>} openControls
 * @property {(app: App, fields: ControlFields) => Promise<Screen>} createControl
 * @property {(app: App, controlId: ControlId) => Promise<Screen>} retireControl
 * @property {(app: App) => Promise<Screen>} openPlatforms
 * @property {(app: App, fields: PlatformFields) => Promise<Screen>} createPlatform
 * @property {(app: App, platformId: PlatformId) => Promise<Screen>} retirePlatform
 * @property {(app: App, platformId: PlatformId, ownerProfileId: UserProfileId) => Promise<Screen>} setPlatformOwner
 * @property {(app: App, id: PlatformId) => Promise<Screen>} openPlatform
 * @property {(app: App, hazardId: HazardId) => Promise<Screen>} linkHazardToPlatform
 * @property {(app: App, hazardId: HazardId) => Promise<Screen>} openAssessment
 * @property {(app: App, reportId: PlatformReportId) => Promise<Screen>} setReportId
 * @property {(app: App, stage: RatingStage, values: RatingValues) => Promise<Screen>} enterRating
 * @property {(app: App, controlId: ControlId) => Promise<Screen>} confirmControlForPlatform
 * @property {(app: App, controlId: ControlId, text: string) => Promise<Screen>} excludeControlFromPlatform
 * @property {(app: App) => Promise<Screen>} openBowtie
 * @property {(app: App) => Promise<Screen>} chooseExportTarget
 * @property {(app: App, target: ExportFileHandle) => Promise<Screen>} exportBowtie
 * @property {(app: App) => Promise<Screen>} openReports
 * @property {(app: App, fields: TemplateFields) => Promise<Screen>} createTemplate
 * @property {(app: App, fields: BeginReportFields) => Promise<Screen>} beginReport
 * @property {(app: App, bowtieHazardIds: readonly HazardId[]) => Promise<Screen>} produceReport
 * @property {(app: App, id: ReportId) => Promise<Screen>} openReport
 * @property {(app: App, format: ReportFormat) => Promise<Screen>} chooseReportExportTarget
 * @property {(app: App, target: ExportFileHandle, format: ReportFormat) => Promise<Screen>} exportReport
 * @property {(app: App) => Promise<Screen>} openFilter
 * @property {(app: App, filter: ItemFilter) => Promise<Screen>} applyFilter
 * @property {(app: App) => Promise<Screen>} openDashboard
 * @property {(app: App) => Promise<Screen>} openOpenItems
 * @property {(app: App) => Promise<Screen>} openHistory
 * @property {(app: App) => Promise<Screen>} openAcknowledgements
 * @property {(app: App, entryId: ChangeLogEntryId, platformId: PlatformId) => Promise<Screen>} acknowledgeChange
 * @property {(app: App, fields: ScheduleFields) => Promise<Screen>} setReviewTempo
 * @property {(app: App) => Promise<Screen>} openReferences
 * @property {(app: App, fields: EntryFields) => Promise<Screen>} createReference
 * @property {(app: App, id: ReferenceEntryId) => Promise<Screen>} openReference
 * @property {(app: App, ref: RecordRef) => Promise<Screen>} linkReference
 * @property {(app: App) => Promise<Screen>} openWorkflows
 * @property {(app: App, fields: StartFields) => Promise<Screen>} startWorkflow
 * @property {(app: App, id: WorkflowRecordId) => Promise<Screen>} openWorkflow
 * @property {(app: App, submission: StepSubmission) => Promise<Screen>} submitStep
 * @property {(app: App) => Promise<Screen>} advanceStep
 * @property {(app: App, fields: CompletionFields) => Promise<Screen>} completeWorkflow
 * @property {(app: App) => Promise<Screen>} abandonWorkflow
 * @property {(app: App) => Promise<Screen>} confirmEdit
 * @property {(app: App) => Promise<Screen>} cancelEdit
 * @property {(app: App) => Promise<Screen>} back
 */

/** @type {Promise<ViewsImplementation> | null} */
let selected = null;

/** @returns {Promise<ViewsImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.VIEWS_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/views.js');
    }
  }
  return selected;
}
