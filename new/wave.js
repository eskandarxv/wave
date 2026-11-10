const $ = selector => document.querySelector(selector);
const view = $('#view');
const audio = $('#audio');
let items = [];
let selected;
let queuePlaylistId;
let playRequest = 0;
let switchingTrack = false;
const playable = item => Boolean(item?.file || item?.audioUrl);
function queueTracks() {
  const playlist = playlists.find(entry => entry.id === queuePlaylistId);
  return (playlist ? playlist.ids.map(id => items.find(item => item.id === id)) : items).filter(playable);
}
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
  $('#notice').textContent = '';
  $('#import-status').textContent = '';
  const status = $('#imports').open ? $('#import-status') : $('#notice');
  status.textContent = message;
  noticeTimer = setTimeout(() => { status.textContent = ''; }, 4500);
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function spotifyEmbed(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password) return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)\/?$/);
    return match ? 'https://open.spotify.com/embed/' + match[1] + '/' + match[2] + '?theme=0' : null;
  } catch { return null; }
}
function serviceEmbed(value) {
  const spotify = spotifyEmbed(value);
  if (spotify) return {url: spotify, name: 'Spotify', note: 'Spotify controls playback availability. Some tracks may be previews.'};
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) return null;
    const video = url.hostname === 'youtu.be' ? url.pathname.slice(1) :
      url.pathname === '/watch' ? url.searchParams.get('v') :
      url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    const playlist = url.searchParams.get('list');
    let path;
    if (video && /^[A-Za-z0-9_-]{11}$/.test(video)) path = video + '?playsinline=1';
    else if (playlist && /^[A-Za-z0-9_-]{10,150}$/.test(playlist)) path = 'videoseries?list=' + playlist + '&playsinline=1';
    else return null;
    return {url: 'https://www.youtube.com/embed/' + path, name: 'YouTube', note: 'Full video playback where YouTube allows embedding. Private, restricted, or unavailable videos may not play.'};
  } catch { return null; }
}
const row = item => `<article class="row"><div class="art">${playable(item) ? '♫' : '↗'}</div>
  ${playable(item) ? `<button class="item" data-track="${item.id}">` : `<a class="item" href="${serviceEmbed(item.url) ? '#listen-' + item.id : escape(item.url)}" ${serviceEmbed(item.url) ? '' : 'target="_blank" rel="noopener noreferrer"'}>`}
  <strong>${escape(item.title)}</strong><small>${escape(item.source)}</small>${playable(item) ? '</button>' : '</a>'}
  <button data-remove="${item.id}" aria-label="Remove ${escape(item.title)}${location.hash.startsWith('#playlist-') ? ' from playlist' : ''}">×</button></article>`;
const list = (entries, fallback) => entries.map(row).join('') || `<div class="empty">${fallback}</div>`;
function render() {
  const requestedPage = location.hash.slice(1) || 'home';
  const page = requestedPage === 'lyrics' && (audio.paused || audio.ended) ? 'library' : requestedPage;
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === '#' + page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  view.classList.toggle('focus-player', page === 'lyrics');
  if (page.startsWith('listen-')) {
    const item = items.find(entry => entry.id === page.slice(7));
    const embed = serviceEmbed(item?.url);
    if (!embed) { location.hash = 'library'; return; }
    audio.pause();
    view.innerHTML = `<a href="#library">‹ Library</a><h1>${escape(item.title)}</h1>
      <section class="service-player"><iframe title="${embed.name} player" src="${escape(embed.url)}" referrerpolicy="strict-origin-when-cross-origin" width="100%" height="480" style="border:0;border-radius:12px" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
      <p>${embed.note}</p></section>`;
  } else if (page === 'settings') {
    view.innerHTML = '<h1>Settings</h1><div class="tiles"><a class="tile" href="#library">Library<small>Browse audio and saved links</small></a><button class="tile" id="settings-theme">Switch theme</button></div>';
    $('#settings-theme').onclick = () => $('#theme').click();
  } else if (page === 'playlists') {
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
    <button class="accent" id="playlist-play" ${entries.some(playable) ? '' : 'disabled'}>▶ Play playlist</button> <button id="playlist-delete">Delete playlist</button><section>${list(entries, 'Add items from your library.')}</section>`;
    $('#playlist-add').onsubmit = event => {
      event.preventDefault();
      const id = event.target.elements.track.value;
      if (savePlaylists(playlists.map(entry => entry === playlist ? {...entry, ids: [...entry.ids, id]} : entry))) render();
    };
    $('#playlist-play').onclick = () => {
      queuePlaylistId = playlist.id;
      choose(queueTracks()[0]);
    };
    $('#playlist-delete').onclick = () => {
      if (confirm('Delete this playlist?') && savePlaylists(playlists.filter(entry => entry !== playlist))) location.hash = 'playlists';
    };
  } else if (page === 'lyrics') {
    view.innerHTML = `<div class="view-switch"><a href="#library">Library</a><a href="#lyrics" aria-current="page">Now playing</a></div>
    <div class="focus-grid"><div class="focus-art"><div class="cover-orbit" aria-hidden="true">≋</div><p id="lyrics-track"></p></div>
    <section class="focus-lyrics"><h1>Lyrics</h1><div id="lyrics-lines"></div><label>Attach synced lyrics<input type="file" accept=".lrc,text/plain" id="lyrics-file"></label></section></div>`;
    $('#lyrics-file').onchange = importLyrics;
    renderLyrics();
  } else if (page === 'queue') {
    view.innerHTML = '<h1>Play queue</h1>' + list(queueTracks(), 'Import audio to build your queue.');
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
    const entries = items;
    view.innerHTML = `<div class="library-heading"><h1>Library</h1><button class="accent" data-import>＋ Import</button></div>
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
    view.innerHTML = `<div class="view-switch"><a href="#library">Library</a><a href="#lyrics" data-playing-only hidden>Now playing</a></div>
    <header class="home-heading"><h1>Your collection</h1><button class="accent" data-import>＋ Import music</button></header>
    ${items.length ? `<section class="quick-shelf" aria-label="Recently imported">${items.slice(0, 6).map(row).join('')}</section>` : '<div class="empty">Import audio or save a link to start your collection.</div>'}
    ${playlists.length ? `<div class="section-head"><h2>Your playlists</h2><a href="#playlists">View all ↗</a></div>
    <div class="mix-shelf">${playlists.map(playlist => `<a class="mix-card" href="#playlist-${playlist.id}"><div class="mix-art" aria-hidden="true"><span>♫</span></div><strong>${escape(playlist.name)}</strong><small>${playlist.ids.filter(id => items.some(item => item.id === id)).length} items</small></a>`).join('')}</div>` : ''}
    ${items.length ? `<div class="section-head"><h2>Recently added</h2><a href="#library">Library ↗</a></div><div class="shelf art-shelf">${items.slice(0, 12).map(row).join('')}</div>` : ''}`;
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
  $('footer').hidden = !selected || location.hash.startsWith('#listen-');
  document.body.classList.toggle('has-track', Boolean(selected));
  const available = Boolean(selected) || queueTracks().length > 0;
  for (const button of ['#prev', '#next', '#play']) $(button).disabled = !available;
  $('#seek').disabled = !Number.isFinite(audio.duration);
  $('#playing').textContent = selected?.title || 'Nothing playing';
  $('#playing-source').textContent = selected?.source || 'Your audio player';
  for (const control of document.querySelectorAll('#lyrics, [data-playing-only]')) control.hidden = audio.paused || audio.ended;
  $('#play').textContent = audio.paused ? '▶' : '❚❚';
  $('#play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
}
const time = seconds => Number.isFinite(seconds) ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '0:00';
function updateTime() {
  $('#elapsed').textContent = time(audio.currentTime);
  $('#duration').textContent = time(audio.duration);
  $('#seek').value = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration * 1000 : 0;
  updatePlayer();
}
function choose(item) {
  if (!playable(item)) return;
  const request = ++playRequest;
  switchingTrack = true;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  selected = item;
  objectUrl = item.file ? URL.createObjectURL(item.file) : undefined;
  audio.src = objectUrl || item.audioUrl;
  audio.play().catch(() => {
    if (request !== playRequest) return;
    notice('Could not play this track. Check that the source is available.');
    if (location.hash === '#lyrics') location.hash = 'library';
  }).finally(() => {
    if (request !== playRequest) return;
    switchingTrack = false;
    updateTime();
  });
  renderLyrics();
  updateTime();
}
function step(direction) {
  const tracks = queueTracks();
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
  const tracks = queueTracks();
  const index = tracks.findIndex(item => item.id === selected?.id);
  if (index >= 0 && index + 1 < tracks.length) choose(tracks[index + 1]);
};
const dialog = $('#imports');
function openImport() {
  importModes[0].click();
  $('#import-status').textContent = '';
  dialog.showModal();
}
$('#import').onclick = openImport;
$('#close').onclick = () => dialog.close();
const importModes = [...dialog.querySelectorAll('[data-mode]')];
for (const button of importModes) button.onclick = () => {
  const linkMode = button.dataset.mode === 'link';
  $('#link-form').hidden = !linkMode;
  $('#import-files').hidden = linkMode;
  for (const mode of importModes) mode.setAttribute('aria-pressed', String(mode === button));
};
$('#pick').onclick = () => $('#files').click();
async function add(item) {
  await change('readwrite', table => table.put(item));
  items.unshift(item);
}
$('#files').onchange = async event => {
  const files = [...event.target.files];
  event.target.value = '';
  const playlistFiles = files.filter(file => /\.m3u8?$/i.test(file.name));
  if (playlistFiles.length > 1) return notice('Choose one playlist at a time.');
  let added = 0;
  try {
    for (const file of files.filter(file => !playlistFiles.includes(file))) {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name)) continue;
      await add({ id: crypto.randomUUID(), title: file.name, source: 'Local audio', file, added: Date.now() });
      added++;
    }
    if (playlistFiles.length) return await importPlaylist(playlistFiles[0]);
    if (added) dialog.close();
    notice(added ? `Imported ${added} audio ${added === 1 ? 'file' : 'files'}.` : 'Choose a supported audio file.');
  } catch { notice(`Saved ${added}. Browser storage could not accept the remaining files.`); }
  if (added) { location.hash = 'library'; render(); }
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
  if (button.hasAttribute('data-import')) return openImport();
  const { track, remove, seek } = button.dataset;
  if (seek !== undefined && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(Number(seek), audio.duration);
    return;
  }
  if (remove && location.hash.startsWith('#playlist-')) {
    const id = location.hash.slice(10);
    if (savePlaylists(playlists.map(entry => entry.id === id ? {...entry, ids: entry.ids.filter(trackId => trackId !== remove)} : entry))) render();
    return;
  }
  const item = items.find(entry => entry.id === (track || remove));
  if (!item) return;
  if (track) {
    const id = location.hash.startsWith('#playlist-') ? location.hash.slice(10) : null;
    if (location.hash !== '#queue') queuePlaylistId = id;
    return choose(item);
  }
  button.disabled = true;
  try {
      await change('readwrite', table => table.delete(item.id));
      items = items.filter(entry => entry.id !== item.id);
      if (selected?.id === item.id) {
        playRequest++;
        switchingTrack = false;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = selected = undefined;
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
controls.innerHTML = '<button id="shuffle" aria-pressed="false">Shuffle</button><button id="repeat">Repeat off</button><button id="queue">Queue</button><button id="lyrics" hidden>Lyrics</button>';
$('footer').append(controls);
let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('wave-blue-theme') || 'dark'; } catch {}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme').textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
  try { localStorage.setItem('wave-blue-theme', theme); } catch {}
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
  const tracks = queueTracks().filter(item => item.id !== selected?.id);
  if (shuffle && direction > 0 && tracks.length) choose(tracks[Math.floor(Math.random() * tracks.length)]);
  else sequentialStep(direction);
};
audio.onended = () => {
  if (repeat === 'song') {
    audio.currentTime = 0;
    audio.play().catch(() => notice('Press play to continue.'));
    return;
  }
  const tracks = queueTracks();
  const index = tracks.findIndex(item => item.id === selected?.id);
  if (shuffle || repeat === 'queue' || index + 1 < tracks.length) step(1);
};
$('#queue').onclick = () => { location.hash = 'queue'; };
document.addEventListener('keydown', event => {
  if ($('#imports').open || event.target.closest?.('input, textarea, button, dialog, a, select')) return;
  if (event.code === 'Space') { event.preventDefault(); $('#play').click(); }
  if (event.key === 'ArrowRight' && Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  if (event.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
});
window.addEventListener('beforeunload', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });

$('#lyrics').onclick = () => { if (!audio.paused && !audio.ended) location.hash = 'lyrics'; };
for (const event of ['pause', 'ended', 'error']) audio.addEventListener(event, () => {
  if (location.hash === '#lyrics' && !switchingTrack && (audio.paused || audio.ended || audio.error)) location.hash = 'library';
});
audio.addEventListener('error', () => {
  if (selected?.audioUrl) notice('The audio host did not provide a playable track. Check the link or import the audio file.');
});

async function importPlaylist(file) {
  if (file.size > 1024 * 1024) return notice('Choose a playlist under 1 MB.');
  try {
    const lines = (await file.text()).split(/\r?\n/);
    if (lines.some(line => /^#EXT-X-/i.test(line.trim()))) return notice('Choose an M3U track list, rather than an HLS stream.');
    const tracks = new Map();
    let skipped = 0;
    let title = '';
    for (const line of lines) {
      const entry = line.trim();
      if (entry.startsWith('#EXTINF:')) {
        title = entry.slice(entry.indexOf(',') + 1).trim();
        continue;
      }
      if (!entry || entry.startsWith('#')) continue;
      try {
        const url = new URL(entry);
        if (url.protocol === 'https:' && !url.username && !url.password &&
            /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(url.pathname)) {
          tracks.set(url.href, {audioUrl: url.href, title: title.slice(0, 160) || url.pathname.split('/').pop(), source: url.hostname});
        } else skipped++;
      } catch {
        const basename = entry.split(/[\\/]/).pop();
        const matches = items.filter(item => item.file?.name === basename);
        if (matches.length === 1) tracks.set(matches[0].id, matches[0]);
        else skipped++;
      }
      title = '';
    }
    if (!tracks.size) return notice('No tracks matched. Select the matching audio files with the playlist, or use direct HTTPS audio links.');
    if (tracks.size > 500) return notice('Choose a playlist with 500 tracks or fewer.');
    const entries = [...tracks.values()].map(track => (track.id ? track : items.find(item => item.audioUrl === track.audioUrl)) ||
      {...track, id: crypto.randomUUID(), added: Date.now()});
    const additions = entries.filter(item => !items.includes(item));
    await change('readwrite', table => {
      for (const item of additions) table.put(item);
      return table.count();
    });
    items.unshift(...additions);
    const playlist = {id: crypto.randomUUID(), name: file.name.replace(/\.m3u8?$/i, ''), ids: entries.map(item => item.id)};
    if (!savePlaylists([...playlists, playlist])) return;
    dialog.close();
    location.hash = 'playlist-' + playlist.id;
    notice(`Imported ${entries.length} playlist tracks.${skipped ? ` Skipped ${skipped} unsupported entries.` : ''}`);
  } catch { notice('Could not import this playlist.'); }
}
