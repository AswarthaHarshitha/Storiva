import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../api/client";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { PasswordField } from "../components/PasswordField";
import { TextField } from "../components/TextField";
import { useLogin } from "../hooks/useAccount";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useForm } from "../hooks/useForm";
import { loginSchema } from "../lib/validation";

export function LoginPage() {
  useDocumentTitle("Log in");
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const form = useForm(loginSchema, { email: "", password: "" });

  // Return people to the page they were sent away from, defaulting to the dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = form.handleSubmit((values, showServerErrors) => {
    if (login.isPending) return;
    login.mutate(values, {
      onSuccess: () => void navigate(from, { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 422) showServerErrors(error.fields);
      },
    });
  });

  const failure = login.error instanceof ApiError && login.error.status === 422 ? null : login.error;

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Enter the email and password you signed up with."
      footer={
        <>
          New to Storiva?{" "}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {failure && <Alert>{errorMessage(failure)}</Alert>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.values.email}
          onValueChange={(v) => form.setValue("email", v)}
          onBlur={() => form.touch("email")}
          error={form.errors.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={form.values.password}
          onValueChange={(v) => form.setValue("password", v)}
          onBlur={() => form.touch("password")}
          error={form.errors.password}
        />
        <Button type="submit" className="w-full" loading={login.isPending} loadingLabel="Logging in…">
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
