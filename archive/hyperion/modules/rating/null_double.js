/**
 * Null double of rating, contract version 1.0 (CORE-TST-002, rung 1). Test-only: contract.js
 * selects it when RATING_IMPL=null through a specifier held in a variable, so it is never
 * built into pivot.html. It returns fixed, valid-looking data of the declared types and
 * enforces nothing: no argument is read or checked and nothing is thrown. Written from the
 * contract surface alone; the conformance suite must fail against it in every file but
 * operations.
 */

/** @typedef {import('./contract.js').RatingImplementation} Impl */

/** @type {Impl['ratingFor']} */
export const ratingFor = async (consequence, likelihood) => ({ band: 'Uncategorised', cell: null });
