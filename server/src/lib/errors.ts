export type FieldErrors = Record<string, string>;

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found.`);
