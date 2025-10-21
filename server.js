import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import fetch from "node-fetch";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(cors());

const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ dest: "uploads/" });

/**
 * Rota inicial
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/**
 * Upload de planilha + Token dinâmico do usuário
 */
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file?.path;
    const token = req.body.token?.trim();

    if (!filePath || !token)
      return res.status(400).json({ error: "Token ou arquivo ausente." });

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);

    const resultados = [];

    for (let i = 0; i < data.length; i++) {
      const produto = data[i];

      try {
        const response = await fetch("https://api.mercadolibre.com/items", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: produto.title || produto.nome || "Produto sem título",
            category_id: produto.category_id || "MLB1430",
            price: Number(produto.price) || 99.9,
            currency_id: "BRL",
            available_quantity: Number(produto.stock) || 10,
            buying_mode: "buy_it_now",
            listing_type_id: "gold_special",
            condition: "new",
            description: { plain_text: produto.description || "Sem descrição" },
            pictures: produto.images
              ? produto.images.split(",").map((url) => ({ source: url.trim() }))
              : [],
          }),
        });

        const json = await response.json();

        if (response.ok && json.id) {
          resultados.push({
            sku: produto.sku || `#${i + 1}`,
            status: "✅ Publicado com sucesso",
            id_ml: json.id,
            link: `https://mercadolivre.com.br/item/${json.id}`,
          });
        } else {
          resultados.push({
            sku: produto.sku || `#${i + 1}`,
            status: `❌ ${json.message || json.error || "Erro de validação"}`,
            id_ml: "-",
            link: "-",
          });
        }
      } catch (error) {
        resultados.push({
          sku: produto.sku || `#${i + 1}`,
          status: `❌ Falha: ${error.message}`,
          id_ml: "-",
          link: "-",
        });
      }
    }

    // Salvar resultados
    const resultadosData = {
      sucesso: resultados.filter((r) => r.status.includes("✅")).length,
      falhas: resultados.filter((r) => r.status.includes("❌")).length,
      resultados,
    };

    const resultPath = path.join(__dirname, "public", "api", "resultados.json");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(resultadosData, null, 2));
    fs.unlinkSync(filePath);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Erro:", err);
    res.status(500).json({ error: "Erro ao processar a planilha" });
  }
});

/**
 * Painel e resultados
 */
app.get("/painel.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "painel.html"));
});

app.get("/api/resultados.json", (req, res) => {
  const resultPath = path.join(__dirname, "public", "api", "resultados.json");
  if (fs.existsSync(resultPath)) {
    const data = fs.readFileSync(resultPath);
    res.json(JSON.parse(data));
  } else {
    res.json({ sucesso: 0, falhas: 0, resultados: [] });
  }
});

app.listen(PORT, () => console.log(`🚀 AutoVend rodando na porta ${PORT}`));
