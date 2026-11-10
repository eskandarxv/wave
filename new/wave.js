const $ = selector => document.querySelector(selector);
const view = $('#view');
const audio = $('#audio');
let items = [];
let selected;
let objectUrl;
let noticeTimer;
let playlists = [];
try { playlists = JSON.parse(localStorage.getItem('wave-playlists') || '[]'); } catch {}

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('wave-fresh-library', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function change(mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('items', mode);
    const request = operation(transaction.objectStore('items'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}
function notice(message) {
  clearTimeout(noticeTimer);
  $('#notice').textContent = message;
  noticeTimer = setTimeout(() => { $('#notice').textContent = ''; }, 3500);
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const row = item => `<article class="row"><div class="art">${item.file ? '♫' : '↗'}</div>
  ${item.file ? `<button class="item" data-track="${item.id}">` : `<a class="item" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">`}
  <strong>${escape(item.title)}</strong><small>${escape(item.source)}</small>${item.file ? '</button>' : '</a>'}
  <button data-like="${item.id}" aria-label="Favorite ${escape(item.title)}" aria-pressed="${Boolean(item.liked)}">${item.liked ? '♥' : '♡'}</button>
  <button data-remove="${item.id}" aria-label="Remove ${escape(item.title)}${location.hash.startsWith('#playlist-') ? ' from playlist' : ''}">×</button></article>`;
const list = (entries, fallback) => entries.map(row).join('') || `<div class="empty">${fallback}</div>`;
function render() {
  const page = location.hash.slice(1) || 'home';
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === '#' + page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const favorites = items.filter(item => item.liked);
  if (page === 'playlists') {
    view.innerHTML = `<h1>Playlists</h1><form id="new-playlist"><label>Name<input name="name" required maxlength="80"></label><button class="accent">Create playlist</button></form>
    <div class="tiles">${playlists.map(playlist => `<a class="tile" href="#playlist-${playlist.id}">${escape(playlist.name)}<small>${playlist.ids.filter(id => items.some(item => item.id === id)).length} items</small></a>`).join('')}</div>`;
    $('#new-playlist').onsubmit = event => {
      event.preventDefault();
      const name = event.target.elements.name.value.trim();
      if (!name) return;
      const playlist = { id: crypto.randomUUID(), name, ids: [] };
      if (savePlaylists([...playlists, playlist])) location.hash = 'playlist-' + playlist.id;
    };
  } else if (page.startsWith('playlist-')) {
    const playlist = playlists.find(entry => entry.id === page.slice(9));
    if (!playlist) { location.hash = 'playlists'; return; }
    const entries = playlist.ids.map(id => items.find(item => item.id === id)).filter(Boolean);
    view.innerHTML = `<a href="#playlists">‹ Playlists</a><h1>${escape(playlist.name)}</h1>
    <form id="playlist-add"><label>Add music<select name="track" required><option value="">Choose from library</option>${items.filter(item => !playlist.ids.includes(item.id)).map(item => `<option value="${item.id}">${escape(item.title)}</option>`).join('')}</select></label><button class="accent">Add item</button></form>
    <button id="playlist-delete">Delete playlist</button><section>${list(entries, 'Add items from your library.')}</section>`;
    $('#playlist-add').onsubmit = event => {
      event.preventDefault();
      const id = event.target.elements.track.value;
      if (savePlaylists(playlists.map(entry => entry === playlist ? {...entry, ids: [...entry.ids, id]} : entry))) render();
    };
    $('#playlist-delete').onclick = () => {
      if (confirm('Delete this playlist?') && savePlaylists(playlists.filter(entry => entry !== playlist))) location.hash = 'playlists';
    };
  } else if (page === 'lyrics') {
    view.innerHTML = '<h1>Synced lyrics</h1><p id="lyrics-track"></p><label>Choose an LRC lyrics file<input type="file" accept=".lrc,text/plain" id="lyrics-file"></label><div id="lyrics-lines"></div>';
    $('#lyrics-file').onchange = importLyrics;
    renderLyrics();
  } else if (page === 'queue') {
    view.innerHTML = '<h1>Play queue</h1>' + list(items.filter(item => item.file), 'Import audio to build your queue.');
  } else if (page === 'search') {
    view.innerHTML = '<h1>Search</h1><label>Search your library<input id="query" type="search" placeholder="Track, playlist, or service"></label><div id="results"></div>';
    const query = $('#query');
    const filter = () => {
      const term = query.value.trim().toLowerCase();
      $('#results').innerHTML = list(items.filter(item => (item.title + ' ' + item.source).toLowerCase().includes(term)), 'No results.');
    };
    query.addEventListener('input', filter);
    filter();
  } else if (page === 'library' || page === 'liked') {
    const entries = page === 'liked' ? favorites : items;
    view.innerHTML = `<div class="library-heading"><h1>${page === 'liked' ? 'Liked music' : 'Library'}</h1><button class="accent" data-import>＋ Import</button></div>
    <div class="library-tools"><label>Filter library<input type="search" id="library-filter" placeholder="Search library"></label><button id="library-layout" aria-pressed="false">List view</button></div>
    <div id="library-results"></div>`;
    const filter = $('#library-filter');
    const layout = $('#library-layout');
    const results = $('#library-results');
    const draw = () => {
      const query = filter.value.trim().toLowerCase();
      results.classList.toggle('shelf', layout.getAttribute('aria-pressed') === 'false');
      results.innerHTML = list(entries.filter(item => (item.title + ' ' + item.source).toLowerCase().includes(query)), query ? 'No matching items.' : 'Import audio or save a music link to fill your library.');
    };
    filter.oninput = draw;
    layout.onclick = () => {
      const useList = layout.getAttribute('aria-pressed') === 'false';
      layout.setAttribute('aria-pressed', String(useList));
      layout.textContent = useList ? 'Grid view' : 'List view';
      draw();
    };
    draw();
  } else {
    view.innerHTML = `<div class="hero"><span class="eyebrow">WAVE MUSIC</span><h1>Your music, together.</h1><p>Play your audio files and save music links from any service.</p><button class="accent" data-import>Import music</button></div>
    <h2>Speed dial</h2><div class="tiles"><a class="tile" href="#library">▤ &nbsp; Library<small>${items.length} saved</small></a><a class="tile" href="#liked">♡ &nbsp; Liked<small>${favorites.length} saved</small></a><button class="tile" data-import>＋ &nbsp; Import<small>Files or links</small></button></div>
    <h2>Recently added</h2>${list(items.slice(0, 6), 'Your library starts here.')}`;
  }
  updatePlayer();
}
function savePlaylists(next) {
  try {
    localStorage.setItem('wave-playlists', JSON.stringify(next));
    playlists = next;
    return true;
  } catch { notice('Could not save playlists on this device.'); return false; }
}
async function importLyrics(event) {
  const track = selected;
  const file = event.target.files[0];
  if (!track || !file) return notice('Select an audio track first.');
  if (file.size > 512000) return notice('Choose an LRC file smaller than 500 KB.');
  try {
    const lyrics = (await file.text()).split(/\r?\n/).flatMap(line => {
      const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      const text = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
      return text ? stamps.map(([, minutes, seconds]) => ({ at: Number(minutes) * 60 + Number(seconds.replace(':', '.')), text })) : [];
    }).sort((a, b) => a.at - b.at);
    if (!lyrics.length) return notice('No timestamped lyrics found.');
    if (!items.includes(track)) return;
    const updated = {...track, lyrics};
    await change('readwrite', table => table.put(updated));
    items = items.map(item => item.id === track.id ? updated : item);
    if (selected?.id === track.id) selected = updated;
    renderLyrics();
  } catch { notice('Could not save lyrics.'); }
}
function renderLyrics() {
  const lines = $('#lyrics-lines');
  if (!lines) return;
  $('#lyrics-track').textContent = selected?.title || 'Select an audio track to attach lyrics.';
  $('#lyrics-file').disabled = !selected;
  lines.innerHTML = selected?.lyrics?.map(({at,text}) => `<button data-seek="${at}">${escape(text)}</button>`).join('') || '<p>Import an LRC file you have permission to use.</p>';
  highlightLyrics();
}
function highlightLyrics() {
  const lines = $('#lyrics-lines');
  if (!lines) return;
  const buttons = [...lines.querySelectorAll('button')];
  const active = buttons.findLast(button => Number(button.dataset.seek) <= audio.currentTime);
  const previous = lines.querySelector('[aria-current]');
  if (previous === active) return;
  previous?.removeAttribute('aria-current');
  active?.setAttribute('aria-current', 'true');
  if (audio.played.length) active?.scrollIntoView({block:'nearest'});
}
audio.addEventListener('timeupdate', highlightLyrics);
function updatePlayer() {
  const available = items.some(item => item.file);
  for (const button of ['#prev', '#next', '#play']) $(button).disabled = !available;
  $('#seek').disabled = !Number.isFinite(audio.duration);
  $('#playing').textContent = selected?.title || 'Nothing playing';
  $('#playing-source').textContent = selected?.source || 'Your audio player';
  $('#play').textContent = audio.paused ? '▶' : '❚❚';
  $('#play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
}
const time = seconds => Number.isFinite(seconds) ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
function updateTime() {
  $('#elapsed').textContent = time(audio.currentTime);
  $('#duration').textContent = time(audio.duration);
  $('#seek').value = audio.duration ? audio.currentTime / audio.duration * 1000 : 0;
  updatePlayer();
}
function choose(item) {
  if (!item?.file) return;
  audio.pause();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  selected = item;
  objectUrl = URL.createObjectURL(item.file);
  audio.src = objectUrl;
  audio.play().catch(() => notice('Could not play this audio file.'));
  renderLyrics();
  updateTime();
}
function step(direction) {
  const tracks = items.filter(item => item.file);
  if (!tracks.length) return;
  const index = tracks.findIndex(item => item.id === selected?.id);
  choose(tracks[index < 0 ? 0 : (index + direction + tracks.length) % tracks.length]);
}
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
$('#play').onclick = () => {
  if (!selected) step(1);
  else if (audio.paused) audio.play().catch(() => notice('Could not play this audio file.'));
  else audio.pause();
};
$('#seek').oninput = event => { if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * event.target.value / 1000; };
audio.volume = Number($('#volume').value);
$('#volume').oninput = event => { audio.volume = Number(event.target.value); };
for (const event of ['loadedmetadata', 'timeupdate', 'play', 'pause', 'emptied']) audio.addEventListener(event, updateTime);
audio.onended = () => {
  const tracks = items.filter(item => item.file);
  const index = tracks.findIndex(item => item.id === selected?.id);
  if (index >= 0 && index + 1 < tracks.length) choose(tracks[index + 1]);
};
const dialog = $('#imports');
$('#import').onclick = () => dialog.showModal();
$('#close').onclick = () => dialog.close();
$('#pick').onclick = () => $('#files').click();
async function add(item) {
  await change('readwrite', table => table.put(item));
  items.unshift(item);
}
$('#files').onchange = async event => {
  const files = [...event.target.files];
  event.target.value = '';
  let added = 0;
  try {
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name)) continue;
      await add({ id: crypto.randomUUID(), title: file.name, source: 'Local audio', file, added: Date.now() });
      added++;
    }
    notice(added ? `Imported ${added} audio ${added === 1 ? 'file' : 'files'}.` : 'Choose a supported audio file.');
  } catch { notice(`Saved ${added}. Browser storage could not accept the remaining files.`); }
  if (added) { dialog.close(); location.hash = 'library'; render(); }
};
$('#link-form').onsubmit = async event => {
  event.preventDefault();
  const url = new URL($('#url').value);
  if (url.protocol !== 'https:' || url.username || url.password) return notice('Use an HTTPS share link.');
  if (items.some(item => item.url === url.href)) return notice('That link is already saved.');
  try {
    await add({ id: crypto.randomUUID(), title: $('#name').value.trim() || url.hostname, source: url.hostname, url: url.href, added: Date.now() });
    event.target.reset();
    dialog.close();
    location.hash = 'library';
    render();
  } catch { notice('Could not save the link.'); }
};
view.onclick = async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-import')) return dialog.showModal();
  const { track, like, remove, seek } = button.dataset;
  if (seek !== undefined && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(Number(seek), audio.duration);
    return;
  }
  if (remove && location.hash.startsWith('#playlist-')) {
    const id = location.hash.slice(10);
    if (savePlaylists(playlists.map(entry => entry.id === id ? {...entry, ids: entry.ids.filter(trackId => trackId !== remove)} : entry))) render();
    return;
  }
  const item = items.find(entry => entry.id === (track || like || remove));
  if (!item) return;
  if (track) return choose(item);
  button.disabled = true;
  try {
    if (like) {
      const updated = { ...item, liked: !item.liked };
      await change('readwrite', table => table.put(updated));
      items = items.map(entry => entry.id === item.id ? updated : entry);
    } else {
      await change('readwrite', table => table.delete(item.id));
      items = items.filter(entry => entry.id !== item.id);
      if (selected?.id === item.id) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        URL.revokeObjectURL(objectUrl);
        objectUrl = selected = undefined;
      }
    }
    const query = $('#query')?.value;
    const libraryFilter = $('#library-filter')?.value;
    const useList = $('#library-layout')?.getAttribute('aria-pressed') === 'true';
    render();
    if (libraryFilter !== undefined) {
      if (useList) $('#library-layout')?.click();
      $('#library-filter').value = libraryFilter;
      $('#library-filter').dispatchEvent(new Event('input'));
    }
    if (query !== undefined) {
      $('#query').value = query;
      $('#query').dispatchEvent(new Event('input'));
    }
  } catch { notice('Could not update this item.'); }
  finally { button.disabled = false; }
};
window.addEventListener('hashchange', render);
try { items = (await change('readonly', table => table.getAll())).sort((a, b) => b.added - a.added); }
catch { notice('Could not open browser storage.'); }
render();

// Player preferences share the existing audio element.
let shuffle = false;
let repeat = 'off';
const controls = document.createElement('div');
controls.className = 'extra-controls';
controls.innerHTML = '<button id="shuffle" aria-pressed="false">Shuffle</button><button id="repeat">Repeat off</button><button id="queue">Queue</button><button id="lyrics">Lyrics</button><button id="theme">Dark glass</button>';
$('footer').append(controls);
let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('wave-theme') || 'dark'; } catch {}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme').textContent = theme === 'dark' ? 'Light glass' : 'Dark glass';
  try { localStorage.setItem('wave-theme', theme); } catch {}
}
setTheme(savedTheme);
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#shuffle').onclick = () => {
  shuffle = !shuffle;
  $('#shuffle').setAttribute('aria-pressed', String(shuffle));
  notice(shuffle ? 'Shuffle on' : 'Shuffle off');
};
$('#repeat').onclick = () => {
  repeat = { off: 'queue', queue: 'song', song: 'off' }[repeat];
  $('#repeat').textContent = 'Repeat ' + repeat;
};
const sequentialStep = step;
step = function(direction) {
  const tracks = items.filter(item => item.file && item.id !== selected?.id);
  if (shuffle && direction > 0 && tracks.length) choose(tracks[Math.floor(Math.random() * tracks.length)]);
  else sequentialStep(direction);
};
audio.onended = () => {
  if (repeat === 'song') {
    audio.currentTime = 0;
    audio.play().catch(() => notice('Press play to continue.'));
    return;
  }
  const tracks = items.filter(item => item.file);
  const index = tracks.findIndex(item => item.id === selected?.id);
  if (shuffle || repeat === 'queue' || index + 1 < tracks.length) step(1);
};
$('#queue').onclick = () => {
  location.hash = 'queue';
  renderQueue();
};
function renderQueue() {
  view.innerHTML = '<h1>Play queue</h1>' + list(items.filter(item => item.file), 'Import audio to build your queue.');
}
window.addEventListener('hashchange', () => { if (location.hash === '#queue') renderQueue(); });
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, button, dialog, a')) return;
  if (event.code === 'Space') { event.preventDefault(); $('#play').click(); }
  if (event.key === 'ArrowRight' && Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  if (event.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
});
window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });

$('#lyrics').onclick = () => { location.hash = 'lyrics'; };
