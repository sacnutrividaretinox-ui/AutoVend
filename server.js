import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs-extra";
import { parse } from "csv-parse/sync";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = "./uploads";
await fs.ensureDir(UPLOAD_DIR);

let csvData = [];
let logs = [];

// === 1. Página inicial ===
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

// === 2. Conexão Mercado Livre ===
app.get("/ml/auth", (req, res) => {
  const redirect = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${process.env.BASE_URL}/ml/callback`;
  res.redirect(redirect);
});

// === 3. Callback de autorização ===
app.get("/ml/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Código de autorização ausente.");

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BASE_URL}/ml/callback`,
      }),
    });

    const data = await response.json();
    if (!data.access_token) throw new Error(JSON.stringify(data));

    process.env.ACCESS_TOKEN = data.access_token;
    logs.push({ time: new Date(), msg: "✅ Conectado ao Mercado Livre com sucesso!" });

    res.send(`
      <h2>✅ Aplicativo conectado com sucesso!</h2>
      <p>Token salvo no servidor.</p>
      <a href="/">Voltar ao painel</a>
    `);
  } catch (err) {
    console.error("Erro no callback:", err);
    logs.push({ time: new Date(), msg: "❌ Erro na autenticação: " + err.message });
    res.status(500).send("Erro ao autenticar com o Mercado Livre.");
  }
});

// === 4. Upload de CSV ===
const upload = multer({ dest: UPLOAD_DIR });
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const content = await fs.readFile(filePath, "utf8");
    const records = parse(content, { columns: true, skip_empty_lines: true });

    csvData = records;
    logs.push({ time: new Date(), msg: `📦 CSV carregado com ${records.length} produtos.` });

    res.json({ count: records.length, sample: records.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 5. Publicação em massa ===
app.post("/api/publish/ml", async (req, res) => {
  const { limit = 50 } = req.body;
  const items = csvData.slice(0, limit);
  let success = 0;
  let failed = 0;
  let results = [];

  if (!process.env.ACCESS_TOKEN) {
    return res.status(400).json({ error: "Conta do Mercado Livre não conectada." });
  }

  for (const item of items) {
    try {
      const payload = {
        title: item.title,
        category_id: item.category_ml || "MLB3530",
        price: parseFloat(item.price) || 10,
        currency_id: "BRL",
        available_quantity: parseInt(item.stock) || 1,
        buying_mode: "buy_it_now",
        listing_type_id: "gold_special",
        condition: "new",
        description: { plain_text: item.description || "" },
        pictures: (item.images || "")
          .split(",")
          .map(url => ({ source: url.trim() }))
          .filter(p => p.source),
      };

      const response = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.id) {
        success++;
        results.push({ sku: item.sku, status: "✅ Publicado", id: data.id });
      } else {
        failed++;
        results.push({ sku: item.sku, status: "❌ Erro", error: data.message });
      }
    } catch (err) {
      failed++;
      results.push({ sku: item.sku, status: "❌ Erro fatal", error: err.message });
    }
  }

  logs.push({ time: new Date(), msg: `🟢 Publicação finalizada. Sucesso: ${success} | Falhas: ${failed}` });

  res.json({
    processed: items.length,
    success,
    failed,
    results: results.slice(0, 10),
  });
});

// === 6. Logs ===
app.get("/api/logs", (req, res) => {
  res.json({ logs });
});

app.listen(PORT, () => console.log(`🚀 MVP rodando na porta ${PORT}`));
