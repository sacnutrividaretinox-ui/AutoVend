// === Dependências ===
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// === Rota inicial ===
app.get("/", (req, res) => {
  res.send("🔥 Servidor AutoVend rodando com sucesso!");
});

// === Rota de webhook (Mercado Livre) ===
app.post("/ml/webhook", async (req, res) => {
  console.log("📩 Webhook recebido do Mercado Livre:");
  console.log(JSON.stringify(req.body, null, 2));
  res.send("✅ Webhook ativo e recebendo notificações!");
});

// Teste rápido de webhook via GET
app.get("/ml/webhook", (req, res) => {
  res.send("✅ Webhook ativo!");
});

// === Rota de callback OAuth ===
app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("❌ Código de autorização não encontrado.");
  }

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("client_id", process.env.ML_CLIENT_ID);
  params.append("client_secret", process.env.ML_CLIENT_SECRET);
  params.append("code", code);
  params.append("redirect_uri", "https://autovend-production.up.railway.app/ml/callback");

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    const data = await response.json();
    console.log("🔑 TOKEN RECEBIDO DO MERCADO LIVRE:");
    console.log(data);

    if (data.access_token) {
      res.send(`
        <h2>✅ Autorização concluída com sucesso!</h2>
        <p>O token foi recebido e armazenado com sucesso no console.</p>
        <p>Verifique os logs no Railway para ver o access_token e refresh_token.</p>
      `);
    } else {
      res.send(`<h2>⚠️ Falha ao obter o token:</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }
  } catch (error) {
    console.error("❌ Erro ao trocar código pelo token:", error);
    res.status(500).send("Erro ao trocar o código pelo token.");
  }
});

// === Rota auxiliar para testar conexão ===
app.get("/ml/test", async (req, res) => {
  try {
    const response = await fetch("https://api.mercadolibre.com/sites");
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).send("Erro ao conectar na API do Mercado Livre");
  }
});

// === Inicialização ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AutoVend rodando na porta ${PORT}`);
});
