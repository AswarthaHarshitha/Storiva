import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value"> {
  label: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: ReactNode;
  multiline?: boolean;
  trailing?: ReactNode;
}

const inputClass =
  "block w-full rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint " +
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 ";

export function TextField({
  label,
  name,
  value,
  onValueChange,
  onBlur,
  error,
  hint,
  required,
  multiline,
  trailing,
  className = "",
  ...rest
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const border = error ? "border-danger focus-visible:outline-danger" : "border-line-strong";

  const shared = {
    id,
    name,
    value,
    required,
    onBlur,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="text-accent" aria-hidden>
            {" "}*
          </span>
        )}
      </label>
      <div className="relative">
        {multiline ? (
          <textarea {...shared} rows={3} onChange={(e) => onValueChange(e.target.value)} className={`${inputClass} ${border} resize-y`} />
        ) : (
          <input {...shared} {...rest} onChange={(e) => onValueChange(e.target.value)} className={`${inputClass} ${border} ${trailing ? "pr-10" : ""}`} />
        )}
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
