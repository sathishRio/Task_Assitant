// Production server for task.devobj.com (cPanel/Plesk start it with `node server.js`; the panel sets PORT).
// Serves the Vite build in dist/ and falls back to index.html so deep links survive a refresh.
// Build first on your PC: `npm run build` (reads VITE_API_URL from .env.production).
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

const dist = path.join(import.meta.dirname, 'dist');
if (!existsSync(path.join(dist, 'index.html'))) {
  throw new Error(`Web app not built: ${dist} is missing. Run \`npm run build\` and upload dist/.`);
}

const app = express();
app.disable('x-powered-by');

// Hashed bundles never change, so browsers can keep them; index.html must always be fresh.
app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(dist, 'index.html'));
});

const port = Number(process.env.PORT) || 5000;
app.listen(port, () => console.log(`Task Assistant web on port ${port}`));
