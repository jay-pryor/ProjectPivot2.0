import { esc, raw } from './html.js';
import { get } from '../core/data.js';

/**
 * The in-app guide: its topics, grouped as the Help rail lists them, and the glossary. Topic text
 * is a small markup, so it stays easy to edit:
 *   blocks are separated by a blank line; "## " starts a heading, lines of "- " a list, lines of
 *   "1. " numbered steps, anything else a paragraph;
 *   **bold**, [[Term]] or [[Term|shown words]] links to the glossary, {{topic|shown words}} to a topic.
 */

/** @typedef {{ title: string, summary: string, body: string, related?: string[] }} HelpTopic */

/** A glossary term's id, as links and anchors use it. @param {string} term */
export const termId = (term) => term.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** @param {Record<string, string>} attrs */
const attrs = (attrs) => Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');

/** One line of help text: escaped, with bold and links. @param {string} line */
function inline(line) {
  let out = '';
  const re = /\*\*(.+?)\*\*|\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\{\{([^}|]+)\|([^}]*)\}\}/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    out += esc(line.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${esc(m[1])}</strong>`;
    else if (m[2] !== undefined) out += `<button type="button" class="link help-term-link" ${attrs({ action: 'go', view: 'help', topic: 'glossary', term: termId(m[2]) })}>${esc(m[3] ?? m[2])}</button>`;
    else out += `<button type="button" class="link" ${attrs({ action: 'go', view: 'help', topic: /** @type {string} */ (m[4]) })}>${esc(m[5])}</button>`;
    last = /** @type {number} */ (m.index) + m[0].length;
  }
  return out + esc(line.slice(last));
}

/** Help text as HTML. @param {string} text */
export function renderHelpText(text) {
  const blocks = text.trim().split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean));
  return raw(blocks.map((lines) => {
    if (lines.length === 1 && lines[0].startsWith('## ')) return `<h3>${inline(lines[0].slice(3))}</h3>`;
    if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+\. /.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join(''));
}

/** Help text as plain words, for search. @param {string} text */
export function plainHelpText(text) {
  return text.replace(/^## |^- |^\d+\. /gm, '').replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t, s) => s ?? t).replace(/\{\{[^}|]+\|([^}]*)\}\}/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

/** The workflow topics, by workflow type. */
const WORKFLOW_TOPIC = Object.freeze({ platformReview: 'wf-review', platformOnboarding: 'wf-onboarding', transferOwner: 'wf-transfer', referenceUpdate: 'wf-reference-update', newTechData: 'wf-tech-data' });

/** The topic for each page. */
const PAGE_TOPIC = Object.freeze({
  home: 'home', openItems: 'home', hazards: 'hazards', hazard: 'hazards', controls: 'controls', control: 'controls', newControl: 'controls',
  platforms: 'platforms', platform: 'platforms', workflows: 'workflows', reviews: 'reviews', platformReview: 'reviews', bowties: 'bowties',
  info: 'info', reports: 'reports', references: 'references', reference: 'references', backups: 'backups', historyDeletions: 'history',
});

/**
 * The help topic for the page being shown: a workflow's by its type; Help itself, the topic open.
 * @param {any} view @param {import('../core/data.js').Data | null | undefined} data
 */
export function helpTopicFor(view, data) {
  if (view?.name === 'help') return HELP_TOPICS[view.topic] ? view.topic : 'getting-started';
  if (view?.name === 'workflow') {
    const wf = data ? get(data, 'workflow', view.id) : null;
    return WORKFLOW_TOPIC[/** @type {keyof typeof WORKFLOW_TOPIC} */ (wf?.type)] ?? 'workflows';
  }
  return PAGE_TOPIC[/** @type {keyof typeof PAGE_TOPIC} */ (view?.name)] ?? 'getting-started';
}

/** The Help rail: its groups and their topics, in order. */
export const HELP_GROUPS = Object.freeze([
  { title: 'Start here', topics: ['getting-started'] },
  { title: 'The pages', topics: ['home', 'hazards', 'controls', 'platforms', 'workflows', 'reviews', 'bowties', 'info', 'reports', 'references'] },
  { title: 'Workflows', topics: ['wf-review', 'wf-onboarding', 'wf-transfer', 'wf-reference-update', 'wf-tech-data'] },
  { title: 'Working together', topics: ['saving', 'acknowledging', 'history', 'backups'] },
  { title: 'Words', topics: ['glossary'] },
]);

/** @type {Record<string, HelpTopic>} */
export const HELP_TOPICS = {
  'getting-started': { title: 'Getting started', summary: 'What PIVOT is for, and how to find your way around.', body: 'Stub.' },
  home: { title: 'Home', summary: 'Home.', body: 'Stub.' },
  hazards: { title: 'Hazards', summary: 'Hazards.', body: 'Hazards are what could go wrong.' },
  controls: { title: 'Controls', summary: 'Controls.', body: 'Stub.' },
  platforms: { title: 'Platforms', summary: 'Platforms.', body: 'Stub.' },
  workflows: { title: 'Workflows', summary: 'Workflows.', body: 'Stub.' },
  reviews: { title: 'Reviews', summary: 'Reviews.', body: 'Stub.' },
  bowties: { title: 'Bow-ties', summary: 'Bow-ties.', body: 'Stub.' },
  info: { title: 'Info', summary: 'Info.', body: 'Stub.' },
  reports: { title: 'Reports', summary: 'Reports.', body: 'Stub.' },
  references: { title: 'References', summary: 'References.', body: 'Stub.' },
  'wf-review': { title: 'Platform Review', summary: 'Review.', body: 'Stub.' },
  'wf-onboarding': { title: 'Platform Onboarding', summary: 'Onboarding.', body: 'Stub.' },
  'wf-transfer': { title: 'Transfer Platform Owner', summary: 'Transfer.', body: 'Stub.' },
  'wf-reference-update': { title: 'Reference Update', summary: 'Update.', body: 'Stub.' },
  'wf-tech-data': { title: 'New Tech Data', summary: 'Tech data.', body: 'Stub.' },
  saving: { title: 'Saving and sharing', summary: 'Saving.', body: 'Stub.' },
  acknowledging: { title: 'Acknowledging changes', summary: 'Acks.', body: 'Stub.' },
  history: { title: 'History', summary: 'History.', body: 'Stub.' },
  backups: { title: 'Backups and recovery', summary: 'Backups.', body: 'Stub.' },
  glossary: { title: 'Glossary', summary: 'What the words used in PIVOT mean.', body: 'Short definitions of the words PIVOT uses, in alphabetical order. Type in the search box to jump to one.' },
};

/** Every term the help links to, alphabetically. @type {{ term: string, def: string }[]} */
export const GLOSSARY = [
  { term: 'Residual risk', def: 'Stub.' },
  { term: 'SFARP', def: 'Stub.' },
];
