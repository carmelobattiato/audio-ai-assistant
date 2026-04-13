
import React from 'react';
import { Button } from '../common/Button';
import { DownloadIcon, SaveIcon as CopyIcon, EditIcon as EditPencilIcon } from '../../constants';

interface LlmResultViewProps {
  title: string;
  content: string;
  onDownload: () => void;
  onCopy: () => void;
  onEdit: () => void;
  disabled: boolean;
  copyText: string;
}

export const LlmResultView: React.FC<LlmResultViewProps> = (props) => (
  <div className="space-y-2 mt-4 animate-fullscreen-fade-in">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <label className="text-sm font-medium text-gray-300">{props.title}:</label>
      <div className="flex gap-2">
        <Button onClick={props.onDownload} variant="ghost" size="sm" leftIcon={<DownloadIcon className="w-4 h-4"/>} disabled={props.disabled}>Download</Button>
        <Button onClick={props.onCopy} variant="ghost" size="sm" leftIcon={<CopyIcon className="w-4 h-4"/>} disabled={props.disabled}>{props.copyText}</Button>
        <Button onClick={props.onEdit} variant="ghost" size="sm" leftIcon={<EditPencilIcon className="w-4 h-4"/>} disabled={props.disabled}>Edit</Button>
      </div>
    </div>
    <div className="llm-result-display-prose scrollbar max-h-[500px]" dangerouslySetInnerHTML={{ __html: props.content }} />
  </div>
);
