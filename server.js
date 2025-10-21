import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public")); // serve o front (index.html e painel.html)

// Variáveis globais
let meliSession = null;
let csvData = [];

// =============== ROTA INICIAL ===================
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// =============== AUTENTICAÇÃO MERCADO LIVRE ===================
app.get("/ml/auth", (req, res) => {
  const redirectUri = `${process.env.BASE_URL}/ml/callback`;
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID}&redirect_uri=${redirectUri}`;
  res.redirect(authUrl);
});

// =============== CALLBACK MERCADO LIVRE ===================
app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Código de autorização ausente.");

  try {
    // Troca o code por access_token
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

    // Salva a sessão
    meliSession = {
      token: data.access_token,
      user_id: data.user_id,
    };

    // Busca informações do usuário
    const userResponse = await fetch(`https://api.mercadolibre.com/users/${data.user_id}`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userInfo = await userResponse.json();

    meliSession.name = userInfo.nickname || userInfo.first_name || "Usuário";
    meliSession.email = userInfo.email || "E-mail não disponível";

    console.log("✅ Conectado como:", meliSession);

    // Redireciona para o painel
    res.redirect("/painel.html");
  } catch (error) {
    console.error("Erro no callback:", error);
    res.status(500).send("Erro interno no servidor");
  }
});

// =============== ROTA PARA RETORNAR A SESSÃO ATUAL ===================
app.get("/api/session", (req, res) => {
  if (!meliSession) return res.status(401).json({ error: "Não autenticado" });
  res.json(meliSession);
});

// =============== UPLOAD DO CSV ===================
const upload = multer({ dest: "uploads/" });

app.post("/api/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

  const results = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      csvData = results;
      res.json({ count: results.length, sample: results.slice(0, 3) });
      fs.unlinkSync(file.path);
    });
});

// =============== PUBLICAÇÃO EM MASSA NO MERCADO LIVRE ===================
app.post("/api/publish/ml", async (req, res) => {
  const { limit } = req.body;
  const token = meliSession?.token;
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  if (!csvData.length) return res.status(400).json({ error: "Nenhum CSV carregado" });

  let processed = 0,
    success = 0,
    failed = 0;
  const results = [];

  for (const row of csvData.slice(0, limit)) {
    processed++;
    try {
      const payload = {
        title: row.title,
        category_id: row.category_ml || "MLB3530",
        price: Number(row.price) || 10,
        currency_id: "BRL",
        available_quantity: Number(row.stock) || 1,
        buying_mode: "buy_it_now",
        listing_type_id: "gold_special",
        condition: "new",
        description: { plain_text: row.description || "Sem descrição." },
        pictures: (row.images || "")
          .split(",")
          .map((url) => ({ source: url.trim() }))
          .slice(0, 5),
      };

      const resp = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await resp.json();

      if (resp.ok) {
        success++;
        results.push({ sku: row.sku, id: json.id, status: "OK" });
      } else {
        failed++;
        results.push({ sku: row.sku, error: json.message || "Erro desconhecido" });
      }
    } catch (err) {
      failed++;
      results.push({ sku: row.sku, error: err.message });
    }
  }

  res.json({ processed, success, failed, results });
});

// =============== INICIAR SERVIDOR ===================
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => console.log(`🔥 AutoVend rodando na porta ${PORT}`));
