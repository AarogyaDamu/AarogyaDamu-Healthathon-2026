import type { FC } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export const ConfirmationModal: FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm Action',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white bg-surface-container-lowest p-6 shadow-2xl border border-outline-variant/30 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-headline font-bold text-on-surface">{title}</h3>
            <p className="mt-1 text-xs font-body text-on-surface-variant leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-label font-semibold text-on-surface-variant hover:bg-surface-container transition-all"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary to-primary-container px-4 py-1.5 text-xs font-label font-bold text-on-primary hover:opacity-95 shadow-md shadow-primary/20 transition-all"
          >
            <Check className="h-4 w-4" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};