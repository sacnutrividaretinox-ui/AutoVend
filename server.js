import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import csvParser from "csv-parser";
import fs from "fs";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({ dest: "uploads/" });

// Banco local simples (para logs e CSV temporário)
const DB_FILE = resolve(__dirname, "db.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ produtos: [], logs: [] }, null, 2));

// === ROTAS ===

// Servir o front-end
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(resolve(__dirname, "index.html"));
});

// Upload CSV
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csvParser())
      .on("data", (row) => results.push(row))
      .on("end", () => {
        const data = JSON.parse(fs.readFileSync(DB_FILE));
        data.produtos = results;
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        fs.unlinkSync(req.file.path);
        res.json({ count: results.length, sample: results.slice(0, 5) });
      });
  } catch (err) {
    console.error("Erro upload:", err);
    res.status(500).json({ error: "Erro ao processar CSV" });
  }
});

// Publicação em massa
app.post("/api/publish/ml", async (req, res) => {
  const { limit = 10 } = req.body;
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  const produtos = data.produtos.slice(0, limit);

  let success = 0;
  let failed = 0;
  const results = [];

  for (const p of produtos) {
    try {
      // Aqui você pode fazer chamadas reais para a API do Mercado Livre
      console.log("Publicando:", p.title || p.sku);
      success++;
      results.push({ status: "✅", title: p.title || "-", sku: p.sku || "-" });
    } catch (err) {
      failed++;
      results.push({ status: "❌", title: p.title || "-", error: err.message });
    }
  }

  const logEntry = { date: new Date().toISOString(), success, failed };
  data.logs.push(logEntry);
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

  res.json({ processed: produtos.length, success, failed, results });
});

// Logs
app.get("/api/logs", (req, res) => {
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  res.json({ logs: data.logs || [] });
});

// === PORT ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
