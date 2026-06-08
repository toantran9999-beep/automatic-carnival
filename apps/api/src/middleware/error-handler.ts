import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { t, translations } from "../lib/i18n.js";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Known service error codes mapped to HTTP status
const KNOWN_ERROR_CODES: Record<string, number> = {
  REWARD_NOT_FOUND: 404,
  LOYALTY_NOT_FOUND: 404,
  INSUFFICIENT_POINTS: 400,
  PENDING_SESSION_NOT_FOUND: 404,
  ACTIVE_SESSION_NOT_FOUND: 404,
  TABLE_NOT_FOUND: 404,
};

export const errorHandler: ErrorHandler = (err, c) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_root";
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: t(c, "invalid_input"),
          details,
        },
      },
      400,
    );
  }

  // AppError (custom business errors)
  if (err instanceof AppError) {
    const isKey = err.message in translations.vi;
    const msg = isKey ? t(c, err.message as any) : err.message;
    return c.json(
      {
        success: false,
        error: { code: err.code, message: msg },
      },
      err.status as any,
    );
  }

  // Known service error codes (thrown as Error("CODE_STRING"))
  const knownStatus = KNOWN_ERROR_CODES[err.message];
  if (knownStatus) {
    return c.json(
      {
        success: false,
        error: { code: err.message, message: t(c, err.message as any) },
      },
      knownStatus as any,
    );
  }

  // Check for errors with a name we recognize
  if (err.name === "OrderValidationError") {
    const isKey = err.message in translations.vi;
    const msg = isKey ? t(c, err.message as any) : err.message;
    return c.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: msg } },
      400,
    );
  }
  if (err.name === "InventoryItemNotFoundError") {
    const isKey = err.message in translations.vi;
    const msg = isKey ? t(c, err.message as any) : err.message;
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: msg } },
      404,
    );
  }

  // Unhandled errors
  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  const status = (err as any).status || 500;
  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: status === 500 ? t(c, "internal_server_error") : err.message,
      },
    },
    status,
  );
};
