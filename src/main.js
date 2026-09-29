import { createController } from './ui/controller.js';
import { mount } from './ui/mount.js';
import { systemClock } from './core/time.js';

/** localStorage can be missing or refused by policy; the mirror reports that as a warning. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return /** @type {Storage} */ (/** @type {unknown} */ ({
      getItem: () => null,
      setItem: () => { throw new Error('the browser refuses storage on this page'); },
      removeItem: () => {},
    }));
  }
}

const w = /** @type {any} */ (window);
const controller = createController({
  clock: systemClock,
  storage: browserStorage(),
  pickFolder: () => w.showDirectoryPicker({ mode: 'readwrite', id: 'pivot-data' }),
  pickSaveFile: (suggestedName) => w.showSaveFilePicker({ suggestedName }),
  pickOpenFile: async () => {
    const [h] = await w.showOpenFilePicker({ types: [{ description: 'Pivot data file', accept: { 'application/json': ['.json'] } }] });
    return (await h.getFile()).text();
  },
  openFile: (file) => {
    const url = URL.createObjectURL(file);
    // A new tab shows PDFs and images; where the browser blocks it, the file downloads instead.
    if (!window.open(url, '_blank')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  copyText: (text) => navigator.clipboard.writeText(text),
});
mount(/** @type {HTMLElement} */ (document.getElementById('pivot')), controller);
