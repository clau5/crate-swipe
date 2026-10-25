// Feed playlist helpers. The YouTube player chains a playlist on its own, so auto-next keeps
// working while iOS has suspended page JS (Safari backgrounded or the phone locked).
export const PLAYLIST_MAX = 12;

// The chosen card first, then the upcoming playable cards, without duplicate video IDs.
export function playlistWindow(cards, index, isDead = () => false, max = PLAYLIST_MAX) {
  const ids = [], used = new Set();
  for (let i = index; i < cards.length && ids.length < max; i++) {
    const song = cards[i]?.song; if (!song?.vid || used.has(song.vid)) continue;
    if (i !== index && (song.dead || isDead(song.vid))) continue;
    used.add(song.vid); ids.push(song.vid);
  }
  return ids;
}

// Position the player moved to inside our playlist, or -1 when the UI is already in step.
// The player only ever chains forwards, so a stale or backwards report is ignored.
export function playlistMove(ids, reportedVid, currentVid) {
  if (!ids?.length || !reportedVid) return -1;
  const at = ids.indexOf(reportedVid), from = ids.indexOf(currentVid);
  return at > from ? at : -1;
}

// Refresh the queue at a song boundary when more cards are waiting than the playlist holds.
// While hidden, only refresh on the last item: reloading earlier would risk the running chain.
export function shouldRefresh(ids, pos, upcoming, hidden, max = PLAYLIST_MAX) {
  const remaining = ids.length - 1 - pos;
  if (pos < 0 || upcoming <= remaining) return false;
  return hidden ? remaining === 0 : remaining < Math.ceil(max / 2);
}

// Swipe target already queued in the running playlist: jump there with playVideoAt instead of
// rebuilding the queue (a fresh loadPlaylist has to resolve every queued video before it starts).
// Needs at least `ahead` songs left behind the target so locked-phone chaining keeps working.
export function playlistJump(ids, vid, pending, ahead = 2) {
  if (!ids?.length || pending || !vid) return -1;
  const at = ids.indexOf(vid);
  return at >= 0 && ids.length - 1 - at >= ahead ? at : -1;
}
