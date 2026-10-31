// Speed Controller - Shared inline SVG icons
// Exposed as globalThis.CSC_ICONS. Each value is a trusted, static SVG string
// (24x24 viewBox, stroke="currentColor") so icons inherit the text color.
// Bundled here because MV3 forbids remote code; no emoji are used as icons.

(function () {
  'use strict';

  const svg = (body) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';

  const icons = {
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    chart: svg('<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>'),
    settings: svg(
      '<path d="M10.37 2.64L13.63 2.64L13.57 4.97L15.86 5.92L17.46 4.23L19.77 6.54L18.08 8.14' +
      'L19.03 10.43L21.36 10.37L21.36 13.63L19.03 13.57L18.08 15.86L19.77 17.46L17.46 19.77' +
      'L15.86 18.08L13.57 19.03L13.63 21.36L10.37 21.36L10.43 19.03L8.14 18.08L6.54 19.77' +
      'L4.23 17.46L5.92 15.86L4.97 13.57L2.64 13.63L2.64 10.37L4.97 10.43L5.92 8.14L4.23 6.54' +
      'L6.54 4.23L8.14 5.92L10.43 4.97Z"/><circle cx="12" cy="12" r="3"/>'
    ),
    minus: svg('<path d="M5 12h14"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    pin: svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
    flame: svg(
      '<path d="M12 3c.8 3.4 5 5.6 5 10.2A5 5 0 0 1 7 13.2c0-2.4 1.3-4 2.4-5 .3 1.7 1.2 2.7 ' +
      '2.6 3.1C12 8.6 11.4 5.6 12 3z"/>'
    ),
    skip: svg('<path d="M5 6l8 6-8 6z"/><path d="M17 6v12"/>'),
    star: svg(
      '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'
    ),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
    trophy: svg(
      '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/>' +
      '<path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 20h8"/><path d="M10 17h4"/>'
    ),
    keyboard: svg(
      '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01"/><path d="M11 10h.01"/>' +
      '<path d="M15 10h.01"/><path d="M7 14h10"/>'
    ),
    message: svg('<path d="M6 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-5 4V7a2 2 0 0 1 2-2z"/>'),
    external: svg(
      '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>' +
      '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
    )
  };

  globalThis.CSC_ICONS = Object.freeze(icons);
})();
