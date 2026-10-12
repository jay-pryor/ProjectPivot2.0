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
    if (m[1] !== undefined) out += `<strong>${inline(m[1])}</strong>`;
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
  info: 'info', reports: 'reports', references: 'references', reference: 'references', backups: 'backups', historyDeletions: 'history', profiles: 'saving',
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
  'getting-started': {
    title: 'Getting started',
    summary: 'What PIVOT is for, and the few things you need to know to use it.',
    body: `
PIVOT is a shared register of safety risk. It holds the [[hazard|hazards]] that could cause harm, the [[platform|platforms]] they apply to, the [[control|controls]] that keep them in check, and how serious each one is. Everyone on the team works from the same data, so what you record is what everyone sees.

## The basics

- **Your data lives in a shared folder.** When PIVOT opens, it asks for the data folder. Everyone on the team uses the same one.
- **You work as a [[profile]].** Pick your name on the Log In screen. Your profile is how PIVOT knows who made each change, which platforms are yours, and your settings (such as light or dark mode).
- **Nothing is stored until you save.** Edits show at once, but the **Unsaved** button in the top bar means they are only in this browser. Click it to save. If someone else saved in the meantime, their changes and yours are combined. See {{saving|Saving and sharing}}.

## Finding your way around

The tabs along the top are the main pages:

- **Home**: what needs your attention, what is coming up, and your platforms. A dot on the tab means something is waiting for you.
- **Hazards**, **Controls** and **Platforms**: the register itself. Open any row to see and edit it.
- **Workflows**: guided tasks such as reviewing or onboarding a platform.
- **Reviews**: when each platform is next due for review.
- **Bow-ties**: diagrams of a hazard, its causes, controls and consequences.
- **Info**: the lists PIVOT offers choices from, and [[platform group|platform groups]].
- **Reports**: produce a platform's safety report.
- **References**: the documents that support the register.

The ☰ menu at the top right has Backups and Deletion history. **← Back** under the tabs returns to the page you were on, and the ☆ beside it adds the page to your favourites on Home.

## Your first day

1. Look at **Home**. Needs attention lists anything waiting for you; each row has a button that takes you to where it is dealt with.
2. Open one of your platforms from Home or the Platforms tab, and look through its hazards.
3. Try editing something small: double-click a value to change it, then press Enter. Notice the **Unsaved** button, and click it to save.
4. When you need to do something bigger, such as a review, start it from **Workflows**. It walks you through each step.

## Getting help

The **Help** button in the top bar opens the help for the page you are on. Use the search box on this page to find any topic or word, and the {{glossary|Glossary}} for what the terms mean. For a 5-minute guided tour on sample data, start the tutorial:
`,
    related: ['home', 'saving', 'glossary'],
  },

  home: {
    title: 'Home',
    summary: 'What needs your attention, what is coming up, and your platforms, in one place.',
    body: `
## Needs attention

Things waiting for you on your platforms, most urgent first. Each row says what it is, who it came from and which platform, and has a button to deal with it. Double-click a row to go where it is dealt with.

- **Urgent**: a platform transferred to you that you have not yet reviewed, or a [[review date]] that has moved to within 30 days (or into the past).
- **Reviews overdue**, longest overdue first.
- **Changes to acknowledge**: changes others made to your platforms. See {{acknowledging|Acknowledging changes}}.
- **Gaps in the register**: controls awaiting a [[control status|status]] decision, controls you have planned to implement, hazards missing a rating or a [[justification]], control details not filled in, and [[SFARP]] not finished.

Each item goes away once the thing behind it is done. The tiles above the list count each kind; click one to see the full list in Open items. The Home tab carries a dot while anything is waiting.

## The rest of Home

- **Coming up**: reviews due soon, and any in progress. Choose how far ahead it looks.
- **Workflows in progress**: your open workflows, with how far along each is. **All workflows** opens the Workflows tab.
- **Favourite pages**: pages you starred with ☆. The ⋯ menu changes how they are laid out and their order.
- **Platform cards**: each of your platforms at a glance: its [[residual risk]], hazards, items waiting and next review.

## Whose items

The owner switch at the top shows your items (Me), another person's, or Everyone's. It is handy when covering for someone.

## Good to know

- Platforms still being [[onboarding|onboarded]] are left out of Needs attention and Coming up until their onboarding is complete.
`,
    related: ['acknowledging', 'reviews', 'workflows'],
  },

  hazards: {
    title: 'Hazards',
    summary: 'The things that could cause harm, and everything recorded about each one.',
    body: `
The Hazards tab lists every [[hazard]], with the platforms it is on and its worst [[residual risk]]. Add one with the small **+** next to the page's title: type its title and press **Add**. Each hazard is numbered (HAZ-001 and so on) when it is first saved; until then it shows a [[TBC]] tag.

## A hazard's page

- **Overview** is what is true of the hazard everywhere: its description, [[consequence|consequences]], [[lifecycle phase|lifecycle phases]], the platforms it is on, its controls, references and safety reports.
- **One tab per platform** holds the assessment for that platform: its [[causal factor|causal factors]] and other [[facet|facets]], the [[initial risk]] and [[residual risk]] ratings, the controls and their [[control status|statuses]] there, safety reports, and [[SFARP]].
- **History** lists every change to it.

## Rating a hazard on a platform

On the platform tab, each of the three [[receptor|receptors]] (Personnel, Environment, Capability) gets a [[likelihood]] and a [[consequence level]], once before controls ([[initial risk]]) and once with them ([[residual risk]]). PIVOT shows the [[assessed level]] that gives. Write a [[justification]] for each choice.

If the same hazard is on another platform, **Copy from…** brings its ratings, controls or SFARP across to save typing.

## Safety reports

Record an occurrence, near miss, hazard report or bulletin against the hazard on a platform. Each gets an ID such as HAZ-001-A-1 when saved. A report filed against the wrong platform can be moved.

## Good to know

- Double-click any value to edit it; Enter applies, Escape cancels.
- A hazard can be retired only once it is on no platform, and deleted only once it is on no live platform. Deleting takes three clicks, and can be undone until your next change or save.
`,
    related: ['platforms', 'controls', 'bowties'],
  },

  controls: {
    title: 'Controls',
    summary: 'The measures that prevent hazards or limit their harm, and where each is used.',
    body: `
A [[control]] is anything that stops a hazard happening or limits the harm if it does. Controls are numbered C-001 and so on. The Controls tab lists them with their [[tier]], [[origin]], and the hazards and platforms they are on. Click **+** to make a new one.

## What a control records

- **[[Tier]]**: where it sits in the hierarchy of controls, from Elimination down to PPE.
- **Usual [[kind]]**: preventative (stops causes) or mitigating (limits consequences). It can differ for a particular hazard or platform.
- **[[Origin]]** and **description**.

## On each platform

Where a control is used on a hazard on a platform, it has:

- a **[[control status|status]]**: Recommended, Planned, Implemented or Rejected (with a reason);
- **[[implemented by]]**: OEM, HighCom or Customer;
- **what it prevents or mitigates** there: the causal factors or consequences it acts on;
- an **[[implementation status]]**: a free-text note on progress.

You set these on the hazard's platform tab, in the Controls section. A control newly added starts as Recommended, which shows on Home as awaiting a decision until you choose.

## Good to know

- Taking a control off one platform (✕) leaves it on the hazard's other platforms, and remembers its status if you add it back.
- A control can be retired (it can no longer be added anywhere) and deleted only once it is used nowhere.
`,
    related: ['hazards', 'platforms'],
  },

  platforms: {
    title: 'Platforms',
    summary: 'The systems or assets hazards apply to, each with an owner.',
    body: `
A [[platform]] is a system or asset the register covers. Each has an [[owner]], the person who answers for it: their platforms fill their Home, and changes others make to them wait for their [[acknowledgement]].

## Adding a platform

The small **+** next to the Platforms page's title (or the Platform Onboarding tile on Workflows) starts an [[onboarding]]: a guided set-up of the platform's description, groups, hazards, facets and controls. See {{wf-onboarding|Platform Onboarding}}.

## A platform's page

- **Owner**, with **Transfer owner…** to hand it to someone else (see {{wf-transfer|Transfer Platform Owner}}).
- **Groups**: the [[platform group|platform groups]] it belongs to. ✕ removes one, + adds one.
- **Next review**, and any changes waiting for acknowledgement.
- **Hazards** on it, with their ratings; **Controls** on it, with their statuses; and **References**.
- The ⋯ menu has the platform's image, its review schedule, Retire and Delete.

The hazard-by-hazard assessment (ratings, controls, SFARP, safety reports) is on each hazard's tab for this platform: open a hazard from the platform's Hazards list.

## Good to know

- **[[Report ID]]**: on the Hazards list you can double-click to give a hazard its own label on this platform; it defaults to the HAZ number.
- Retiring a platform cancels any workflows open on it. A platform can be deleted only once it has no hazards.
`,
    related: ['hazards', 'reviews', 'wf-onboarding', 'wf-transfer'],
  },

  workflows: {
    title: 'Workflows',
    summary: 'Guided tasks that walk you through a job step by step, and keep a record of it.',
    body: `
A [[workflow]] takes you through a job one step at a time, such as reviewing a platform or handing it to a new owner. Your progress is part of the saved data, so you can stop, save, and carry on later, even on another computer.

## The Workflows tab

- **In progress**: every open workflow, with its owner and how far along it is. Pick an owner at the top to narrow it down. **Resume →** carries on.
- **Start a workflow**: one tile per kind. Fill in what the tile asks for and press **Start**.
- **Recently completed**: workflows finished in the last 7, 30 or 90 days, or year.
- **History**: every completed and cancelled workflow.

## Working in a workflow

- The list on the left shows each step, ticked once done. Click one to go to it.
- Every edit you make in a workflow is marked [[via WF-n]], so anyone can see later which changes it made.
- **Complete** stays greyed out, saying what is still needed, until every step is done.

## Owners, taking over and cancelling

Each workflow has an owner: whoever started it. Only the owner can work on it; anyone else sees it read-only and can **Take over…** (two clicks). The owner can **Cancel workflow…** (also two clicks). A cancelled workflow is kept in History, and changes already made through it stay.

## The five workflows

- {{wf-review|Platform Review}}: check each hazard on a platform and complete its review.
- {{wf-onboarding|Platform Onboarding}}: set up a new platform.
- {{wf-transfer|Transfer Platform Owner}}: hand a platform to someone else.
- {{wf-reference-update|Reference Update}}: take a reference to a new revision.
- {{wf-tech-data|New Tech Data}}: work new technical information through what it affects.
`,
    related: ['wf-review', 'wf-onboarding', 'wf-transfer', 'wf-reference-update', 'wf-tech-data'],
  },

  reviews: {
    title: 'Reviews',
    summary: 'When each platform is next due for review, and how that date is worked out.',
    body: `
Every platform should be reviewed regularly. The Reviews tab shows when each is next due, what sets that date, and when it was last reviewed. Use the Owner and Group filters to narrow the list.

## Setting a review schedule

Open a platform from the list and choose **Edit review rule**:

- **Fixed period**: every so many months or years.
- **[[Review policy]]**: the period depends on the platform's [[residual risk]]: the riskier its worst hazard, the sooner the review.
- **No schedule**: shows on Home as needing one.

The **[[counted from]]** date is where the schedule starts. The next due date steps on by whole periods past the last completed review.

## When a due date moves

On a policy, a change to a residual rating can change the due date. When it does, PIVOT shows the new date and asks the owner to check it, and it stays marked **Moved** (and listed on Home) until the owner acknowledges it. It is urgent if the new date has passed or is within 30 days.

## Doing a review

**Start review** opens a {{wf-review|Platform Review}} workflow. Completing it records the review and sets the next due date.

## Other tabs

- **Timeline**: a year at a glance, one row per platform, showing upcoming and completed reviews.
- **Policies**: make and edit [[review policy|review policies]]: for each [[receptor]] and [[risk level]], how often to review. Leave a cell blank so that level does not drive a review.

## Good to know

- **[[Due soon]]** means within 30 days; **[[overdue]]** means past the due date.
`,
    related: ['wf-review', 'home'],
  },

  bowties: {
    title: 'Bow-ties',
    summary: 'Diagrams of a hazard on a platform: its causes, controls and consequences.',
    body: `
A [[bow-tie]] draws one hazard on one platform: its [[causal factor|causal factors]] on the left, the preventative controls in between, the hazard in the middle, then the mitigating controls and the [[consequence|consequences]] on the right. Implemented controls are drawn solid; others are dashed.

## Making and keeping diagrams

- **New diagram**: choose a hazard and a platform.
- **Save** keeps the view (its filters and layout) under My bow-ties. **Share…** lets other profiles see it under Shared with me. Only you can change your own saved views.
- **Export SVG** saves the picture as a file.
- Drag a view to the left or right of the drawing area to compare two side by side.

## Changing what is shown

- **Layout**: Traditional (a row per cause and consequence) or Focus (each control once).
- **Filters**: which control statuses and tiers to show (Rejected is hidden at first).
- **Show gaps** marks causes and consequences no control covers. Show tags and Show numbers add detail.
- Zoom with the mouse wheel or buttons, drag to move around, and **Fit** to see it all.

## Good to know

- The diagram is drawn from the register. To change what it shows, change the hazard: **Go to hazard platform page** takes you there.
`,
    related: ['hazards', 'controls'],
  },

  info: {
    title: 'Info',
    summary: 'The lists PIVOT offers choices from, and which platform groups each item belongs to.',
    body: `
Info holds the shared lists: [[platform group|platform groups]], and the options offered for each [[facet]] (causal factors, consequences, element failure modes, systems or elements, lifecycle phases and affected groups). Pick a section from the list on the left.

## Keeping the lists

- **Add** an option at the top of its section; double-click one to rename it; ✕ deletes it (it can be restored from Deletion history).
- **On hazards, not in the list** shows entries typed on hazards that are not yet options; add them one at a time or all at once.

## Assigning to platform groups

Hazards, controls and facet options can be assigned to platform groups, or to [[all platforms]]. That is what {{wf-onboarding|Platform Onboarding}} uses to suggest what a new platform probably needs. Choose **Assign to platform group**, pick the group, select rows (drag, or Shift- or Ctrl-click), then **Confirm**.

**View setup** chooses which groups are shown as columns.

## Good to know

- A platform joins a group on its own page, or during onboarding.
`,
    related: ['wf-onboarding', 'platforms'],
  },

  reports: {
    title: 'Reports',
    summary: "Produce a platform's safety report, and design what reports contain.",
    body: `
## Producing a report

Choose a platform and a title, then **Produce**. Reports are made from saved data, so save first. The report appears in the list below, where anyone can download it as Markdown (.md) or a web page (.html). Save to keep it.

A report on a platform whose review is overdue is still produced, and marked Overdue.

## Designing reports

**Open the report designer** sets the sections, wording, layout and classification marking that every report uses. The design is shared by everyone using the data folder.

## Good to know

- Deleting a report from the list deletes it for everyone.
`,
    related: ['platforms'],
  },

  references: {
    title: 'References',
    summary: 'The documents that support the register, and what each one supports.',
    body: `
A [[reference]] is a document the register relies on, such as a manual, a standard or a test report. It points at the document with a file, a web link or a network path (at least one), and records its doc number and [[revision]]. References are numbered REF-001 and so on.

## A reference's page

- **File**: upload one, or **Replace with new revision** (the old file is kept under Past files). A "File missing" tag means the file is no longer in the folder.
- **Supports**: the hazards (and their parts), controls and platforms it backs up. **+** links more; ✕ unlinks.
- **Update revision…** starts a {{wf-reference-update|Reference Update}}: the new revision is checked against everything it supports.
- **Work through as new tech data…** starts {{wf-tech-data|New Tech Data}} on this reference.

## Active and archived

Move a reference to **Archived** when it is no longer current. Archived references keep their links but are not offered for linking or updating. The ⋯ menu also has Retire, and Delete once it supports nothing.
`,
    related: ['wf-reference-update', 'wf-tech-data'],
  },

  'wf-review': {
    title: 'Platform Review',
    summary: 'Check every hazard on a platform, then complete its review.',
    body: `
## Starting

From the Platform Review tile on Workflows (overdue and due-soon platforms are listed first), or **Start review** on Reviews or Home. A platform has one review open at a time; starting again opens the one in progress.

## The steps

Each hazard on the platform has its own page with six checks. Each check shows the same editor as the platform page, so you fix things there and then:

1. **Safety reports**: any that fit but are not included?
2. **References**: any changed or updated and not represented?
3. **Controls**: any implemented that are not included?
4. **Residual risk ratings**: any change because of the above?
5. **Residual risk justifications**: do they still make sense?
6. **SFARP**: does it still make sense?

Tick **Checked** on each, with a note if useful. The list on the left shows each hazard's count.

## Completing

The summary shows every hazard against every check. Add an outcome and any notes, then **Complete review**. It needs every check ticked and a review schedule. Completing records the review and moves the next due date on.

## Good to know

- A platform still being onboarded cannot be reviewed until onboarding is complete.
`,
    related: ['reviews', 'workflows'],
  },

  'wf-onboarding': {
    title: 'Platform Onboarding',
    summary: 'Set up a new platform with everything it needs before it counts as a normal platform.',
    body: `
Every new platform is set up through onboarding. The platform is made straight away and tagged **Onboarding** until it is complete; until then it is left out of Home's lists, Coming up and Reviews.

## Starting

The small **+** next to the Platforms page's title, or the Platform Onboarding tile on Workflows: give the name and the owner.

## The steps

1. **Details**: a description (needed), the owner, and an image if you have one.
2. **Groups**: at least one [[platform group]].
3. **Hazards**: at least one. Hazards assigned to the platform's groups (or [[all platforms]]) are suggested; tick them and **Add**.
4. **Each hazard**: two things are needed, listed below.

On each hazard's page:

- its **[[facet|facets]]**: each of failure modes, systems or elements, affected groups and causal factors has an entry, or a tick for **None applies**;
- its **implemented controls**: each with tier, origin, description and implemented by, or a tick for **No controls implemented**.

Suggestions come from the groups the hazard and platform share. Other controls, ratings, justifications and SFARP can be filled in too, but are not required.

## Completing

The summary lists anything still needed, each a link to where it is. **Complete** removes the Onboarding tag.

## Good to know

- Cancelling leaves the platform as it is, still tagged Onboarding; its page then offers **Onboard again**.
`,
    related: ['platforms', 'info', 'workflows'],
  },

  'wf-transfer': {
    title: 'Transfer Platform Owner',
    summary: 'Hand a platform, and everything open on it, to a new owner.',
    body: `
All changes of a platform's owner go through this workflow (except choosing the owner while onboarding).

## Starting

**Transfer owner…** on the platform's page, or the tile on Workflows.

## The steps

1. Choose the new owner.
2. Look through each group of responsibilities: changes waiting [[acknowledgement]], the review schedule, workflows open on the platform, controls awaiting a decision or to implement, incomplete controls, and hazards missing ratings, justifications or SFARP. Tick each group once you have checked it, with a note if useful. Empty groups need no tick.
3. **Confirm transfer**.

## What happens

- The platform's owner changes at once.
- The old owner's open workflows on that platform pass to the new owner; others' stay with them.
- The new owner gets an urgent item on Home to review what they have taken on. It clears when they open the transfer and click **Mark as reviewed**.
`,
    related: ['platforms', 'home'],
  },

  'wf-reference-update': {
    title: 'Reference Update',
    summary: 'Take a reference to a new revision, checking everything it supports.',
    body: `
## Starting

**Update revision…** on the reference's page, or the tile on Workflows.

## The steps

1. Give the **new revision** (it must differ from the current one) and at least one of a **new file**, **link** or **path**.
2. Every item the reference supports is listed. Check each one still holds with the new revision: **Open →** goes to it, with a bar to bring you back, and edits there count as made [[via WF-n|through the workflow]]. Tick each, with a note if useful.
3. **Confirm update**.

## What happens

Nothing reaches the reference until you confirm. Then it gets the new revision, file, link and path, and the old file is kept under Past files. Cancelling leaves the reference untouched.
`,
    related: ['references', 'workflows'],
  },

  'wf-tech-data': {
    title: 'New Tech Data',
    summary: 'Work new technical information through the platforms, controls and ratings it affects.',
    body: `
Use this when new technical data arrives, such as a manufacturer bulletin, a test report or a revised manual.

## The steps

1. **Reference**: the data is kept as a [[reference]]. Fill in the new reference (a title, and a file, link or path), or choose an existing one. A new reference is made only when the workflow completes, so cancelling leaves nothing behind.
2. **Scope**: tick the platforms the data affects, then the hazards on each. If it brings a new hazard, **Add hazard…** links an existing one, or type a title to make one.
3. **Each platform and hazard** gets a page with four cards: Controls, Safety reports, Residual rating & justification, and SFARP. Make any changes in the card, then answer **Changed** or **No change**. If you answer Changed but made no change there, PIVOT points it out.
4. **Summary**: shows what the reference will be linked to. **Complete** once every card is answered.

## What happens

Completing links the reference to the platforms in scope, the hazards that changed or were added, and the controls changed through the workflow, so it is clear later where the data came in.

## Good to know

- If a change raises a [[residual risk]] on a platform reviewed by [[review policy]], its next review may move sooner, and the owner is told on Home.
`,
    related: ['references', 'workflows', 'reviews'],
  },

  saving: {
    title: 'Saving and sharing',
    summary: 'How your work is stored, and how it combines with everyone else’s.',
    body: `
## Saving

Your edits show straight away but are only in this browser until you save. The button in the top bar says where things stand: **Unsaved** (click it to save), **Saving…**, or **Saved**.

If you close the browser with unsaved edits, PIVOT offers to recover them next time you open the same folder.

## When others have saved too

Everyone saves to the same folder. If someone saved after you opened PIVOT, your save [[merge|merges]] their changes with yours. Where you both changed the same thing, yours wins, and PIVOT tells you whose changes it replaced. The person whose change was replaced is told next time they log in. Their earlier file is kept in [[Superseded Saves]].

A few rules must always hold (for example, a platform has only one review open at a time). If combining two saves would break one, your version is kept; if that cannot work, nothing is saved and PIVOT says why.

## Profiles

A [[profile]] is a name, not a login: there are no passwords. Your theme, column widths, favourites and some page settings follow your profile to any computer.

A profile no longer in use can be retired from **Profiles** in the ☰ menu, once it owns no platforms, has no open workflows and no transfer to mark reviewed. It leaves the Log In screen and the lists of people to choose, and its name stays on everything it did. **Restore** brings it back.

## Good to know

- Times and dates are Australian Eastern Standard Time.
- To use a different data folder, save first, then click the folder name in the top bar.
`,
    related: ['backups', 'acknowledging', 'history'],
  },

  acknowledging: {
    title: 'Acknowledging changes',
    summary: 'How a platform’s owner sees and signs off changes other people make to it.',
    body: `
When someone other than a platform's [[owner]] changes something on that platform, the change waits for the owner's [[acknowledgement]]. It shows on the owner's Home under Needs attention, and on the platform's page.

## Acknowledging

Read the change (the row says what, who and when; open it to see more), then click **Acknowledge**. On Open items, **Acknowledge all shown** does every listed change at once.

## What never needs acknowledging

Changes the owner makes themselves, producing reports, adding or removing a platform from a group, and the steps of acknowledging review dates and transfers.

## Good to know

- A moved [[review date]] is acknowledged the same way, from Home or the platform's review page.
`,
    related: ['home', 'history'],
  },

  history: {
    title: 'History',
    summary: 'Every change to every record: who made it, when, and what changed.',
    body: `
Every record (a hazard, control, platform, reference and so on) has a **History** tab listing each change: when, who, what, and exactly what changed. A change made through a workflow carries a [[via WF-n]] tag.

## Tidying a history

- **Comment**: + adds a note to a change.
- **[[Bundle]]**: group two or more changes into one row, with your own description. Unbundle splits them again.
- **Delete**: ✕ removes a change from the history. It is kept under Deletion history (☰ menu), where it can be restored.

## Deletion history

The ☰ menu's Deletion history lists history entries, facet options, platform groups and review policies that have been deleted, with **Restore** for each.
`,
    related: ['saving', 'acknowledging'],
  },

  backups: {
    title: 'Backups and recovery',
    summary: 'Going back to an earlier copy of the data, and recovering unsaved work.',
    body: `
## Backups

PIVOT keeps backups of the data in the folder automatically, at most one an hour, and keeps the newest 72. The ☰ menu's **Backups** lists them.

**Restore…** puts a backup back for everyone. PIVOT warns you first about any unsaved changes you would lose, and keeps the data it replaces in [[Superseded Saves]]. **Restore from a file…** does the same from a data file you choose.

## Recovering unsaved work

If PIVOT closed with unsaved edits, it offers them back when you next open the folder: **Recover** puts them back on screen (anything saved since by others is combined on your next save), or **Discard** them.

## If a file cannot be read

PIVOT says which file is the problem. For the data, continue, pick your profile, and restore from a backup.
`,
    related: ['saving'],
  },

  glossary: {
    title: 'Glossary',
    summary: 'What the words used in PIVOT mean.',
    body: 'Short definitions of the words PIVOT uses, in alphabetical order. Type in the search box to jump to one.',
  },
};

/** Every term the help links to, alphabetically. @type {{ term: string, def: string }[]} */
export const GLOSSARY = [
  { term: 'Acknowledgement', def: 'A platform owner confirming they have seen a change someone else made to their platform. See {{acknowledging|Acknowledging changes}}.' },
  { term: 'All platforms', def: 'A special [[platform group]] meaning every platform. Something assigned to it is suggested for every platform.' },
  { term: 'Archived', def: 'A [[reference]] that is no longer current. It keeps its links but is not offered for new ones.' },
  { term: 'Assessed level', def: 'The result of a [[likelihood]] and a [[consequence level]], such as "2C Serious": the matrix cell and its [[risk level]].' },
  { term: 'Bow-tie', def: 'A diagram of one hazard on one platform: causes and preventative controls on the left, mitigating controls and consequences on the right.' },
  { term: 'Bundle', def: 'Several changes in a record\'s History grouped into one row with their own description.' },
  { term: 'Causal factor', def: 'Something that can bring a hazard about. Recorded per platform; preventative controls act on them.' },
  { term: 'Consequence', def: 'An outcome if a hazard occurs. Shared across the hazard\'s platforms; mitigating controls act on them.' },
  { term: 'Consequence level', def: 'How bad the outcome would be: 1 Catastrophic, 2 Critical, 3 Marginal, 4 Negligible, 5 None.' },
  { term: 'Control', def: 'A measure that prevents a hazard or limits its harm. Numbered C-001 and so on.' },
  { term: 'Control status', def: 'Where a control stands on a hazard on a platform: Recommended (not yet decided), Planned, Implemented, or Rejected (with a reason).' },
  { term: 'Counted from', def: 'The date a platform\'s review schedule starts from.' },
  { term: 'Due soon', def: 'A review due within the next 30 days.' },
  { term: 'Facet', def: 'One kind of detail recorded about a hazard: causal factors, consequences, element failure modes, systems or elements, affected groups, and lifecycle phases.' },
  { term: 'Hazard', def: 'Something that could cause harm. Numbered HAZ-001 and so on, and assessed separately on each platform it is on.' },
  { term: 'Implementation status', def: 'A free-text note on how a control\'s implementation is going on a platform.' },
  { term: 'Implemented by', def: 'Who puts a control in place on a platform: OEM (the manufacturer), HighCom, or Customer. Controls Planned and implemented by HighCom show on the owner\'s Home as to implement.' },
  { term: 'Initial risk', def: 'How serious a hazard is before any controls, rated for each [[receptor]].' },
  { term: 'Justification', def: 'The reason for a chosen [[likelihood]] or [[consequence level]].' },
  { term: 'Kind', def: 'Whether a control is preventative (acts on causes) or mitigating (limits consequences).' },
  { term: 'Lifecycle phase', def: 'A stage in a platform\'s life (for example, operation or maintenance) when a hazard applies. The list is kept on Info.' },
  { term: 'Likelihood', def: 'How likely the outcome is: A Frequent, B Probable, C Occasional, D Remote, E Improbable, F Eliminated, G Not Credible.' },
  { term: 'Merge', def: 'Combining your save with changes others saved since you opened PIVOT. See {{saving|Saving and sharing}}.' },
  { term: 'Onboarding', def: 'Setting up a new platform through the Platform Onboarding workflow. The platform is tagged Onboarding until it is complete.' },
  { term: 'Origin', def: 'Where a control came from, in your own words.' },
  { term: 'Overdue', def: 'A review whose due date has passed.' },
  { term: 'Owner', def: 'The person responsible for a platform, or the person running a workflow.' },
  { term: 'Platform', def: 'A system or asset the register covers. Numbered P-001 and so on, and owned by one person.' },
  { term: 'Platform group', def: 'A named kind of platform, used to filter lists and to suggest hazards, controls and options when onboarding.' },
  { term: 'Profile', def: 'Your name in PIVOT. It records who made each change and keeps your settings. There are no passwords.' },
  { term: 'Receptor', def: 'What a risk falls on: Personnel, Environment or Capability. Each is rated separately.' },
  { term: 'Reference', def: 'A document the register relies on, with a file, link or path. Numbered REF-001 and so on.' },
  { term: 'Report ID', def: 'A hazard\'s label on a particular platform. It defaults to the HAZ number.' },
  { term: 'Residual risk', def: 'How serious a hazard is with its controls in place, rated for each [[receptor]]. It drives review policies.' },
  { term: 'Review date', def: 'When a platform is next due for review. It is "moved" when a change shifts it, until the owner acknowledges the new date.' },
  { term: 'Review policy', def: 'A rule setting how often platforms are reviewed from their [[residual risk]]: a period for each [[receptor]] and [[risk level]]. A platform uses the shortest period any of its hazards gives.' },
  { term: 'Revision', def: 'Which version of a document a [[reference]] points at.' },
  { term: 'Risk level', def: 'The band a rating falls in, worst first: High, Serious, Medium, Low; then Eliminated, Not Credible, and Uncategorised (not fully rated).' },
  { term: 'SFARP', def: 'So Far As Reasonably Practicable: the argument that a hazard\'s risk is as low as it reasonably can be. Recorded as a justification, a conclusion and conditions of validity.' },
  { term: 'Superseded Saves', def: 'A folder inside the data folder keeping data files that a merge or restore replaced.' },
  { term: 'TBC', def: 'Shown on a new record before it is first saved and numbered.' },
  { term: 'Tier', def: 'Where a control sits in the hierarchy of controls: Elimination, Substitution, Isolation, Engineering, Administrative, PPE.' },
  { term: 'via WF-n', def: 'Marks a change made through workflow WF-n, so it can be traced back to it.' },
  { term: 'Workflow', def: 'A guided, owned task such as a platform review. Numbered WF-001 and so on. See {{workflows|Workflows}}.' },
];
