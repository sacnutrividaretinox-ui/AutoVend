import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fileUpload from "express-fileupload";
import dotenv from "dotenv";
import { parse } from "csv-parse/sync";
import pMap from "p-map";
import fs from "fs";
import path from "path";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// === Banco de dados local (db.json) ===
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { products: [], logs: [] });
await db.read();
db.data ||= { products: [], logs: [] };

// === Pasta de arquivos públicos ===
app.use(express.static("public"));

// === Rota inicial ===
app.get("/", (req, res) => {
  res.send("🚀 AutoVend API rodando com sucesso!");
});

// === Upload do CSV ===
app.post("/api/upload", async (req, res) => {
  try {
    if (!req.files?.file) throw new Error("Nenhum arquivo enviado.");
    const file = req.files.file;
    const csvString = file.data.toString("utf-8");

    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
    });

    db.data.products = records;
    await db.write();

    res.json({
      count: records.length,
      sample: records.slice(0, 5),
    });
  } catch (err) {
    console.error("Erro no upload:", err);
    res.status(500).json({ error: err.message });
  }
});

// === Publicar em Massa (Simulação) ===
app.post("/api/publish/ml", async (req, res) => {
  const { limit = 10, concurrency = 2 } = req.body;
  const items = db.data.products.slice(0, limit);

  const results = await pMap(
    items,
    async (p) => ({
      ts: new Date().toISOString(),
      sku: p.sku,
      title: p.title,
      success: true,
      remote_id: `SIMULADO-${Date.now()}`,
    }),
    { concurrency }
  );

  db.data.logs.push(...results);
  await db.write();

  res.json({
    processed: items.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
});

// === Logs ===
app.get("/api/logs", async (req, res) => {
  await db.read();
  res.json({ logs: db.data.logs || [] });
});

// === Webhook Mercado Livre ===
app.get("/ml/webhook", (req, res) => {
  res.status(200).send("Webhook ativo!");
});

app.post("/ml/webhook", (req, res) => {
  console.log("🔔 Webhook recebido:", req.body);
  db.data.logs.push({
    ts: new Date().toISOString(),
    type: "webhook",
    data: req.body,
  });
  db.write();
  res.status(200).send("OK");
});

// === Iniciar servidor ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AutoVend rodando na porta ${PORT}`);
});
