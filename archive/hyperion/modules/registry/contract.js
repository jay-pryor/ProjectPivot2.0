/**
 * Contract: registry, version 5.0. The module's sole import surface (CORE-CON-003). Owns
 * the hazard record model (DEC-004, DEC-005): at 1.0 a bare hazard with a title and a
 * global ID that is never reused (REQ-024, REQ-050); at 2.0 the hazard's causal factors,
 * consequences and controls, the control library, platforms with one owner, the three
 * links that relate them (DEC-013), the initial and residual ratings an assessor enters,
 * the ID a hazard has in one platform's reports, and the one query every list of a
 * platform's hazards is produced by (HZ-004); at 3.0 what a hazard's control is on a
 * platform — confirmed by a person, excluded with a justification, or awaiting a ruling —
 * and nothing else (DEC-014, HZ-001, HZ-007); at 4.0 retirement, a platform's owner, and the
 * promise that no change this module makes is unrecorded (DEC-016, REQ-067, REQ-076; HZ-005,
 * HZ-006); at 5.0 every hazard, control, and platform whatever its status, and the live links
 * that name one whatever the records at either end are (DEC-036). Every operation is a
 * function of the working
 * `DataBody` a consumer holds between `store.load` and `store.save` (DEC-006): this module
 * reads no folder and writes nothing anywhere. Clause IDs (C-nnn) are defined in
 * CONTRACT.md beside this file and cited by the conformance suite.
 *
 * What a rating *means* is not here: this module stores the consequence and the likelihood
 * an assessor entered and never the band, which is `rating.ratingFor`'s alone (DEC-002,
 * C-017, C-018).
 *
 * From 4.0 every changing operation takes an `Act` rather than a bare `ActiveProfile`, and
 * appends the act's entry to the body it returns by calling `change-log.recordChange` — the
 * one module this contract imports (C-007, C-023). A record and its history are written
 * together or not at all, so there is no way through this surface to change a stored record
 * and leave no record of the change (HZ-005).
 *
 * Every operation delegates to the selected implementation: `src/registry.js` in
 * production, `null_double.js` when `REGISTRY_IMPL=null` is set in the environment
 * (CORE-TST-002, rung 1). The null double is test-only and never embedded in the built
 * pivot.html, which is why its specifier is held in a variable: the build inlines only
 * quoted import specifiers.
 */

/** @typedef {import('../../baseline/types.js').HazardId} HazardId */
/** @typedef {import('../../baseline/types.js').ControlId} ControlId */
/** @typedef {import('../../baseline/types.js').PlatformId} PlatformId */
/** @typedef {import('../../baseline/types.js').CausalFactorId} CausalFactorId */
/** @typedef {import('../../baseline/types.js').ConsequenceId} ConsequenceId */
/** @typedef {import('../../baseline/types.js').JustificationId} JustificationId */
/** @typedef {import('../../baseline/types.js').RatingId} RatingId */
/** @typedef {import('../../baseline/types.js').LinkId} LinkId */
/** @typedef {import('../../baseline/types.js').PlatformReportId} PlatformReportId */
/** @typedef {import('../../baseline/types.js').UserProfileId} UserProfileId */
/** @typedef {import('../../baseline/types.js').ActiveProfile} ActiveProfile */
/** @typedef {import('../../baseline/types.js').TimestampAest} TimestampAest */
/** @typedef {import('../../baseline/types.js').RecordKind} RecordKind */
/** @typedef {import('../../baseline/types.js').RecordStatus} RecordStatus */
/** @typedef {import('../../baseline/types.js').RecordRef} RecordRef */
/** @typedef {import('../../baseline/types.js').ControlKind} ControlKind */
/** @typedef {import('../../baseline/types.js').RatingStage} RatingStage */
/** @typedef {import('../../baseline/types.js').ConsequenceLevel1to5} ConsequenceLevel1to5 */
/** @typedef {import('../../baseline/types.js').LikelihoodLetterAtoG} LikelihoodLetterAtoG */
/** @typedef {import('../../baseline/schema.js').DataBody} DataBody */

// ------------------------------------------------------------------ record shapes

/**
 * The fields every record of this module carries, from the baseline record header
 * (schema.js `RecordHeader`). Each record kind below narrows `id` and `kind` and adds its
 * own fields (DEC-005). Plain data throughout, so it survives a save and a load unchanged
 * (C-004).
 * @typedef {object} RegistryHeader
 * @property {RecordStatus} status `live` from creation; `deleted` after a delete or a supersession (C-005, C-021); `retired` after a retirement (C-025)
 * @property {UserProfileId} createdBy
 * @property {TimestampAest} createdAtAest
 * @property {UserProfileId} updatedBy
 * @property {TimestampAest} updatedAtAest
 */

/**
 * A hazard, in `collections.hazard` keyed by its id. Names no platform and no control
 * (C-004): what relates it to either is a `Link`.
 * @typedef {RegistryHeader & {
 *   id: HazardId,
 *   kind: 'hazard',
 *   title: string,
 * }} Hazard
 */

/**
 * A control in the library, in `collections.control` keyed by its id. Stored once,
 * independently of hazards and platforms, and carrying no `ControlKind`: which side of a
 * hazard a control sits on is the hazard-control link's (DEC-013, C-011).
 * @typedef {RegistryHeader & {
 *   id: ControlId,
 *   kind: 'control',
 *   title: string,
 * }} Control
 */

/**
 * A platform, in `collections.platform` keyed by its id. Exactly one user profile owns it
 * (REQ-065, C-014).
 * @typedef {RegistryHeader & {
 *   id: PlatformId,
 *   kind: 'platform',
 *   name: string,
 *   ownerProfileId: UserProfileId,
 * }} Platform
 */

/**
 * One of a hazard's causal factors, in `collections['causal-factor']` keyed by its id
 * (REQ-044, C-010).
 * @typedef {RegistryHeader & {
 *   id: CausalFactorId,
 *   kind: 'causal-factor',
 *   hazardId: HazardId,
 *   text: string,
 * }} CausalFactor
 */

/**
 * One of a hazard's consequences, in `collections.consequence` keyed by its id
 * (REQ-044, C-010). Not to be confused with `ConsequenceLevel1to5`, which is the level a
 * rating carries.
 * @typedef {RegistryHeader & {
 *   id: ConsequenceId,
 *   kind: 'consequence',
 *   hazardId: HazardId,
 *   text: string,
 * }} Consequence
 */

/**
 * Why one of a hazard's controls is not on one platform, in `collections.justification`
 * keyed by its id. Written by the act that excludes the control and never by any other
 * (REQ-058, C-020); it names all three ids, so the same control excluded from two platforms
 * carries two reasons, and a live one and a live `control-platform` link never hold the same
 * three ids (C-021).
 * @typedef {RegistryHeader & {
 *   id: JustificationId,
 *   kind: 'justification',
 *   hazardId: HazardId,
 *   controlId: ControlId,
 *   platformId: PlatformId,
 *   text: string,
 * }} Justification
 */

/**
 * What an assessor entered for one hazard on one platform at one stage, in
 * `collections.rating` keyed by its id. Both values are stored exactly as entered and
 * null is the uncategorised case (DEC-002, C-017, C-018). No band is stored.
 * @typedef {RegistryHeader & {
 *   id: RatingId,
 *   kind: 'rating',
 *   hazardId: HazardId,
 *   platformId: PlatformId,
 *   stage: RatingStage,
 *   consequence: ConsequenceLevel1to5 | null,
 *   likelihood: LikelihoodLetterAtoG | null,
 * }} Rating
 */

/**
 * A hazard is linked to a platform, and carries there the ID that platform's reports use
 * (REQ-051, C-015, C-016).
 * @typedef {RegistryHeader & {
 *   id: LinkId,
 *   kind: 'link',
 *   linkKind: 'hazard-platform',
 *   hazardId: HazardId,
 *   platformId: PlatformId,
 *   reportId: PlatformReportId,
 * }} HazardPlatformLink
 */

/**
 * A control is one of a hazard's, on the preventative or the mitigating side. The kind is
 * the hazard's use of the control, not a property of the control (DEC-013, C-012).
 * @typedef {RegistryHeader & {
 *   id: LinkId,
 *   kind: 'link',
 *   linkKind: 'hazard-control',
 *   hazardId: HazardId,
 *   controlId: ControlId,
 *   controlKind: ControlKind,
 * }} HazardControlLink
 */

/**
 * A person confirmed one of a hazard's controls for one platform, which is what puts the
 * control on it: the row exists only because someone confirmed it, and its `createdBy` and
 * `createdAtAest` are who and when (REQ-013, REQ-070, DEC-014). All three ids together are
 * the link, so the same control may be on this hazard on one platform and not on another,
 * and not on another hazard on the same platform (DEC-013, C-013).
 * @typedef {RegistryHeader & {
 *   id: LinkId,
 *   kind: 'link',
 *   linkKind: 'control-platform',
 *   hazardId: HazardId,
 *   controlId: ControlId,
 *   platformId: PlatformId,
 * }} ControlPlatformLink
 */

/**
 * Every link shares `collections.link` and is told from the others by `linkKind` (DEC-013).
 * @typedef {HazardPlatformLink | HazardControlLink | ControlPlatformLink} Link
 */

// ------------------------------------------------------------------ what a consumer supplies

/**
 * One act: one call, one profile, one instant, and the platform the user was working on when
 * they performed it (DEC-015, DEC-016). Replaces the bare `ActiveProfile` every changing
 * operation took at 3.0. `profile` stamps every header this module writes;
 * `madeForPlatformId` is stored on no record of this module and is passed to the entry C-023
 * writes, where it decides which platforms await the act and which does not (`change-log`
 * C-010). It is required and never defaulted: an absent property is refused, because the
 * value that decides whose queue a change lands in is the one a caller must not be able to
 * forget.
 * @typedef {object} Act
 * @property {ActiveProfile} profile the profile this session acts as (REQ-055)
 * @property {PlatformId | null} madeForPlatformId the platform the act was made for, or null for none
 */

/** @typedef {{ title: string }} HazardFields what a consumer supplies to create or retitle a hazard */
/** @typedef {{ text: string }} TextFields a causal factor's or a consequence's text */
/** @typedef {{ title: string }} ControlFields a library control's title */
/** @typedef {{ name: string, ownerProfileId: UserProfileId }} PlatformFields a platform and its one owner */
/** @typedef {{ hazardId: HazardId, controlId: ControlId, controlKind: ControlKind }} HazardControlFields */
/** @typedef {{ hazardId: HazardId, platformId: PlatformId }} HazardPlatformFields */
/** @typedef {{ hazardId: HazardId, controlId: ControlId, platformId: PlatformId }} ControlPlatformFields the triple a confirmation names (C-013) */
/** @typedef {ControlPlatformFields & { text: string }} ExclusionFields the triple, and why the control is not on that platform (C-020) */
/** @typedef {{ hazardId: HazardId, platformId: PlatformId, reportId: PlatformReportId }} ReportIdFields */
/** @typedef {{ platformId: PlatformId, ownerProfileId: UserProfileId }} PlatformOwnerFields the platform, and the profile that is to own it (C-028) */

/**
 * What an assessor entered. Either value may be null, which is DEC-002's uncategorised
 * case; anything else outside the scales is refused (C-018).
 * @typedef {object} RatingFields
 * @property {HazardId} hazardId
 * @property {PlatformId} platformId
 * @property {RatingStage} stage
 * @property {ConsequenceLevel1to5 | null} consequence
 * @property {LikelihoodLetterAtoG | null} likelihood
 */

// ------------------------------------------------------------------ what a change returns

/**
 * What every changing operation returns: the body as it now is, and the record as it now
 * is in that body. The body passed in is untouched (C-003); the consumer replaces its
 * working body with `body` and passes that to `store.save` when the user saves.
 * @typedef {{ body: DataBody, hazard: Hazard }} HazardChange
 */
/** @typedef {{ body: DataBody, control: Control }} ControlChange */
/** @typedef {{ body: DataBody, platform: Platform }} PlatformChange */
/** @typedef {{ body: DataBody, causalFactor: CausalFactor }} CausalFactorChange */
/** @typedef {{ body: DataBody, consequence: Consequence }} ConsequenceChange */
/** @typedef {{ body: DataBody, rating: Rating }} RatingChange */
/** @typedef {{ body: DataBody, link: Link }} LinkChange */

/**
 * What a confirmation returns: the link the control is now on the platform by, and the
 * justification it superseded, as it now is with status `deleted`, or null when the control
 * was awaiting rather than excluded (C-013, C-021).
 * @typedef {{ body: DataBody, link: ControlPlatformLink, clearedJustification: Justification | null }} ConfirmationChange
 */

/**
 * What an exclusion returns: the justification now stored, and the link it superseded, as it
 * now is with status `deleted`, or null when the control was awaiting rather than confirmed
 * (C-020, C-021).
 * @typedef {{ body: DataBody, justification: Justification, removedLink: ControlPlatformLink | null }} ExclusionChange
 */

// ------------------------------------------------------------------ what a read returns

/** @typedef {{ control: Control, controlKind: ControlKind }} HazardControl one of a hazard's controls, with the side it sits on */

/**
 * A hazard with everything stored against the hazard itself: platform-independent, so it
 * is the same whichever platform the hazard is linked to (C-004, C-010, C-012).
 * @typedef {object} HazardDetail
 * @property {Hazard} hazard
 * @property {readonly CausalFactor[]} causalFactors
 * @property {readonly Consequence[]} consequences
 * @property {readonly HazardControl[]} controls
 */

/**
 * A consequence and a likelihood exactly as an assessor entered them, both null when none
 * were (C-017). No band: that is `rating.ratingFor`'s (DEC-002).
 * @typedef {object} RatingValues
 * @property {ConsequenceLevel1to5 | null} consequence
 * @property {LikelihoodLetterAtoG | null} likelihood
 */

/** @typedef {{ initial: RatingValues, residual: RatingValues }} PlatformRatings both stages for one hazard on one platform */

/**
 * What one of a hazard's controls is on one platform, and nothing between the three
 * (DEC-014): `confirmed` a person confirmed it, `excluded` a person ruled it out with a
 * reason, `awaiting` nobody has ruled yet. Only `confirmed` is on the platform (REQ-001).
 * @typedef {'confirmed' | 'excluded' | 'awaiting'} ControlPlatformState
 */

/**
 * Who confirmed a control for a platform and when, read from the confirming link's creation
 * stamp and never from a field of its own (REQ-070, C-022).
 * @typedef {{ byProfileId: UserProfileId, atAest: TimestampAest }} Confirmation
 */

/**
 * One of a hazard's controls as it stands on one platform: its state, the confirmation when
 * it has one, and the justification when it has one. Exactly one of the two is non-null in
 * `confirmed` and `excluded`, and both are null in `awaiting` (C-021).
 * @typedef {HazardControl & {
 *   state: ControlPlatformState,
 *   confirmation: Confirmation | null,
 *   justification: Justification | null,
 * }} PlatformControl
 */

/**
 * One hazard on one platform, complete: what it is, what it is called in this platform's
 * reports, every one of its controls with what that control is on this platform, and the
 * residual values as entered (C-019).
 * @typedef {object} PlatformHazardRow
 * @property {Hazard} hazard
 * @property {PlatformReportId} reportId
 * @property {readonly PlatformControl[]} controls
 * @property {RatingValues} residual
 */

/** @typedef {'malformed-control' | 'malformed-rating' | 'malformed-justification'} OmissionReason why a row could not be built (C-008, C-019) */

/**
 * A hazard linked to the platform and live that this query could not carry as a row. It is
 * named rather than dropped: HZ-004 is a hazard left out without anyone being told.
 * @typedef {object} OmittedHazard
 * @property {HazardId} id
 * @property {OmissionReason} reason
 * @property {string} key the key of the record that stopped it
 * @property {string} detail one sentence naming the field
 */

/**
 * The one result every list of a platform's hazards is made from (C-019): each live hazard
 * linked to the platform is a row or is named in `omitted`, never neither and never both.
 * @typedef {object} PlatformHazards
 * @property {Platform} platform
 * @property {readonly PlatformHazardRow[]} rows
 * @property {readonly OmittedHazard[]} omitted
 */

// ------------------------------------------------------------------ error conditions: invalid input

/** C-001, C-009: a hazard title that is empty once trimmed. The body is unchanged. */
export class InvalidHazardTitleError extends Error {
  /** @param {string} title what was given */
  constructor(title) {
    super('a hazard title must have at least one character that is not a space');
    this.name = 'InvalidHazardTitleError';
    this.given = title;
  }
}

/** C-010: a causal factor's text is empty once trimmed. The body is unchanged. */
export class InvalidCausalFactorTextError extends Error {
  /** @param {string} text */
  constructor(text) {
    super('a causal factor must have at least one character that is not a space');
    this.name = 'InvalidCausalFactorTextError';
    this.given = text;
  }
}

/** C-010: a consequence's text is empty once trimmed. The body is unchanged. */
export class InvalidConsequenceTextError extends Error {
  /** @param {string} text */
  constructor(text) {
    super('a consequence must have at least one character that is not a space');
    this.name = 'InvalidConsequenceTextError';
    this.given = text;
  }
}

/** C-011: a control title that is empty once trimmed. The body is unchanged. */
export class InvalidControlTitleError extends Error {
  /** @param {string} title */
  constructor(title) {
    super('a control must have at least one character that is not a space');
    this.name = 'InvalidControlTitleError';
    this.given = title;
  }
}

/** C-014: a platform name that is empty once trimmed. The body is unchanged. */
export class InvalidPlatformNameError extends Error {
  /** @param {string} name */
  constructor(name) {
    super('a platform name must have at least one character that is not a space');
    this.name = 'InvalidPlatformNameError';
    this.given = name;
  }
}

/**
 * C-014: `createPlatform` given no owner, or one whose id is not a user profile id. Every
 * platform records exactly one owner (REQ-065). That the id names a stored profile is
 * `profiles` C-004's promise to whoever passes it here.
 */
export class InvalidOwnerError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a platform records exactly one user profile as its owner');
    this.name = 'InvalidOwnerError';
    this.given = given;
  }
}

/** C-012: `linkControlToHazard` given a kind that is neither `preventative` nor `mitigating`. */
export class InvalidControlKindError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a control is linked to a hazard as preventative or as mitigating');
    this.name = 'InvalidControlKindError';
    this.given = given;
  }
}

/** C-018: `setRating` given a stage that is neither `initial` nor `residual`. */
export class InvalidRatingStageError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a rating is entered at the initial stage or the residual stage');
    this.name = 'InvalidRatingStageError';
    this.given = given;
  }
}

/**
 * C-018: `setRating` given a consequence that is neither null nor a whole number 1 to 5,
 * or a likelihood that is neither null nor one of A to G (DEC-002's scales). Nothing is
 * written, so no out-of-scale value can later be read back and shown.
 */
export class InvalidRatingValueError extends Error {
  /**
   * @param {'consequence' | 'likelihood'} field
   * @param {unknown} given
   */
  constructor(field, given) {
    super(field === 'consequence'
      ? `a consequence is a whole number 1 to 5, or none; got ${String(given)}`
      : `a likelihood is a letter A to G, or none; got ${String(given)}`);
    this.name = 'InvalidRatingValueError';
    this.field = field;
    this.given = given;
  }
}

/**
 * C-020: `excludeControlFromPlatform` given a text that is empty once trimmed. Nothing is
 * written, so a control is never recorded as ruled out with no reason (REQ-058, HZ-001).
 */
export class InvalidJustificationTextError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a reason for leaving a control off a platform must have at least one character that is not a space');
    this.name = 'InvalidJustificationTextError';
    this.given = given;
  }
}

/** C-016: `setPlatformReportId` given an ID that is empty or carries leading or trailing whitespace. */
export class InvalidPlatformReportIdError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('a report ID must be non-empty with no leading or trailing space');
    this.name = 'InvalidPlatformReportIdError';
    this.given = given;
  }
}

/**
 * C-001, C-005, and every other changing operation: given no `Act`, or one whose `profile` is
 * missing or whose profile id is not a user profile id. The body is unchanged. A profile is
 * how a record's header says who created or changed it, and how the entry C-023 writes says
 * who performed the act (REQ-045).
 */
export class MissingProfileError extends Error {
  constructor() {
    super('no user profile is selected; a record records who created or changed it');
    this.name = 'MissingProfileError';
  }
}

/**
 * C-023: an `Act` whose `madeForPlatformId` is absent, or is neither null nor a platform id.
 * It is not defaulted: null is a value meaning the act was made for no platform, and an
 * absent property is a caller that has not said (DEC-016). The body is unchanged.
 */
export class InvalidActError extends Error {
  /** @param {unknown} given */
  constructor(given) {
    super('an act names the platform it was made for, or null; the property is not optional');
    this.name = 'InvalidActError';
    this.given = given;
  }
}

/**
 * C-026: `retireHazard` given a hazard that live `hazard-platform` links still hold. Carries
 * every such platform id so the user is told what stands in the way rather than that the
 * attempt failed (REQ-076; SL-05 criterion 6). The body is unchanged.
 */
export class HazardOnPlatformsError extends Error {
  /**
   * @param {HazardId} id
   * @param {readonly PlatformId[]} platformIds ascending as strings, never empty
   */
  constructor(id, platformIds) {
    super(`hazard ${String(id)} is on ${platformIds.length} platform(s) and cannot be retired`);
    this.name = 'HazardOnPlatformsError';
    this.id = id;
    this.platformIds = platformIds;
  }
}

/**
 * C-029: a change that would write the value already stored — the same trimmed title, report
 * ID, owner, or pair of rating values. Nothing is written, no header is restamped, and no
 * entry is recorded, so every entry in the log is an act that changed something.
 */
export class NoChangeError extends Error {
  /**
   * @param {RecordRef} ref the record that would have been written
   * @param {string} field the field whose value is already what was given
   */
  constructor(ref, field) {
    super(`${ref.kind} ${ref.id} already has that ${field}; nothing to change`);
    this.name = 'NoChangeError';
    this.ref = ref;
    this.field = field;
  }
}

/**
 * C-024: `platformsAffected` given a `ref` of a record kind this module does not own. An
 * empty list would be this module saying a change reaches no platform when it holds no link
 * to say so; the module that owns the kind answers for it.
 */
export class UnownedRecordKindError extends Error {
  /** @param {RecordKind} recordKind */
  constructor(recordKind) {
    super(`the registry owns no ${recordKind} record and cannot say which platforms one reaches`);
    this.name = 'UnownedRecordKindError';
    this.recordKind = recordKind;
  }
}

// ------------------------------------------------------------------ error conditions: the record is not there

/**
 * C-002: `createHazard` found that the id the body's hazard sequence would assign is
 * already held by a hazard in the body. Nothing was assigned and the body is unchanged;
 * the sequence is data (DEC-005) and a sequence behind its collection is data this build
 * refuses to extend rather than reuse an id (REQ-050).
 */
export class HazardSequenceError extends Error {
  /** @param {HazardId} id the id the sequence would have assigned */
  constructor(id) {
    super(`the hazard sequence would assign ${String(id)}, which a stored hazard already holds`);
    this.name = 'HazardSequenceError';
    this.id = id;
  }
}

/** C-005, C-009: an id no hazard in the body has, whatever its status. The body is unchanged. */
export class UnknownHazardError extends Error {
  /** @param {HazardId} id */
  constructor(id) {
    super(`no hazard has the id ${String(id)}`);
    this.name = 'UnknownHazardError';
    this.id = id;
  }
}

/** C-012, C-013: an id no control in the library has. The body is unchanged. */
export class UnknownControlError extends Error {
  /** @param {ControlId} id */
  constructor(id) {
    super(`no control has the id ${String(id)}`);
    this.name = 'UnknownControlError';
    this.id = id;
  }
}

/** C-014, C-015, C-019: an id no platform has. The body is unchanged. */
export class UnknownPlatformError extends Error {
  /** @param {PlatformId} id */
  constructor(id) {
    super(`no platform has the id ${String(id)}`);
    this.name = 'UnknownPlatformError';
    this.id = id;
  }
}

/** C-005, C-009: the hazard with this id has a status other than `live`. The body is unchanged. */
export class HazardNotLiveError extends Error {
  /**
   * @param {HazardId} id
   * @param {RecordStatus} status the hazard's status at the time of the call
   */
  constructor(id, status) {
    super(`hazard ${String(id)} is ${status}, not live`);
    this.name = 'HazardNotLiveError';
    this.id = id;
    this.status = status;
  }
}

/** C-012: the control with this id has a status other than `live`. The body is unchanged. */
export class ControlNotLiveError extends Error {
  /**
   * @param {ControlId} id
   * @param {RecordStatus} status
   */
  constructor(id, status) {
    super(`control ${String(id)} is ${status}, not live`);
    this.name = 'ControlNotLiveError';
    this.id = id;
    this.status = status;
  }
}

/** C-015: the platform with this id has a status other than `live`. The body is unchanged. */
export class PlatformNotLiveError extends Error {
  /**
   * @param {PlatformId} id
   * @param {RecordStatus} status
   */
  constructor(id, status) {
    super(`platform ${String(id)} is ${status}, not live`);
    this.name = 'PlatformNotLiveError';
    this.id = id;
    this.status = status;
  }
}

// ------------------------------------------------------------------ error conditions: the link

/**
 * C-012, C-013, C-015: a live link of that kind already holds those ids. Nothing is linked
 * twice, so no list can show the same thing twice.
 */
export class DuplicateLinkError extends Error {
  /**
   * @param {Link['linkKind']} linkKind
   * @param {LinkId} existing the id of the live link already holding those ids
   */
  constructor(linkKind, existing) {
    super(`a live ${linkKind} link already holds those ids`);
    this.name = 'DuplicateLinkError';
    this.linkKind = linkKind;
    this.existing = existing;
  }
}

/**
 * C-020, C-021: `excludeControlFromPlatform` given three ids a live justification already
 * holds. The control is already off that platform with a reason; nothing is stored twice.
 */
export class AlreadyExcludedError extends Error {
  /** @param {JustificationId} existing the id of the live justification already holding those ids */
  constructor(existing) {
    super('that control is already excluded from that platform for that hazard, with a reason');
    this.name = 'AlreadyExcludedError';
    this.existing = existing;
  }
}

/**
 * C-013, C-016, C-017: the hazard is not linked to the platform, so there is nothing on
 * that platform to rate, to name in its reports, or to hang a control link on (REQ-025).
 */
export class HazardNotOnPlatformError extends Error {
  /**
   * @param {HazardId} hazardId
   * @param {PlatformId} platformId
   */
  constructor(hazardId, platformId) {
    super(`hazard ${String(hazardId)} is not linked to that platform`);
    this.name = 'HazardNotOnPlatformError';
    this.hazardId = hazardId;
    this.platformId = platformId;
  }
}

/** C-013: the control is not one of the hazard's, so it cannot be linked on a platform for it (REQ-033). */
export class ControlNotOnHazardError extends Error {
  /**
   * @param {ControlId} controlId
   * @param {HazardId} hazardId
   */
  constructor(controlId, hazardId) {
    super(`control ${String(controlId)} is not one of hazard ${String(hazardId)}'s controls`);
    this.name = 'ControlNotOnHazardError';
    this.controlId = controlId;
    this.hazardId = hazardId;
  }
}

// ------------------------------------------------------------------ error conditions: the record is not readable

/**
 * C-008: an entry of a collection this module owns is not a record of that kind: its key
 * differs from its id, or a header field or one of the kind's own fields is missing or of
 * the wrong shape. Nothing from the collection is returned; the caller names the record to
 * the user rather than showing a list with a record silently missing from it. Each kind
 * has its own subclass, so a consumer may handle the family or one kind of it.
 */
export class MalformedRecordError extends Error {
  /**
   * @param {RecordKind} recordKind
   * @param {string} key the entry's key in its collection
   * @param {string} detail one sentence naming the field
   */
  constructor(recordKind, key, detail) {
    super(`${recordKind} record ${JSON.stringify(key)} is not readable: ${detail}`);
    this.name = 'MalformedRecordError';
    this.recordKind = recordKind;
    this.key = key;
    this.detail = detail;
  }
}

/** C-008: an entry of `collections.hazard` is not a `Hazard`. */
export class MalformedHazardError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('hazard', key, detail);
    this.name = 'MalformedHazardError';
  }
}

/** C-008: an entry of `collections.control` is not a `Control`. */
export class MalformedControlError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('control', key, detail);
    this.name = 'MalformedControlError';
  }
}

/** C-008: an entry of `collections.platform` is not a `Platform`. */
export class MalformedPlatformError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('platform', key, detail);
    this.name = 'MalformedPlatformError';
  }
}

/** C-008: an entry of `collections['causal-factor']` is not a `CausalFactor`. */
export class MalformedCausalFactorError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('causal-factor', key, detail);
    this.name = 'MalformedCausalFactorError';
  }
}

/** C-008: an entry of `collections.consequence` is not a `Consequence`. */
export class MalformedConsequenceError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('consequence', key, detail);
    this.name = 'MalformedConsequenceError';
  }
}

/** C-008: an entry of `collections.link` is not a `Link`, including a `linkKind` outside the three. */
export class MalformedLinkError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('link', key, detail);
    this.name = 'MalformedLinkError';
  }
}

/** C-008: an entry of `collections.justification` is not a `Justification`. */
export class MalformedJustificationError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('justification', key, detail);
    this.name = 'MalformedJustificationError';
  }
}

/** C-008: an entry of `collections.rating` is not a `Rating`. */
export class MalformedRatingError extends MalformedRecordError {
  /**
   * @param {string} key
   * @param {string} detail
   */
  constructor(key, detail) {
    super('rating', key, detail);
    this.name = 'MalformedRatingError';
  }
}

// ------------------------------------------------------------------ operations: hazards

/**
 * Add a hazard to the body with the next global ID from the body's hazard sequence, the
 * title trimmed, status `live`, and the header stamped with `act.profile` and the baseline
 * clock's now. Resolves with the new body and the hazard as stored in it; the body passed
 * in is untouched. Rejects a blank title, a missing profile, and a sequence that would
 * reuse an id, changing nothing. C-001, C-002, C-003, C-004.
 * @param {DataBody} body the working body, as loaded or as last changed
 * @param {Act} act the profile this session acts as (REQ-055) and the platform the act was made for
 * @param {HazardFields} fields
 * @returns {Promise<HazardChange>}
 */
export async function createHazard(body, act, fields) {
  return (await impl()).createHazard(body, act, fields);
}

/**
 * Change a live hazard's title on the one record every platform reads, leaving its id,
 * its creation header, its links, and every other record alone. Rejects a blank title, a
 * missing profile, an unknown id, and a hazard that is not live, changing nothing.
 * C-003, C-004, C-009.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} id
 * @param {HazardFields} fields
 * @returns {Promise<HazardChange>}
 */
export async function updateHazard(body, act, id, fields) {
  return (await impl()).updateHazard(body, act, id, fields);
}

/**
 * Every live hazard in the body, once each, in ascending order of the number in its global
 * ID; empty when the body holds none. Deleted and retired hazards are not listed.
 * C-006, C-008.
 * @param {DataBody} body
 * @returns {Promise<readonly Hazard[]>}
 */
export async function listHazards(body) {
  return (await impl()).listHazards(body);
}

/**
 * The hazard with this id as it is in the body, whatever its status, or null when no
 * hazard has ever had this id in the body. C-005, C-008.
 * @param {DataBody} body
 * @param {HazardId} id
 * @returns {Promise<Hazard | null>}
 */
export async function getHazard(body, id) {
  return (await impl()).getHazard(body, id);
}

/**
 * The hazard with everything stored against the hazard itself: its live causal factors,
 * its live consequences, and its controls with the side each sits on. Platform-independent
 * (C-004), so it is the same whichever platform the hazard is linked to. Given whatever the
 * hazard's own status; null only when no hazard has the id. C-008, C-010, C-012.
 * @param {DataBody} body
 * @param {HazardId} id
 * @returns {Promise<HazardDetail | null>}
 */
export async function getHazardDetail(body, id) {
  return (await impl()).getHazardDetail(body, id);
}

/**
 * Mark a live hazard deleted: its row stays, with status `deleted` and the header's
 * `updatedBy` and `updatedAtAest` set to `act.profile` and the clock's now, every other field
 * unchanged, and its links, causal factors, consequences, and ratings left as they were.
 * Its id is never assigned again. Rejects an unknown id and a hazard that is not live,
 * changing nothing. C-002, C-003, C-005.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} id
 * @returns {Promise<HazardChange>}
 */
export async function deleteHazard(body, act, id) {
  return (await impl()).deleteHazard(body, act, id);
}

/**
 * Mark a live hazard retired: its row stays exactly where it is, its id is never reassigned,
 * and it leaves `listHazards` and every platform row as a deleted hazard does — except that a
 * hazard on a platform cannot be retired at all. Rejects with `HazardOnPlatformsError`
 * carrying every platform the hazard is linked to, so a hazard never leaves a platform's list
 * by retirement (REQ-076; HZ-004, HZ-005). Rejects an unknown id, a hazard that is not live,
 * and a missing profile, changing nothing. C-003, C-023, C-025, C-026.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} id
 * @returns {Promise<HazardChange>}
 */
export async function retireHazard(body, act, id) {
  return (await impl()).retireHazard(body, act, id);
}

// ------------------------------------------------------------------ operations: causal factors and consequences

/**
 * Add one causal factor to a live hazard, its text trimmed, stamped with `act.profile` and the
 * clock's now. Rejects a blank text, a missing profile, an unknown id, and a hazard that is
 * not live, changing nothing. C-003, C-010.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} hazardId
 * @param {TextFields} fields
 * @returns {Promise<CausalFactorChange>}
 */
export async function addCausalFactor(body, act, hazardId, fields) {
  return (await impl()).addCausalFactor(body, act, hazardId, fields);
}

/**
 * Add one consequence to a live hazard, its text trimmed, stamped with `act.profile` and the
 * clock's now. Rejects a blank text, a missing profile, an unknown id, and a hazard that is
 * not live, changing nothing. C-003, C-010.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardId} hazardId
 * @param {TextFields} fields
 * @returns {Promise<ConsequenceChange>}
 */
export async function addConsequence(body, act, hazardId, fields) {
  return (await impl()).addConsequence(body, act, hazardId, fields);
}

// ------------------------------------------------------------------ operations: the control library

/**
 * Add a control to the library under a fresh id, its title trimmed, status `live`, stamped
 * with `act.profile` and the clock's now. The entry names no hazard and no platform, so it is
 * the one entry every hazard and platform reads (DEC-013). Rejects a blank title and a
 * missing profile, changing nothing. C-003, C-004, C-011.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ControlFields} fields
 * @returns {Promise<ControlChange>}
 */
export async function createControl(body, act, fields) {
  return (await impl()).createControl(body, act, fields);
}

/**
 * Every live control in the library, once each, in ascending order of `createdAtAest` then
 * id; empty when the body holds none. C-008, C-011.
 * @param {DataBody} body
 * @returns {Promise<readonly Control[]>}
 */
export async function listControls(body) {
  return (await impl()).listControls(body);
}

/**
 * Mark a live control retired: it leaves the library, so it is no longer offered for a new
 * link and `linkControlToHazard` of it rejects — and it stays exactly where a person already
 * put it, on every hazard and every platform, with the state and reason it had (C-027). Its
 * row and every link naming it are untouched. Rejects an unknown id, a control that is not
 * live, and a missing profile, changing nothing. C-003, C-023, C-025, C-027.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ControlId} id
 * @returns {Promise<ControlChange>}
 */
export async function retireControl(body, act, id) {
  return (await impl()).retireControl(body, act, id);
}

/**
 * Make a library control one of a hazard's, on the preventative or the mitigating side.
 * One control may be linked to any number of hazards; a second live link of the same pair
 * rejects. Rejects a missing profile, an unknown or not-live hazard or control, and a kind
 * outside the two, changing nothing. C-003, C-012.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardControlFields} fields
 * @returns {Promise<LinkChange>}
 */
export async function linkControlToHazard(body, act, fields) {
  return (await impl()).linkControlToHazard(body, act, fields);
}

// ------------------------------------------------------------------ operations: platforms

/**
 * Add a platform under a fresh id, its name trimmed, with exactly one user profile as its
 * owner (REQ-065). Every existing record of every kind is left equal to what it was
 * (REQ-035). Rejects a blank name, an owner that is not a user profile id, and a missing
 * profile, changing nothing. C-003, C-014.
 * @param {DataBody} body
 * @param {Act} act
 * @param {PlatformFields} fields
 * @returns {Promise<PlatformChange>}
 */
export async function createPlatform(body, act, fields) {
  return (await impl()).createPlatform(body, act, fields);
}

/**
 * Every live platform, once each, in ascending order of `createdAtAest` then id; empty
 * when the body holds none. C-008, C-014.
 * @param {DataBody} body
 * @returns {Promise<readonly Platform[]>}
 */
export async function listPlatforms(body) {
  return (await impl()).listPlatforms(body);
}

/**
 * Mark a live platform retired: it leaves `listPlatforms` and takes no new hazard, and it
 * keeps every link, rating, and justification it had, so its hazards are still readable and
 * its queue is still its owner's (C-027). Rejects an unknown id, a platform that is not live,
 * and a missing profile, changing nothing. C-003, C-023, C-025, C-027.
 * @param {DataBody} body
 * @param {Act} act
 * @param {PlatformId} id
 * @returns {Promise<PlatformChange>}
 */
export async function retirePlatform(body, act, id) {
  return (await impl()).retirePlatform(body, act, id);
}

/**
 * Change which profile owns a live platform, and nothing else: the name, the links, the
 * ratings, and every entry already in the change log are left as they were, so every change
 * the outgoing owner had not acknowledged for that platform is what the incoming owner is
 * shown (REQ-081; `change-log` C-012). Rejects an owner that is not a user profile id, the
 * owner the platform already has, an unknown or not-live platform, and a missing profile,
 * changing nothing. C-003, C-023, C-028, C-029.
 * @param {DataBody} body
 * @param {Act} act
 * @param {PlatformOwnerFields} fields
 * @returns {Promise<PlatformChange>}
 */
export async function setPlatformOwner(body, act, fields) {
  return (await impl()).setPlatformOwner(body, act, fields);
}

/**
 * Link a live hazard to a live platform. The link is created carrying the hazard's global
 * ID as the ID that platform's reports use, which a user may change afterwards (C-016).
 * Nothing of the hazard is copied, so a later change to its title is read by every platform
 * it is linked to. A second live link over the same pair rejects. Rejects a missing
 * profile and an unknown or not-live hazard or platform, changing nothing.
 * C-003, C-004, C-015, C-016.
 * @param {DataBody} body
 * @param {Act} act
 * @param {HazardPlatformFields} fields
 * @returns {Promise<LinkChange>}
 */
export async function linkHazardToPlatform(body, act, fields) {
  return (await impl()).linkHazardToPlatform(body, act, fields);
}

/**
 * Change the ID a hazard has in one platform's reports, leaving its global ID and its ID on
 * every other platform alone (REQ-052). Rejects a missing profile, an ID that is empty or
 * has leading or trailing whitespace, and a hazard not linked to the platform, changing
 * nothing. C-003, C-016.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ReportIdFields} fields
 * @returns {Promise<LinkChange>}
 */
export async function setPlatformReportId(body, act, fields) {
  return (await impl()).setPlatformReportId(body, act, fields);
}

// ------------------------------------------------------------------ operations: a hazard's controls on a platform

/**
 * Confirm one of a hazard's controls for one platform, which is the only thing that puts it
 * there (REQ-013): one control, one hazard, one platform, one call, with `act.profile` stamped
 * as who confirmed it (REQ-070). All three ids together are the link, so this says nothing
 * about the same control on another platform or for another hazard (DEC-013). A live
 * justification for the same three is superseded and returned (C-021). No rating changes
 * (C-017). A second confirmation while the link is live rejects. Rejects a missing profile,
 * an unknown control, a hazard not linked to the platform, and a control that is not one of
 * the hazard's, changing nothing. C-003, C-013, C-017, C-021, C-022.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ControlPlatformFields} fields
 * @returns {Promise<ConfirmationChange>}
 */
export async function confirmControlForPlatform(body, act, fields) {
  return (await impl()).confirmControlForPlatform(body, act, fields);
}

/**
 * Rule one of a hazard's controls off one platform, with the reason a person wrote for it
 * (REQ-058): the justification is stored against the three ids, and a live link over them is
 * superseded and returned, its row staying with status `deleted` so the removal can be shown
 * (REQ-045, SL-05). No rating changes (C-017). Rejects a blank text, a missing profile, an
 * unknown control, a hazard not linked to the platform, a control that is not one of the
 * hazard's, and a control already excluded, changing nothing. C-003, C-017, C-020, C-021.
 * @param {DataBody} body
 * @param {Act} act
 * @param {ExclusionFields} fields
 * @returns {Promise<ExclusionChange>}
 */
export async function excludeControlFromPlatform(body, act, fields) {
  return (await impl()).excludeControlFromPlatform(body, act, fields);
}

// ------------------------------------------------------------------ operations: ratings

/**
 * Store what an assessor entered for one hazard on one platform at one stage, exactly as
 * entered and never derived from the hazard's controls (HZ-002). A second call over the
 * same hazard, platform, and stage updates the one record. Rejects a missing profile, a
 * hazard not linked to the platform, a stage outside the two, and a value outside the
 * scales, changing nothing. C-003, C-017, C-018.
 * @param {DataBody} body
 * @param {Act} act
 * @param {RatingFields} fields
 * @returns {Promise<RatingChange>}
 */
export async function setRating(body, act, fields) {
  return (await impl()).setRating(body, act, fields);
}

/**
 * The initial and the residual values for one hazard on one platform, each exactly as
 * entered and both null where nothing was entered. No band: what the values mean is
 * `rating.ratingFor`'s (DEC-002). A read: an id it does not find and a hazard not linked
 * to the platform are both "none", and only a malformed record rejects. C-008, C-017.
 * @param {DataBody} body
 * @param {HazardId} hazardId
 * @param {PlatformId} platformId
 * @returns {Promise<PlatformRatings>}
 */
export async function getRatings(body, hazardId, platformId) {
  return (await impl()).getRatings(body, hazardId, platformId);
}

// ------------------------------------------------------------------ operations: the one query

/**
 * Every hazard linked to a platform, with its controls and what each of them is on this
 * platform — confirmed, excluded with its reason, or awaiting a ruling (C-021) — what this
 * platform's reports call it, and its residual values as entered. Each live linked hazard is
 * a row or is named in `omitted` with the record that stopped it: never neither, never both,
 * never silently absent (HZ-004). Every list of a platform's hazards Pivot shows is made from
 * this one result, so a hazard cannot be in one list and missing from another. Rejects an
 * unknown platform and a malformed hazard, link, or platform. C-008, C-019.
 * @param {DataBody} body
 * @param {PlatformId} platformId
 * @returns {Promise<PlatformHazards>}
 */
export async function listPlatformHazards(body, platformId) {
  return (await impl()).listPlatformHazards(body, platformId);
}

// ------------------------------------------------------------------ operations: what a change reaches

/**
 * Every platform a change to one record reaches, derived from the live links this module
 * holds: distinct, ascending as strings, empty for a record nothing in the body has. It is
 * the same list every changing operation gives its change-log entry as `affectedPlatformIds`
 * (C-023), so the platforms a user is shown before saving and the platforms that then await
 * the change cannot differ (REQ-011 is `views`' half of that showing; REQ-012; HZ-006).
 * Rejects a `ref` of a record kind this module does not own, and a malformed record.
 * C-008, C-024.
 * @param {DataBody} body
 * @param {RecordRef} ref the kind and id of the record being changed
 * @returns {Promise<readonly PlatformId[]>}
 */
export async function platformsAffected(body, ref) {
  return (await impl()).platformsAffected(body, ref);
}

// ------------------------------------------------------------------ operations: every status, and what is linked

/**
 * Every hazard in the body whatever its status — live, retired, or deleted — once each, in
 * `listHazards`' order and each carrying its stored status; `listHazards` is its live entries.
 * Empty when the body holds none. C-006, C-008, C-030.
 * @param {DataBody} body
 * @returns {Promise<readonly Hazard[]>}
 */
export async function listAllHazards(body) {
  return (await impl()).listAllHazards(body);
}

/**
 * Every control in the library whatever its status, once each, in `listControls`' order;
 * `listControls` is its live entries. C-008, C-011, C-030.
 * @param {DataBody} body
 * @returns {Promise<readonly Control[]>}
 */
export async function listAllControls(body) {
  return (await impl()).listAllControls(body);
}

/**
 * Every platform whatever its status, once each, in `listPlatforms`' order; `listPlatforms`
 * is its live entries. C-008, C-014, C-030.
 * @param {DataBody} body
 * @returns {Promise<readonly Platform[]>}
 */
export async function listAllPlatforms(body) {
  return (await impl()).listAllPlatforms(body);
}

/**
 * Every live link that names this hazard, control, or platform, in ascending order of
 * `createdAtAest` then id. The link's own status decides and the status of the records it
 * names never does, so a control whose only link is to a deleted hazard has that link listed,
 * and a retired record's links are listed as a live one's are. Empty for an owned kind no link
 * names and for an id nothing has. Rejects a kind this module does not own and a malformed
 * link. Whether the links are enough to count a record as linked is the consumer's to say.
 * C-008, C-031.
 * @param {DataBody} body
 * @param {RecordRef} ref the kind and id of the record whose links are wanted
 * @returns {Promise<readonly Link[]>}
 */
export async function listLinks(body, ref) {
  return (await impl()).listLinks(body, ref);
}

// ------------------------------------------------------------------ implementation selection

/**
 * @typedef {object} RegistryImplementation
 * @property {(body: DataBody, act: Act, fields: HazardFields) => Promise<HazardChange>} createHazard
 * @property {(body: DataBody, act: Act, id: HazardId, fields: HazardFields) => Promise<HazardChange>} updateHazard
 * @property {(body: DataBody) => Promise<readonly Hazard[]>} listHazards
 * @property {(body: DataBody, id: HazardId) => Promise<Hazard | null>} getHazard
 * @property {(body: DataBody, id: HazardId) => Promise<HazardDetail | null>} getHazardDetail
 * @property {(body: DataBody, act: Act, id: HazardId) => Promise<HazardChange>} deleteHazard
 * @property {(body: DataBody, act: Act, id: HazardId) => Promise<HazardChange>} retireHazard
 * @property {(body: DataBody, act: Act, hazardId: HazardId, fields: TextFields) => Promise<CausalFactorChange>} addCausalFactor
 * @property {(body: DataBody, act: Act, hazardId: HazardId, fields: TextFields) => Promise<ConsequenceChange>} addConsequence
 * @property {(body: DataBody, act: Act, fields: ControlFields) => Promise<ControlChange>} createControl
 * @property {(body: DataBody) => Promise<readonly Control[]>} listControls
 * @property {(body: DataBody, act: Act, id: ControlId) => Promise<ControlChange>} retireControl
 * @property {(body: DataBody, act: Act, fields: HazardControlFields) => Promise<LinkChange>} linkControlToHazard
 * @property {(body: DataBody, act: Act, fields: PlatformFields) => Promise<PlatformChange>} createPlatform
 * @property {(body: DataBody) => Promise<readonly Platform[]>} listPlatforms
 * @property {(body: DataBody, act: Act, id: PlatformId) => Promise<PlatformChange>} retirePlatform
 * @property {(body: DataBody, act: Act, fields: PlatformOwnerFields) => Promise<PlatformChange>} setPlatformOwner
 * @property {(body: DataBody, act: Act, fields: HazardPlatformFields) => Promise<LinkChange>} linkHazardToPlatform
 * @property {(body: DataBody, act: Act, fields: ReportIdFields) => Promise<LinkChange>} setPlatformReportId
 * @property {(body: DataBody, act: Act, fields: ControlPlatformFields) => Promise<ConfirmationChange>} confirmControlForPlatform
 * @property {(body: DataBody, act: Act, fields: ExclusionFields) => Promise<ExclusionChange>} excludeControlFromPlatform
 * @property {(body: DataBody, act: Act, fields: RatingFields) => Promise<RatingChange>} setRating
 * @property {(body: DataBody, hazardId: HazardId, platformId: PlatformId) => Promise<PlatformRatings>} getRatings
 * @property {(body: DataBody, platformId: PlatformId) => Promise<PlatformHazards>} listPlatformHazards
 * @property {(body: DataBody, ref: RecordRef) => Promise<readonly PlatformId[]>} platformsAffected
 * @property {(body: DataBody) => Promise<readonly Hazard[]>} listAllHazards
 * @property {(body: DataBody) => Promise<readonly Control[]>} listAllControls
 * @property {(body: DataBody) => Promise<readonly Platform[]>} listAllPlatforms
 * @property {(body: DataBody, ref: RecordRef) => Promise<readonly Link[]>} listLinks
 */

/** @type {Promise<RegistryImplementation> | null} */
let selected = null;

/** @returns {Promise<RegistryImplementation>} */
function impl() {
  if (selected === null) {
    const env = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process?.env;
    if (env?.REGISTRY_IMPL === 'null') {
      const nullDouble = './null_double.js'; // test-only; not a runtime source, so never inlined by the build
      selected = import(nullDouble);
    } else {
      selected = import('./src/registry.js');
    }
  }
  return selected;
}
