import { createController } from './ui/controller.js';
import { mount } from './ui/mount.js';
import { systemClock } from './core/time.js';
import { viewableType } from './ui/files.js';

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
  openFile: (file, name = file.name) => {
    // Only PDFs, images and plain text open in a tab, re-typed by their extension so a file cannot
    // pass itself off as a web page; everything else downloads. The tab gets no handle on Pivot.
    const type = viewableType(name);
    const url = URL.createObjectURL(type ? new Blob([file], { type }) : file);
    const a = document.createElement('a');
    a.href = url;
    if (type) { a.target = '_blank'; a.rel = 'noopener'; } else a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  copyText: (text) => navigator.clipboard.writeText(text),
});
mount(/** @type {HTMLElement} */ (document.getElementById('pivot')), controller);
