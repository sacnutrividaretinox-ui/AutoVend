import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";
import xlsx from "xlsx";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });
app.use(cors());
app.use(express.json());

// === Configurações ===
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "SEU_ACCESS_TOKEN_AQUI";
const PORT = process.env.PORT || 8080;

// === Rota inicial ===
app.get("/", (req, res) => {
  res.send("🔥 AutoVend rodando com sucesso!");
});

// === Upload da planilha ===
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const produtos = sheetData.map((row, index) => ({
      sku: row["SKU"] || index + 1,
      title: row["Título"] || "",
      price: row["Preço"] || 0,
      stock: row["Quantidade"] || 1,
      category_ml: row["Categoria"] || "MLB1430",
      description: row["Descrição"] || "",
      images: row["Fotos"] || "",
    }));

    let resultados = [];

    for (const [index, produto] of produtos.entries()) {
      try {
        const response = await fetch("https://api.mercadolibre.com/items", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: produto.title,
            category_id: produto.category_ml,
            price: produto.price,
            currency_id: "BRL",
            available_quantity: produto.stock,
            buying_mode: "buy_it_now",
            condition: "new",
            listing_type_id: "gold_special",
            description: { plain_text: produto.description },
            pictures: produto.images
              .split(",")
              .filter(Boolean)
              .map((url) => ({ source: url.trim() })),
          }),
        });

        const data = await response.json();

        if (response.ok) {
          resultados.push({
            sku: produto.sku,
            status: "✅ Publicado com sucesso",
            id_ml: data.id,
            link: data.permalink,
          });
        } else {
          const msgErro =
            data &&
            data.cause &&
            data.cause.length > 0 &&
            data.cause[0].message
              ? `${data.cause[0].code} → ${data.cause[0].message}`
              : JSON.stringify(data);

          resultados.push({
            sku: produto.sku,
            status: `❌ Erro de validação: ${msgErro}`,
            id_ml: "-",
            link: "-",
          });
        }
      } catch (err) {
        resultados.push({
          sku: produto.sku,
          status: `❌ Erro interno: ${err.message}`,
          id_ml: "-",
          link: "-",
        });
      }
    }

    res.json({
      sucesso: resultados.filter((r) =>
        r.status.includes("sucesso")
      ).length,
      falhas: resultados.filter((r) =>
        r.status.includes("Erro")
      ).length,
      resultados,
    });
  } catch (error) {
    console.error("Erro no upload:", error);
    res.status(500).json({ erro: error.message });
  }
});

// === Servir o front-end ===
app.use(express.static("public"));

// === Iniciar servidor ===
app.listen(PORT, () => {
  console.log(`🚀 AutoVend rodando na porta ${PORT}`);
});
