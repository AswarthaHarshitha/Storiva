import { useState, type FormEvent } from "react";
import type { z } from "zod";
import type { FieldErrors } from "../api/client";
import { validate } from "../lib/validation";

/**
 * Form state with validation on blur and on submit. Once a field's error is showing, it is
 * re-evaluated as the person types, so the message clears as soon as the value is fixed.
 *
 * Client errors are derived from the current values on every render rather than stored, so
 * they can never describe an older value. Server errors (e.g. a duplicate SKU) are stored
 * until the field they belong to is edited.
 */
export function useForm<V extends Record<string, string>>(schema: z.ZodType, initialValues: V) {
  const [values, setValues] = useState(initialValues);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});

  const clientErrors = validate(schema, values) ?? {};
  const errors: FieldErrors = { ...serverErrors };
  for (const name of shown) {
    const message = clientErrors[name];
    if (message) errors[name] ??= message;
  }

  const setValue = (name: keyof V & string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setServerErrors((current) =>
      name in current ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)) : current,
    );
  };

  const touch = (name: keyof V & string) => {
    setShown((current) => (current.has(name) ? current : new Set(current).add(name)));
  };

  /**
   * Validates everything, focuses the first problem, and only calls onValid when all is well.
   * onValid receives a helper for showing field errors the server returns later.
   */
  const handleSubmit =
    (onValid: (values: V, showServerErrors: (fields: FieldErrors) => void) => void) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const found = validate(schema, values);
      setShown(new Set(Object.keys(values)));
      if (found) {
        focusFirstError(form, found);
        return;
      }
      onValid(values, (fields) => {
        setServerErrors(fields);
        focusFirstError(form, fields);
      });
    };

  return { values, errors, setValue, touch, handleSubmit };
}

function focusFirstError(form: HTMLFormElement, errors: FieldErrors) {
  const field = Array.from(form.elements).find(
    (element): element is HTMLInputElement =>
      element instanceof HTMLElement && Boolean(errors[element.getAttribute("name") ?? ""]),
  );
  field?.focus();
}
