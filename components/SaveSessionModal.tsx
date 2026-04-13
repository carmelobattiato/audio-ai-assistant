import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Input } from './common/Input';

interface SaveSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sessionName: string) => void;
}

export const SaveSessionModal: React.FC<SaveSessionModalProps> = ({ isOpen, onClose, onSave }) => {
  const [sessionName, setSessionName] = useState('');

  useEffect(() => {
    if (isOpen) {
        // Reset state when modal opens
        setSessionName('');
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave(sessionName); // Pass the name, even if it's empty. Parent will handle default.
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Save Current Session"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={handleSave} variant="primary">Save</Button>
        </div>
      }
    >
      <Input
        label="Session Name (optional):"
        id="sessionName"
        value={sessionName}
        onChange={(e) => setSessionName(e.target.value)}
        placeholder="e.g., Q3 Project Meeting. Leave blank for a default name."
        autoFocus
      />
    </Modal>
  );
};