import { useState, useCallback, useEffect } from 'react';

const isSupported =
  typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  const openPip = useCallback(async (width = 320, height = 230) => {
    if (!isSupported || pipWindow) return;
    const pip = await window.documentPictureInPicture!.requestWindow({ width, height });

    // Title
    pip.document.title = document.title;

    // theme-color → chrome nero
    const themeMeta = pip.document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.content = '#000000';
    pip.document.head.appendChild(themeMeta);

    // Favicon (copia tutti i <link rel="icon">)
    document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]').forEach(l =>
      pip.document.head.appendChild(l.cloneNode(true))
    );

    // Stili CSS dell'app (variabili, keyframes, ecc.)
    document.querySelectorAll('head style').forEach(s =>
      pip.document.head.appendChild(s.cloneNode(true))
    );

    // Copy bundled Tailwind script into PiP document (works offline)
    await new Promise<void>(resolve => {
      const mainScript = document.querySelector<HTMLScriptElement>('script[src="/tailwind.min.js"]');
      if (mainScript) {
        const s = pip.document.createElement('script');
        s.src = mainScript.src;
        s.onload = () => resolve();
        s.onerror = () => resolve(); // non-blocking if fails
        pip.document.head.appendChild(s);
      } else {
        resolve();
      }
    });

    pip.document.body.className = document.body.className;
    pip.document.body.style.cssText =
      'margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100vh;display:flex;';

    const div = pip.document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;display:flex;flex:1;min-height:0;';
    pip.document.body.appendChild(div);

    setPipWindow(pip);
    setMountEl(div);

    pip.addEventListener('pagehide', () => {
      setPipWindow(null);
      setMountEl(null);
    });
  }, [pipWindow]);

  const closePip = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
    setMountEl(null);
  }, [pipWindow]);

  useEffect(() => {
    return () => { pipWindow?.close(); };
  }, [pipWindow]);

  return {
    isSupported,
    isOpen: !!pipWindow,
    mountEl,
    openPip,
    closePip,
  };
}
