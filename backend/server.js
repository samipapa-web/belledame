import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

const dataDir = path.join(__dirname, "data");
ensureDir(dataDir);

const dbFile = path.join(dataDir, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { products: [] });

async function initDb() {
  await db.read();
  db.data ||= { products: [] };
  await db.write();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

function requireAdmin(req, res, next) {
  const pin = req.header("x-admin-pin") || "";
  if (pin !== ADMIN_PIN) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function normalizeProduct(p) {
  const image = (p.images && p.images[0]) ? String(p.images[0]) : (p.image ? String(p.image) : "");
  return {
    id: String(p.id || nanoid(10)),
    name: String(p.name || ""),
    brand: String(p.brand || ""),
    price: Number(p.price || 0),
    currency: String(p.currency || "FCFA"),
    rubrique: String(p.rubrique || ""),
    sous_rubrique: String(p.sous_rubrique || ""),
    categorie: String(p.categorie || ""),
    description: String(p.description || ""),
    images: image ? [image] : [],
    active: p.active === false ? false : true,
    updated_at: new Date().toISOString()
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Public products (active only)
app.get("/api/products", async (req, res) => {
  await db.read();
  const list = (db.data.products || []).filter(p => p.active !== false);
  // tri simple
  list.sort((a, b) =>
    (a.rubrique || "").localeCompare(b.rubrique || "") ||
    (a.brand || "").localeCompare(b.brand || "") ||
    (a.name || "").localeCompare(b.name || "")
  );
  res.json(list);
});

// Admin: all products (including inactive)
app.get("/api/admin/products", requireAdmin, async (req, res) => {
  await db.read();
  res.json(db.data.products || []);
});

// Admin: seed (replace/update from array)
app.post("/api/admin/seed", requireAdmin, async (req, res) => {
  const products = req.body?.products;
  if (!Array.isArray(products)) return res.status(400).json({ error: "Provide {products:[...]}" });

  await db.read();
  const map = new Map((db.data.products || []).map(p => [p.id, p]));

  for (const p of products) {
    const np = normalizeProduct(p);
    map.set(np.id, { ...(map.get(np.id) || {}), ...np });
  }

  db.data.products = Array.from(map.values());
  await db.write();
  res.json({ ok: true, count: products.length });
});

// Admin: upsert one
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const p = req.body || {};
  if (!p.id || !p.name || !p.brand) return res.status(400).json({ error: "Missing fields (id,name,brand)" });

  await db.read();
  const list = db.data.products || [];
  const idx = list.findIndex(x => x.id === String(p.id));
  const np = normalizeProduct(p);

  if (idx >= 0) list[idx] = { ...list[idx], ...np };
  else list.push(np);

  db.data.products = list;
  await db.write();
  res.json(np);
});

// Admin: patch existing (price/image/description/active)
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const body = req.body || {};

  await db.read();
  const list = db.data.products || [];
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });

  const cur = list[idx];
  const image = body.image !== undefined
    ? String(body.image)
    : (body.images && body.images[0] ? String(body.images[0]) : (cur.images?.[0] || ""));

  list[idx] = {
    ...cur,
    price: body.price !== undefined ? Number(body.price) : cur.price,
    description: body.description !== undefined ? String(body.description) : cur.description,
    images: image ? [image] : [],
    active: body.active !== undefined ? !!body.active : cur.active,
    updated_at: new Date().toISOString()
  };

  db.data.products = list;
  await db.write();
  res.json(list[idx]);
});

// Admin: soft delete
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  await db.read();
  const list = db.data.products || [];
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) {
    list[idx].active = false;
    list[idx].updated_at = new Date().toISOString();
    db.data.products = list;
    await db.write();
  }
  res.json({ ok: true });
});

// Serve front-end
const publicDir = path.join(__dirname, "..");
app.use(express.static(publicDir));

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`BELLE DAME backend (JSON) running on http://localhost:${PORT}`);
    console.log(`DB JSON: ${dbFile}`);
  });
});
