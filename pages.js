/* GitHub Pages edition: browser-local library, no pretend accounts or APIs. */
headerAccount=function(){ $('.header-right').innerHTML=`<button class="profile-pill" data-page="profile" aria-label="Your device library"><span class="avatar">W</span><span>Your library</span></button>`; };
auth=function(){openModal(`<span class="eyebrow">YOUR OWN LITTLE SPACE</span><h2>Listen freely.</h2><p>This is Wave’s GitHub Pages edition. Your likes, playlists, and imported songs are saved in this browser. No account is needed.</p><p>Shared accounts and rankings need a connected backend and aren’t available on this edition.</p><button class="primary" id="guest-library">Open my library</button>`);$('#guest-library').onclick=()=>{$('#modal').close();navigate('library')}};
renderProfile=function(){const n=tracks.filter(t=>t.local).length;$('#content').innerHTML=`<div class="page-subnav"><span class="eyebrow">SAVED ON THIS DEVICE</span></div><section class="profile-hero">${avatar('Wave',0)}<div><span class="eyebrow">YOUR PERSONAL LIBRARY</span><h1>Your Wave.</h1><span class="profile-handle">Saved on this device.</span></div></section><div class="profile-stats"><div class="stat-card"><span class="eyebrow">LIKED SONGS</span><b>${liked.size}</b><small>Your repeat favorites.</small></div><div class="stat-card"><span class="eyebrow">IMPORTED SONGS</span><b>${n}</b><small>Kept in this browser.</small></div><div class="stat-card"><span class="eyebrow">PLAYLISTS</span><b>${playlists.length}</b><small>Your own collections.</small></div></div><div class="info-card"><h2>Your music, kept close.</h2><p>Files you import stay in this browser on this device. Likes and playlists are saved here too. Keep original files backed up: clearing browser data removes this library.</p><div class="inline-actions"><button class="primary" data-page="library">Open library</button><button class="text-button" data-page="import">Import songs</button></div></div><p class="status-note">GitHub Pages edition · Shared sign-in, cross-device syncing, and community rankings require a backend and are not connected.</p>`;};
renderCommunity=function(){ $('#content').innerHTML=`<span class="eyebrow">ON THE SAME WAVELENGTH</span><h1 class="page-title">Good sounds.<br>Better together.</h1><p class="page-description">Share Wave’s link with your friends. Everyone gets their own private browser library.</p><div class="rank-tabs" role="tablist" aria-label="Ranking type">${[['listening','clock','Listening time'],['imports','upload','Songs imported'],['donations','heart','Donations']].map(([key,ic,name])=>`<button role="tab" aria-selected="${communityTab===key}" class="${communityTab===key?'selected':''}" data-ranking="${key}">${icon(ic)}${name}</button>`).join('')}</div><div class="empty-state" role="tabpanel"><div class="empty-symbol">${icon(communityTab==='donations'?'heart':'rank')}</div><h2>${communityTab==='donations'?'Supporters deserve real recognition.':'Community rankings aren’t connected yet.'}</h2><p>${communityTab==='donations'?'Donations and verified supporter rankings need a payment connection. No payments are collected here.':'This GitHub Pages edition saves libraries privately in each browser. Shared accounts and listening/import rankings need a connected backend.'}</p><button class="text-button" data-page="${communityTab==='donations'?'support':'profile'}">${communityTab==='donations'?'About supporting Wave':'See my device library'}</button></div>`; };
$('#about-button').onclick=()=>openModal('<span class="eyebrow">OPEN BY DESIGN</span><h2>A new frequency.</h2><p>Wave is an open-source, browser-local music player. The eight included instrumental demos are original synthesized compositions and recordings, shared under CC0. App code and original cover art are MIT licensed.</p><p>Your imported music stays in this browser and keeps its existing rights. No commercial streaming catalog is included.</p><p>This GitHub Pages edition has no connected accounts, shared rankings, donations, or cross-device sync.</p>');
async function startPages(){me=null;ownerKey='guest';serverAvailable=false;libraryBooting=false;accountReady=true;await loadImports();queue=tracks.map(t=>t.id);render();}
startPages();

const renderPage = render;
render = function () {
  if (page !== 'home') return renderPage();
  sidebar();
  $$('.nav').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const recent = history.map(get).filter(Boolean).slice(0, 5);
  $('#content').innerHTML = `
    <section class="wave-welcome">
      <div><span class="eyebrow">YOUR MUSIC LIBRARY</span><h1>Welcome to Wave.</h1></div>
      <button class="primary" data-page="import">${icon('upload')} Import music</button>
    </section>
    <div class="section-head"><h2>Speed dial</h2></div>
    <div class="wave-shortcuts">
      <button class="library-item" data-page="liked"><span class="liked-art">♥</span><span>Liked songs<small>${liked.size} saved</small></span></button>
      <button class="library-item" data-page="library"><span class="playlist-art">≋</span><span>Your library<small>${tracks.length} tracks</small></span></button>
      <button class="library-item" data-create><span class="playlist-art">＋</span><span>Create playlist</span></button>
    </div>
    <section><div class="section-head"><h2>${recent.length ? 'Recently played' : 'Your music'}</h2></div>
    ${rows(recent.length ? recent : tracks.slice(0, 5))}</section>`;
  icons();
  updatePlayer();
};
const renderPlayer = updatePlayer;
updatePlayer = function () {
  renderPlayer();
  for (const selector of ['#play', '#next', '#previous', '#shuffle', '#repeat', '#queue-button']) {
    $(selector).disabled = !tracks.length;
  }
  for (const selector of ['#like-current', '#seek', '#expand-player', '#fullscreen']) {
    $(selector).disabled = !get(current.id);
  }
};
$('#about-button').onclick = () => openModal('<h2>About Wave</h2><p>Your audio, likes and playlists are stored in this browser. Import files you have permission to use.</p>');
render();

const renderAudioImport = renderImport;
renderImport = function () {
  renderAudioImport();
  $('#content').insertAdjacentHTML('beforeend', `
    <section class="info-card">
      <h2>Music links</h2>
      <p>Save a song or playlist link and open it in its original service.</p>
      <form id="link-form"><label>Share link<input name="url" type="url" required placeholder="https://…" maxlength="2000"></label>
      <label>Name<input name="title" maxlength="120" placeholder="Optional"></label>
      <button class="primary">Save link</button></form>
      <div id="music-links"></div>
    </section>`);
  const key = 'wave-music-links';
  let links = [];
  try { links = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const saveLinks = next => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      links = next;
      showLinks();
      return true;
    } catch { toast('Could not save to this browser.'); return false; }
  };
  function showLinks() {
    const list = $('#music-links');
    list.replaceChildren();
    for (const item of links) {
      const row = document.createElement('div');
      row.className = 'inline-actions';
      const link = document.createElement('a');
      link.href = item.url;
      link.textContent = item.title;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const remove = document.createElement('button');
      remove.className = 'text-button';
      remove.textContent = 'Remove';
      remove.onclick = () => saveLinks(links.filter(entry => entry.url !== item.url));
      row.append(link, remove);
      list.append(row);
    }
  }
  showLinks();
  $('#link-form').onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const url = new URL(form.elements.url.value);
    if (url.protocol !== 'https:' || url.username || url.password) return toast('Use an HTTPS share link.');
    if (links.some(item => item.url === url.href)) return toast('That link is already saved.');
    const title = form.elements.title.value.trim() || url.hostname;
    if (saveLinks([{ url: url.href, title }, ...links])) form.reset();
  };
};
