
import React, { useState } from 'react';
import { CustomInstruction } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { TextArea } from '../common/TextArea';

interface CustomInstructionsTabProps {
  instructions: CustomInstruction[];
  onChange: (instructions: CustomInstruction[]) => void;
}

type EditState = { mode: 'add' } | { mode: 'edit'; id: string };

const emptyDraft = () => ({ name: '', text: '' });

export const CustomInstructionsTab: React.FC<CustomInstructionsTabProps> = ({ instructions, onChange }) => {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [draft, setDraft] = useState(emptyDraft());

  const startAdd = () => {
    setDraft(emptyDraft());
    setEditState({ mode: 'add' });
  };

  const startEdit = (rule: CustomInstruction) => {
    setDraft({ name: rule.name, text: rule.text });
    setEditState({ mode: 'edit', id: rule.id });
  };

  const cancel = () => {
    setEditState(null);
    setDraft(emptyDraft());
  };

  const save = () => {
    if (!draft.name.trim() || !draft.text.trim()) return;
    if (editState?.mode === 'add') {
      const newRule: CustomInstruction = {
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        text: draft.text.trim(),
        enabled: true,
      };
      onChange([...instructions, newRule]);
    } else if (editState?.mode === 'edit') {
      onChange(instructions.map(r =>
        r.id === editState.id ? { ...r, name: draft.name.trim(), text: draft.text.trim() } : r
      ));
    }
    cancel();
  };

  const toggleEnabled = (id: string) => {
    onChange(instructions.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    onChange(instructions.filter(r => r.id !== id));
    if (editState?.mode === 'edit' && editState.id === id) cancel();
  };

  const isFormOpen = editState !== null;

  return (
    <div className="space-y-4">
      <div className="p-3 bg-gray-700 bg-opacity-50 rounded-md border border-gray-600">
        <p className="text-sm text-gray-300 leading-relaxed">
          Add custom rules that will be included in every AI Analysis prompt.
          Use them for terminology corrections (e.g. <span className="font-mono text-sky-400 text-xs">"when you read T&amp;D replace it with T&amp;A"</span>),
          style instructions, or any other repeated directive.
        </p>
      </div>

      {instructions.length === 0 && !isFormOpen && (
        <p className="text-sm text-gray-500 text-center py-4">
          No custom rules yet. Click "Add rule" to get started.
        </p>
      )}

      <div className="space-y-2">
        {instructions.map(rule => {
          const isBeingEdited = editState?.mode === 'edit' && editState.id === rule.id;
          return (
            <div
              key={rule.id}
              className={`rounded-md border transition-colors ${
                isBeingEdited
                  ? 'border-sky-500 bg-gray-700'
                  : rule.enabled
                  ? 'border-gray-600 bg-gray-800'
                  : 'border-gray-700 bg-gray-800 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggleEnabled(rule.id)}
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer flex-shrink-0"
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${rule.enabled ? 'text-gray-100' : 'text-gray-400'}`}>
                    {rule.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{rule.text}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(rule)}
                    className="p-1.5 text-gray-400 hover:text-sky-400 hover:bg-gray-700 rounded transition-colors"
                    title="Edit rule"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                    title="Delete rule"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isFormOpen && (
        <div className="p-4 bg-gray-700 rounded-md border border-sky-600 space-y-3">
          <p className="text-sm font-semibold text-sky-400">
            {editState?.mode === 'add' ? 'New rule' : 'Edit rule'}
          </p>
          <Input
            label="Rule name:"
            id="ruleNameInput"
            value={draft.name}
            onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="E.g. Fix T&D → T&A"
          />
          <TextArea
            label="Instruction for the AI:"
            id="ruleTextInput"
            value={draft.text}
            onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))}
            placeholder="E.g. When the transcription contains 'T&D', always replace it with 'T&A' in the output."
            rows={4}
          />
          <div className="flex gap-2 justify-end">
            <Button onClick={cancel} variant="ghost" size="sm">Cancel</Button>
            <Button
              onClick={save}
              variant="primary"
              size="sm"
              disabled={!draft.name.trim() || !draft.text.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {!isFormOpen && (
        <Button onClick={startAdd} variant="secondary" size="sm">
          + Add rule
        </Button>
      )}

      {instructions.filter(r => r.enabled).length > 0 && (
        <p className="text-xs text-gray-500">
          {instructions.filter(r => r.enabled).length} active rule{instructions.filter(r => r.enabled).length === 1 ? '' : 's'} — automatically applied to every AI Analysis prompt.
        </p>
      )}
    </div>
  );
};
