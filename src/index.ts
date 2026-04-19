import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat";

// Create the Express app
const app = express();

// Middleware - allows JSON requests and cross-origin requests
app.use(cors());
app.use(express.json());

// root check endpoint - to verify the service is running
app.use("/chat", chatRoutes);

// Start the server
const PORT = process.env["PORT"] || 3001;
app.listen(PORT, () => {
  console.log(` AI Service running on http://localhost:${PORT}`);
});
