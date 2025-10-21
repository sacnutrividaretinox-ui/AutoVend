import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || `https://autovend-production.up.railway.app`;

// 🔹 Página inicial
app.get("/", (req, res) => {
  res.send("🔥 Servidor AutoVend rodando com sucesso!");
});

// 🔹 Iniciar login com Mercado Livre
app.get("/ml/auth", (req, res) => {
  const redirect = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${BASE_URL}/ml/callback`;
  res.redirect(redirect);
});

// 🔹 Callback do OAuth
app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("❌ Erro: parâmetro 'code' ausente na URL.");
  }

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        code,
        redirect_uri: `${BASE_URL}/ml/callback`,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Erro no token:", data);
      return res.status(400).send("⚠️ Erro ao autenticar: " + JSON.stringify(data));
    }

    console.log("✅ Autenticação bem-sucedida:", data);

    res.send(`
      <h2>✅ Aplicativo conectado com sucesso!</h2>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `);
  } catch (err) {
    console.error("Erro no callback:", err);
    res.status(500).send("❌ Erro interno no servidor");
  }
});

// 🔹 Subir servidor
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
