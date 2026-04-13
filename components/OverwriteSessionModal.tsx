import React, { useState } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { SavedSession } from '../types';

interface OverwriteSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onOverwrite: (sessionIdToOverwrite: string) => void;
  newSessionName: string;
}

export const OverwriteSessionModal: React.FC<OverwriteSessionModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onOverwrite,
  newSessionName,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const handleOverwrite = () => {
    if (selectedSessionId) {
      onOverwrite(selectedSessionId);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Overwrite Existing Session"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={handleOverwrite} variant="danger" disabled={!selectedSessionId}>
            Overwrite Selected
          </Button>
        </div>
      }
    >
      <p className="text-gray-300">
        You have reached the maximum of 3 saved sessions. To save "<strong className="text-sky-400">{newSessionName}</strong>", please select an existing session to overwrite.
      </p>
      <div className="space-y-2 mt-4">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => setSelectedSessionId(session.id)}
            className={`p-3 rounded-lg cursor-pointer border-2 transition-all ${
              selectedSessionId === session.id
                ? 'border-sky-500 bg-sky-900 bg-opacity-50'
                : 'border-transparent bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <p className="font-semibold">{session.name}</p>
            <p className="text-xs text-gray-400">
              Saved: {new Date(session.timestamp).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
};
