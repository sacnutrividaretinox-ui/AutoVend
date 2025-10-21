import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// === Configuração de middlewares ===
app.use(express.json());
app.use(cors());

// === Servir a pasta public ===
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

// === Configuração de upload ===
const upload = multer({ dest: "uploads/" });

// === Rota inicial (mostra o front) ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === Upload de planilha ===
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Aqui é onde você faria o envio para a API do Mercado Livre
    // (exemplo: for await (const produto of data) { ... })

    // Exemplo: gerar JSON de resultado
    const resultados = data.map((item, index) => ({
      sku: item.sku || `#${index + 1}`,
      status: "✅ Publicado com sucesso",
      id_ml: Math.floor(Math.random() * 9999999999),
      link: "https://www.mercadolivre.com.br/",
    }));

    const resultadosData = {
      sucesso: resultados.length,
      falhas: 0,
      resultados,
    };

    // Cria pasta caso não exista
    const resultPath = path.join(__dirname, "public", "api", "resultados.json");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(resultadosData, null, 2));

    // Limpa arquivo enviado
    fs.unlinkSync(filePath);

    res.json({ ok: true, count: resultados.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar planilha" });
  }
});

// === Rota do painel ===
app.get("/painel.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "painel.html"));
});

// === Rota de resultados ===
app.get("/api/resultados.json", (req, res) => {
  const resultPath = path.join(__dirname, "public", "api", "resultados.json");
  if (fs.existsSync(resultPath)) {
    const data = fs.readFileSync(resultPath);
    res.json(JSON.parse(data));
  } else {
    res.json({ sucesso: 0, falhas: 0, resultados: [] });
  }
});

// === Inicia servidor ===
app.listen(PORT, () => {
  console.log(`🔥 AutoVend rodando na porta ${PORT}`);
});
