import * as start from './screens/start.js';
import { shell } from './screens/common.js';
import { hazardsView, hazardView } from './screens/hazards.js';
import { controlsView, controlView, newControlView } from './screens/controls.js';
import { platformsView, platformView } from './screens/platforms.js';
import { reviewsView } from './screens/reviews.js';
import { pickerView } from './screens/picker.js';
import { homeView, openItemsView } from './screens/home.js';
import { referencesView, referenceView } from './screens/references.js';
import { reportsView, backupsView } from './screens/reports.js';
import { infoView } from './screens/info.js';
import { bowtiesView } from './screens/bowties.js';
import { historyDeletionsView } from './screens/history-deletions.js';

/** @param {any} state */
function mainView(state) {
  const data = state.session?.working;
  const v = state.view;
  if (!data || v.name === 'backups' || state.pendingRestore) return backupsView(state);
  switch (v.name) {
    case 'home': return homeView(state, data);
    case 'openItems': return openItemsView(state, data);
    case 'hazard': return hazardView(state, data, v.id);
    case 'controls': return controlsView(state, data);
    case 'control': return controlView(state, data, v.id);
    case 'newControl': return newControlView(state, data);
    case 'platforms': return platformsView(state, data);
    case 'platform': return platformView(state, data, v.id);
    case 'reviews': return reviewsView(state, data);
    case 'references': return referencesView(state, data);
    case 'reference': return referenceView(state, data, v.id);
    case 'info': return infoView(state, data);
    case 'reports': return reportsView(state, data);
    case 'bowties': return bowtiesView(state, data);
    case 'historyDeletions': return historyDeletionsView(state, data);
    default: return hazardsView(state, data);
  }
}

/** @param {any} state @returns {string} */
export function renderApp(state) {
  switch (state.screen) {
    case 'open': return start.openScreen(state).toString();
    case 'check': return start.checkScreen(state).toString();
    case 'profile': return start.profileScreen(state).toString();
    case 'recover': return start.recoverScreen(state).toString();
    case 'notices': return start.noticesScreen(state).toString();
    default: return shell(state, mainView(state)).toString() + (state.session ? pickerView(state, state.session.working).toString() : '');
  }
}
