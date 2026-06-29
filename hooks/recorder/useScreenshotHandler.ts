
import React, { useState, useCallback } from 'react';
import { BubbleNote } from '../../types';
import { formatTime } from '../../utils/textUtils';
import { loggingService } from '../../services/loggingService';

// ImageCapture is not yet in lib.dom.d.ts for all environments
interface ImageCapture { grabFrame(): Promise<ImageBitmap> }
declare const ImageCapture: { new(track: MediaStreamTrack): ImageCapture } | undefined;

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
    loggingService.debug('SCREENSHOT_HANDLER', 'handleTakeScreenshot called', { isAutomatic, hasDisplayStream: !!displayStream, hasScreenshotStream: !!screenshotStream });
    let streamToUse = displayStream || screenshotStream;
    if (!streamToUse) {
      loggingService.info('SCREENSHOT_GETDISPLAY', 'No stream active — requesting getDisplayMedia');
      try {
        const newStream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false });
        const firstTrack = newStream.getVideoTracks()[0];
        if (firstTrack) firstTrack.onended = () => { loggingService.info('SCREENSHOT_STREAM_ENDED', 'Screen share stream ended'); setScreenshotStream(null); };
        setScreenshotStream(newStream);
        streamToUse = newStream;
        loggingService.info('SCREENSHOT_STREAM_ACQUIRED', 'Screen share stream acquired');
      } catch (err) {
        loggingService.warn('SCREENSHOT_GETDISPLAY_DENIED', 'User denied screen share or error', { error: String(err) });
        return;
      }
    }

    const videoTrack = streamToUse?.getVideoTracks()[0];
    if (!videoTrack) {
      loggingService.warn('SCREENSHOT_NO_TRACK', 'No video track in stream');
      return;
    }

    try {
      if (typeof ImageCapture === 'undefined') { loggingService.warn('SCREENSHOT', 'ImageCapture API not available'); return; }
      const imageCapture = new ImageCapture(videoTrack);
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
          isEditing: false, isProcessing: false,
          type: 'auto-screenshot'
        };
        onBubbleNotesChange([...bubbleNotes, newNote]);
        loggingService.info('SCREENSHOT_SAVED_AUTO', 'Auto-screenshot saved as new note', { ts });
      } else {
        onPendingNoteHtmlChange(`${pendingNoteHtml}<p><em>Screenshot at ${ts}</em></p>${imgHtml}<p><br></p>`);
        loggingService.info('SCREENSHOT_SAVED_MANUAL', 'Manual screenshot appended to pending note', { ts });
      }
    } catch (e) {
      loggingService.error('SCREENSHOT_CAPTURE_ERROR', 'Failed to capture frame', { error: String(e) });
    }
  }, [displayStream, screenshotStream, bubbleNotes, onBubbleNotesChange, pendingNoteHtml, onPendingNoteHtmlChange, elapsedTimeRef]);

  return { screenshotStream, setScreenshotStream, handleTakeScreenshot };
};
