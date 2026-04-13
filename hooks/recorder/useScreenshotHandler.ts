
import React, { useState, useCallback } from 'react';
import { BubbleNote } from '../../types';
import { formatTime } from '../../utils/textUtils';

export const useScreenshotHandler = (
  displayStream: MediaStream | null,
  bubbleNotes: BubbleNote[],
  onBubbleNotesChange: (notes: BubbleNote[]) => void,
  pendingNoteHtml: string,
  onPendingNoteHtmlChange: (html: string) => void,
  // Fix: Added React. prefix for typing
  elapsedTimeRef: React.RefObject<number>
) => {
  const [screenshotStream, setScreenshotStream] = useState<MediaStream | null>(null);

  const handleTakeScreenshot = useCallback(async (isAutomatic: boolean = false) => {
    let streamToUse = displayStream || screenshotStream;
    if (!streamToUse) {
      try {
        const newStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        newStream.getVideoTracks()[0].onended = () => setScreenshotStream(null);
        setScreenshotStream(newStream);
        streamToUse = newStream;
      } catch (err) { return; }
    }

    const videoTrack = streamToUse?.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const imageCapture = new (window as any).ImageCapture(videoTrack);
      const imageBitmap = await imageCapture.grabFrame();
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      canvas.getContext('2d')?.drawImage(imageBitmap, 0, 0);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const ts = formatTime(elapsedTimeRef.current || 0);
      const imgHtml = `<img src="${dataUrl}" alt="Screenshot at ${ts}" />`;

      if (isAutomatic) {
        const newNote: BubbleNote = {
          id: `auto_${Date.now()}`,
          contentHtml: `<p>Auto-screenshot at ${ts}</p>${imgHtml}`,
          timestamp: Date.now(),
          recordingElapsedTime: elapsedTimeRef.current || 0,
          isEditing: false, isProcessing: false
        };
        onBubbleNotesChange([...bubbleNotes, newNote]);
      } else {
        onPendingNoteHtmlChange(`${pendingNoteHtml}<p><em>Screenshot at ${ts}</em></p>${imgHtml}<p><br></p>`);
      }
    } catch (e) {}
  }, [displayStream, screenshotStream, bubbleNotes, onBubbleNotesChange, pendingNoteHtml, onPendingNoteHtmlChange, elapsedTimeRef]);

  return { screenshotStream, setScreenshotStream, handleTakeScreenshot };
};
