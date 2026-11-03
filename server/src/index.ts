import express from "express";

const app = express();
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`StockFlow API listening on port ${port}`);
});
