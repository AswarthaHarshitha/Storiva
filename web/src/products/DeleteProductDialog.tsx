import { errorMessage } from "../api/client";
import type { Product } from "../api/types";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { useDeleteProduct } from "../hooks/useInventory";
import { pluralize } from "../lib/format";

interface DeleteProductDialogProps {
  product: Pick<Product, "id" | "name" | "sku" | "quantityOnHand"> | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteProductDialog({ product, onClose, onDeleted }: DeleteProductDialogProps) {
  const remove = useDeleteProduct();
  const toast = useToast();

  const close = () => {
    remove.reset();
    onClose();
  };

  const confirm = () => {
    if (!product || remove.isPending) return;
    remove.mutate(product.id, {
      onSuccess: () => {
        toast(`${product.name} was deleted.`);
        remove.reset();
        onClose();
        onDeleted?.();
      },
    });
  };

  return (
    <Dialog open={product !== null} onClose={close} title="Delete this product?">
      {product && (
        <div className="mt-3 space-y-4">
          <div className="rounded-md border border-line bg-canvas px-4 py-3">
            <p className="font-medium text-ink">{product.name}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              <span className="font-mono text-xs">{product.sku}</span> · {pluralize(product.quantityOnHand, "unit")} on hand
            </p>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            {product.quantityOnHand > 0 && <>Its stock count of {pluralize(product.quantityOnHand, "unit")} will be lost. </>}
            Deleting is permanent and can't be undone.
          </p>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={remove.isPending} autoFocus>
              Keep product
            </Button>
            <Button variant="danger" onClick={confirm} loading={remove.isPending} loadingLabel="Deleting…">
              Delete product
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
