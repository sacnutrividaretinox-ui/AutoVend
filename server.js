import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// === ROTA TESTE PRINCIPAL ===
app.get("/", (req, res) => {
  res.send("🔥 Servidor AutoVend rodando com sucesso!");
});

// === ROTA WEBHOOK (GET e POST) ===
app.get("/ml/webhook", (req, res) => {
  res.send("✅ Webhook ativo!");
});

app.post("/ml/webhook", (req, res) => {
  console.log("📩 Webhook recebido:", req.body);
  res.sendStatus(200);
});

// === PORTA DINÂMICA PARA RAILWAY ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
