const express = require('express');
const puppeteer = require('puppeteer');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

let cachedCookies = null;

async function refreshCookies() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://now.gg');
  cachedCookies = await page.cookies();
  await browser.close();
}

setInterval(refreshCookies, 10 * 60 * 1000); // atualiza cookies a cada 10 minutos
refreshCookies();

const proxy = createProxyMiddleware({
  target: 'https://now.gg',
  changeOrigin: true,
  ws: true,

  onProxyReq(proxyReq, req) {
    proxyReq.setHeader('referer', 'https://now.gg');
    proxyReq.setHeader('origin', 'https://now.gg');
    proxyReq.setHeader('user-agent', req.headers['user-agent'] || 'Mozilla/5.0');
    proxyReq.setHeader('host', 'now.gg');

    if (cachedCookies) {
      const cookieString = cachedCookies.map(c => `${c.name}=${c.value}`).join('; ');
      proxyReq.setHeader('cookie', cookieString);
    }
  },

  onProxyRes(proxyRes, req, res) {
    const cookies = proxyRes.headers['set-cookie'];
    if (cookies) {
      const newCookies = cookies.map(cookie =>
        cookie.replace(/Domain=\.?now\.gg/gi, 'Domain=localhost').replace(/Secure/gi, '')
      );
      res.setHeader('set-cookie', newCookies);
    }

    if (proxyRes.headers['location']) {
      proxyRes.headers['location'] = proxyRes.headers['location'].replace(/^https:\/\/now\.gg/, '');
    }
  },

  pathRewrite: { '^/': '/' }
});

app.get('/jogo', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Jogo via Proxy</title>
      <style>
        html, body, iframe { margin:0; padding:0; width:100%; height:100%; border:0; }
      </style>
    </head>
    <body>
      <iframe src="/apps/uncube/10005/" allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
    </body>
    </html>
  `);
});

app.use('/', proxy);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Proxy rodando em http://localhost:${PORT}/jogo`);
});
