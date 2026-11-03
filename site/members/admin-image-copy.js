// Admin > Media > "Image copy". Download or copy the badge, sticker and shirt-print images, and copy the plain
// HTML snippet for each web badge. Client-side only. The page CSP blocks fetch, so Copy image draws the
// same-origin picture onto a canvas and copies that; if the browser will not copy images it downloads the file instead.
(() => {
'use strict';

const SITE = 'https://michiinstitute.com';
// Web badges are hosted publicly at /badges/NAME.png (with NAME@2x.png beside it). w and h are the size of the 1x file.
const BADGES = [
  { name: 'we-support-the-way-dark', title: 'We support The Way (dark)', w: 260, h: 80 },
  { name: 'we-support-the-way-light', title: 'We support The Way (light)', w: 260, h: 80 },
  { name: 'we-support-the-way-square-200', title: 'Square (dark)', w: 200, h: 200 },
  { name: 'we-support-the-way-square-200-light', title: 'Square (light)', w: 200, h: 200 },
  { name: 'check-it-banner-728x90', title: 'Check it banner 728x90 (dark)', w: 728, h: 90 },
  { name: 'check-it-banner-728x90-light', title: 'Check it banner 728x90 (light)', w: 728, h: 90 },
  { name: 'belongs-to-you-banner-468x60', title: 'The Way belongs to you, 468x60', w: 468, h: 60 },
  { name: 'featured-with-the-way-300x100', title: 'Covered by The Way, 300x100', w: 300, h: 100 },
];
// Stickers and shirt prints. ready:false shows a marked placeholder until the file is added to site/members/image-copy/.
// Stickers: image-copy/stickers/FILE.png. Shirts: image-copy/shirts/FILE.png (full print, 4500x5400) and FILE-preview.png (about 1200px wide).
const STICKERS = [
  { file: 'sticker-we-support-the-way-round', title: 'Round sticker', ready: false },
  { file: 'sticker-check-it-dont-just-share-it', title: 'Check it sticker', ready: false },
  { file: 'sticker-belongs-to-you', title: 'Belongs to you sticker', ready: false },
];
const SHIRTS = [
  { file: 'shirt-we-support-the-way-for-DARK-shirts', title: 'We support The Way (for dark shirts)', ready: false },
  { file: 'shirt-we-support-the-way-for-LIGHT-shirts', title: 'We support The Way (for light shirts)', ready: false },
  { file: 'shirt-check-it-for-DARK-shirts', title: 'Check it (for dark shirts)', ready: false },
  { file: 'shirt-check-it-for-LIGHT-shirts', title: 'Check it (for light shirts)', ready: false },
  { file: 'shirt-left-chest-for-DARK-shirts', title: 'Left chest (for dark shirts)', ready: false },
  { file: 'shirt-left-chest-for-LIGHT-shirts', title: 'Left chest (for light shirts)', ready: false },
];

const snippet = (b) => `<a href="${SITE}/"><img src="${SITE}/badges/${b.name}.png" width="${b.w}" height="${b.h}" alt="We support The Way"></a>`;

function make({ h }) {
  const status = h('p', { class: 'small muted ic-status', role: 'status', 'aria-live': 'polite' });
  const say = (t) => { status.textContent = t; };

  function download(href, name) {
    const a = h('a', { href, download: name });
    document.body.append(a); a.click(); a.remove();
  }
  async function copyImage(img, href, name) {
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('no image clipboard');
      if (!img.complete || !img.naturalWidth) await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('no blob'))), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      say(`Copied ${name}.`);
    } catch (e) {
      download(href, name);
      say(`This browser would not copy the image, so ${name} was downloaded instead.`);
    }
  }
  async function copyText(text, what) {
    try { await navigator.clipboard.writeText(text); say(`Copied the ${what}.`); }
    catch (e) { say('This browser would not copy. Select the text and copy it by hand.'); }
  }

  // One card: picture, a Download link, a Copy image button, and any extra buttons.
  // The picture shown is the one that gets copied (the 2x file for badges, the preview for shirts), so Copy image
  // copies the picture on screen; Download always gives the full file.
  function card(title, src, fullHref, name, w, hgt, extra) {
    const img = h('img', { src, alt: title, width: w, height: hgt, loading: 'lazy', decoding: 'async', class: 'ic-img' });
    return h('li', { class: 'panel ic-card' },
      h('div', { class: 'ic-pic' }, img),
      h('div', { class: 'ic-title', text: title }),
      h('div', { class: 'btns' },
        h('a', { class: 'button quiet', href: fullHref, download: name }, 'Download'),
        h('button', { type: 'button', class: 'quiet', onclick: () => copyImage(img, fullHref, name) }, 'Copy image'),
        extra || null));
  }
  const placeholder = (title, where) => h('li', { class: 'panel ic-card ic-wait' },
    h('div', { class: 'ic-pic ic-soon', text: 'Coming soon' }),
    h('div', { class: 'ic-title', text: title }),
    h('div', { class: 'small muted', text: `Not added yet. ${where}` }));

  const grid = (items) => h('ul', { class: 'ic-grid' }, items);

  function panel() {
    const badges = BADGES.map((b) => card(b.title, `/badges/${b.name}@2x.png`, `/badges/${b.name}.png`, `${b.name}.png`, b.w, b.h,
      h('button', { type: 'button', class: 'quiet', onclick: () => copyText(snippet(b), 'HTML snippet') }, 'Copy HTML')));
    const stickers = STICKERS.map((s) => s.ready
      ? card(s.title, `/members/image-copy/stickers/${s.file}.png`, `/members/image-copy/stickers/${s.file}.png`, `${s.file}.png`, 300, 300)
      : placeholder(s.title, 'The picture will appear here once the file is added.'));
    const shirts = SHIRTS.map((s) => s.ready
      ? card(s.title, `/members/image-copy/shirts/${s.file}-preview.png`, `/members/image-copy/shirts/${s.file}.png`, `${s.file}.png`, 300, 360)
      : placeholder(s.title, 'The full 4500x5400 print and a preview will appear here once the file is added.'));
    return h('div', { class: 'ic' },
      h('p', { class: 'muted', text: 'Download or copy the images. Copy HTML gives a plain link around the badge for a partner site. Shirt previews are smaller; Download gives the full print file.' }),
      status,
      h('h3', { text: 'Web badges' }), grid(badges),
      h('h3', { text: 'Stickers' }), grid(stickers),
      h('h3', { text: 'Shirt prints' }), grid(shirts));
  }
  return { panel };
}
window.TheWayImageCopy = { make, snippet, BADGES };
})();
