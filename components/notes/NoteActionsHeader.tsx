import React from 'react';
import { CheckSquare, Maximize2, Download, Trash2, X, Video } from 'lucide-react';

interface NoteActionsHeaderProps {
  isSelectMode: boolean;
  selectedCount: number;
  hasNotes: boolean;
  isVideoRecording: boolean;
  videoChunkCount: number;
  onToggleSelect: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onDeleteRequest: () => void;
  onCancelSelect: () => void;
}

const HeaderBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}> = ({ onClick, disabled, children, variant = 'default' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      variant === 'danger'
        ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300'
        : 'text-gray-400 hover:bg-white/8 hover:text-gray-200'
    }`}
  >
    {children}
  </button>
);

export const NoteActionsHeader: React.FC<NoteActionsHeaderProps> = (props) => (
  <div className="flex items-center justify-between px-1 py-1 min-h-[36px]">
    <div className="flex items-center gap-2">
      <h4 className="text-sm font-medium text-gray-400 select-none">Notes</h4>
      {props.isVideoRecording && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-xs animate-pulse">
          <Video size={11} />
          REC {props.videoChunkCount > 0 && `· ${props.videoChunkCount}`}
        </span>
      )}
    </div>
    <div className="flex items-center gap-0.5">
      {props.isSelectMode ? (
        <>
          <HeaderBtn variant="danger" onClick={props.onDeleteRequest} disabled={props.selectedCount === 0}>
            <Trash2 size={13} /> Delete ({props.selectedCount})
          </HeaderBtn>
          <HeaderBtn onClick={props.onCancelSelect}>
            <X size={13} /> Cancel
          </HeaderBtn>
        </>
      ) : (
        <>
          <HeaderBtn onClick={props.onToggleSelect} disabled={!props.hasNotes}>
            <CheckSquare size={13} /> Select
          </HeaderBtn>
          <HeaderBtn onClick={props.onFullscreen} disabled={!props.hasNotes}>
            <Maximize2 size={13} />
          </HeaderBtn>
          <HeaderBtn onClick={props.onDownload} disabled={!props.hasNotes}>
            <Download size={13} />
          </HeaderBtn>
        </>
      )}
    </div>
  </div>
);
