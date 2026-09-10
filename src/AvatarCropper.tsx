import { useCallback, useRef, useState } from "react";

// A focused, Apple-style crop dialog: drag to reposition, pinch/slider to
// zoom, always exports a perfect square avatar. Pointer math stays in
// normalized [-1,1] offset space so it maps 1:1 onto image.worker.ts.
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (state: { zoom: number; offsetX: number; offsetY: number; url: string }) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const move = useCallback((clientX: number, clientY: number) => {
    if (!drag.current || !frame.current) return;
    const size = frame.current.clientWidth;
    const dx = ((clientX - drag.current.x) / (size / 2)) * -1;
    const dy = ((clientY - drag.current.y) / (size / 2)) * -1;
    setOffset({ x: clamp(drag.current.ox + dx), y: clamp(drag.current.oy + dy) });
  }, []);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal cropper" onClick={(e) => e.stopPropagation()}>
        <h2>Sesuaikan foto profil</h2>
        <div
          ref={frame}
          className="crop-frame"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => drag.current && move(e.clientX, e.clientY)}
          onPointerUp={() => (drag.current = null)}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              transform: `translate(${offset.x * 50}%, ${offset.y * 50}%) scale(${zoom})`,
            }}
          />
          <div className="crop-ring" />
        </div>
        <label className="crop-zoom">
          <span>Perbesar</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <p className="crop-hint">Seret foto untuk memposisikan, geser slider untuk memperbesar.</p>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Batal
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onDone({ zoom, offsetX: offset.x, offsetY: offset.y, url })}
          >
            Gunakan foto ini
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(v: number) {
  return Math.max(-1, Math.min(1, v));
}
