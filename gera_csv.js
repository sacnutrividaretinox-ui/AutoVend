import fs from "fs";
import { stringify } from "csv-stringify/sync";

// === Exemplo de dados dos produtos ===
const produtos = [
  {
    sku: "PROD001",
    title: "Camiseta Dry Fit Masculina",
    description: "Camiseta leve e respirável para treino",
    price: 59.9,
    stock: 20,
    images: [
      "https://images.unsplash.com/photo-1520975916090-3105956dac38"
    ],
    brand: "Marca X",
    color: "Preto",
    size: "M",
    category_ml: "MLB1430"
  },
  {
    sku: "PROD002",
    title: "Tênis Esportivo",
    description: "Tênis para corrida com amortecimento",
    price: 129.9,
    stock: 10,
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff"
    ],
    brand: "Marca Y",
    color: "Branco",
    size: "42",
    category_ml: "MLB1747"
  },
  {
    sku: "PROD003",
    title: "Meia Esportiva",
    description: "Meia com tecnologia de conforto",
    price: 19.9,
    stock: 100,
    images: [
      "https://images.unsplash.com/photo-1542060748-10c28b62716b"
    ],
    brand: "Marca Z",
    color: "Branca",
    size: "Único",
    category_ml: "MLB1430"
  }
];

// === Converte JSON para CSV ===
const csv = stringify(produtos, {
  header: true,
  columns: [
    "sku",
    "title",
    "description",
    "price",
    "stock",
    "images",
    "brand",
    "color",
    "size",
    "category_ml"
  ],
  cast: {
    string: (value) => value?.replace(/\n/g, " ") || "",
  }
});

// === Salva o arquivo ===
fs.writeFileSync("produtos.csv", csv, "utf8");
console.log("✅ Arquivo 'produtos.csv' gerado com sucesso!");
