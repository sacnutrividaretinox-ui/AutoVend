import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import multer from "multer";
import csvParser from "csv-parser";
import path from "path";
import os from "os";

dotenv.config();


dotenv.config();


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === ARQUIVOS BASE ===
const USERS_DB = "users.json";
const LOGS_DB = "logs.json";
if (!fs.existsSync(USERS_DB)) fs.writeFileSync(USERS_DB, JSON.stringify({ users: [] }, null, 2));
if (!fs.existsSync(LOGS_DB)) fs.writeFileSync(LOGS_DB, JSON.stringify({ logs: [] }, null, 2));

const BASE_URL = process.env.BASE_URL;
const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

// === 1) AUTENTICAÇÃO MERCADO LIVRE ===
app.get("/ml/auth/:userId", (req, res) => {
  const { userId } = req.params;
  const redirect = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${BASE_URL}/ml/callback?userId=${userId}`;
  res.redirect(redirect);
});

app.get("/ml/callback", async (req, res) => {
  const { code, userId } = req.query;
  if (!code) return res.status(400).send("Erro: falta o código de autorização.");

  try {
    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: `${BASE_URL}/ml/callback?userId=${userId}`,
      }),
    });

    const data = await r.json();
    if (data.error) throw new Error(JSON.stringify(data));

    const db = JSON.parse(fs.readFileSync(USERS_DB, "utf-8"));
    const existing = db.users.find((u) => u.id === userId);
    if (existing) Object.assign(existing, data);
    else db.users.push({ id: userId, ...data });
    fs.writeFileSync(USERS_DB, JSON.stringify(db, null, 2));

    res.send(`<h2>✅ Conta Mercado Livre conectada com sucesso para <b>${userId}</b></h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
  } catch (err) {
    console.error("Erro no callback:", err);
    res.status(500).send("Erro ao autenticar no Mercado Livre.");
  }
});

// === 2) REFRESH AUTOMÁTICO ===
async function refreshToken(userId) {
  const db = JSON.parse(fs.readFileSync(USERS_DB, "utf-8"));
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;

  try {
    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: user.refresh_token,
      }),
    });

    const data = await r.json();
    if (data.access_token) {
      Object.assign(user, data);
      fs.writeFileSync(USERS_DB, JSON.stringify(db, null, 2));
      console.log(`♻️ Token atualizado para ${userId}`);
    }
  } catch (err) {
    console.error("Erro no refresh:", err);
  }
}
setInterval(async () => {
  const db = JSON.parse(fs.readFileSync(USERS_DB, "utf-8"));
  for (const u of db.users) await refreshToken(u.id);
}, 18000 * 1000);

// === 3) UPLOAD DE CSV ===
const upload = multer({ dest: os.tmpdir() });
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => results.push(row))
      .on("end", () => {
        fs.writeFileSync("products.csv", fs.readFileSync(filePath));
        fs.unlinkSync(filePath);
        res.json({ count: results.length, sample: results.slice(0, 5) });
      });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 4) PUBLICAR NO MERCADO LIVRE ===
app.post("/api/publish/ml", async (req, res) => {
  const { userId, limit = 10 } = req.body;
  const db = JSON.parse(fs.readFileSync(USERS_DB, "utf-8"));
  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: "Usuário não autenticado." });

  const products = [];
  fs.createReadStream("products.csv")
    .pipe(csvParser())
    .on("data", (data) => products.push(data))
    .on("end", async () => {
      const subset = products.slice(0, limit);
      const results = [];

      for (const p of subset) {
        try {
          const body = {
            title: p.title || "Produto sem título",
            category_id: p.category_ml || "MLB3530",
            price: Number(p.price) || 100,
            currency_id: "BRL",
            available_quantity: Number(p.stock) || 1,
            buying_mode: "buy_it_now",
            listing_type_id: "bronze",
            condition: "new",
            description: { plain_text: p.description || "Sem descrição" },
            pictures: (p.images || "")
              .split(",")
              .map((url) => ({ source: url.trim() }))
              .filter((pic) => pic.source.length > 5),
          };

          const r = await fetch("https://api.mercadolibre.com/items", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${user.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          const data = await r.json();
          const entry = {
            userId,
            sku: p.sku,
            title: p.title,
            status: data.id ? "✅ Publicado" : "❌ Falhou",
            id: data.id || "-",
            error: data.error || "",
          };
          results.push(entry);
          saveLog(entry);
        } catch (err) {
          const entry = { userId, sku: p.sku, title: p.title, status: "❌ Erro", error: err.message };
          results.push(entry);
          saveLog(entry);
        }
      }

      res.json({
        processed: subset.length,
        success: results.filter((r) => r.status.includes("✅")).length,
        failed: results.filter((r) => r.status.includes("❌")).length,
        results,
      });
    });
});

// === 5) LOGS ===
function saveLog(entry) {
  const db = JSON.parse(fs.readFileSync(LOGS_DB, "utf-8"));
  db.logs.push({ timestamp: new Date().toISOString(), ...entry });
  fs.writeFileSync(LOGS_DB, JSON.stringify(db, null, 2));
}
app.get("/api/logs", (req, res) => {
  const db = JSON.parse(fs.readFileSync(LOGS_DB, "utf-8"));
  res.json(db);
});

// === FRONT SIMPLES ===
app.use(express.static("."));
app.get("/", (req, res) => res.sendFile(path.resolve("index.html")));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
