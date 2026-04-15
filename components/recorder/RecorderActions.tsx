
import React, { useState, useEffect } from 'react';
import { Button } from '../common/Button';
import { Checkbox } from '../common/Checkbox';
import {
  RecordIcon, StopIcon, UploadIcon, TrashIcon, DownloadIcon,
  PauseIcon, HeadphonesIcon, MicrophoneOnIcon, MicrophoneOffIcon, TimeIcon, FolderIcon
} from '../../constants';
import { formatTime } from '../../utils/textUtils';
import { RecordingState, PipelineStep } from '../../types';

interface RecorderActionsProps {
  isStartMode: boolean;
  disabled: boolean;
  recordingState: RecordingState;
  elapsedTime: number;
  isPaused: boolean;
  isAutoPaused: boolean;
  isAppAudioActive: boolean;
  isMicEnabled: boolean;
  isAutoSaveEnabled: boolean;
  autoSaveCountdown: number;
  onStart: (app: boolean) => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMic: () => void;
  onAddAppAudio: () => void;
  onUpload: () => void;
  onToggleAutoSave: () => void;
  onSaveFile: () => void;
  onReset: () => void;
  showSaveButton: boolean;
  chunkCountdown: number;
  enableChunked: boolean;
  pipelineStep?: PipelineStep;
  autoPipelineEnabled: boolean;
  onToggleAutoPipeline: (val: boolean) => void;
  chunksCount: number;
  forceShowSystemAudioGuide?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// System-audio guide modal
// ─────────────────────────────────────────────────────────────────────────────

const SystemAudioGuideModal: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => (
  <div
    className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50"
    onClick={onCancel}
  >
    <div
      className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-600/30 border border-sky-500/40 flex items-center justify-center flex-shrink-0">
            <HeadphonesIcon className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Recording with headphones</h3>
            <p className="text-xs text-gray-400">How to enable system audio capture</p>
          </div>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors p-1" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">

        {/* Alert */}
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-xs text-amber-300 leading-relaxed">
            With headphones, the microphone <strong className="text-amber-200">cannot hear PC audio</strong>.
            You must share your screen and enable system audio to capture the meeting.
          </p>
        </div>

        {/* Steps */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">In the browser dialog that opens:</p>

        <div className="space-y-3">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
            <div>
              <p className="text-sm text-gray-200 font-medium">
                The <span className="text-sky-300 font-semibold">Entire Screen</span> tab opens automatically — click <span className="text-sky-300 font-semibold">Screen 1</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Stay on <strong className="text-gray-300">Entire Screen</strong> — do <strong className="text-red-400">not</strong> switch to "Chrome Tab".
                Only "Entire Screen" can capture audio from Teams, Meet, Zoom…
              </p>
            </div>
          </div>

          {/* Step 2 — highlighted */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-900/25 border border-emerald-700/50">
            <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-sm text-emerald-300 font-bold">Enable "Also share system audio"</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Look for the toggle <strong className="text-gray-300">at the bottom of the dialog</strong> — turn it <strong className="text-emerald-300">ON</strong>.
              </p>
              {/* Warning for wrong label */}
              <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded text-xs text-amber-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>
                  If you see <strong className="text-amber-200">"Also share tab audio"</strong> instead, you are on the wrong tab —
                  go back and select <strong className="text-amber-200">Entire Screen</strong>.
                  "Tab audio" only captures browser tabs, not Teams or Zoom.
                </span>
              </div>
              {/* Visual mockup */}
              <div className="mt-2.5 rounded-md border border-gray-600 bg-gray-900 px-3 py-2.5 text-xs space-y-2">
                <p className="text-gray-500 text-[10px] uppercase tracking-wide font-medium">Chrome dialog — bottom section (Entire Screen)</p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Also share system audio</span>
                  {/* Toggle ON */}
                  <div className="flex items-center gap-1.5">
                    <div className="w-9 h-5 bg-emerald-500 rounded-full relative flex-shrink-0">
                      <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow" />
                    </div>
                    <span className="text-emerald-400 font-bold text-[10px]">← ON</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
            <div>
              <p className="text-sm text-gray-200 font-medium">Click "Share"</p>
              <p className="text-xs text-gray-500 mt-0.5">Recording starts automatically with system audio active.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 px-5 py-1.5 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          Open screen share
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

export const RecorderActions: React.FC<RecorderActionsProps> = (props) => {
  const [showAudioGuide, setShowAudioGuide] = useState(false);

  // Triggered externally (e.g. from "Apri Teams e Registra" in Outlook modal)
  useEffect(() => {
    if (props.forceShowSystemAudioGuide) {
      setShowAudioGuide(true);
    }
  }, [props.forceShowSystemAudioGuide]);

  const handleStartWithHeadphones = () => setShowAudioGuide(true);

  const handleConfirmSystemAudio = () => {
    setShowAudioGuide(false);
    props.onStart(true);
  };

  const handleCancelGuide = () => {
    setShowAudioGuide(false);
  };

  const isFinalizing = props.pipelineStep &&
                       props.pipelineStep !== PipelineStep.IDLE &&
                       props.pipelineStep !== PipelineStep.RECORDING &&
                       props.pipelineStep !== PipelineStep.COMPLETED;

  const chunkCountdownTooltip = "PROSSIMO CHUNK (1 min): Tempo rimanente prima che il segmento audio attuale venga persistito su disco IndexedDB.";
  const smartPipelineTooltip = "SMART PIPELINE: Automatizza Trascrizione + Analisi al termine della registrazione.";

  return (
    <>
      {showAudioGuide && (
        <SystemAudioGuideModal
          onConfirm={handleConfirmSystemAudio}
          onCancel={handleCancelGuide}
        />
      )}

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-start items-center flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {props.isStartMode ? (
              <>
                <Button
                  onClick={() => props.onStart(false)}
                  variant="primary"
                  leftIcon={<MicrophoneOnIcon className="w-5 h-5" />}
                  disabled={props.disabled || isFinalizing}
                >
                  Rec without headphones
                </Button>
                <Button
                  onClick={handleStartWithHeadphones}
                  variant="primary"
                  leftIcon={<HeadphonesIcon className="w-5 h-5" />}
                  disabled={props.disabled || isFinalizing}
                  className="bg-sky-600 hover:bg-sky-700 focus:ring-sky-500 border-sky-700"
                >
                  Rec with headphones
                </Button>
              </>
            ) : (
              <div className="inline-flex rounded-lg shadow-md">
                <Button
                  onClick={props.onStop}
                  variant="danger"
                  isGlowing={props.recordingState === RecordingState.RECORDING && !props.isPaused}
                  leftIcon={<StopIcon className="w-5 h-5" />}
                  disabled={props.disabled}
                  className="rounded-r-none"
                >
                  {isFinalizing ? "Finalizing Pipeline..." : `Stop (${formatTime(props.elapsedTime)})`}
                </Button>
                <Button
                  onClick={props.onAddAppAudio}
                  variant="secondary"
                  disabled={props.disabled || props.isAppAudioActive}
                  className="rounded-none border-l border-gray-500 px-3"
                  title="Aggiungi audio di sistema"
                >
                  <HeadphonesIcon className={`w-5 h-5 ${props.isAppAudioActive ? 'text-emerald-400' : ''}`} />
                </Button>
                <Button
                  onClick={props.onToggleMic}
                  variant="secondary"
                  disabled={props.disabled}
                  className="rounded-l-none border-l border-gray-500 px-3"
                >
                  {props.isMicEnabled
                    ? <MicrophoneOnIcon className="w-5 h-5" />
                    : <MicrophoneOffIcon className="w-5 h-5 text-red-400" />}
                </Button>
              </div>
            )}

            {!isFinalizing && (
              <div
                className="flex items-center bg-gray-700/50 px-3 py-2 rounded-lg border border-gray-600 transition-all hover:bg-gray-700 has-custom-tooltip"
                data-tooltip={smartPipelineTooltip}
              >
                <Checkbox
                  id="quick-auto-pipeline"
                  label="Smart Pipeline"
                  checked={props.autoPipelineEnabled}
                  onChange={(e) => props.onToggleAutoPipeline(e.target.checked)}
                  className="text-sky-300 font-semibold text-xs"
                />
              </div>
            )}
          </div>

          {props.recordingState === RecordingState.RECORDING && props.enableChunked && (
            <div className="flex gap-2 items-center">
              <div
                className="flex items-center gap-2 text-sm text-sky-300 font-medium p-2 bg-gray-700 rounded-lg has-custom-tooltip animate-pulse"
                data-tooltip={chunkCountdownTooltip}
              >
                <TimeIcon className="w-5 h-5" />
                <span className="font-mono">DB-Sync: {formatTime(props.chunkCountdown)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900/30 text-emerald-400 rounded-lg border border-emerald-800 text-xs font-bold">
                <FolderIcon className="w-4 h-4" />
                <span>{props.chunksCount} CHUNKS SAVED</span>
              </div>
            </div>
          )}

          {props.recordingState === RecordingState.RECORDING && !props.isPaused && (
            <Button onClick={props.onPause} variant="secondary" leftIcon={<PauseIcon className="w-5 h-5" />} disabled={props.disabled}>Pause</Button>
          )}
          {props.recordingState === RecordingState.RECORDING && props.isPaused && (
            <Button onClick={props.onResume} variant="primary" leftIcon={<RecordIcon className="w-5 h-5" />} disabled={props.disabled}>
              {props.isAutoPaused ? 'Resume (Auto)' : 'Resume'}
            </Button>
          )}

          <Button onClick={props.onUpload} variant="primary" leftIcon={<UploadIcon className="w-5 h-5" />} disabled={props.disabled || !props.isStartMode || isFinalizing}>Upload File</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-start items-center flex-wrap border-t border-gray-700 pt-4">
          {props.showSaveButton && (
            <Button onClick={props.onSaveFile} variant="ghost" size="sm" leftIcon={<DownloadIcon className="w-5 h-5" />}>Save Audio</Button>
          )}
          <Button onClick={props.onReset} variant="ghost" size="sm" leftIcon={<TrashIcon className="w-5 h-5" />} disabled={props.disabled}>Reset Everything</Button>
        </div>
      </div>
    </>
  );
};
