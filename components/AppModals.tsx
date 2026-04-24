
import React from 'react';
import { SettingsPanel } from './SettingsPanel';
import { StatisticsModal } from './StatisticsModal';
import { LoadSessionModal } from './LoadSessionModal';
import { BubbleNoteViewerModal } from './BubbleNoteViewerModal';
import { ConfirmModal } from './common/ConfirmModal';
import { AppSettings, BubbleNote, SavedSession } from '../types';

interface AppModalsProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  appSettings: AppSettings;
  handleSettingsChange: (s: AppSettings) => void;
  isStatisticsModalOpen: boolean;
  setIsStatisticsModalOpen: (v: boolean) => void;
  appStatistics: any;
  coherenceAssessment: any;
  coherenceStatus: any;
  showLoadSessionModal: boolean;
  setShowLoadSessionModal: (v: boolean) => void;
  savedSessions: SavedSession[];
  handleLoadSession: (id: string) => void;
  handleDeleteSession: (id: string) => void;
  handleExportSessionJson: (id: string) => void;
  handleImportSessionJson: (file: File) => void;
  showLoadChunksModal: boolean;
  setShowLoadChunksModal: (v: boolean) => void;
  recordingChunksCount: number;
  handleLoadChunksToQueue: () => void;
  viewingBubbleNote: BubbleNote | null;
  handleCloseBubbleNoteViewer: () => void;
  handleUpdateBubbleNote: (n: BubbleNote) => void;
  handleDeleteBubbleNote: (id: string) => void;
  handleGenerateSummaryForBubble: (n: BubbleNote) => Promise<string | null>;
  handleAssessCoherence: () => Promise<void>;
}

export const AppModals: React.FC<AppModalsProps> = (props) => (
  <>
    <SettingsPanel
      isOpen={props.isSettingsOpen}
      onClose={() => props.setIsSettingsOpen(false)}
      settings={props.appSettings}
      onSettingsChange={props.handleSettingsChange}
    />

    <StatisticsModal
      isOpen={props.isStatisticsModalOpen}
      onClose={() => props.setIsStatisticsModalOpen(false)}
      stats={props.appStatistics}
      onAssessCoherence={props.handleAssessCoherence}
      coherenceAssessmentText={props.coherenceAssessment}
      coherenceStatus={props.coherenceStatus}
    />

    <LoadSessionModal
      isOpen={props.showLoadSessionModal}
      onClose={() => props.setShowLoadSessionModal(false)}
      sessions={props.savedSessions}
      onLoadSession={props.handleLoadSession}
      onDeleteSession={props.handleDeleteSession}
      onExportSessionJson={props.handleExportSessionJson}
      onImportSessionJson={props.handleImportSessionJson}
      onStartMerge={() => {}}
    />

    <ConfirmModal
      isOpen={props.showLoadChunksModal}
      onClose={() => props.setShowLoadChunksModal(false)}
      onConfirm={props.handleLoadChunksToQueue}
      title="Load Segments"
      confirmText="Load"
    >
      <p>Load {props.recordingChunksCount} segments into queue?</p>
    </ConfirmModal>

    <BubbleNoteViewerModal
      isOpen={!!props.viewingBubbleNote}
      onClose={props.handleCloseBubbleNoteViewer}
      note={props.viewingBubbleNote}
      onSave={props.handleUpdateBubbleNote}
      onDelete={props.handleDeleteBubbleNote}
      onGenerateSummary={props.handleGenerateSummaryForBubble}
      llmSettings={props.appSettings.llm}
    />
  </>
);
