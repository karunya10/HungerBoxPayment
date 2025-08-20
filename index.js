import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  createSetupIntent,
  storeCardMetadata,
  payWithSavedCard,
  deleteCard,
} from "./stripe.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.post("/api/create-setup-intent", createSetupIntent);
app.post("/api/store-payment-method", storeCardMetadata);
app.post("/api/pay-with-saved-card", payWithSavedCard);
app.post("/api/delete-card", deleteCard);

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
