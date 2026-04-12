import { NextFunction, Request, Response, Router } from "express";
import { chat } from "../controllers/chat.controller";

const router = Router();

const expectedKey = process.env["AI_SERVICE_KEY"];
if (!expectedKey) {
  throw new Error(
    "Missing AI_SERVICE_KEY. Add it to your environment or .env before starting the AI service.",
  );
}

const requireServiceKey = (req: Request, res: Response, next: NextFunction) => {
  const providedKey = req.header("x-service-key");
  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
};

router.post("/", requireServiceKey, chat);

export default router;
