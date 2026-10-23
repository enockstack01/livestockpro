import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Modal from '../Modal.jsx';

/* Photos for LivestockPro AI: "Take photo" opens the phone camera directly
   (or a live camera view on a computer) so a farmer can photograph the
   affected part of the animal; "Upload" picks an existing picture. Each photo
   is shrunk before sending (longest side 1568 px, JPEG) and gets a small
   preview the saved report keeps. */

export const MAX_PHOTOS = 3;
const FULL_SIDE = 1568;
const THUMB_SIDE = 320;

function draw(source, w, h, side, quality) {
  const scale = Math.min(1, side / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function fromSource(source, w, h) {
  const full = draw(source, w, h, FULL_SIDE, 0.85);
  return {
    media_type: 'image/jpeg',
    data: full.slice(full.indexOf(',') + 1),
    thumb: draw(source, w, h, THUMB_SIDE, 0.7)
  };
}

function loadFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { try { resolve(fromSource(img, img.naturalWidth, img.naturalHeight)); } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); } };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/* State for the photos of one request: { photos, add, remove, clear, payload }. */
export function usePhotos() {
  const [photos, setPhotos] = useState([]);
  return {
    photos,
    add: (list) => setPhotos((p) => [...p, ...list].slice(0, MAX_PHOTOS)),
    remove: (i) => setPhotos((p) => p.filter((_, j) => j !== i)),
    clear: () => setPhotos([]),
    payload: () => (photos.length ? { images: photos.map(({ media_type, data }) => ({ media_type, data })), thumbnails: photos.map((p) => p.thumb) } : {})
  };
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

/* Live camera on a computer (getUserMedia). */
function CameraModal({ open, onClose, onShot }) {
  const { t } = useTranslation();
  const video = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    setFailed(false);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      } catch {
        setFailed(true);
      }
    })();
    return () => { if (stream) stream.getTracks().forEach((tr) => tr.stop()); };
  }, [open]);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    onShot(fromSource(v, v.videoWidth, v.videoHeight));
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="680px"
      title={<><i className="fas fa-camera" style={{ marginRight: 8 }}></i>{t('ai.photo.cameraTitle')}</>}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" onClick={snap} disabled={failed}><i className="fas fa-camera"></i> {t('ai.photo.capture')}</button></>}
    >
      {failed ? <p className="hp-note">{t('ai.photo.noCamera')}</p> : (
        <>
          <video ref={video} className="ai-camera-view" playsInline muted />
          <p className="ai-muted" style={{ marginTop: 10 }}>{t('ai.photo.tip')}</p>
        </>
      )}
    </Modal>
  );
}

export default function PhotoPicker({ state, disabled, compact }) {
  const { t } = useTranslation();
  const cameraInput = useRef(null);
  const fileInput = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const full = state.photos.length >= MAX_PHOTOS;

  async function onFiles(e) {
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS - state.photos.length);
    e.target.value = '';
    setError('');
    const out = [];
    for (const f of files) {
      try { out.push(await loadFile(f)); } catch { setError(t('ai.photo.unreadable')); }
    }
    if (out.length) state.add(out);
  }

  function takePhoto() {
    if (isTouch() || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) cameraInput.current.click();
    else setCameraOpen(true);
  }

  return (
    <div className={`ai-photos${compact ? ' compact' : ''}`}>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
      <div className="ai-photo-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={takePhoto} disabled={disabled || full} title={t('ai.photo.take')}>
          <i className="fas fa-camera"></i>{compact ? null : <> {t('ai.photo.take')}</>}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current.click()} disabled={disabled || full} title={t('ai.photo.upload')}>
          <i className="fas fa-image"></i>{compact ? null : <> {t('ai.photo.upload')}</>}
        </button>
        {!compact ? <small className="ai-muted">{t('ai.photo.hint', { max: MAX_PHOTOS })}</small> : null}
      </div>
      {state.photos.length ? (
        <div className="ai-photo-strip">
          {state.photos.map((p, i) => (
            <div className="ai-photo-thumb" key={i}>
              <img src={p.thumb} alt={t('ai.photo.alt', { n: i + 1 })} />
              <button type="button" onClick={() => state.remove(i)} aria-label={t('ai.photo.remove')} disabled={disabled}><i className="fas fa-xmark"></i></button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <small className="ai-photo-error">{error}</small> : null}
      {/* At the top level of the page, so it sits above the dialog it was opened from. */}
      {createPortal(<CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} onShot={(p) => state.add([p])} />, document.body)}
    </div>
  );
}
