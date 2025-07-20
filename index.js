const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

let browser, page, isNavigating = false;

const VIEWPORT = {
  width: 1080,
  height: 1920,
  deviceScaleFactor: 7,
  isMobile: true,
  hasTouch: true,
  isLandscape: false,
};

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; Bluestacks) AppleWebKit/537.36 Chrome/99.0 Mobile Safari/537.36';

async function initBrowser() {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  });

  page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport(VIEWPORT);
  await page.setExtraHTTPHeaders({
    'accept-language': 'en-US,en;q=0.9',
  });

  await page.goto('https://now.gg/apps/uncube/10005/now.html', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('✅ Puppeteer pronto');
}

async function handleRequest(req, res) {
  if (isNavigating) await new Promise(r => setTimeout(r, 1000));
  isNavigating = true;

  try {
    const targetURL = 'https://now.gg' + req.originalUrl;
    await page.setRequestInterception(true);

    page.once('request', interceptedRequest => {
      const headers = {
        ...interceptedRequest.headers(),
        'user-agent': req.headers['user-agent'] || USER_AGENT,
        'referer': 'https://now.gg',
        'origin': 'https://now.gg',
        'cookie': req.headers['cookie'] || '',
      };
      interceptedRequest.continue({ headers });
    });

    const response = await page.goto(targetURL, { waitUntil: 'networkidle2', timeout: 60000 });
    const buffer = await response.buffer();
    const contentType = response.headers()['content-type'] || '';

    res.setHeader('content-type', contentType);

    const setCookies = response.headers()['set-cookie'];
    if (setCookies) {
      const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
      res.setHeader('set-cookie', cookies.map(c => c.replace(/Domain=\.?now\.gg/gi, 'Domain=localhost').replace(/Secure/gi, '')));
    }

    if (contentType.includes('text/html')) {
      let body = buffer.toString('utf8');
      body = body.replace(/https:\/\/now\.gg/g, '');
      body = body.replace('</head>', `
        <script>
          Object.defineProperty(window, 'devicePixelRatio', { get: () => 7 });
          Object.defineProperty(screen, 'width', { get: () => 1080 });
          Object.defineProperty(screen, 'height', { get: () => 1920 });
          Object.defineProperty(window, 'innerWidth', { get: () => 1080 });
          Object.defineProperty(window, 'innerHeight', { get: () => 1920 });
        </script>
      </head>`);
      res.status(response.status()).send(body);
    } else {
      res.status(response.status()).send(buffer);
    }

  } catch (err) {
    console.error('Erro no proxy:', err);
    res.status(500).send('Erro interno no proxy');
  } finally {
    isNavigating = false;
  }
}

app.use(async (req, res) => {
  await handleRequest(req, res);
});

(async () => {
  await initBrowser();
  app.listen(PORT, () => {
    console.log(`🚀 Proxy online: http://localhost:${PORT}`);
  });
})();
