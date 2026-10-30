// Reads the text in a picture inside this browser tab (Pull a Thread, "Add a screenshot").
// The picture is never sent anywhere: it is decoded to a canvas here, read by Tesseract (vendor/ocr/, all served from our own site),
// and only the text comes back. Loaded on demand, only when someone chooses a picture, so the page itself stays light.
(function () {
  'use strict';
  const BASE = '/members/vendor/ocr/';
  const MAX_PIXELS = 12e6;                 // bigger pictures are shrunk before reading, to keep memory down on phones
  let loading = null;

  const loadScript = (src) => new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => no(new Error('The reading program could not be loaded.'));
    document.head.append(s);
  });
  // Is WebAssembly SIMD available? (small test module; a wrong guess would only cost speed, so the plain build is the fallback)
  const simd = () => {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; }
  };
  const loadLib = () => (window.Tesseract ? Promise.resolve() : loading || (loading = loadScript(BASE + 'tesseract.min.js').catch((e) => { loading = null; throw e; })));

  // Draw the picture on a canvas. Light text on a dark background (dark-mode screenshots) is turned around, because the reader expects dark text.
  async function prepare(file) {
    if (!window.createImageBitmap) throw new Error('This browser cannot open pictures here.');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
    const img = g.getImageData(0, 0, w, h), d = img.data;
    let sum = 0; const step = 16;
    for (let i = 0; i < d.length; i += 4 * step) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (sum / (d.length / (4 * step)) < 110) {
      for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      g.putImageData(img, 0, 0);
    }
    return c;
  }

  // read(file, onProgress) -> the text. onProgress(0..1, plain-words status). Nothing is cached or kept: the worker is shut down afterwards.
  async function read(file, onProgress) {
    const say = (p, t) => { try { onProgress && onProgress(Math.max(0, Math.min(1, p)), t); } catch (e) { /* ignore */ } };
    say(0, 'Getting the reading program (first time only)…');
    await loadLib();
    const canvas = await prepare(file);
    const phase = { 'loading tesseract core': [0, 0.1, 'Getting the reading program…'], 'initializing tesseract': [0.1, 0.15, 'Getting the reading program…'],
      'loading language traineddata': [0.15, 0.3, 'Getting the English language data…'], 'initializing api': [0.3, 0.35, 'Getting ready…'],
      'recognizing text': [0.35, 1, 'Reading the text on your device…'] };
    const worker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: BASE + 'worker.min.js',
      corePath: BASE + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
      langPath: BASE, gzip: true,
      workerBlobURL: false,                // load the worker from our own file, not a blob: address (the site's security rules do not allow those)
      cacheMethod: 'none',                 // nothing is written to browser storage
      logger: (m) => { const p = phase[m.status]; if (p) say(p[0] + (p[1] - p[0]) * (m.progress || 0), p[2]); },
    });
    try {
      const { data } = await worker.recognize(canvas);
      return String(data && data.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } finally {
      try { await worker.terminate(); } catch (e) { /* ignore */ }
      canvas.width = canvas.height = 0;    // let go of the picture's pixels
    }
  }
  window.ThreadOCR = { read };
})();
