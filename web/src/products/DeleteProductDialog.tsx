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
    if (!product) return;
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
    <Dialog open={product !== null} onClose={close} title={product ? `Delete ${product.name}?` : ""}>
      {product && (
        <div className="mt-2 space-y-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            This permanently removes <span className="font-medium text-ink">{product.name}</span> (SKU{" "}
            <span className="font-mono text-xs">{product.sku}</span>) and its stock count of{" "}
            {pluralize(product.quantityOnHand, "unit")}. It can't be undone.
          </p>
          {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={remove.isPending} autoFocus>
              Cancel
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
