import type { z } from "zod";
import { HttpError, type FieldErrors } from "../lib/errors.js";

/** Parses input against a schema, turning failures into a 422 with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    fields[key] ??= issue.message;
  }
  throw new HttpError(422, "VALIDATION_FAILED", "Some fields need attention.", fields);
}
