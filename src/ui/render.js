import * as start from './screens/start.js';
import { shell } from './screens/common.js';
import { hazardsView, hazardView } from './screens/hazards.js';
import { controlsView, controlView } from './screens/controls.js';
import { platformsView, platformView } from './screens/platforms.js';
import { pickerView } from './screens/picker.js';
import { homeView } from './screens/home.js';
import { referencesView, referenceView } from './screens/references.js';
import { reportsView, backupsView } from './screens/reports.js';

/** @param {any} state */
function mainView(state) {
  const data = state.session?.working;
  const v = state.view;
  if (!data || v.name === 'backups' || state.pendingRestore) return backupsView(state);
  switch (v.name) {
    case 'home': return homeView(state, data);
    case 'hazard': return hazardView(state, data, v.id);
    case 'controls': return controlsView(state, data);
    case 'control': return controlView(state, data, v.id);
    case 'platforms': return platformsView(state, data);
    case 'platform': return platformView(state, data, v.id);
    case 'references': return referencesView(state, data);
    case 'reference': return referenceView(state, data, v.id);
    case 'reports': return reportsView(state, data);
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
