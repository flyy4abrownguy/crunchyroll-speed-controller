// HTML fixtures served (via Playwright routing) in place of the real sites.
// Each page is the minimum the extension needs: a <video> and/or a /series/ link.

const page = (body) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fixture</title></head><body>${body}</body></html>`;

const SERIES_LINK = '<a href="/series/G1/frieren-beyond-journeys-end">Frieren</a>';

// Crunchyroll watch page: series link + video.
export const crWatch = page(`${SERIES_LINK}<video></video>`);

// Same, but the series link renders 2500 ms after load (slow SPA hydration).
export const crWatchLateLink = page(`<video></video>
<script>
  setTimeout(() => {
    document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(SERIES_LINK)});
  }, 2500);
</script>`);

// Player in an iframe: the top page has no video, /player does.
export const crIframe = page('<iframe src="/player" width="640" height="360"></iframe>');
export const crIframePlayer = page('<video></video>');

// Catalog page: no video, not a watch URL.
export const crCatalog = page('<h1>Popular</h1>');

// Watch URL whose player never shows up.
export const crWatchNoVideo = page(`${SERIES_LINK}<p>Player failed to load</p>`);

// HIDIVE watch page.
export const hidiveWatch = page('<video></video>');

// HIDIVE watch URL with only a numeric id, no show slug.
export const hidiveNumeric = page('<video></video>');

// A second show, for switching between shows.
export const crWatchShow2 = page('<a href="/series/G2/solo-leveling">Solo Leveling</a><video></video>');

export const examplePage = page('<h1>Example Domain</h1>');
export const webStorePage = page('<h1>Chrome Web Store</h1>');

export const URLS = {
  crWatch: 'https://www.crunchyroll.com/watch/ABC/the-journeys-end',
  crWatchLateLink: 'https://www.crunchyroll.com/watch/LATE/the-journeys-end',
  crIframe: 'https://www.crunchyroll.com/watch/IFR/iframe-episode',
  crIframePlayer: 'https://www.crunchyroll.com/player',
  crCatalog: 'https://www.crunchyroll.com/videos/popular',
  crWatchNoVideo: 'https://www.crunchyroll.com/watch/XYZ/ep',
  hidiveWatch: 'https://www.hidive.com/video/12345/some-show-episode-1',
  hidiveNumeric: 'https://www.hidive.com/video/412345',
  crWatchShow2: 'https://www.crunchyroll.com/watch/SL1/i-am-used-to-it',
  example: 'https://example.com/'
};

// Exact URL -> HTML. Anything else on a routed origin gets a 404.
export const PAGES = {
  [URLS.crWatch]: crWatch,
  [URLS.crWatchLateLink]: crWatchLateLink,
  [URLS.crIframe]: crIframe,
  [URLS.crIframePlayer]: crIframePlayer,
  [URLS.crCatalog]: crCatalog,
  [URLS.crWatchNoVideo]: crWatchNoVideo,
  [URLS.hidiveWatch]: hidiveWatch,
  [URLS.hidiveNumeric]: hidiveNumeric,
  [URLS.crWatchShow2]: crWatchShow2,
  [URLS.example]: examplePage
};
