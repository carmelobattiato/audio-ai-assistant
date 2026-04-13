
import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { TextArea } from './common/TextArea';

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (finalSystemInstruction: string, finalUserPrompt: string) => void;
  initialSystemInstruction: string;
  initialUserPrompt: string;
  isProcessing: boolean;
}

export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialSystemInstruction,
  initialUserPrompt,
  isProcessing,
}) => {
  const [systemInstruction, setSystemInstruction] = useState('');
  const [userPrompt, setUserPrompt] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSystemInstruction(initialSystemInstruction);
      setUserPrompt(initialUserPrompt);
    }
  }, [isOpen, initialSystemInstruction, initialUserPrompt]);

  const handleConfirm = () => {
    onConfirm(systemInstruction, userPrompt);
  };

  const modalFooter = (
    <div className="flex justify-end gap-2">
      <Button onClick={onClose} variant="ghost" disabled={isProcessing}>
        Cancel
      </Button>
      <Button onClick={handleConfirm} variant="primary" isLoading={isProcessing}>
        {isProcessing ? 'Processing...' : 'Confirm & Send to LLM'}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Review & Edit Prompt" footer={modalFooter}>
      <div className="space-y-4">
        <TextArea
          label="System Instruction (AI Role):"
          id="systemInstructionEditor"
          value={systemInstruction}
          onChange={(e) => setSystemInstruction(e.target.value)}
          rows={4}
          disabled={isProcessing}
        />
        <TextArea
          label="Main Prompt (Context & Task):"
          id="userPromptEditor"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          rows={15}
          disabled={isProcessing}
        />
      </div>
    </Modal>
  );
};
