const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

const PORT = process.env.PORT || 3000;

let browser;
let page;
let isNavigating = false;

const VIEWPORT = {
  width: 1080,
  height: 1920,
  deviceScaleFactor: 7, // DPI 700
  isMobile: true,
  hasTouch: true,
  isLandscape: false,
};

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; Bluestacks) AppleWebKit/537.36 Chrome/99.0 Mobile Safari/537.36';

// Inicializa Puppeteer e abre a página inicial
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
    'sec-ch-ua': '"Chromium";v="114", "Google Chrome";v="114", ";Not A Brand";v="99"',
  });

  await page.goto('https://now.gg/apps/uncube/10005/now.html', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('🚀 Puppeteer inicializado e página carregada');
}

// Função para manipular cada requisição do proxy
async function handleRequest(req, res) {
  if (isNavigating) {
    await new Promise(r => setTimeout(r, 1000));
  }
  isNavigating = true;

  try {
    // Monta URL completa do destino
    const targetURL = 'https://now.gg' + req.originalUrl;

    await page.setRequestInterception(true);

    page.once('request', interceptedRequest => {
      const headers = Object.assign({}, interceptedRequest.headers());

      // Substitui headers por valores reais do cliente para evitar bloqueios
      headers['user-agent'] = req.headers['user-agent'] || USER_AGENT;
      headers['referer'] = 'https://now.gg';
      headers['origin'] = 'https://now.gg';
      headers['cookie'] = req.headers['cookie'] || '';

      interceptedRequest.continue({ headers });
    });

    const response = await page.goto(targetURL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    const buffer = await response.buffer();
    const contentType = response.headers()['content-type'] || '';

    res.setHeader('content-type', contentType);

    const setCookies = response.headers()['set-cookie'];
    if (setCookies) {
      const newCookies = Array.isArray(setCookies) ? setCookies : [setCookies];
      const fixedCookies = newCookies.map(c =>
        c.replace(/Domain=\.?now\.gg/gi, 'Domain=localhost').replace(/Secure/gi, '')
      );
      res.setHeader('set-cookie', fixedCookies);
    }

    if (contentType.includes('text/html')) {
      let body = buffer.toString('utf8');

      // Remove referências absolutas para o domínio real
      body = body.replace(/https:\/\/now\.gg/g, '');

      // Injeta script para DPI 700 e dimensões reais
      body = body.replace('</head>', `
        <script>
          Object.defineProperty(window, 'devicePixelRatio', { get: () => 7 });
          Object.defineProperty(screen, 'width', { get: () => 1080 });
          Object.defineProperty(screen, 'height', { get: () => 1920 });
          Object.defineProperty(window, 'innerWidth', { get: () => 1080 });
          Object.defineProperty(window, 'innerHeight', { get: () => 1920 });
        </script>
      </head>`);

      res.status(response.status());
      res.send(body);
    } else {
      // Resposta binária (imagens, JS, CSS)
      res.status(response.status());
      res.send(buffer);
    }
  } catch (error) {
    console.error('❌ Erro no proxy Puppeteer:', error);
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
    console.log(`🚀 Proxy Puppeteer rodando em http://localhost:${PORT}`);
  });
})();
