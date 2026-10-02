import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist"),
  port = Number(process.env.PORT || 4319),
  host = process.env.HOST || "127.0.0.1";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".json": "application/json",
};
createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
  );
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://local").pathname,
    );
    let file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    if (pathname === "/") file = resolve(root, "index.html");
    try {
      if (!(await stat(file)).isFile()) throw new Error("Missing");
    } catch {
      if (!extname(pathname)) file = resolve(root, "index.html");
      else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
    }
    const bytes = await readFile(file);
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
}).listen(port, host, () => console.log(`Holdfast at http://${host}:${port}`));
