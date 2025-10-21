import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import pMap from "p-map";
import { parse } from "csv-parse";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

const adapter = new JSONFile("db.json");
const db = new Low(adapter, { products: [], publish_logs: [], ml_token: null });
await db.read();
if (!db.data) db.data = { products: [], publish_logs: [], ml_token: null };

const PORT = process.env.PORT || 3000;
const SITE_ID = process.env.ML_SITE_ID || "MLB";
const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/ml/callback`;

/* =====================================================
   📦 Leitura automática de CSV ou XLSX
===================================================== */
async function parseFile(file) {
  const fileName = file.name.toLowerCase();
  let produtos = [];

  if (fileName.endsWith(".xlsx")) {
    const workbook = XLSX.read(file.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    produtos = normalizeData(rows);
  } else if (fileName.endsWith(".csv")) {
    produtos = await parseCSV(file.data);
  } else {
    throw new Error("Formato de arquivo não suportado. Use .csv ou .xlsx");
  }

  return produtos;
}

function normalizeData(records) {
  const map = {
    sku: ["sku", "id", "codigo", "referencia"],
    title: ["title", "titulo", "nome", "produto"],
    description: ["description", "descricao", "detalhes"],
    price: ["price", "preco", "valor"],
    stock: ["stock", "estoque", "quantidade"],
    images: ["images", "fotos", "imagens", "urls"],
    brand: ["brand", "marca"],
    color: ["color", "cor"],
    size: ["size", "tamanho"],
    category_ml: ["category_ml", "categoria", "categoria_id", "mlb"],
  };

  const normalizeHeader = (header) => {
    header = header.toLowerCase().trim();
    for (const key in map) if (map[key].includes(header)) return key;
    return null;
  };

  const headers = Object.keys(records[0] || {});
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));

  const produtos = records.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      const key = normalizedHeaders[i];
      if (!key) return;
      let val = row[header];

      if (key === "price" && typeof val === "string") val = val.replace(",", ".").replace(/[^\d.]/g, "");
      if (key === "stock" && typeof val === "string") val = val.replace(/\D/g, "");
      if (key === "images" && typeof val === "string")
        val = val.split(/[,|]/).map((s) => s.trim()).filter(Boolean).join("|");

      obj[key] = val;
    });

    for (const key of Object.keys(map)) if (!obj[key]) obj[key] = "";
    return obj;
  });

  return produtos;
}

function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    let text = buffer.toString("utf-8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    parse(
      text,
      { columns: true, delimiter: ",", skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true },
      (err, records) => (err ? reject(err) : resolve(normalizeData(records)))
    );
  });
}

/* =====================================================
   🚀 Publicar produtos no Mercado Livre
===================================================== */
async function publishToMercadoLivre(product) {
  const token = db.data.ml_token?.access_token;
  if (!token) throw new Error("Conecte ao Mercado Livre antes de publicar.");

  const payload = {
    title: product.title,
    category_id: product.category_ml || "",
    price: Number(product.price) || 0,
    currency_id: "BRL",
    available_quantity: Number(product.stock) || 0,
    buying_mode: "buy_it_now",
    listing_type_id: "bronze",
    condition: "new",
    pictures: (product.images || "").split("|").map((url) => ({ source: url })),
    attributes: [
      product.brand ? { id: "BRAND", value_name: product.brand } : null,
      product.color ? { id: "COLOR", value_name: product.color } : null,
      product.size ? { id: "SIZE", value_name: product.size } : null,
    ].filter(Boolean),
  };

  try {
    const res = await axios.post("https://api.mercadolibre.com/items", payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, remote_id: res.data.id, payload };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message, payload };
  }
}

/* =====================================================
   🧠 Rotas principais
===================================================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/api/upload", async (req, res) => {
  try {
    if (!req.files?.file) return res.status(400).json({ error: "Envie um arquivo CSV ou XLSX em 'file'" });
    const produtos = await parseFile(req.files.file);
    db.data.products = produtos;
    await db.write();
    res.json({ count: produtos.length, sample: produtos.slice(0, 5) });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/publish/ml", async (req, res) => {
  try {
    const { limit = 50, concurrency = 2 } = req.body || {};
    const all = db.data.products || [];
    const batch = all.slice(0, limit);

    const results = await pMap(batch, async (p) => {
      const out = await publishToMercadoLivre(p);
      const log = { ts: new Date().toISOString(), sku: p.sku, title: p.title, success: out.success, remote_id: out.remote_id, error: out.error };
      db.data.publish_logs.push(log);
      return log;
    }, { concurrency });

    await db.write();
    res.json({ processed: results.length, success: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/* =====================================================
   🔐 Autenticação Mercado Livre
===================================================== */
app.get("/ml/auth", (req, res) => {
  const url = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.redirect(url);
});

app.get("/ml/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.post("https://api.mercadolibre.com/oauth/token", null, {
      params: {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    db.data.ml_token = tokenRes.data;
    await db.write();

    res.send(`
      <h2>✅ Conexão com Mercado Livre concluída!</h2>
      <p>Você já pode fechar esta aba e voltar ao sistema.</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);
  } catch (err) {
    res.status(500).send("Erro ao conectar: " + (err.response?.data?.message || err.message));
  }
});

/* =====================================================
   💻 Inicialização
===================================================== */
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});
