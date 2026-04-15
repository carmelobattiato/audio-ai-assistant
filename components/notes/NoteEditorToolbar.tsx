
import React from 'react';
import { 
  FormatBoldIcon, FormatItalicIcon, FormatUnderlinedIcon, 
  FormatListBulletedIcon, FormatListNumberedIcon, UploadIcon, CameraIcon, MinusIcon, PlusIcon, DownloadIcon 
} from '../../constants';

interface NoteEditorToolbarProps {
  isEditorEditable: boolean;
  isRecordingSessionActive: boolean;
  activeFormats: Record<string, boolean>;
  applyFormat: (cmd: string) => void;
  onFileUploadClick: () => void;
  onDownloadPendingClick: () => void;
  onTakeScreenshot: (auto: boolean) => void;
  isAutoScreenshotOn: boolean;
  toggleAutoScreenshot: () => void;
  isScreenSharing: boolean;
  countdown: number;
  currentInterval: number;
  adjustTiming: (amt: number) => void;
}

export const NoteEditorToolbar: React.FC<NoteEditorToolbarProps> = (props) => (
  <div className="simple-editor-toolbar flex-wrap">
    <div className="flex gap-1">
      <ToolbarBtn icon={<FormatBoldIcon className="w-5 h-5"/>} onClick={() => props.applyFormat('bold')} active={props.activeFormats['bold']} disabled={!props.isEditorEditable} />
      <ToolbarBtn icon={<FormatItalicIcon className="w-5 h-5"/>} onClick={() => props.applyFormat('italic')} active={props.activeFormats['italic']} disabled={!props.isEditorEditable} />
      <ToolbarBtn icon={<FormatUnderlinedIcon className="w-5 h-5"/>} onClick={() => props.applyFormat('underline')} active={props.activeFormats['underline']} disabled={!props.isEditorEditable} />
      <ToolbarBtn icon={<FormatListBulletedIcon className="w-5 h-5"/>} onClick={() => props.applyFormat('insertUnorderedList')} active={props.activeFormats['insertUnorderedList']} disabled={!props.isEditorEditable} />
      <ToolbarBtn icon={<FormatListNumberedIcon className="w-5 h-5"/>} onClick={() => props.applyFormat('insertOrderedList')} active={props.activeFormats['insertOrderedList']} disabled={!props.isEditorEditable} />
    </div>
    <div className="flex-grow"></div>
    <div className="flex items-center gap-2">
      <button onClick={props.onFileUploadClick} disabled={!props.isEditorEditable} className="p-1.5 text-gray-300 hover:text-white disabled:text-gray-500" title="Upload Image/Text/Doc"><UploadIcon className="w-5 h-5" /></button>
      <button onClick={props.onDownloadPendingClick} disabled={!props.isEditorEditable} className="p-1.5 text-gray-300 hover:text-white disabled:text-gray-500" title="Download Current Content"><DownloadIcon className="w-5 h-5" /></button>
      <button onClick={() => props.onTakeScreenshot(false)} disabled={!props.isEditorEditable} className="p-1.5 text-gray-300 hover:text-white disabled:text-gray-500" title="Take Screenshot"><CameraIcon className="w-5 h-5" /></button>
      <div className="h-6 border-l border-gray-600"></div>
      <button onClick={props.toggleAutoScreenshot} disabled={!props.isEditorEditable} className={`px-2 py-1 text-xs rounded ${props.isAutoScreenshotOn ? 'bg-cyan-600 text-white' : 'bg-gray-600 text-gray-300'}`}>Auto-Shot: {props.isAutoScreenshotOn ? 'On' : 'Off'}</button>
      {props.isAutoScreenshotOn && (
        <div className="flex items-center gap-1.5 text-xs text-cyan-300">
          <span>{props.countdown}s</span>
          <div className="flex items-center bg-gray-700 rounded-full px-1">
            <button onClick={() => props.adjustTiming(-30)} className="p-0.5"><MinusIcon className="w-3 h-3"/></button>
            <span className="mx-1 text-[10px]">{props.currentInterval}s</span>
            <button onClick={() => props.adjustTiming(30)} className="p-0.5"><PlusIcon className="w-3 h-3"/></button>
          </div>
        </div>
      )}
    </div>
  </div>
);

const ToolbarBtn = ({ icon, onClick, active, disabled }: any) => (
  <button onClick={onClick} disabled={disabled} className={`p-1.5 rounded transition-colors ${active ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-300'}`}>{icon}</button>
);
