import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmButtonVariant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonVariant = 'danger',
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="text-gray-300">{children}</div>
      <div className="mt-6 flex justify-end gap-3">
        <Button onClick={onClose} variant="ghost">
          {cancelText}
        </Button>
        <Button onClick={onConfirm} variant={confirmButtonVariant}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
};