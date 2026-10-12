import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELP_GROUPS, HELP_TOPICS, GLOSSARY, termId, renderHelpText, plainHelpText, helpTopicFor } from '../../src/ui/help-content.js';
import { helpView } from '../../src/ui/screens/help.js';
import { shell } from '../../src/ui/screens/common.js';
import { createReference } from '../../src/core/ops/references.js';
import { startWorkflow } from '../../src/core/ops/workflows.js';
import { state } from './screens-workflows.test.js';
import { seed, act } from '../helpers.js';

const at = (view) => ({ ...state, view: { name: 'help', ...view } });
const topicIds = HELP_GROUPS.flatMap((g) => g.topics);

test('the help markup: headings, bullets, numbered steps, bold, and links to terms and topics, all escaped', () => {
  const out = renderHelpText('## How to\n\nA <b>line</b> with **bold**, [[SFARP]] and [[residual risk|the residual]].\n\n- one\n- {{hazards|Hazards}}\n\n1. first\n2. second').toString();
  assert.match(out, /<h3>How to<\/h3>/);
  assert.match(out, /A &lt;b&gt;line&lt;\/b&gt; with <strong>bold<\/strong>/);
  assert.match(out, /data-view="help"[^>]*data-topic="glossary"[^>]*data-term="sfarp"[^>]*>SFARP</);
  assert.match(out, /data-term="residual-risk"[^>]*>the residual</);
  assert.match(out, /<ul><li>one<\/li><li><button[^>]*data-topic="hazards"[^>]*>Hazards<\/button><\/li><\/ul>/);
  assert.match(out, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.equal(plainHelpText('## How\n\n[[SFARP]] and {{hazards|Hazards}} **now**'), 'How SFARP and Hazards now');
});

test('every topic in the rail exists once, with a title, a one-line summary and a body; Getting started comes first', () => {
  assert.equal(topicIds[0], 'getting-started');
  assert.equal(new Set(topicIds).size, topicIds.length);
  assert.deepEqual([...topicIds].sort(), Object.keys(HELP_TOPICS).sort());
  for (const id of topicIds) {
    const t = HELP_TOPICS[id];
    assert.ok(t.title && t.summary && t.body, id);
    assert.ok(!t.summary.includes('\n'), `${id}: the summary is one line`);
  }
});

test('every link in the help goes somewhere: each [[term]] is in the glossary, each {{topic}} is a topic', () => {
  const terms = new Set(GLOSSARY.map((g) => termId(g.term)));
  const texts = [...Object.values(HELP_TOPICS).flatMap((t) => [t.summary, t.body]), ...GLOSSARY.map((g) => g.def)];
  for (const text of texts) {
    for (const [, name] of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) assert.ok(terms.has(termId(name)), `no glossary term "${name}"`);
    for (const [, id] of text.matchAll(/\{\{([^}|]+)\|[^}]*\}\}/g)) assert.ok(HELP_TOPICS[id], `no topic "${id}"`);
  }
});

test('the glossary is alphabetical, one entry per term, each defined', () => {
  const names = GLOSSARY.map((g) => g.term.toLowerCase());
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(GLOSSARY.map((g) => termId(g.term))).size, GLOSSARY.length);
  for (const g of GLOSSARY) assert.ok(g.def.trim(), g.term);
});

test('the Help page opens on Getting started: a rail of every topic in groups, and a search that also finds glossary terms', () => {
  const out = helpView(at({}), seed()).toString();
  assert.match(out, /<h1>Help<\/h1>/);
  assert.match(out, /data-filter-list/);
  assert.match(out, /class="help-rail"[^>]*data-filter-scope/);
  for (const id of topicIds) assert.match(out, new RegExp(`data-topic="${id}"`));
  assert.match(out, /help-item on[^>]*data-topic="getting-started"|data-topic="getting-started"[^>]*class="[^"]*on/);
  assert.match(out, new RegExp(`<h2>${HELP_TOPICS['getting-started'].title}</h2>`));
  assert.match(out, /data-pick-only[^>]*data-pick-text="sfarp[^"]*"|data-pick-text="sfarp[^"]*"[^>]*data-pick-only/, 'glossary terms show only when searching');
  const hazards = out.match(/<li data-pick-text="([^"]*)"[^>]*><button[^>]*data-topic="hazards"/);
  assert.ok(hazards && hazards[1].includes(plainHelpText(HELP_TOPICS.hazards.body).toLowerCase().slice(0, 40)), 'a topic is found by any of its words');
});

test('a topic shows its summary, body and links to the topics related to it', () => {
  const out = helpView(at({ topic: 'hazards' }), seed()).toString();
  assert.match(out, new RegExp(`<h2>${HELP_TOPICS.hazards.title}</h2>`));
  assert.match(out, /class="help-summary"/);
  if (HELP_TOPICS.hazards.related?.length) assert.match(out, /Related/);
});

test('the glossary shows every term, the one looked up first and marked', () => {
  const out = helpView(at({ topic: 'glossary', term: 'sfarp' }), seed()).toString();
  assert.match(out, /class="help-term on"[^>]*id="term-sfarp"|id="term-sfarp"[^>]*class="help-term on"/);
  assert.equal((out.match(/class="help-term/g) ?? []).length, GLOSSARY.length + 1, 'every term, and the one looked up again at the top');
});

test('an unknown topic falls back to Getting started', () => {
  assert.match(helpView(at({ topic: 'nope' }), seed()).toString(), new RegExp(`<h2>${HELP_TOPICS['getting-started'].title}</h2>`));
});

test('Help in the top bar opens the topic for the page you are on, a workflow by its type', () => {
  let d = createReference(seed(), act, { id: 'r1', title: 'SB', url: 'x' });
  d = startWorkflow(d, act, { id: 't1', type: 'newTechData', referenceId: 'r1' });
  assert.equal(helpTopicFor({ name: 'platform', id: 'p1' }, d), 'platforms');
  assert.equal(helpTopicFor({ name: 'workflow', id: 't1' }, d), 'wf-tech-data');
  assert.equal(helpTopicFor({ name: 'openItems' }, d), 'home');
  assert.equal(helpTopicFor({ name: 'help', topic: 'reviews' }, d), 'reviews');
  assert.equal(helpTopicFor({ name: 'somethingNew' }, d), 'getting-started');
  const top = shell({ ...state, session: { base: d, working: d, loadedStamp: null }, view: { name: 'platform', id: 'p1' } }, '').toString();
  assert.match(top, /class="help-button"[^>]*data-view="help"[^>]*data-topic="platforms"|data-topic="platforms"[^>]*class="help-button"/);
});
