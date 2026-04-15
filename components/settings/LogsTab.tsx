
import React, { useState, useEffect, useMemo } from 'react';
import { loggingService } from '../../services/loggingService';
import { LogEntry, LogLevel } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';

const LOG_LEVEL_KEY = 'neo_log_min_level';

export const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(loggingService.getLogs());
  const [filter, setFilter] = useState('');
  const [minLevel, setMinLevel] = useState<LogLevel>(
    () => (localStorage.getItem(LOG_LEVEL_KEY) as LogLevel | null) ?? LogLevel.INFO
  );

  const handleMinLevelChange = (level: LogLevel) => {
    setMinLevel(level);
    localStorage.setItem(LOG_LEVEL_KEY, level);
  };

  useEffect(() => {
    return loggingService.subscribe((newLogs) => {
      setLogs([...newLogs]);
    });
  }, []);

  const filteredLogs = useMemo(() => {
    const levelOrder = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minLevelIdx = levelOrder.indexOf(minLevel);

    return logs.filter(log => {
      const levelIdx = levelOrder.indexOf(log.level);
      if (levelIdx < minLevelIdx) return false;

      if (!filter) return true;
      const searchStr = filter.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchStr) ||
        log.event.toLowerCase().includes(searchStr) ||
        log.correlationId.toLowerCase().includes(searchStr)
      );
    });
  }, [logs, filter, minLevel]);

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.ERROR: return 'text-red-400';
      case LogLevel.WARN: return 'text-amber-400';
      case LogLevel.INFO: return 'text-sky-400';
      case LogLevel.DEBUG: return 'text-gray-400';
      default: return 'text-gray-500';
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end bg-gray-800 p-3 rounded-lg border border-gray-700">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Filter Logs:"
            id="logFilter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search message, event, or ID..."
          />
        </div>
        <div className="w-40">
          <Select
            label="Min Level:"
            id="logMinLevel"
            value={minLevel}
            onChange={(e) => handleMinLevelChange(e.target.value as LogLevel)}
            options={[
              { value: LogLevel.TRACE, label: 'TRACE' },
              { value: LogLevel.DEBUG, label: 'DEBUG' },
              { value: LogLevel.INFO, label: 'INFO' },
              { value: LogLevel.WARN, label: 'WARN' },
              { value: LogLevel.ERROR, label: 'ERROR' },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => loggingService.clearLogs()}>Clear</Button>
          <Button variant="secondary" size="sm" onClick={downloadLogs}>Export JSON</Button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 italic">No logs found matching filters.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left border-b border-gray-700 w-24">Time</th>
                  <th className="px-3 py-2 text-left border-b border-gray-700 w-20">Level</th>
                  <th className="px-3 py-2 text-left border-b border-gray-700 w-32">Event</th>
                  <th className="px-3 py-2 text-left border-b border-gray-700">Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-gray-800/50 border-b border-gray-800/30">
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className={`px-3 py-1.5 font-bold ${getLevelColor(log.level)}`}>
                      {log.level}
                    </td>
                    <td className="px-3 py-1.5 text-sky-300 font-medium">
                      {log.event}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 break-words">
                      {log.message}
                      {log.context && (
                        <details className="mt-1 opacity-60 hover:opacity-100 cursor-pointer">
                          <summary className="text-[10px] uppercase tracking-wider">Context</summary>
                          <pre className="mt-1 p-2 bg-black/40 rounded overflow-x-auto">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      <div className="flex justify-between text-[10px] text-gray-500 uppercase tracking-widest px-1">
        <span>Session: {loggingService.getSessionId()}</span>
        <span>Correlation: {loggingService.getCorrelationId()}</span>
      </div>
    </div>
  );
};
