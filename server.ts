import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Set up express body parsers
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

// Global Incoming Request Logger for Diagnostics
app.use((req, res, next) => {
  console.log(`[EXPRESS REQUEST] ${req.method} ${req.url}`);
  next();
});

// Proxy Route: Download asset buffer for cross-origin file migrations
app.get("/api/proxy-download", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  try {
    const fetchResponse = await fetch(targetUrl);
    if (!fetchResponse.ok) {
      return res.status(fetchResponse.status).json({ error: `Failed to fetch remote asset: ${fetchResponse.statusText}` });
    }

    const contentType = fetchResponse.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    const arrayBuffer = await fetchResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("[Proxy Download Error]", error);
    res.status(500).json({ error: error.message || "Failed to download asset" });
  }
});

// Client Info Endpoint (IP address & User Agent detection)
app.get("/api/client-info", (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : (req.socket.remoteAddress || "127.0.0.1");
  const cleanIp = rawIp.replace(/^::ffff:/, "");
  res.json({
    ip: cleanIp || "127.0.0.1",
    userAgent: req.headers["user-agent"] || ""
  });
});

// Vite Middleware & SPA serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (Firebase Storage Mode)`);
  });
}

startServer();
