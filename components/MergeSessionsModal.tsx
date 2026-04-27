import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { SavedSession } from '../types';

interface MergeSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmMerge: (session1Id: string, session2Id: string, newName: string) => void;
  sessionsToMerge: SavedSession[]; // Array of two sessions
}

export const MergeSessionsModal: React.FC<MergeSessionsModalProps> = ({
  isOpen,
  onClose,
  onConfirmMerge,
  sessionsToMerge,
}) => {
  const [part1, setPart1] = useState<SavedSession | null>(null);
  const [part2, setPart2] = useState<SavedSession | null>(null);
  const [newSessionName, setNewSessionName] = useState('');

  useEffect(() => {
    if (isOpen && sessionsToMerge.length === 2) {
      setPart1(sessionsToMerge[0] ?? null);
      setPart2(sessionsToMerge[1] ?? null);
      setNewSessionName(`Merged: ${sessionsToMerge[0]?.name} & ${sessionsToMerge[1]?.name}`);
    } else {
      setPart1(null);
      setPart2(null);
      setNewSessionName('');
    }
  }, [isOpen, sessionsToMerge]);
  
  const handleSwap = () => {
    setPart1(part2);
    setPart2(part1);
  };

  const handleConfirm = () => {
    if (part1 && part2 && newSessionName.trim()) {
      onConfirmMerge(part1.id, part2.id, newSessionName.trim());
    }
  };

  if (!isOpen || !part1 || !part2) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Sessions"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={handleConfirm} variant="primary" disabled={!newSessionName.trim()}>Confirm Merge</Button>
        </div>
      }
    >
      <div className="space-y-4 text-gray-300">
        <p>You are about to merge two sessions. The audio and notes from Part 2 will be appended to Part 1. Please confirm the order and provide a name for the new session.</p>

        <div className="flex items-center justify-center gap-4 my-4">
            <div className="p-3 bg-gray-700 rounded-lg text-center flex-1">
                <p className="text-xs text-gray-400">Part 1 (Base)</p>
                <p className="font-semibold text-sky-400">{part1.name}</p>
            </div>
            <Button onClick={handleSwap} variant="secondary" size="sm" title="Swap Order">
                &#8596;
            </Button>
            <div className="p-3 bg-gray-700 rounded-lg text-center flex-1">
                <p className="text-xs text-gray-400">Part 2 (Append)</p>
                <p className="font-semibold text-sky-400">{part2.name}</p>
            </div>
        </div>
        
        <Input
          label="New Merged Session Name:"
          id="newMergedSessionName"
          value={newSessionName}
          onChange={(e) => setNewSessionName(e.target.value)}
          required
        />
      </div>
    </Modal>
  );
};
