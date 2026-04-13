
import React from 'react';
import { Select } from '../common/Select';
import { TextArea } from '../common/TextArea';
import { Button } from '../common/Button';

interface LlmControlsProps {
  options: { value: string; label: string }[];
  selectedKey: string;
  onKeyChange: (key: string) => void;
  customContext: string;
  onContextChange: (ctx: string) => void;
  onProcess: () => void;
  isProcessing: boolean;
  isDisabled: boolean;
}

export const LlmControls: React.FC<LlmControlsProps> = (props) => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <div className="sm:col-span-2">
        <Select label="Action:" options={props.options} value={props.selectedKey} onChange={(e) => props.onKeyChange(e.target.value)} disabled={props.isProcessing || props.isDisabled} />
      </div>
      <Button onClick={props.onProcess} disabled={props.isProcessing || props.isDisabled} isGlowing={props.isProcessing} className="w-full">
        {props.isProcessing ? "Processing..." : "Process Text"}
      </Button>
    </div>
    <TextArea label="Custom Instructions:" value={props.customContext} onChange={(e) => props.onContextChange(e.target.value)} placeholder="e.g., Use a formal tone..." disabled={props.isProcessing || props.isDisabled} rows={2} />
  </div>
);
