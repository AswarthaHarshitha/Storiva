import { errorMessage } from "../api/client";
import { Alert } from "./Alert";

export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Alert>
      {errorMessage(error)}{" "}
      <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
        Try again
      </button>
    </Alert>
  );
}
