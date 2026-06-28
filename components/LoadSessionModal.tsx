
import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { ConfirmModal } from './common/ConfirmModal';
import { SavedSession, SessionStatus, BubbleNote } from '../types';
import { TrashIcon, EyeIcon, ArrowUpIcon } from '../constants'; // Using ArrowUp as 'Back' icon equivalent or just text
import { formatTime, htmlToPlainText } from '../utils/textUtils';

interface LoadSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onLoadSession: (sessionId: string) => void;
  onLoadAndRecord?: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartMerge: (sessionIds: [string, string]) => void;
  onExportSessionJson: (sessionId: string) => void;
  onImportSessionJson: (file: File) => void;
  initialViewSessionId?: string;
}

const StatusBadge: React.FC<{ status: SessionStatus }> = ({ status }) => {
    const colors = {
        'In Progress': 'bg-sky-900/40 text-sky-400 border-sky-800',
        'Success': 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
        'Failed': 'bg-red-900/40 text-red-400 border-red-800',
        'Interrupted': 'bg-amber-900/40 text-amber-400 border-amber-800',
    };
    return (
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${colors[status] || colors['In Progress']}`}>
            {status}
        </span>
    );
};

export const LoadSessionModal: React.FC<LoadSessionModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onLoadSession,
  onLoadAndRecord,
  onDeleteSession,
  onStartMerge,
  onExportSessionJson,
  onImportSessionJson,
  initialViewSessionId,
}) => {
  const [sessionToDelete, setSessionToDelete] = useState<SavedSession | null>(null);
  const [viewingSession, setViewingSession] = useState<SavedSession | null>(null);

  useEffect(() => {
    if (isOpen && initialViewSessionId) {
      const s = sessions.find(x => x.id === initialViewSessionId) ?? null;
      setViewingSession(s);
    }
    if (!isOpen) setViewingSession(null);
  }, [isOpen, initialViewSessionId, sessions]);
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedToMerge, setSelectedToMerge] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredSessions = searchQuery.trim()
    ? sessions.filter(s => {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q)
          || (s.data.transcribedText || '').toLowerCase().includes(q)
          || htmlToPlainText(s.data.llmProcessedText || '').toLowerCase().includes(q);
      })
    : sessions;

  const handleProceedToMerge = () => {
    if (selectedToMerge.length === 2) {
      onStartMerge([selectedToMerge[0]!, selectedToMerge[1]!]);
      setIsMergeMode(false);
      setSelectedToMerge([]);
    }
  };

  const renderSessionList = () => (
    <>
      <div className="mb-3">
        <input
          type="text"
          placeholder="Cerca in titolo, trascrizioni e analisi..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500"
        />
      </div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <p className="text-gray-400 text-sm">
          {isMergeMode ? `Select two sessions to merge (${selectedToMerge.length}/2).` : searchQuery.trim() ? `${filteredSessions.length} / ${sessions.length} sessioni` : `Manage your last ${sessions.length} sessions.`}
        </p>
        <div className="flex gap-2">
          {!isMergeMode && (
            <Button onClick={() => fileInputRef.current?.click()} variant="ghost" size="sm" leftIcon={<ArrowUpIcon className="w-4 h-4 rotate-180"/>}>
              Load External Session
            </Button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".json,application/json" 
            className="hidden" 
            onChange={(e) => e.target.files?.[0] && onImportSessionJson(e.target.files[0])} 
          />
          {isMergeMode && (
            <Button onClick={handleProceedToMerge} variant="primary" size="sm" disabled={selectedToMerge.length !== 2}>
              Proceed to Merge
            </Button>
          )}
          {sessions.length >= 2 && (
            <Button onClick={() => { setIsMergeMode(!isMergeMode); setSelectedToMerge([]); }} variant="secondary" size="sm">
              {isMergeMode ? 'Cancel Merge' : 'Merge Sessions'}
            </Button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No saved sessions found in this browser.</p>
      ) : filteredSessions.length === 0 ? (
        <p className="text-gray-400 text-center py-8">Nessuna sessione trovata per "{searchQuery}".</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-700 max-h-[60vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-700 bg-gray-800/50">
            <thead className="bg-gray-700/50 sticky top-0 z-10">
              <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Session Info</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Segs</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredSessions.map((session) => {
                const chunksCount = session.data.chunks?.length || 0;
                return (
                <tr 
                  key={session.id}
                  className={`hover:bg-gray-700/30 transition-colors ${isMergeMode ? 'cursor-pointer' : ''} ${selectedToMerge.includes(session.id) ? 'bg-blue-900/20' : ''}`}
                  onClick={() => isMergeMode && !selectedToMerge.includes(session.id) && selectedToMerge.length < 2 && setSelectedToMerge([...selectedToMerge, session.id])}
                >
                  <td className="px-4 py-3">
                      <p className="font-bold text-sky-400 text-sm truncate max-w-[150px]" title={session.name}>{session.name}</p>
                      <p className="text-[10px] text-gray-500">{new Date(session.timestamp).toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-3">
                      <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                      <span className="text-xs font-mono text-gray-300">{chunksCount}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-400">{session.totalSizeMb} MB</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                          <Button onClick={(e) => { e.stopPropagation(); onExportSessionJson(session.id); }} variant="ghost" size="sm" disabled={isMergeMode} title="Download JSON">
                              <ArrowUpIcon className="w-4 h-4" />
                          </Button>
                          <Button onClick={(e) => { e.stopPropagation(); setViewingSession(session); }} variant="secondary" size="sm" disabled={isMergeMode} title="View Details">
                              <EyeIcon className="w-4 h-4" />
                          </Button>
                          <Button onClick={(e) => { e.stopPropagation(); onLoadSession(session.id); }} variant="primary" size="sm" disabled={isMergeMode}>
                              Load
                          </Button>
                          {onLoadAndRecord && (
                            <Button onClick={(e) => { e.stopPropagation(); onLoadAndRecord(session.id); }} variant="secondary" size="sm" disabled={isMergeMode} title="Riprendi la sessione e avvia la registrazione senza resettare i dati">
                              Continue
                            </Button>
                          )}
                          <Button onClick={(e) => { e.stopPropagation(); setSessionToDelete(session); }} variant="ghost" size="sm" disabled={isMergeMode}>
                              <TrashIcon className="w-4 h-4 text-red-500" />
                          </Button>
                      </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const renderDetailView = (session: SavedSession) => {
    const { data } = session;
    const bubbleNotes = data.bubbleNotes || [];
    const transcriptionPreview = data.transcribedText ? htmlToPlainText(data.transcribedText).slice(0, 300) + '...' : 'No transcription available.';
    const llmPreview = data.llmProcessedText ? htmlToPlainText(data.llmProcessedText).slice(0, 300) + '...' : 'No AI analysis result.';
    
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
            <div>
                <h3 className="text-lg font-bold text-sky-400">{session.name}</h3>
                <p className="text-xs text-gray-400">{new Date(session.timestamp).toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
                <Button onClick={() => onExportSessionJson(session.id)} variant="ghost" size="sm" leftIcon={<ArrowUpIcon className="w-4 h-4"/>}>JSON</Button>
                <Button onClick={() => { onDeleteSession(session.id); setViewingSession(null); }} variant="danger" size="sm" leftIcon={<TrashIcon className="w-4 h-4"/>}>Delete</Button>
                <Button onClick={() => onLoadSession(session.id)} variant="primary" size="sm">Load Session</Button>
                {onLoadAndRecord && (
                  <Button onClick={() => onLoadAndRecord(session.id)} variant="secondary" size="sm" title="Riprendi la sessione e avvia la registrazione senza resettare i dati">Continue</Button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-700/50 p-3 rounded-lg border border-gray-600 text-center">
                <p className="text-xs text-gray-400 uppercase">Duration</p>
                <p className="text-xl font-mono text-white">{formatTime(data.audioDuration || 0)}</p>
            </div>
            <div className="bg-gray-700/50 p-3 rounded-lg border border-gray-600 text-center">
                <p className="text-xs text-gray-400 uppercase">Segments (Chunks)</p>
                <p className="text-xl font-mono text-white">{data.chunks?.length || 0}</p>
            </div>
            <div className="bg-gray-700/50 p-3 rounded-lg border border-gray-600 text-center">
                <p className="text-xs text-gray-400 uppercase">Total Size</p>
                <p className="text-xl font-mono text-white">{session.totalSizeMb} MB</p>
            </div>
        </div>

        <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <div className="bg-gray-700/50 px-4 py-2 border-b border-gray-600 flex justify-between items-center">
                    <h4 className="text-sm font-bold text-gray-200">Bubble Notes</h4>
                    <span className="text-xs bg-gray-600 px-2 py-0.5 rounded text-white">{bubbleNotes.length}</span>
                </div>
                <div className="max-h-40 overflow-y-auto p-4 space-y-2">
                    {bubbleNotes.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">No bubble notes recorded.</p>
                    ) : (
                        bubbleNotes.map((note: BubbleNote) => (
                            <div key={note.id} className="text-xs border-b border-gray-700 last:border-0 pb-2 mb-2">
                                <span className="font-mono text-sky-400 mr-2">[{formatTime(note.recordingElapsedTime)}]</span>
                                <span className="text-gray-300">{htmlToPlainText(note.contentHtml).slice(0, 80) || "(Image/Empty)"}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <div className="bg-gray-700/50 px-4 py-2 border-b border-gray-600">
                        <h4 className="text-sm font-bold text-gray-200">Transcription</h4>
                    </div>
                    <div className="p-3 text-xs text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                        {transcriptionPreview}
                    </div>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <div className="bg-gray-700/50 px-4 py-2 border-b border-gray-600 flex justify-between">
                        <h4 className="text-sm font-bold text-gray-200">LLM Result</h4>
                        {data.llmProcessingType && <span className="text-[10px] text-sky-300">{data.llmProcessingType}</span>}
                    </div>
                    <div className="p-3 text-xs text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                        {llmPreview}
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={viewingSession ? "Session Details" : "Session History (IndexedDB)"} maxWidth={viewingSession ? 'max-w-[90vw]' : 'max-w-4xl'} zIndex="z-[60]">
        {viewingSession ? (
            <div>
                <Button onClick={() => setViewingSession(null)} variant="ghost" size="sm" className="mb-2 text-gray-400 hover:text-white">
                    &larr; Back to List
                </Button>
                {renderDetailView(viewingSession)}
            </div>
        ) : renderSessionList()}
      </Modal>

      {sessionToDelete && (
        <ConfirmModal
          isOpen={!!sessionToDelete}
          onClose={() => setSessionToDelete(null)}
          onConfirm={() => { onDeleteSession(sessionToDelete.id); setSessionToDelete(null); }}
          title="Delete Session"
          confirmText="Delete"
        >
          <p>Delete session "<strong className="text-sky-400">{sessionToDelete.name}</strong>"?</p>
        </ConfirmModal>
      )}
    </>
  );
};
