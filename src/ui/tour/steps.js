/**
 * The tutorial's steps, in order. Each shows a page of the sample register and highlights what it
 * talks about (`target`: one CSS selector or several; the first is what the bubble sits beside;
 * none centres the text). A try step (`try`) moves on by itself once one of its actions is done.
 * `sections` opens a page's rail section first; `enter` is an action done on arriving (opening a
 * saved bow-tie, say).
 *
 * Text uses Help's markup (blank lines between paragraphs, "- " lists, **bold**), but never links:
 * a link would take the reader away from the step. It assumes no knowledge of PIVOT, says where on
 * the screen each thing is, and everything it talks about is highlighted.
 */

/** A main tab at the top, as a step highlights it. @param {string} view */
const tab = (view) => `.topbar nav button[data-view="${view}"]`;

/** A step's highlights, as a list. @param {{ target?: string | string[] }} step @returns {string[]} */
export const targetsOf = (step) => (step.target === undefined ? [] : Array.isArray(step.target) ? step.target : [step.target]);

export const TOUR_STEPS = [
  {
    id: 'welcome', view: { name: 'home' }, title: 'Welcome to PIVOT',
    text: `PIVOT is where the team keeps its safety register: what could go wrong, which equipment it affects, how serious it is, and what is being done about it.

This tour shows you around using **made-up sample data**, so click anything you like: none of it is saved, and your own data is waiting, untouched, when you finish.

Press **Next** (or the → key) to go on, **Back** (←) to go back, and **Skip tutorial** or the orange bar's **Leave tutorial** to stop at any time.`,
  },
  {
    id: 'tabs', view: { name: 'home' }, target: '.topbar nav', title: 'The main pages',
    text: `This row of tabs along the top of the screen is how you move around. Click a tab to open that page; the underlined one is where you are.

- **Home**: what needs your attention.
- **Hazards**, **Controls** and **Platforms**: the register itself.
- The rest are covered later in this tour.`,
  },
  {
    id: 'save', view: { name: 'home' }, target: '.topbar .save', title: 'Saving your work',
    text: `This button, at the top right, shows whether your work is saved.

When you change something, the change shows straight away but is only in your browser, and the button says **Unsaved**. Click it to save, so everyone else sees your change. If you close PIVOT without saving, it offers your changes back next time.

(Saving is switched off during this tour.)`,
  },
  {
    id: 'help', view: { name: 'home' }, target: '.help-button', title: 'Getting help',
    text: `The **Help** button, next to your name at the top right, opens a guide to whichever page you are on.

Help also has a search box and a glossary that explains every term PIVOT uses, such as "residual risk" or "SFARP".`,
  },
  {
    id: 'settings-menu', view: { name: 'home' }, target: '.settings-menu', title: 'The ☰ menu',
    text: `The three lines at the far top right open a small menu:

- **Backups**: earlier copies of the data PIVOT keeps automatically, which can be put back if something goes wrong.
- **Deletion history**: things that have been deleted, which can be brought back.

Click the three lines again, or anywhere else, to close it.`,
  },
  {
    id: 'tiles', view: { name: 'home' }, target: ['.tiles', tab('home')], title: 'Home: your numbers at a glance',
    text: `You are on the **Home** page. This row of boxes counts the things waiting for you on the platforms you own, one kind per box (for example "1 to acknowledge" or "1 awaiting decision").

A box with a number in orange has something in it. Click any box to see the full list of that kind.`,
  },
  {
    id: 'attention', view: { name: 'home' }, target: '.attn-panel', title: 'Needs attention',
    text: `This list shows every item waiting for you, most urgent first. The coloured label at the left of each row says what kind it is:

- **Change**: someone else changed one of your platforms; you **acknowledge** it once you have looked.
- **Review**: a platform's **review** is due soon or overdue, or its date has moved.
- **Control**: a control needs a **decision** (whether to use it), is planned for you to **implement**, or is missing details.
- **Rating**: a hazard is missing a risk **rating**, or a rating has no **justification**.
- **SFARP**: the argument that the risk is as low as it reasonably can be is unfinished.

Each row has a button at its right end that takes you to where the item is dealt with.`,
  },
  {
    id: 'try-acknowledge', view: { name: 'home' }, target: '.attn-panel', title: 'Your turn: acknowledge a change',
    text: `In the list, the row labelled **Change** says Sam (sample) edited the hazard "Person overboard" on your Harbour Patrol Boat.

When someone else changes your platform, PIVOT asks you to acknowledge it, so you always know what has changed. Acknowledging only records that you have seen it; it does not undo the change.`,
    try: { action: ['acknowledge', 'acknowledgeAll'], says: 'Click the **Acknowledge** button at the right end of that row.' },
  },
  {
    id: 'coming-up', view: { name: 'home' }, target: '.coming-panel', title: 'Coming up',
    text: `**Coming up** lists the reviews due soon on your platforms: when each is due, and how many working days are left. The dropdown at its top right changes how far ahead it looks.

Here the Harbour Patrol Boat's review is due in two weeks. Its review is already under way, so the button says **Continue review →**.`,
  },
  {
    id: 'workflows-home', view: { name: 'home' }, target: '.wf-panel', title: 'Workflows in progress',
    text: `**Workflows in progress** lists the step-by-step tasks you have started and not finished, each with a bar showing how far along it is.

Here, your review of the patrol boat is under way. **Resume →** carries on where you left off, and **All workflows →** at the top right opens the Workflows page.`,
  },
  {
    id: 'hazards', view: { name: 'hazards' }, target: ['[data-table="hazards"]', tab('hazards')], title: 'The Hazards page',
    text: `This is the **Hazards** page. A **hazard** is something that could cause harm, such as "Person overboard".

Each row of the list is one hazard: its number (HAZ-001 and so on), its name, the platforms it applies to, and how serious it still is with controls in place. Click a hazard's name to open its own page.`,
  },
  {
    id: 'add-hazard', view: { name: 'hazards' }, target: ['main .head .plus', tab('hazards')], title: 'Adding a hazard',
    text: `To add a hazard, click the small **+** next to the page's title. A box opens: type the hazard's name and press **Add**.

The same small **+** adds things all over PIVOT: next to a page's title, or at the top of a table or a card.`,
  },
  {
    id: 'hazard', view: { name: 'hazard', id: 'tour-h1' }, target: ['.dash-summary', '.doc-menu'], title: 'A hazard’s page: the Overview',
    text: `This is the page for hazard **HAZ-001 Person overboard**.

Each hazard's page opens on its **Overview**. The Overview holds what is true of the hazard on every platform it applies to: its description (highlighted), its consequences, the stages of a platform's life when it applies, the controls linked to it, and its references and safety reports. Scroll down to see them.

The **⋯** button at the right of the title has options for the whole hazard, such as Retire and Delete.`,
  },
  {
    id: 'platform-tabs', view: { name: 'hazard', id: 'tour-h1' }, target: 'nav.tabs', title: 'One tab for each platform',
    text: `Under the hazard's name is a row of tabs: **Overview**, then **one tab for each platform this hazard applies to**, then **History**.

Person overboard applies to two platforms, so there are two platform tabs: **Harbour Patrol Boat** and **Training Range**. The same hazard can be more or less serious, and have different controls, on each platform, so each platform has its own tab. The coloured label on a tab shows how serious the hazard is there.

**History** lists every change ever made to the hazard.`,
  },
  {
    id: 'hazard-platform', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, target: '.dash-card[aria-label="Risk"]', title: 'The hazard on one platform',
    text: `This is the **Harbour Patrol Boat** tab: the hazard as it applies to the patrol boat platform.

The highlighted table shows how serious it is for three things it could harm (**Personnel**, **Environment** and **Capability**), rated twice:

- **Initial**: before any controls.
- **Residual**: with the controls in place.

Everything below on this tab (its causes, its controls, its ratings) is for this platform only.`,
  },
  {
    id: 'section-menu', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'residual' }, target: '.rail', title: 'The tab’s menu',
    text: `Further down the tab, this column on the left is its **menu**. Each line opens one section beside it: Safety reports, References, Initial risk, Controls, Residual risk and SFARP. The highlighted line is the section open now; a number or coloured dot beside a line shows what is in it.

Click a line to open its section; click the open one again to close it. Many pages in PIVOT have a menu like this.`,
  },
  {
    id: 'try-rating', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'residual' }, target: '.risk-residual', title: 'Your turn: rate the risk',
    text: `**Residual risk** is open from the menu. It has one panel each for Personnel, Environment and Capability.

Each rating is a **likelihood**, from A (frequent) to G (not credible), and a **consequence**, from 1 (catastrophic) to 5 (none). PIVOT works out the **assessed level** from the two. The boxes beneath each are for the justification of each choice.`,
    try: { action: ['setAssessment', 'setRating'], says: 'Choose a different letter in one of the **Likelihood** dropdowns.' },
  },
  {
    id: 'moved', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'residual' }, title: 'Review dates follow the risk',
    text: `Every platform is reviewed regularly. The patrol boat's next review date depends on how serious its worst hazard is: the more serious, the sooner the review.

So changing a rating can move the platform's review date. When it does, PIVOT tells the platform's owner, and the new date shows on their Home until they acknowledge it.`,
  },
  {
    id: 'controls', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'controls' }, target: ['.rail-panel', '.rail-item[data-section="controls"]'], title: 'Controls on this platform',
    text: `**Controls** is open from the menu. A **control** is something that stops the hazard happening or limits the harm, such as "Lifejackets worn on deck".

Each control has a **status** on this platform, chosen in its dropdown:

- **Recommended**: suggested, not yet decided (shows on Home as needing a decision).
- **Planned**: agreed, not yet in place.
- **Implemented**: in place.
- **Rejected**: not used, with a reason.`,
  },
  {
    id: 'platform', view: { name: 'platform', id: 'tour-p1' }, target: ['.doc-head', tab('platforms')], title: 'A platform’s page',
    text: `This is the page for the **Harbour Patrol Boat**, opened from the **Platforms** page. A **platform** is a piece of equipment or a system the register covers.

Below its name: who **owns** it (the person responsible for it), the groups it belongs to, when its next review is due, then lists of its hazards and controls. **Transfer owner…** hands it to someone else, and the **⋯** button at the right of the title has more options, such as its picture and its review schedule.`,
  },
  {
    id: 'workflows', view: { name: 'workflows' }, target: ['.wf-cards', tab('workflows')], title: 'Workflows: guided tasks',
    text: `This is the **Workflows** page. A workflow walks you through a bigger job step by step, such as reviewing a platform, setting up a new one, or handing one to a new owner.

Start one from these boxes: choose what it is about from the box's dropdown, then press **Start**. Workflows already started are listed above, under In progress, with how far along each is.`,
  },
  {
    id: 'review', view: { name: 'workflow', id: 'tour-w1', hazardId: 'tour-h1' }, target: ['.wf-rail', tab('workflows')], title: 'A review in progress',
    text: `This is your review of the patrol boat, opened from Workflows.

The list on the left is the review's **menu**: one line per hazard on the platform, each with how many of its checks are done, and **Summary & complete** at the bottom. Click a line to go to it. The page to the right shows the checks for the hazard chosen: six questions to look at, each with what you need to answer it.`,
  },
  {
    id: 'try-check', view: { name: 'workflow', id: 'tour-w1', hazardId: 'tour-h1' }, target: '.wf-check-foot', title: 'Your turn: tick a check',
    text: `Each check shows the same information you would see on the hazard's page, so you can fix anything there and then. At the bottom of each check is a box for a note, and a **Checked** tickbox (highlighted, for the first check).

Once every check on every hazard is ticked, the review can be completed from **Summary & complete**.`,
    try: { action: ['setStep'], says: 'Tick the **Checked** box at the right end of this row.' },
  },
  {
    id: 'reviews', view: { name: 'reviews' }, target: ['[data-table="reviewSchedule"]', tab('reviews')], title: 'The Reviews page',
    text: `This is the **Reviews** page. It lists every platform and when its next review is due.

Here the Training Range's review is **overdue** (its date has passed) and the Harbour Patrol Boat's is **due soon** (within 30 days). Click a platform's name to set how often it is reviewed, or to start its review. The **Timeline** tab, above the list, shows the whole year at a glance.`,
  },
  {
    id: 'bowties', view: { name: 'bowties' }, enter: { type: 'openBowtieView', id: 'tour-bv1' }, target: ['.bt-stage', '.bt-side', tab('bowties')], title: 'Bow-ties',
    text: `This is the **Bow-ties** page, showing the saved diagram of Person overboard on the patrol boat.

It is drawn like a bow tie: the **causes** on the left, the **hazard** in the middle, and the **consequences** on the right. Between them are the **controls**: those that stop the causes, and those that limit the consequences. Solid boxes are controls in place; dashed ones are not yet.

The panel on the left lists your saved diagrams, and **New diagram** draws another.`,
  },
  {
    id: 'rest', view: { name: 'info' }, target: [tab('info'), tab('reports'), tab('references')], title: 'Info, Reports and References',
    text: `Three more tabs at the top:

- **Info** (open now): the shared lists PIVOT offers choices from, and the groups platforms belong to.
- **Reports**: a platform's safety report, made in the report designer as a PDF or web page.
- **References**: the documents the register relies on, such as manuals and test reports.`,
  },
  {
    id: 'finish', view: { name: 'home' }, title: 'That’s the tour',
    text: `You have seen the main parts of PIVOT. When you press **Finish**, the sample data goes away and your own data comes back exactly as you left it.

If you get stuck, the **Help** button at the top right explains the page you are on, and Help's **Getting started** page has this tutorial if you want to take it again.`,
  },
];
