// The connected Wave app runs on a private-source hosted backend.
// Add ?local=1 to keep using the original browser-only GitHub Pages player.
if (!new URLSearchParams(location.search).has('local')) {
  location.replace('https://wave-blue-hour-music.expertpin129.chatgpt.site/');
}
