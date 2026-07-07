import { useRef, useState } from 'react';

/**
 * Browser speech recognition, shared by the board composer and the New
 * Discussion panel. Honest by design: exposes supported=false when the
 * platform has no recognizer — no fake transcripts, ever.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null; // server render (ui-smoke)
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export function useVoice(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const supported = speechRecognition() !== null;

  const toggle = () => {
    const Recognition = speechRecognition();
    if (!Recognition) return; // button is disabled; belt and braces
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    setError(null);
    const rec = new Recognition();
    recognizer.current = rec;
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const heard = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
        .join(' ')
        .trim();
      // The transcript lands IN the text box — visible, editable, honest.
      if (heard) onTranscript(heard);
    };
    rec.onerror = (e) => setError(`voice input failed: ${e.error}`);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return { supported, listening, error, toggle };
}
