import { z } from "zod";

const email = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

export const signupSchema = z
  .object({
    email,
    password: z
      .string({ error: "Password is required." })
      .min(8, "Use at least 8 characters.")
      // bcrypt ignores everything past 72 bytes, so longer passwords would be silently truncated.
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Use at most 72 characters.")
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Include at least one letter and one number."),
    confirmPassword: z.string({ error: "Confirm your password." }),
    organizationName: z
      .string({ error: "Organization name is required." })
      .trim()
      .min(2, "Use at least 2 characters.")
      .max(120, "Use at most 120 characters."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Password is required." }).min(1, "Password is required."),
});
