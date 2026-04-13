
import React from 'react';
import { Button } from '../common/Button';
import { ExpandIcon, DocumentDuplicateIcon, TrashIcon } from '../../constants';

interface NoteActionsHeaderProps {
  isSelectMode: boolean;
  selectedCount: number;
  hasNotes: boolean;
  onToggleSelect: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onDeleteRequest: () => void;
  onCancelSelect: () => void;
}

export const NoteActionsHeader: React.FC<NoteActionsHeaderProps> = (props) => (
  <div className="flex justify-between items-center">
    <h4 className="text-md font-medium text-gray-300">Bubble Notes</h4>
    <div className="flex items-center gap-2">
      {props.isSelectMode ? (
        <>
          <Button variant="danger" size="sm" onClick={props.onDeleteRequest} disabled={props.selectedCount === 0} leftIcon={<TrashIcon className="w-4 h-4"/>}>Delete ({props.selectedCount})</Button>
          <Button variant="secondary" size="sm" onClick={props.onCancelSelect}>Cancel</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={props.onToggleSelect} disabled={!props.hasNotes}>Select</Button>
          <Button variant="ghost" size="sm" onClick={props.onFullscreen} disabled={!props.hasNotes} leftIcon={<ExpandIcon className="w-4 h-4"/>}>Fullscreen</Button>
          <Button variant="ghost" size="sm" onClick={props.onDownload} disabled={!props.hasNotes} leftIcon={<DocumentDuplicateIcon className="w-4 h-4"/>}>Download</Button>
        </>
      )}
    </div>
  </div>
);
