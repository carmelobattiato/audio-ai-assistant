import React, { createContext, useContext, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface StartChoiceModal {
  resolve: (mode: 'new' | 'append' | 'cancel') => void;
}

interface UIState {
  isSettingsOpen: boolean;
  settingsInitialTab: string | undefined;
  isStatisticsModalOpen: boolean;
  showLoadSessionModal: boolean;
  sessionToPreview: string | undefined;
  showLoadChunksModal: boolean;
  startChoiceModal: StartChoiceModal | null;
  viewingBubbleNoteId: string | null;
  isBusy: boolean;
  appUserMessage: string | null;
  isCalendarOpen: boolean;
  isNewCalendarOpen: boolean;
  activeRightTab: string;
  leftWidthPct: number;
}

interface UIStateCtxValue extends UIState {
  setIsSettingsOpen: (v: boolean) => void;
  setSettingsInitialTab: (v: string | undefined) => void;
  setIsStatisticsModalOpen: (v: boolean) => void;
  setShowLoadSessionModal: (v: boolean) => void;
  setSessionToPreview: (v: string | undefined) => void;
  setShowLoadChunksModal: (v: boolean) => void;
  setStartChoiceModal: (v: StartChoiceModal | null) => void;
  setViewingBubbleNoteId: (v: string | null) => void;
  setIsBusy: (v: boolean) => void;
  setAppUserMessage: (v: string | null) => void;
  setIsCalendarOpen: (v: boolean) => void;
  setIsNewCalendarOpen: (v: boolean) => void;
  setActiveRightTab: (v: string) => void;
  setLeftWidthPct: (v: number) => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const UIStateContext = createContext<UIStateCtxValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function UIStateProvider({ children }: { children: React.ReactNode }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [isStatisticsModalOpen, setIsStatisticsModalOpen] = useState(false);
  const [showLoadSessionModal, setShowLoadSessionModal] = useState(false);
  const [sessionToPreview, setSessionToPreview] = useState<string | undefined>(undefined);
  const [showLoadChunksModal, setShowLoadChunksModal] = useState(false);
  const [startChoiceModal, setStartChoiceModal] = useState<StartChoiceModal | null>(null);
  const [viewingBubbleNoteId, setViewingBubbleNoteId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [appUserMessage, setAppUserMessage] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isNewCalendarOpen, setIsNewCalendarOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<string>('notes');
  const [leftWidthPct, setLeftWidthPct] = useState<number>(28);

  const stableSetIsSettingsOpen = useCallback((v: boolean) => setIsSettingsOpen(v), []);
  const stableSetSettingsInitialTab = useCallback((v: string | undefined) => setSettingsInitialTab(v), []);
  const stableSetIsStatisticsModalOpen = useCallback((v: boolean) => setIsStatisticsModalOpen(v), []);
  const stableSetShowLoadSessionModal = useCallback((v: boolean) => setShowLoadSessionModal(v), []);
  const stableSetSessionToPreview = useCallback((v: string | undefined) => setSessionToPreview(v), []);
  const stableSetShowLoadChunksModal = useCallback((v: boolean) => setShowLoadChunksModal(v), []);
  const stableSetStartChoiceModal = useCallback((v: StartChoiceModal | null) => setStartChoiceModal(v), []);
  const stableSetViewingBubbleNoteId = useCallback((v: string | null) => setViewingBubbleNoteId(v), []);
  const stableSetIsBusy = useCallback((v: boolean) => setIsBusy(v), []);
  const stableSetAppUserMessage = useCallback((v: string | null) => setAppUserMessage(v), []);
  const stableSetIsCalendarOpen = useCallback((v: boolean) => setIsCalendarOpen(v), []);
  const stableSetIsNewCalendarOpen = useCallback((v: boolean) => setIsNewCalendarOpen(v), []);
  const stableSetActiveRightTab = useCallback((v: string) => setActiveRightTab(v), []);
  const stableSetLeftWidthPct = useCallback((v: number) => setLeftWidthPct(v), []);

  return (
    <UIStateContext.Provider value={{
      isSettingsOpen, settingsInitialTab, isStatisticsModalOpen,
      showLoadSessionModal, sessionToPreview, showLoadChunksModal,
      startChoiceModal, viewingBubbleNoteId, isBusy, appUserMessage,
      isCalendarOpen, isNewCalendarOpen, activeRightTab, leftWidthPct,
      setIsSettingsOpen: stableSetIsSettingsOpen,
      setSettingsInitialTab: stableSetSettingsInitialTab,
      setIsStatisticsModalOpen: stableSetIsStatisticsModalOpen,
      setShowLoadSessionModal: stableSetShowLoadSessionModal,
      setSessionToPreview: stableSetSessionToPreview,
      setShowLoadChunksModal: stableSetShowLoadChunksModal,
      setStartChoiceModal: stableSetStartChoiceModal,
      setViewingBubbleNoteId: stableSetViewingBubbleNoteId,
      setIsBusy: stableSetIsBusy,
      setAppUserMessage: stableSetAppUserMessage,
      setIsCalendarOpen: stableSetIsCalendarOpen,
      setIsNewCalendarOpen: stableSetIsNewCalendarOpen,
      setActiveRightTab: stableSetActiveRightTab,
      setLeftWidthPct: stableSetLeftWidthPct,
    }}>
      {children}
    </UIStateContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useUIState(): UIStateCtxValue {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used inside <UIStateProvider>');
  return ctx;
}
