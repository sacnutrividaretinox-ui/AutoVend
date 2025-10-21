import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === Rota inicial ===
app.get("/", (req, res) => {
  res.sendFile(resolve(__dirname, "index.html"));
});

// === Autenticação Mercado Livre ===
app.get("/ml/auth", (req, res) => {
  const redirectUri = `${process.env.BASE_URL}/ml/callback`;
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${redirectUri}`;
  res.redirect(authUrl);
});

// === Callback do Mercado Livre ===
app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("Código de autorização ausente.");
  }

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BASE_URL}/ml/callback`,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      console.log("✅ Autenticação bem-sucedida:", data);
      res.send(`
        <h2 style="color:green;">✅ Aplicativo conectado com sucesso!</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `);
    } else {
      console.error("❌ Erro na autenticação:", data);
      res.status(400).send(`<h3>Erro na autenticação</h3><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }
  } catch (error) {
    console.error("Erro no callback:", error);
    res.status(500).send("Erro interno no servidor");
  }
});

// === Servir front ===
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
