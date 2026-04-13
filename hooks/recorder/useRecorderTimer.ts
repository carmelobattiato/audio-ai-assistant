
import { useState, useRef, useCallback } from 'react';

export const useRecorderTimer = () => {
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const recordingIntervalRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    recordingIntervalRef.current = window.setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  }, [stopTimer]);

  const resetTimer = useCallback(() => {
    stopTimer();
    setElapsedTime(0);
  }, [stopTimer]);

  return { elapsedTime, setElapsedTime, startTimer, stopTimer, resetTimer };
};
