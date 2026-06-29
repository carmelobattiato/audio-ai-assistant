import React from 'react';
import { Paperclip, Camera, Timer, Video, Square, CornerDownLeft } from 'lucide-react';

interface NoteStaticToolbarProps {
  isEditorEditable: boolean;
  isScreenSharing: boolean;
  isVideoRecording: boolean;
  videoChunkCount: number;
  isAutoScreenshotOn: boolean;
  countdown: number;
  currentInterval: number;
  parsingMessage: string | null;
  onFileUploadClick: () => void;
  onTakeScreenshot: () => void;
  onToggleAutoScreenshot: () => void;
  onAdjustTiming: (amount: number) => void;
  onStartVideo: () => void;
  onStopVideo: () => void;
  onAddNote: () => void;
}

const IconBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, disabled, title, active, children, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'bg-violet-600/30 text-violet-300'
        : 'text-gray-400 hover:text-white hover:bg-white/8'
    } ${className}`}
  >
    {children}
  </button>
);

export const NoteStaticToolbar: React.FC<NoteStaticToolbarProps> = (props) => (
  <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/8 bg-gray-900/40">
    {/* Left: file ops */}
    <IconBtn onClick={props.onFileUploadClick} disabled={!props.isEditorEditable} title="Attach file (Img, PDF, DOCX, PPTX, HTML, TXT)">
      <Paperclip size={15} />
    </IconBtn>

    <IconBtn onClick={props.onTakeScreenshot} disabled={!props.isEditorEditable} title="Take screenshot">
      <Camera size={15} />
    </IconBtn>

    {/* Auto screenshot */}
    <div className="flex items-center">
      <IconBtn
        onClick={props.onToggleAutoScreenshot}
        active={props.isAutoScreenshotOn}
        title={props.isAutoScreenshotOn ? 'Disable auto-screenshot' : 'Enable auto-screenshot'}
      >
        <Timer size={15} />
        <span className="text-xs font-mono">
          {props.isAutoScreenshotOn ? `${props.countdown}s` : 'Auto'}
        </span>
      </IconBtn>
      {props.isAutoScreenshotOn && (
        <>
          <button
            onClick={() => props.onAdjustTiming(-10)}
            className="px-1 text-gray-400 hover:text-white text-xs"
            title="-10s"
          >−</button>
          <button
            onClick={() => props.onAdjustTiming(10)}
            className="px-1 text-gray-400 hover:text-white text-xs"
            title="+10s"
          >+</button>
        </>
      )}
    </div>

    {/* Video recording */}
    {props.isVideoRecording ? (
      <IconBtn onClick={props.onStopVideo} title={`Stop video (${props.videoChunkCount} chunks saved)`} className="text-red-400 hover:text-red-300">
        <Square size={15} className="fill-current" />
        <span className="text-xs font-mono">{props.videoChunkCount}</span>
      </IconBtn>
    ) : (
      <IconBtn
        onClick={props.onStartVideo}
        disabled={!props.isScreenSharing}
        title={props.isScreenSharing ? 'Start screen recording (saves WebM chunks to Downloads)' : 'Start screen sharing first to enable video recording'}
      >
        <Video size={15} />
      </IconBtn>
    )}

    {/* Parsing status */}
    {props.parsingMessage && (
      <span className="text-xs text-violet-400 ml-1 truncate max-w-[120px]">{props.parsingMessage}</span>
    )}

    {/* Spacer + save hint */}
    <div className="flex-1" />
    <button
      onClick={props.onAddNote}
      disabled={!props.isEditorEditable}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
      title="Save note (Enter)"
    >
      <CornerDownLeft size={13} />
    </button>
  </div>
);
