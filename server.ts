import express from "express";
import { createServer as createViteServer } from "vite";
import exceljs from "exceljs";

function getExcelColumnName(columnNumber: number) {
  let columnName = "";
  while (columnNumber > 0) {
    let remainder = (columnNumber - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - remainder) / 26);
  }
  return columnName;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post('/api/export', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error (export):', errorText);
        return res.status(response.status).json({ error: 'Backend export failed', details: errorText });
      }

      const arrayBuffer = await response.arrayBuffer();
      const contentDisposition = response.headers.get('Content-Disposition');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      }
      res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      console.error('Error proxying to backend:', error);
      const isTimeout = error.name === 'AbortError';
      res.status(isTimeout ? 504 : 500).json({ 
        error: isTimeout ? 'Timeout del servidor backend' : 'Backend connection failed', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post('/api/export-consolidated', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout for consolidated

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-consolidated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error:', errorText);
        return res.status(response.status).json({ error: 'Backend export failed', details: errorText });
      }

      const arrayBuffer = await response.arrayBuffer();
      const contentDisposition = response.headers.get('Content-Disposition');
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      }
      
      res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      console.error('Error proxying consolidated export to backend:', error);
      const isTimeout = error.name === 'AbortError';
      res.status(isTimeout ? 504 : 500).json({ 
        error: isTimeout ? 'Timeout del servidor backend' : 'Backend connection failed', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
