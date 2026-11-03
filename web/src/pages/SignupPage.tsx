import { Link, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { PasswordField } from "../components/PasswordField";
import { TextField } from "../components/TextField";
import { useSignup } from "../hooks/useAccount";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useForm } from "../hooks/useForm";
import { signupSchema } from "../lib/validation";

export function SignupPage() {
  useDocumentTitle("Create your account");
  const navigate = useNavigate();
  const signup = useSignup();
  const form = useForm(signupSchema, { organizationName: "", email: "", password: "", confirmPassword: "" });

  const submit = form.handleSubmit((values, showServerErrors) => {
    signup.mutate(values, {
      onSuccess: () => void navigate("/", { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
          showServerErrors(error.fields);
        }
      },
    });
  });

  const failure = signup.error instanceof ApiError && Object.keys(signup.error.fields).length > 0 ? null : signup.error;
  const field = (name: keyof typeof form.values) => ({
    name,
    value: form.values[name],
    onValueChange: (v: string) => form.setValue(name, v),
    onBlur: () => form.touch(name),
    error: form.errors[name],
    required: true,
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up a private inventory for your business. It starts empty, ready for your products."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <TextField label="Organization name" autoComplete="organization" hint="Your shop or business name." {...field("organizationName")} />
        <TextField label="Email" type="email" autoComplete="email" {...field("email")} />
        <PasswordField label="Password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." {...field("password")} />
        <PasswordField label="Confirm password" autoComplete="new-password" {...field("confirmPassword")} />
        <Button type="submit" className="w-full" loading={signup.isPending} loadingLabel="Creating account…">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
