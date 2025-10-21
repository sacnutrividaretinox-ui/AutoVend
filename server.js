import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === Servir arquivos estáticos (frontend) ===
app.use(express.static(resolve(__dirname, "public")));

// === Rota de autenticação Mercado Livre ===
app.get("/ml/auth", (req, res) => {
  const redirectUri = `${process.env.BASE_URL}/ml/callback`;
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${redirectUri}`;
  res.redirect(authUrl);
});

// === Callback de autenticação ===
app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Código de autorização ausente.");

  try {
    // 1️⃣ Solicita o token ao Mercado Livre
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

    if (!data.access_token) {
      console.error("❌ Erro na autenticação:", data);
      return res.status(400).send(`<h3>Erro na autenticação</h3><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }

    // 2️⃣ Guarda o token em memória
    global.meliSession = {
      token: data.access_token,
      user_id: data.user_id,
    };

    // 3️⃣ Busca dados do usuário logado
    const userResponse = await fetch(`https://api.mercadolibre.com/users/${data.user_id}`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userInfo = await userResponse.json();

    // 4️⃣ Salva também o nome e e-mail na sessão
    global.meliSession.name = userInfo.nickname || userInfo.first_name || "Usuário";
    global.meliSession.email = userInfo.email || "E-mail não disponível";

    console.log("✅ Conectado como:", global.meliSession);

    // 5️⃣ Redireciona para o painel
    res.redirect("/painel.html");
  } catch (error) {
    console.error("Erro no callback:", error);
    res.status(500).send("Erro interno no servidor");
  }
});

// === Dados da sessão atual ===
app.get("/api/session", (req, res) => {
  if (!global.meliSession) return res.status(401).json({ error: "Não autenticado" });
  res.json(global.meliSession);
});

// === Rota fallback (SPA ou HTML simples) ===
app.get("*", (req, res) => {
  res.sendFile(resolve(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
