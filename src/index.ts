import "dotenv/config";
import express from "express";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index";
import http from "http";
import HealthCheck from "./controllers/health-check.controller";
import RegisterAgent from "./controllers/scheduler.controller";
import db from "./config/db.config";

const PORT: number = parseInt(process.env.PORT);

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.use("/api/inngest", serve({ client: inngest, functions }));

app.get("/", (req, res) => {
  res.status(200).json({ message: "🟢 Server is running..." });
});

app.post("/api/v1/scheduler/health-check", HealthCheck);
app.post("/api/v1/scheduler/register", RegisterAgent);

server.listen(PORT, () => {
  console.log("🟢 Server is running...");
  if (db) {
    console.log("🟢 Database is healthy...");
  } else {
    console.log("🔴 Error with the Database...");
  }
});
