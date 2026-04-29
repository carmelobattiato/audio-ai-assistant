import React, { useState } from 'react';
import { SystemPrompt } from '../../types';

interface SystemPromptsTabProps {
  prompts: SystemPrompt[];
  onChange: (prompts: SystemPrompt[]) => void;
}

const CATEGORY_LABELS: Record<SystemPrompt['category'], string> = {
  transcription: 'Transcription',
  analysis: 'AI Analysis',
  system: 'System Role',
};

const CATEGORY_ORDER: SystemPrompt['category'][] = ['transcription', 'system', 'analysis'];

const PLACEHOLDERS = [
  { key: '{{LANGUAGE}}', desc: 'Selected transcription language (e.g. Italian)' },
  { key: '{{DATE}}', desc: 'Formatted meeting date' },
  { key: '{{DIARIZATION}}', desc: 'Speaker diarization instructions (transcription only)' },
  { key: '{{EXTRA}}', desc: 'Additional custom context / user instructions' },
];

export const SystemPromptsTab: React.FC<SystemPromptsTabProps> = ({ prompts, onChange }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({});
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  const handleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    const p = prompts.find(x => x.id === id);
    if (p && !(id in editingTexts)) {
      setEditingTexts(prev => ({ ...prev, [id]: p.text }));
    }
  };

  const handleTextChange = (id: string, value: string) => {
    setEditingTexts(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = (id: string) => {
    const newText = editingTexts[id];
    if (newText === undefined) return;
    onChange(prompts.map(p => p.id === id ? { ...p, text: newText } : p));
    setExpandedId(null);
  };

  const handleRestore = (id: string) => {
    const p = prompts.find(x => x.id === id);
    if (!p) return;
    setEditingTexts(prev => ({ ...prev, [id]: p.defaultText }));
    onChange(prompts.map(x => x.id === id ? { ...x, text: x.defaultText } : x));
  };

  const isModified = (p: SystemPrompt) => p.text !== p.defaultText;

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: prompts.filter(p => p.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="flex gap-3 p-3 rounded-lg border"
        style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.35)' }}>
        <span className="text-lg flex-shrink-0">⚠️</span>
        <div className="text-xs leading-relaxed" style={{ color: '#FCA5A5' }}>
          <strong>Warning:</strong> Editing system prompts can deeply compromise application behaviour — incorrect prompts may cause transcription failures, wrong output formats, or broken pipeline steps. Always use <strong>Restore Default</strong> if something stops working. Original defaults are always preserved and cannot be deleted.
        </div>
      </div>

      {/* Placeholders reference */}
      <div>
        <button
          className="text-xs flex items-center gap-1.5 transition-opacity hover:opacity-80"
          style={{ color: '#A78BFA' }}
          onClick={() => setShowPlaceholders(v => !v)}
        >
          <span>{showPlaceholders ? '▾' : '▸'}</span> Available placeholders
        </button>
        {showPlaceholders && (
          <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--neo-border)' }}>
            {PLACEHOLDERS.map(ph => (
              <div key={ph.key} className="flex gap-3 items-center px-3 py-1.5 border-b last:border-b-0 text-xs"
                style={{ borderColor: 'var(--neo-border)', background: 'rgba(124,58,237,0.06)' }}>
                <code className="font-mono flex-shrink-0" style={{ color: '#C4B5FD', fontSize: '11px' }}>{ph.key}</code>
                <span style={{ color: 'var(--neo-muted)' }}>{ph.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grouped prompt list */}
      {grouped.map(({ cat, items }) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--neo-muted)' }}>
            {CATEGORY_LABELS[cat]}
          </h4>
          <div className="space-y-2">
            {items.map(p => {
              const isOpen = expandedId === p.id;
              const modified = isModified(p);
              const editText = editingTexts[p.id] ?? p.text;
              return (
                <div key={p.id} className="rounded-lg border overflow-hidden"
                  style={{ borderColor: modified ? 'rgba(245,158,11,0.4)' : 'var(--neo-border)', background: 'var(--neo-card)' }}>
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-all hover:brightness-110"
                    onClick={() => handleExpand(p.id)}
                  >
                    <span className="flex-1 text-sm font-medium" style={{ color: 'var(--neo-text)' }}>{p.name}</span>
                    {modified && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }}>
                        modified
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--neo-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--neo-border)' }}>
                      <p className="text-xs pt-2" style={{ color: 'var(--neo-muted)' }}>{p.description}</p>
                      <textarea
                        value={editText}
                        onChange={e => handleTextChange(p.id, e.target.value)}
                        rows={10}
                        spellCheck={false}
                        className="w-full text-xs font-mono rounded-lg p-2.5 resize-y focus:outline-none focus:ring-1"
                        style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--neo-border)',
                          color: 'var(--neo-text)',
                          lineHeight: '1.55',
                        }}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleRestore(p.id)}
                          className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
                          title="Restore the original default prompt (cannot be undone)"
                        >
                          ↺ Restore Default
                        </button>
                        <button
                          onClick={() => { setExpandedId(null); setEditingTexts(prev => ({ ...prev, [p.id]: p.text })); }}
                          className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--neo-border)', color: 'var(--neo-muted)' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSave(p.id)}
                          className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                          style={{ background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(139,92,246,0.5)', color: '#C4B5FD' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
