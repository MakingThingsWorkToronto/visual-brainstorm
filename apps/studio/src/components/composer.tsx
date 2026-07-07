import { useEffect, useRef, useState } from 'react';
import type { ResponseAttachment } from '@visual-brainstorm/protocol';
import { BodyPortal, MicIcon } from './primitives';
import type { useVoice } from '../lib/useVoice';

/**
 * Shared composer machinery for the board reply surface and the New Discussion
 * panel: attachment intake (file picker + live camera), the chip strip that
 * shows what will ship, and the mic button. One implementation, two surfaces.
 */

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function useAttachments() {
  const [attachments, setAttachments] = useState<ResponseAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const attach = (file: File) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`"${file.name}" is over 8MB. Attach something smaller.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [...prev, { name: file.name, dataUri: String(reader.result) }]);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const addDataUri = (name: string, dataUri: string) =>
    setAttachments((prev) => [...prev, { name, dataUri }]);
  const remove = (index: number) => setAttachments((prev) => prev.filter((_, i) => i !== index));

  return { attachments, attach, addDataUri, remove, error };
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ResponseAttachment[];
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {attachments.map((attachment, i) => (
        <span
          key={`${attachment.name}-${i}`}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
        >
          {attachment.name || 'photo'}
          <button
            type="button"
            onClick={() => onRemove(i)}
            title="Remove this attachment"
            className="text-ink-dim hover:text-ink"
          >
            ✕
          </button>
        </span>
      ))}
      <span className="text-[11px] text-ink-dim">sent with your reply</span>
    </div>
  );
}

export function MicButton({
  voice,
  hint,
}: {
  voice: ReturnType<typeof useVoice>;
  hint: string;
}) {
  return (
    <button
      type="button"
      disabled={!voice.supported}
      onClick={voice.toggle}
      aria-label={voice.listening ? 'Stop voice input' : 'Voice input'}
      title={
        voice.supported
          ? voice.listening
            ? 'Stop listening'
            : hint
          : 'Voice input is unavailable in this browser'
      }
      className={`rounded-xl border px-3 py-2 ${
        voice.listening
          ? 'border-accent bg-accent/15'
          : 'border-line hover:border-accent disabled:opacity-40'
      }`}
    >
      <MicIcon className="h-4 w-4" />
    </button>
  );
}

export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Live camera capture: asks for camera permission (getUserMedia), shows the
 * preview, and snaps a frame to a PNG data URI. Honest failure: a denied or
 * absent camera shows the error and offers the file picker instead.
 */
export function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (name: string, dataUri: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      })
      .catch((err) => setError(`camera unavailable: ${String(err)}`));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    onCapture(`photo-${stamp}.png`, canvas.toDataURL('image/png'));
    onClose();
  };

  return (
    <BodyPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-4 shadow-2xl">
        <h2 className="text-sm font-bold">Take a photo</h2>
        {error ? (
          <div className="mt-2 text-xs text-red-500">
            {error}
            <label className="mt-2 block cursor-pointer rounded-lg border border-line px-3 py-2 text-center text-sm text-ink hover:border-accent">
              Choose a file instead
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    onCapture(file.name, String(reader.result));
                    onClose();
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="mt-2 aspect-video w-full rounded-xl bg-black object-contain"
          />
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
          >
            Cancel
          </button>
          {!error && (
            <button
              type="button"
              disabled={!ready}
              onClick={snap}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
            >
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}
