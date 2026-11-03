import type { Request, Response } from "express";
import { authOf } from "../middleware/requireAuth.js";
import { parseInput } from "../middleware/validate.js";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { settingsSchema } from "../validation/settings.js";

export async function show(req: Request, res: Response) {
  res.json({ data: await getSettings(authOf(req).organizationId) });
}

export async function update(req: Request, res: Response) {
  const input = parseInput(settingsSchema, req.body);
  res.json({ data: await updateSettings(authOf(req).organizationId, input) });
}
