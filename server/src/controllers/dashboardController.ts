import type { Request, Response } from "express";
import { authOf } from "../middleware/requireAuth.js";
import { getDashboard } from "../services/dashboardService.js";

export async function show(req: Request, res: Response) {
  res.json({ data: await getDashboard(authOf(req).organizationId) });
}
