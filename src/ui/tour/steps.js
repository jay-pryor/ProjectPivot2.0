/**
 * The tutorial's steps, in order. Each shows a page of the sample register and highlights one
 * thing on it (`target`, a CSS selector; none centres the text). A try step (`try`) moves on by
 * itself once one of its actions is done. `sections` opens a page's rail section first.
 *
 * Text uses Help's markup (blank lines between paragraphs, "- " lists, **bold**), but never links:
 * a link would take the reader away from the step. It assumes no knowledge of PIVOT, and says
 * where on the screen each thing is.
 */
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
- The rest (Workflows, Reviews and so on) are covered later in this tour.`,
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
    id: 'tiles', view: { name: 'home' }, target: '.tiles', title: 'Home: your numbers at a glance',
    text: `You are on the **Home** page. This row of boxes counts the things waiting for you on the platforms you own, one kind per box (for example "1 to acknowledge" or "1 awaiting decision").

A box with a number in orange has something in it. Click any box to see the full list of that kind.`,
  },
  {
    id: 'attention', view: { name: 'home' }, target: '.attn-panel', title: 'Needs attention',
    text: `This list shows every item waiting for you, most urgent first. The coloured label at the left of each row says what kind it is:

- **Change**: someone else changed one of your platforms; you **acknowledge** it once you have looked.
- **Review**: a platform's **review** is due soon or overdue, or its date has moved.
- **Control**: a control needs a **decision** (whether to use it), is planned for you to **implement**, or is missing details.
- **Rating**: a hazard is missing a risk **rating**, or a rating has no **justification** (the reason for it).
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
    id: 'workflows-home', view: { name: 'home' }, target: '.wf-panel', title: 'Coming up, and work in progress',
    text: `To the right of Needs attention are two more panels:

- **Coming up** (above): reviews due soon on your platforms, with how many working days are left.
- **Workflows in progress** (highlighted): step-by-step tasks you have started and not finished. Here, your review of the patrol boat is under way. **Resume →** carries on where you left off.`,
  },
  {
    id: 'hazards', view: { name: 'hazards' }, target: '[data-table="hazards"]', title: 'The Hazards page',
    text: `You are now on the **Hazards** page (the Hazards tab at the top). A **hazard** is something that could cause harm, such as "Person overboard".

Each row is one hazard: its number (HAZ-001 and so on), its name, the platforms it applies to, and how serious it still is with controls in place. Click a hazard's name to open its own page. To add a hazard, click the small **+** next to the page's title, type its name and press **Add**.`,
  },
  {
    id: 'hazard', view: { name: 'hazard', id: 'tour-h1' }, target: '.dash-summary', title: 'A hazard’s page: the Overview',
    text: `This is the page for hazard **HAZ-001 Person overboard**.

Each hazard's page opens on its **Overview**. The Overview holds what is true of the hazard on every platform it applies to: its description (highlighted), its consequences, the stages of a platform's life when it applies, the controls linked to it, and its references and safety reports. Scroll down to see them.`,
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
    id: 'try-rating', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'residual' }, target: '.risk-residual', title: 'Your turn: rate the risk',
    text: `Further down the tab, a column of icons on the left opens each section; **Residual risk** is open now. It has one panel each for Personnel, Environment and Capability.

Each rating is a **likelihood**, from A (frequent) to G (not credible), and a **consequence**, from 1 (catastrophic) to 5 (none). PIVOT works out the **assessed level** from the two. The boxes beneath are for the reason behind each choice.`,
    try: { action: ['setAssessment', 'setRating'], says: 'Choose a different letter in one of the **Likelihood** dropdowns.' },
  },
  {
    id: 'moved', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'residual' }, title: 'Review dates follow the risk',
    text: `Every platform is reviewed regularly. The patrol boat's next review date depends on how serious its worst hazard is: the more serious, the sooner the review.

So changing a rating can move the platform's review date. When it does, PIVOT tells the platform's owner, and the new date shows on their Home until they acknowledge it.`,
  },
  {
    id: 'controls', view: { name: 'hazard', id: 'tour-h1', tab: 'p:tour-p1' }, sections: { ssra: 'controls' }, target: '.rail-panel', title: 'Controls on this platform',
    text: `This is the **Controls** section (from the column of icons on the left). A **control** is something that stops the hazard happening or limits the harm, such as "Lifejackets worn on deck".

Each control has a **status** on this platform, chosen in its dropdown:

- **Recommended**: suggested, not yet decided (shows on Home as needing a decision).
- **Planned**: agreed, not yet in place.
- **Implemented**: in place.
- **Rejected**: not used, with a reason.`,
  },
  {
    id: 'platform', view: { name: 'platform', id: 'tour-p1' }, target: '.doc-head', title: 'A platform’s page',
    text: `This is the page for the **Harbour Patrol Boat** platform (from the Platforms tab at the top). A **platform** is a piece of equipment or a system the register covers.

Below its name: who **owns** it (the person responsible for it), the groups it belongs to, when its next review is due, then lists of its hazards and controls. **Transfer owner…** hands it to someone else.`,
  },
  {
    id: 'workflows', view: { name: 'workflows' }, target: '.wf-cards', title: 'Workflows: guided tasks',
    text: `This is the **Workflows** page. A workflow walks you through a bigger job step by step, such as reviewing a platform, setting up a new one, or handing one to a new owner.

Start one from these boxes: choose what it is about from the dropdown, then press **Start**. Workflows you have started are listed above, under In progress, and anyone can see how far along they are.`,
  },
  {
    id: 'review', view: { name: 'workflow', id: 'tour-w1', hazardId: 'tour-h1' }, target: '.wf-rail', title: 'A review in progress',
    text: `This is your Platform Review of the patrol boat, opened from Workflows.

The list on the left has one entry per hazard on the platform, each with how many of its checks are done, and **Summary & complete** at the bottom. Click an entry to go to it. The page to the right shows the checks for the hazard chosen: six questions to look at, each with what you need to look at it.`,
  },
  {
    id: 'try-check', view: { name: 'workflow', id: 'tour-w1', hazardId: 'tour-h1' }, target: '.wf-check-foot', title: 'Your turn: tick a check',
    text: `Each check shows the same information you would see on the hazard's page, so you can fix anything there and then. Underneath each one is a box for a note, and a **Checked** tickbox.

Once every check on every hazard is ticked, the review can be completed from Summary & complete.`,
    try: { action: ['setStep'], says: 'Tick one of the **Checked** boxes.' },
  },
  {
    id: 'reviews', view: { name: 'reviews' }, target: '[data-table="reviewSchedule"]', title: 'The Reviews page',
    text: `The **Reviews** page lists every platform with when its next review is due.

Here the Training Range is **overdue** (its date has passed) and the Harbour Patrol Boat is **due soon** (within 30 days). Click a platform to set how often it is reviewed or start a review. The **Timeline** tab shows the whole year at a glance.`,
  },
  {
    id: 'bowties', view: { name: 'bowties' }, target: '.bt-side', title: 'Bow-ties',
    text: `The **Bow-ties** page draws a hazard on a platform as a diagram shaped like a bow tie: its causes on the left, the hazard in the middle, and its consequences on the right, with the controls in between.

This panel on the left lists your saved diagrams; click one to open it, or choose **New diagram**.`,
  },
  {
    id: 'rest', view: { name: 'info' }, target: '.topbar nav', title: 'Info, Reports and References',
    text: `Three more tabs at the top:

- **Info** (open now): the shared lists PIVOT offers choices from, and the groups platforms belong to.
- **Reports**: produce a platform's safety report as a document.
- **References**: the documents the register relies on, such as manuals and test reports.`,
  },
  {
    id: 'finish', view: { name: 'home' }, title: 'That’s the tour',
    text: `You have seen the main parts of PIVOT. When you press **Finish**, the sample data goes away and your own data comes back exactly as you left it.

If you get stuck, the **Help** button at the top right explains the page you are on, and Help's **Getting started** page has this tutorial if you want to take it again.`,
  },
];
