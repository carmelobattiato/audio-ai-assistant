import { useState, useEffect, useCallback } from 'react';

interface HeadphoneDetectionResult {
  headphonesDetected: boolean;
  detectedDeviceName: string | null;
}

const HEADPHONE_KEYWORDS = [
  'headphone', 'headset', 'earphone', 'earbud', 'cuffi',
  'bluetooth', 'wireless', 'bt audio',
  'airpod', 'beats', 'jabra', 'bose', 'sennheiser', 'sony wh', 'sony wf',
  'linkbuds', 'plantronics', 'poly', 'hyperx', 'corsair', 'steelseries',
  'razer', 'arctis', 'blackshark', 'virtuoso', 'logitech g', 'g pro',
  'quietcomfort', 'momentum', 'jbl', 'a50', 'a40', 'anker',
];

const SPEAKER_KEYWORDS = ['speaker', 'built-in', 'realtek', 'hdmi', 'display', 'monitor', ' tv'];

function isHeadphoneDevice(label: string): boolean {
  const l = label.toLowerCase();
  if (SPEAKER_KEYWORDS.some(k => l.includes(k))) return false;
  return HEADPHONE_KEYWORDS.some(k => l.includes(k));
}

async function detectHeadphones(): Promise<HeadphoneDetectionResult> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { headphonesDetected: false, detectedDeviceName: null };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === 'audiooutput' && d.label);
    for (const device of outputs) {
      if (isHeadphoneDevice(device.label)) {
        return { headphonesDetected: true, detectedDeviceName: device.label };
      }
    }
  } catch {
    // permission not yet granted or API unavailable
  }
  return { headphonesDetected: false, detectedDeviceName: null };
}

export function useHeadphoneDetection(enabled: boolean): HeadphoneDetectionResult {
  const [result, setResult] = useState<HeadphoneDetectionResult>({
    headphonesDetected: false,
    detectedDeviceName: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setResult({ headphonesDetected: false, detectedDeviceName: null });
      return;
    }
    const r = await detectHeadphones();
    setResult(r);
  }, [enabled]);

  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, [refresh]);

  return result;
}
