
import React from 'react';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { LoadingSpinner } from './common/LoadingSpinner';
import { AppStatistics, CoherenceAssessmentStatus, LlmUsageStats } from '../types';
import { formatTime } from '../utils/textUtils';

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: AppStatistics | null;
  onAssessCoherence: () => Promise<void>;
  coherenceAssessmentText: string | null;
  coherenceStatus: CoherenceAssessmentStatus;
}

// Map models to costs (per 1,000,000 tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 4.00, output: 18.00 },
  'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'gemini-2.5-pro': { input: 2.50, output: 15.00 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
};

const calculateCost = (usage: LlmUsageStats): number => {
    const pricing = MODEL_PRICING[usage.model] || { input: 0, output: 0 };
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
};

const StatItem: React.FC<{ label: string; value: string | number | undefined | null }> = ({ label, value }) => {
  if (value === undefined || value === null || value === "" || (typeof value === 'number' && isNaN(value)) ) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between py-1 border-b border-gray-700 last:border-b-0">
      <span className="text-gray-400 text-sm sm:text-base">{label}:</span>
      <span className="text-gray-100 font-medium text-sm sm:text-base text-left sm:text-right">{String(value)}</span>
    </div>
  );
};

export const StatisticsModal: React.FC<StatisticsModalProps> = ({
  isOpen,
  onClose,
  stats,
  onAssessCoherence,
  coherenceAssessmentText,
  coherenceStatus,
}) => {
  if (!isOpen) return null;

  const renderAudioDetails = () => {
    if (!stats?.audioDetails) return <p className="text-gray-500">No audio data available.</p>;
    const { format, duration, size, sampleRate, channels, bitrate } = stats.audioDetails;
    return (
      <div className="space-y-1">
        <h4 className="text-md font-semibold text-sky-300 mb-1">Audio Details</h4>
        <StatItem label="Format" value={format} />
        <StatItem label="Duration" value={duration > 0 ? formatTime(duration) : "N/A"} />
        <StatItem label="Size" value={size > 0 ? `${(size / 1024).toFixed(2)} KB` : "N/A"} />
        {sampleRate && <StatItem label="Sample Rate" value={`${sampleRate} Hz`} />}
        <StatItem label="Channels" value={channels} />
        <StatItem label="Bitrate (Recording Setting)" value={`${bitrate / 1000} kbps`} />
      </div>
    );
  };

  const renderTextStats = (data: AppStatistics['transcriptionStats' | 'llmResultStats'], title: string) => {
    if (!data) return <p className="text-gray-500">{`No ${title.toLowerCase()} data available.`}</p>;
    const { characterCount, wordCount, estimatedTokenCount, size } = data;
    return (
      <div className="space-y-1">
        <h4 className="text-md font-semibold text-sky-300 mb-1">{title} Stats</h4>
        <StatItem label="Character Count" value={characterCount} />
        <StatItem label="Word Count" value={wordCount} />
        <StatItem label="Estimated Token Count" value={estimatedTokenCount} />
        <StatItem label="Text Size (approx.)" value={size > 0 ? `${(size / 1024).toFixed(2)} KB` : "N/A"} />
      </div>
    );
  };
  
  const renderGeneralInfo = () => {
    if (!stats) return null;
    return (
      <div className="space-y-1 mt-3">
        <h4 className="text-md font-semibold text-sky-300 mb-1">General Information</h4>
        <StatItem label="Recording/Upload Date & Time" value={stats.recordingTimestamp} />
      </div>
    );
  };
  
  const renderLlmUsageHistory = () => {
    const history = stats?.llmUsageHistory;
    const totalInput = history?.reduce((acc, curr) => acc + curr.inputTokens, 0) || 0;
    const totalOutput = history?.reduce((acc, curr) => acc + curr.outputTokens, 0) || 0;
    const totalCost = history?.reduce((acc, curr) => acc + calculateCost(curr), 0) || 0;

    return (
      <div className="space-y-1">
        <h4 className="text-md font-semibold text-sky-300 mb-1">LLM Call History & Estimated Cost</h4>
        {!history || history.length === 0 ? (
          <p className="text-gray-500">No LLM calls have been made in this session yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="bg-gray-700 text-xs text-gray-400 uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">Function</th>
                  <th scope="col" className="px-3 py-2">Model</th>
                  <th scope="col" className="px-3 py-2 text-right">Input</th>
                  <th scope="col" className="px-3 py-2 text-right">Output</th>
                  <th scope="col" className="px-3 py-2 text-right">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((usage, index) => {
                  const cost = calculateCost(usage);
                  return (
                    <tr key={index} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="px-3 py-2 font-medium truncate max-w-[120px]" title={usage.functionName}>{usage.functionName}</td>
                      <td className="px-3 py-2 truncate text-[10px]" title={usage.model}>{usage.model}</td>
                      <td className="px-3 py-2 text-right font-mono text-[10px]">{usage.inputTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-[10px]">{usage.outputTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">
                        ${cost < 0.001 && cost > 0 ? '<0.001' : cost.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="font-bold bg-gray-700">
                <tr>
                    <td colSpan={2} className="px-3 py-2 text-right">Totals:</td>
                    <td className="px-3 py-2 text-right font-mono text-[10px]">{totalInput.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-[10px]">{totalOutput.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">${totalCost.toFixed(4)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Content Statistics">
      {!stats ? (
        <p className="text-gray-400">No statistics to display yet. Process some audio or text.</p>
      ) : (
        <div className="space-y-4">
          {renderGeneralInfo()}
          {renderAudioDetails()}
          {renderTextStats(stats.transcriptionStats, "Transcription / Source Text")}
          {renderTextStats(stats.llmResultStats, "LLM Processed Result")}
          {renderLlmUsageHistory()}
          
          <div className="space-y-1">
             <h4 className="text-md font-semibold text-sky-300 mb-1">Content Analysis (Experimental)</h4>
            <StatItem label="Detected Participants (from Diarization)" value={stats.participantCount || "Not Attempted / Unknown"} />
            
            <div className="pt-2">
                <Button 
                    onClick={onAssessCoherence} 
                    variant="secondary"
                    size="sm"
                    disabled={coherenceStatus === CoherenceAssessmentStatus.LOADING || !stats.transcriptionStats}
                    className="w-full sm:w-auto"
                >
                    {coherenceStatus === CoherenceAssessmentStatus.LOADING ? "Assessing..." : "Assess Speech Coherence"}
                </Button>
                {coherenceStatus === CoherenceAssessmentStatus.LOADING && <LoadingSpinner size="sm" text="Assessing coherence..." />}
                {coherenceStatus === CoherenceAssessmentStatus.ERROR && <p className="text-red-400 text-xs mt-1">Could not assess coherence.</p>}
                {coherenceAssessmentText && coherenceStatus === CoherenceAssessmentStatus.SUCCESS && (
                    <div className="mt-2 p-2 bg-gray-700 rounded">
                        <p className="text-sm text-gray-300">Coherence Assessment:</p>
                        <p className="text-xs text-gray-100">{coherenceAssessmentText}</p>
                    </div>
                )}
            </div>
          </div>
        </div>
      )}
      <div className="mt-6 flex flex-col sm:flex-row justify-end">
        <Button onClick={onClose} variant="primary" className="w-full sm:w-auto">Close</Button>
      </div>
    </Modal>
  );
};
