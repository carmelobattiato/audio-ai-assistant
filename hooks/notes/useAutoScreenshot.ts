
import { useState, useRef, useEffect } from 'react';

export const useAutoScreenshot = (
  _isRecordingCurrentlyActive: boolean,
  _isScreenSharing: boolean,
  initialInterval: number,
  onTakeScreenshot: (isAuto: boolean) => void
) => {
  const [isAutoScreenshotOn, setIsAutoScreenshotOn] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [countdown, setCountdown] = useState(initialInterval);
  const countdownIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    setCurrentInterval(initialInterval);
    if (isAutoScreenshotOn) setCountdown(initialInterval);
  }, [initialInterval, isAutoScreenshotOn]);

  useEffect(() => {
    if (!isAutoScreenshotOn) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onTakeScreenshot(true);
          return currentInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [isAutoScreenshotOn, onTakeScreenshot, currentInterval]);

  const toggleAutoScreenshot = () => {
    const next = !isAutoScreenshotOn;
    setIsAutoScreenshotOn(next);
    if (next) {
      onTakeScreenshot(true);
      setCountdown(currentInterval);
    }
  };

  const adjustTiming = (amount: number) => {
    const newVal = Math.max(10, currentInterval + amount);
    setCurrentInterval(newVal);
    setCountdown(newVal);
  };

  return { isAutoScreenshotOn, currentInterval, countdown, toggleAutoScreenshot, adjustTiming };
};
