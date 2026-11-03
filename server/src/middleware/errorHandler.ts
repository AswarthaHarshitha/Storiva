import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/errors.js";

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "No such API endpoint." } });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
    return;
  }

  // Body-parser errors (malformed JSON, oversized body) carry a client-error status.
  if (isClientBodyError(err)) {
    res.status(err.status).json({ error: { code: "BAD_REQUEST", message: "The request body could not be read." } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } });
};

function isClientBodyError(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500 &&
    "expose" in err &&
    err.expose === true
  );
}
