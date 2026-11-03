import { ButtonLink } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <>
      <PageHeader title="Page not found" description="The address may be mistyped, or the page no longer exists." />
      <ButtonLink to="/" variant="secondary">
        Go to the dashboard
      </ButtonLink>
    </>
  );
}
