// content.js — lightweight page-side hotkey listener.
// Injected into all pages via manifest content_scripts.
// Sole responsibility: forward Alt+P keypresses to the service worker as a
// togglePause message so the user can pause/resume typing without switching
// to the side panel. The document.hidden check prevents firing on background
// tabs. No DOM mutation or page state is read or written here.
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'p' && !document.hidden) {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'togglePause' });
  }
});
