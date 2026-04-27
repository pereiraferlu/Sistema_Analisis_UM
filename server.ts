import express from "express";
import { createServer as createViteServer } from "vite";

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

  app.post('/api/export-corrected-data', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-corrected-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error (export-corrected-data):', errorText);
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

  app.post('/api/export-corrected-data', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-corrected-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error (export-corrected-data):', errorText);
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

  app.post('/api/export-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error (discrepancies):', errorText);
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
      console.error('Error proxying discrepancies export to backend:', error);
      const isTimeout = error.name === 'AbortError';
      res.status(isTimeout ? 504 : 500).json({ 
        error: isTimeout ? 'Timeout del servidor backend' : 'Backend connection failed', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post('/api/export-route-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-route-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend responded with error (route-discrepancies):', errorText);
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
      console.error('Error proxying route discrepancies export to backend:', error);
      const isTimeout = error.name === 'AbortError';
      res.status(isTimeout ? 504 : 500).json({ 
        error: isTimeout ? 'Timeout del servidor backend' : 'Backend connection failed', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post('/api/export-quantity-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-quantity-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying quantity export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-novedad-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-novedad-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying novedad export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-vehicle-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-vehicle-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying vehicle export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-zone-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-zone-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying zone export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-date-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-date-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying date export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-all-discrepancies', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-all-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying all discrepancies export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-corrected-data', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-corrected-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying corrected data export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
    }
  });

  app.post('/api/export-piezas-planilla', async (req, res) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://flash-backend-lbej.onrender.com/api/export-piezas-planilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal as any
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
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
      console.error('Error proxying piezas planilla export:', error);
      res.status(500).json({ error: 'Backend connection failed', details: error.message });
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
