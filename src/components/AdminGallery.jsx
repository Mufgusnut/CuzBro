import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  FileArchive,
  FileText,
  Link2,
  ImagePlus,
  Pencil,
  Save,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import * as tiff from 'tiff';
import { supabase } from '../supabase.js';
import { sendCuzBroSignal } from '../lib/signals.js';
import {
  recordOperationEvent,
  useActiveOperation
} from '../lib/operations.js';
import {
  buildOperationReportNextGoal,
  buildOperationReportNotes,
  clearOperationReportHandoff,
  formatOperationReportDate,
  readOperationReportHandoff
} from '../lib/operationReportHandoff.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

const MAX_MASTER_UPLOAD_BYTES =
  99 * 1024 * 1024;

const GENERATED_JPEG_QUALITY = 0.98;

function getGeneratedJpegName(filename) {
  const baseName = String(
    filename || 'capture'
  )
    .replace(/\.(tif|tiff)$/i, '')
    .trim();

  return `${baseName || 'capture'}-web.jpg`;
}

function canvasToJpegFile(
  canvas,
  fileName
) {
  return new Promise(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(
                'Browser could not create the web JPEG.'
              )
            );

            return;
          }

          resolve(
            new File(
              [blob],
              fileName,
              {
                type: 'image/jpeg',
                lastModified: Date.now()
              }
            )
          );
        },
        'image/jpeg',
        GENERATED_JPEG_QUALITY
      );
    }
  );
}

function getSampleMaximum(
  data,
  bitsPerSample
) {
  if (data instanceof Uint8Array) {
    return 255;
  }

  if (data instanceof Uint16Array) {
    return 65535;
  }

  const bitDepth = Array.isArray(
    bitsPerSample
  )
    ? Number(bitsPerSample[0])
    : Number(bitsPerSample);

  if (
    Number.isFinite(bitDepth) &&
    bitDepth > 0 &&
    bitDepth <= 16
  ) {
    return 2 ** bitDepth - 1;
  }

  let maximum = 0;

  for (
    let index = 0;
    index < data.length;
    index += 1
  ) {
    const value = data[index];

    if (
      Number.isFinite(value) &&
      value > maximum
    ) {
      maximum = value;
    }
  }

  return maximum <= 1
    ? 1
    : maximum;
}

function sampleToByte(
  value,
  maximum
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(
    Math.min(
      255,
      Math.max(
        0,
        (value / maximum) * 255
      )
    )
  );
}

async function generateWebJpegFromTiff(
  file
) {
  const arrayBuffer =
    await file.arrayBuffer();

  const pages = tiff.decode(
    new Uint8Array(arrayBuffer)
  );

  const page = pages?.[0];

  if (
    !page ||
    !page.data ||
    !page.width ||
    !page.height
  ) {
    throw new Error(
      'The TIFF could not be decoded into image pixels.'
    );
  }

  const pixelCount =
    page.width * page.height;

  const channels = Math.round(
    page.data.length / pixelCount
  );

  if (
    channels !== 1 &&
    channels !== 2 &&
    channels !== 3 &&
    channels !== 4
  ) {
    throw new Error(
      `Unsupported TIFF channel layout (${channels} channels).`
    );
  }

  const maximum = getSampleMaximum(
    page.data,
    page.bitsPerSample
  );

  const rgba =
    new Uint8ClampedArray(
      pixelCount * 4
    );

  for (
    let pixel = 0;
    pixel < pixelCount;
    pixel += 1
  ) {
    const sourceIndex =
      pixel * channels;

    const targetIndex =
      pixel * 4;

    if (
      channels === 1 ||
      channels === 2
    ) {
      const gray = sampleToByte(
        page.data[sourceIndex],
        maximum
      );

      rgba[targetIndex] = gray;
      rgba[targetIndex + 1] = gray;
      rgba[targetIndex + 2] = gray;

      rgba[targetIndex + 3] =
        channels === 2
          ? sampleToByte(
              page.data[
                sourceIndex + 1
              ],
              maximum
            )
          : 255;
    } else {
      rgba[targetIndex] = sampleToByte(
        page.data[sourceIndex],
        maximum
      );

      rgba[targetIndex + 1] =
        sampleToByte(
          page.data[sourceIndex + 1],
          maximum
        );

      rgba[targetIndex + 2] =
        sampleToByte(
          page.data[sourceIndex + 2],
          maximum
        );

      rgba[targetIndex + 3] =
        channels === 4
          ? sampleToByte(
              page.data[
                sourceIndex + 3
              ],
              maximum
            )
          : 255;
    }
  }

  const canvas =
    document.createElement('canvas');

  canvas.width = page.width;
  canvas.height = page.height;

  const context = canvas.getContext(
    '2d'
  );

  if (!context) {
    throw new Error(
      'Browser image canvas is unavailable.'
    );
  }

  const imageData = new ImageData(
    rgba,
    page.width,
    page.height
  );

  context.putImageData(
    imageData,
    0,
    0
  );

  const generatedFile =
    await canvasToJpegFile(
      canvas,
      getGeneratedJpegName(file.name)
    );

  canvas.width = 1;
  canvas.height = 1;

  return generatedFile;
}

function formatFileSize(bytes) {
  if (
    bytes === null ||
    bytes === undefined ||
    Number.isNaN(Number(bytes))
  ) {
    return '';
  }

  const size = Number(bytes);

  if (size >= 1024 * 1024 * 1024) {
    return `${(
      size /
      1024 /
      1024 /
      1024
    ).toFixed(1)} GB`;
  }

  if (size >= 1024 * 1024) {
    return `${(
      size /
      1024 /
      1024
    ).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(
      size /
      1024
    ).toFixed(1)} KB`;
  }

  
return `${size} bytes`;
}

function clampFocusValue(value) {
  return Math.min(1, Math.max(0, value));
}

function normalizeFocusInput(value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  return String(clampFocusValue(number));
}

function formatFocusCoordinate(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  return clampFocusValue(number)
    .toFixed(4)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

function getStoredFocusPair(xValue, yValue) {
  const x = Number(xValue);
  const y = Number(yValue);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: clampFocusValue(x),
    y: clampFocusValue(y)
  };
}

function getContainFrame(bounds, naturalWidth, naturalHeight) {
  if (!bounds.width || !bounds.height || !naturalWidth || !naturalHeight) {
    return null;
  }

  const scale = Math.min(
    bounds.width / naturalWidth,
    bounds.height / naturalHeight
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    left: (bounds.width - width) / 2,
    top: (bounds.height - height) / 2,
    width,
    height
  };
}

function ReplayFocusPickerCard({
  label,
  description,
  imageUrl,
  xValue,
  yValue,
  onCoordinateChange,
  onClear
}) {
  const focus = getStoredFocusPair(xValue, yValue);
  const [imageMeta, setImageMeta] = useState({
    width: 0,
    height: 0
  });

  const previewFrame = getContainFrame(
    {
      width: 1,
      height: 1
    },
    imageMeta.width,
    imageMeta.height
  );

  const handleImageClick = (event) => {
    if (!imageUrl) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const containFrame = getContainFrame(
      {
        width: bounds.width,
        height: bounds.height
      },
      imageMeta.width,
      imageMeta.height
    );

    if (!containFrame) {
      return;
    }

    const relativeX = event.clientX - bounds.left - containFrame.left;
    const relativeY = event.clientY - bounds.top - containFrame.top;

    if (
      relativeX < 0 ||
      relativeY < 0 ||
      relativeX > containFrame.width ||
      relativeY > containFrame.height
    ) {
      return;
    }

    const nextX = clampFocusValue(
      relativeX / containFrame.width
    );
    const nextY = clampFocusValue(
      relativeY / containFrame.height
    );

    onCoordinateChange(nextX, nextY);
  };

  const pointStyle = focus && previewFrame
    ? {
        left: `${previewFrame.left * 100 + focus.x * previewFrame.width * 100}%`,
        top: `${previewFrame.top * 100 + focus.y * previewFrame.height * 100}%`
      }
    : null;

  return (
    <article className="admin-replay-focus-card">
      <div className="admin-replay-focus-card-header">
        <div>
          <small>MISSION REPLAY TARGET</small>
          <strong>{label}</strong>
        </div>

        {focus && (
          <button type="button" onClick={onClear}>
            CLEAR
          </button>
        )}
      </div>

      <p>{description}</p>

      <button
        type="button"
        className={`admin-replay-focus-preview${imageUrl ? '' : ' is-disabled'}`}
        onClick={handleImageClick}
        disabled={!imageUrl}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={`${label} replay target`}
              onLoad={(event) => {
                setImageMeta({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                });
              }}
            />
            <span className="admin-replay-focus-crosshair" aria-hidden="true" />
            {pointStyle && (
              <span
                className="admin-replay-focus-point"
                style={pointStyle}
                aria-hidden="true"
              />
            )}
          </>
        ) : (
          <span className="admin-replay-focus-empty">
            IMAGE NOT AVAILABLE YET
          </span>
        )}
      </button>

      <div className="admin-replay-focus-fields">
        <label>
          <span>X</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.0001"
            value={xValue}
            onChange={(event) => onCoordinateChange(event.target.value, yValue)}
            placeholder="0.5000"
          />
        </label>

        <label>
          <span>Y</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.0001"
            value={yValue}
            onChange={(event) => onCoordinateChange(xValue, event.target.value)}
            placeholder="0.5000"
          />
        </label>
      </div>

      <small className="admin-replay-focus-hint">
        Click directly on the object center. Only clicks on the visible image area are recorded.
      </small>
    </article>
  );
}

const emptyCapture = {
  title: '',
  subtitle: '',
  category: 'Astrophotography',
  objectType: '',
  constellation: '',
  distance: '',
  captureDate: '',
  exposure: '',
  exposureSeconds: '',
  frameCount: '',
  gain: '',
  processing: '',
  equipment: '',
  notes: '',
  nextGoal: '',
  ra: '',
  dec: '',
  sortOrder: '',
  replayRawFocusX: '',
  replayRawFocusY: '',
  replayStackedFocusX: '',
  replayStackedFocusY: '',
  replayFinalFocusX: '',
  replayFinalFocusY: ''
};

function databaseRowToForm(capture) {
  return {
    title: capture.title || '',
    subtitle: capture.subtitle || '',
    category:
      capture.category ||
      'Astrophotography',
    objectType:
      capture.object_type || '',
    constellation:
      capture.constellation || '',
    distance: capture.distance || '',
    captureDate:
      capture.capture_date || '',
    exposure: capture.exposure || '',
    exposureSeconds: capture.exposure_seconds === null || capture.exposure_seconds === undefined ? '' : String(capture.exposure_seconds),
    frameCount: capture.frame_count === null || capture.frame_count === undefined ? '' : String(capture.frame_count),
    gain: capture.gain === null || capture.gain === undefined ? '' : String(capture.gain),
    processing:
      capture.processing || '',
    equipment: capture.equipment || '',
    notes: capture.notes || '',
    nextGoal: capture.next_goal || '',
    ra:
      capture.ra === null ||
      capture.ra === undefined
        ? ''
        : String(capture.ra),
    dec:
      capture.dec === null ||
      capture.dec === undefined
        ? ''
        : String(capture.dec),
    sortOrder:
      capture.sort_order === null ||
      capture.sort_order === undefined
        ? ''
        : String(capture.sort_order),
    replayRawFocusX: normalizeFocusInput(capture.replay_raw_focus_x),
    replayRawFocusY: normalizeFocusInput(capture.replay_raw_focus_y),
    replayStackedFocusX: normalizeFocusInput(capture.replay_stacked_focus_x),
    replayStackedFocusY: normalizeFocusInput(capture.replay_stacked_focus_y),
    replayFinalFocusX: normalizeFocusInput(capture.replay_final_focus_x),
    replayFinalFocusY: normalizeFocusInput(capture.replay_final_focus_y)
  };
}

function getCaptureImageUrl(image) {
  if (!image) {
    return '';
  }

  if (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  const cleanPath = image.replace(
    /^\/+/,
    ''
  );

  return (
    import.meta.env.BASE_URL +
    cleanPath
  );
}

function isR2ImageUrl(image) {
  return String(image || '').startsWith(
    `${GALLERY_API}/media/`
  );
}

async function getCrewAccessToken() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.access_token) {
    throw new Error(
      'Crew authentication expired. Log in again.'
    );
  }

  return session.access_token;
}

export default function AdminGallery() {
  const editorRef = useRef(null);
  const {
    activeOperation
  } = useActiveOperation();

  const [captures, setCaptures] =
    useState([]);

  const [captureSearch, setCaptureSearch] = useState('');
  const [gainFilter, setGainFilter] = useState('');
  const [exposureFilter, setExposureFilter] = useState('');
  const [framesFilter, setFramesFilter] = useState('');

  const [status, setStatus] =
    useState('loading');

  const [
    editingCaptureId,
    setEditingCaptureId
  ] = useState(null);

  const [form, setForm] =
    useState(emptyCapture);

  const [sourceOperation, setSourceOperation] =
    useState(null);

  const [handoffLoaded, setHandoffLoaded] =
    useState(false);

  const [imageFile, setImageFile] =
    useState(null);

  const [masterFile, setMasterFile] =
    useState(null);

  const [rawFile, setRawFile] =
    useState(null);

  const [stackedFile, setStackedFile] =
    useState(null);

  const [previewUrl, setPreviewUrl] =
    useState('');

  const [rawPreviewUrl, setRawPreviewUrl] =
    useState('');

  const [stackedPreviewUrl, setStackedPreviewUrl] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [
    convertingMaster,
    setConvertingMaster
  ] = useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [targetScanBusy, setTargetScanBusy] = useState(false);
  const [targetScanError, setTargetScanError] = useState('');
  const [targetScanResult, setTargetScanResult] = useState(null);

  const [
    imageDragActive,
    setImageDragActive
  ] = useState(false);

  const [
    masterDragActive,
    setMasterDragActive
  ] = useState(false);

  const [
    rawDragActive,
    setRawDragActive
  ] = useState(false);

  const [
    stackedDragActive,
    setStackedDragActive
  ] = useState(false);

  useEffect(() => {
    if (editingCaptureId === null) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingCaptureId]);

  const editingCapture =
    editingCaptureId === 'new'
      ? null
      : captures.find(
          (capture) =>
            capture.id === editingCaptureId
        ) || null;

  async function loadCaptures() {
    setStatus('loading');
    setError('');

    const {
      data,
      error: loadError
    } = await supabase
      .from('gallery')
      .select('*')
      .order('sort_order', {
        ascending: true
      });

    if (loadError) {
      console.error(loadError);

      setError(loadError.message);
      setStatus('error');

      return;
    }

    setCaptures(data || []);
    setStatus('ready');
  }

  useEffect(() => {
    loadCaptures();
  }, []);

  useEffect(() => {
    if (
      handoffLoaded ||
      status !== 'ready' ||
      !new URLSearchParams(window.location.search).has(
        'operationHandoff'
      )
    ) {
      return;
    }

    setHandoffLoaded(true);

    const handoff = readOperationReportHandoff();

    if (!handoff?.operation?.id) {
      setError(
        'Operation report handoff data is no longer available.'
      );
      return;
    }

    const capture = handoff.selectedCaptureId
      ? captures.find(
          (item) => item.id === handoff.selectedCaptureId
        )
      : null;

    const handoffNotes = buildOperationReportNotes(handoff);
    const handoffNextGoal =
      buildOperationReportNextGoal(handoff);
    const nextSortOrder =
      captures.reduce(
        (highest, item) =>
          Math.max(highest, item.sort_order || 0),
        0
      ) + 1;

    setSourceOperation({
      id: handoff.operation.id,
      designation: handoff.operation.designation,
      target: handoff.operation.target,
      captureCount:
        handoff.summary?.captures?.length || 0,
      incidentCount:
        handoff.summary?.incidents?.length || 0,
      participants:
        handoff.summary?.participants || []
    });

    setEditingCaptureId(capture?.id || 'new');

    if (capture) {
      const existingForm = databaseRowToForm(capture);

      setForm({
        ...existingForm,
        captureDate:
          existingForm.captureDate ||
          formatOperationReportDate(
            handoff.operation.startedAt
          ),
        notes: [existingForm.notes, handoffNotes]
          .filter(Boolean)
          .join('\n\n'),
        nextGoal: [existingForm.nextGoal, handoffNextGoal]
          .filter(Boolean)
          .join('; ')
      });

      setPreviewUrl(getCaptureImageUrl(capture.image));
    } else {
      setForm({
        ...emptyCapture,
        title:
          handoff.operation.target ||
          handoff.operation.designation ||
          '',
        subtitle:
          handoff.operation.objective ||
          `${handoff.operation.operationType || 'Observing'} operation`,
        category:
          handoff.operation.operationType ||
          'Astrophotography',
        captureDate: formatOperationReportDate(
          handoff.operation.startedAt
        ),
        notes: handoffNotes,
        nextGoal: handoffNextGoal,
        sortOrder: String(nextSortOrder)
      });

      setPreviewUrl('');
    }

    setImageFile(null);
    setMasterFile(null);
    setRawFile(null);
    setStackedFile(null);
    setRawPreviewUrl(getCaptureImageUrl(capture?.raw_image));
    setStackedPreviewUrl(getCaptureImageUrl(capture?.stacked_image));
    setMessage(
      `OPERATION HANDOFF LOADED · ${String(
        handoff.operation.designation || 'OPERATION'
      ).toUpperCase()}`
    );
    setError('');
  }, [captures, handoffLoaded, status]);

  useEffect(() => {
    return () => {
      [previewUrl, rawPreviewUrl, stackedPreviewUrl]
        .filter((url) => url.startsWith('blob:'))
        .forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrl, rawPreviewUrl, stackedPreviewUrl]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function scanTargetMetadata() {
    const target = form.title.trim();

    if (!target) {
      setTargetScanError('Enter a target name or catalog designation first.');
      return;
    }

    setTargetScanBusy(true);
    setTargetScanError('');
    setTargetScanResult(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('target-autofill', {
        body: {
          target,
          existingValues: {
            subtitle: form.subtitle,
            objectType: form.objectType,
            constellation: form.constellation,
            distance: form.distance,
            ra: form.ra,
            dec: form.dec,
            notes: form.notes
          }
        }
      });

      if (invokeError) throw invokeError;
      if (!data?.target) throw new Error(data?.error || 'Target scanner returned no match.');

      setTargetScanResult(data.target);
    } catch (scanError) {
      console.error('[TARGET AUTOFILL] Scan failed:', scanError);
      setTargetScanError(scanError.message || 'Target metadata scan failed.');
    } finally {
      setTargetScanBusy(false);
    }
  }

  function applyTargetScan(overwrite = false) {
    if (!targetScanResult) return;

    const proposed = {
      title: targetScanResult.displayName,
      subtitle: targetScanResult.subtitle,
      objectType: targetScanResult.objectType,
      constellation: targetScanResult.constellation,
      distance: targetScanResult.distance,
      ra: targetScanResult.rightAscensionHours,
      dec: targetScanResult.declinationDegrees,
      notes: targetScanResult.notes
    };

    setForm((current) => {
      const next = { ...current };

      Object.entries(proposed).forEach(([field, value]) => {
        if (value === null || value === undefined || value === '') return;
        if (overwrite || !String(current[field] ?? '').trim()) next[field] = String(value);
      });

      return next;
    });

    setMessage(overwrite
      ? 'TARGET DATA APPLIED · EXISTING METADATA REPLACED'
      : 'TARGET DATA APPLIED · EXISTING ENTRIES PRESERVED');
  }

  function releasePreviewUrl() {
    if (
      previewUrl.startsWith('blob:')
    ) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  function releaseStagePreviewUrl(stage) {
    const url = stage === 'raw'
      ? rawPreviewUrl
      : stackedPreviewUrl;

    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  function resetEditor() {
    releasePreviewUrl();

    setEditingCaptureId(null);
    setForm(emptyCapture);
    setSourceOperation(null);
    setImageFile(null);
    setMasterFile(null);
    setRawFile(null);
    setStackedFile(null);
    setPreviewUrl('');
    setRawPreviewUrl('');
    setStackedPreviewUrl('');
    setMessage('');
    setError('');
  }

  function startNewCapture() {
    releasePreviewUrl();
    setSourceOperation(null);

    const nextSortOrder =
      captures.reduce(
        (highest, capture) =>
          Math.max(
            highest,
            capture.sort_order || 0
          ),
        0
      ) + 1;

    setEditingCaptureId('new');

    setForm({
      ...emptyCapture,
      sortOrder: String(nextSortOrder)
    });

    setImageFile(null);
    setMasterFile(null);
    setRawFile(null);
    setStackedFile(null);
    setPreviewUrl('');
    setRawPreviewUrl('');
    setStackedPreviewUrl('');
    setMessage('');
    setError('');
  }

  function startEditingCapture(capture) {
    releasePreviewUrl();

    setSourceOperation(
      capture.source_operation_id
        ? {
            id: capture.source_operation_id,
            designation:
              capture.source_operation_designation ||
              'Linked operation'
          }
        : null
    );

    setEditingCaptureId(capture.id);
    setForm(
      databaseRowToForm(capture)
    );

    setImageFile(null);
    setMasterFile(null);
    setRawFile(null);
    setStackedFile(null);

    setPreviewUrl(
      getCaptureImageUrl(capture.image)
    );
    setRawPreviewUrl(
      getCaptureImageUrl(capture.raw_image)
    );
    setStackedPreviewUrl(
      getCaptureImageUrl(capture.stacked_image)
    );

    setMessage('');
    setError('');
  }

  function acceptImageFile(file) {
    if (!file) {
      return;
    }

    const lowerName =
      file.name.toLowerCase();

    const isSupportedImage =
      (
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp')
      );

    if (!isSupportedImage) {
      setError(
        'Mission Capture must be a JPG, PNG, or WEBP image.'
      );

      return;
    }

    releasePreviewUrl();

    setImageFile(file);

    setPreviewUrl(
      URL.createObjectURL(file)
    );

    setMessage('');
    setError('');
  }

  function handleImageSelection(event) {
    acceptImageFile(
      event.target.files?.[0]
    );

    event.target.value = '';
  }

  function handleImageDrop(event) {
    event.preventDefault();

    setImageDragActive(false);

    if (
      convertingMaster ||
      saving
    ) {
      return;
    }

    acceptImageFile(
      event.dataTransfer.files?.[0]
    );
  }

  async function acceptMasterFile(file) {
    if (!file) {
      return;
    }

    const lowerName =
      file.name.toLowerCase();

    if (
      !lowerName.endsWith('.tif') &&
      !lowerName.endsWith('.tiff')
    ) {
      setError(
        'Full-resolution master must be a .tif or .tiff file.'
      );

      return;
    }

    if (
      file.size >
      MAX_MASTER_UPLOAD_BYTES
    ) {
      setError(
        'TIFF master is too large for the current upload route. Keep the file under 99 MB.'
      );

      return;
    }

    setConvertingMaster(true);
    setMessage('');
    setError('');

    try {
      const generatedImage =
        await generateWebJpegFromTiff(
          file
        );

      releasePreviewUrl();

      setMasterFile(file);
      setImageFile(generatedImage);

      setPreviewUrl(
        URL.createObjectURL(
          generatedImage
        )
      );

      setMessage(
        `WEB JPEG GENERATED AUTOMATICALLY · ${generatedImage.name} · ${formatFileSize(
          generatedImage.size
        )}`
      );
    } catch (conversionError) {
      console.error(conversionError);

      setMasterFile(null);
      setImageFile(null);

      setError(
        conversionError.message ||
          'TIFF conversion failed.'
      );
    }

    setConvertingMaster(false);
  }

  async function handleMasterSelection(
    event
  ) {
    await acceptMasterFile(
      event.target.files?.[0]
    );

    event.target.value = '';
  }

  function handleMasterDrop(event) {
    event.preventDefault();

    setMasterDragActive(false);

    if (
      convertingMaster ||
      saving
    ) {
      return;
    }

    acceptMasterFile(
      event.dataTransfer.files?.[0]
    );
  }

  async function acceptReplayStageFile(file, stage) {
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    const isTiff = lowerName.endsWith('.tif') || lowerName.endsWith('.tiff');
    const isWebImage = /\.(jpe?g|png|webp)$/i.test(lowerName);

    if (!isTiff && !isWebImage) {
      setError('Mission Replay stage images must be JPG, PNG, WEBP, or TIFF files.');
      return;
    }

    if (isTiff && file.size > MAX_MASTER_UPLOAD_BYTES) {
      setError('Mission Replay TIFF is too large for browser conversion. Keep it under 99 MB.');
      return;
    }

    setMessage('');
    setError('');

    try {
      const stageFile = isTiff
        ? await generateWebJpegFromTiff(file)
        : file;

      releaseStagePreviewUrl(stage);
      const nextPreviewUrl = URL.createObjectURL(stageFile);

      if (stage === 'raw') {
        setRawFile(stageFile);
        setRawPreviewUrl(nextPreviewUrl);
      } else {
        setStackedFile(stageFile);
        setStackedPreviewUrl(nextPreviewUrl);
      }

      if (isTiff) {
        setMessage(`${stage.toUpperCase()} WEB JPEG GENERATED FROM TIFF · ${stageFile.name} · ${formatFileSize(stageFile.size)}`);
      }
    } catch (stageError) {
      console.error(stageError);
      setError(stageError.message || `Could not prepare the ${stage} stage image.`);
    }
  }

  async function handleReplayStageSelection(event, stage) {
    await acceptReplayStageFile(event.target.files?.[0], stage);
    event.target.value = '';
  }

  function handleReplayStageDrop(event, stage) {
    event.preventDefault();

    if (stage === 'raw') {
      setRawDragActive(false);
    } else {
      setStackedDragActive(false);
    }

    if (saving || convertingMaster) {
      return;
    }

    acceptReplayStageFile(event.dataTransfer.files?.[0], stage);
  }

  async function uploadImage(
    file = imageFile
  ) {
    if (!file) {
      return null;
    }

    const accessToken =
      await getCrewAccessToken();

    const response = await fetch(
      `${GALLERY_API}/upload`,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            file.type,

          'X-Filename':
            file.name
        },

        body: file
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          'R2 image upload failed.'
      );
    }

    return {
      image: result.url,
      storagePath: result.key
    };
  }

  async function uploadMaster() {
    if (!masterFile) {
      return null;
    }

    const accessToken =
      await getCrewAccessToken();

    const response = await fetch(
      `${GALLERY_API}/upload-master`,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            masterFile.type ||
            'image/tiff',

          'X-Filename':
            masterFile.name
        },

        body: masterFile
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          'R2 TIFF master upload failed.'
      );
    }

    return {
      url: result.url,
      storagePath: result.key,
      fileName:
        result.fileName ||
        masterFile.name,
      fileSize:
        result.fileSize ??
        masterFile.size
    };
  }

  async function deleteR2Object(
    storagePath
  ) {
    if (!storagePath) {
      return;
    }

    const accessToken =
      await getCrewAccessToken();

    const response = await fetch(
      `${GALLERY_API}/media/${encodeURIComponent(
        storagePath
      )}`,
      {
        method: 'DELETE',

        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
          'R2 object deletion failed.'
      );
    }
  }

  async function handleSave(event) {
    event.preventDefault();

    setSaving(true);
    setMessage('');
    setError('');

    let uploadedImage = null;
    let uploadedMaster = null;
    let uploadedRaw = null;
    let uploadedStacked = null;

    try {
      const requiredFields = [
        ['Title', form.title],
        ['Subtitle', form.subtitle],
        ['Category', form.category],
        ['Object Type', form.objectType],
        ['Constellation', form.constellation],
        ['Distance', form.distance],
        ['Capture Date', form.captureDate],
        ['Exposure Summary', form.exposure],
        ['Exposure per Frame', form.exposureSeconds],
        ['Frames Captured', form.frameCount],
        ['Gain', form.gain],
        ['Processing', form.processing],
        ['Equipment', form.equipment],
        ['Sort Order', form.sortOrder],
        ['Capture Notes', form.notes],
        ['Next Goal', form.nextGoal]
      ];

      const missingFields =
        requiredFields
          .filter(
            ([, value]) =>
              String(value || '').trim() === ''
          )
          .map(([label]) => label);

      if (missingFields.length > 0) {
        throw new Error(
          `Complete these fields: ${missingFields.join(
            ', '
          )}.`
        );
      }

      if (
        editingCaptureId === 'new' &&
        !imageFile &&
        !masterFile
      ) {
        throw new Error(
          'Select a display image or a TIFF master before creating a new capture.'
        );
      }

      const existingCapture =
        editingCaptureId === 'new'
          ? null
          : captures.find(
              (capture) =>
                capture.id ===
                editingCaptureId
            );

      let imageToUpload = imageFile;

      if (
        masterFile &&
        !imageToUpload
      ) {
        setConvertingMaster(true);

        imageToUpload =
          await generateWebJpegFromTiff(
            masterFile
          );

        releasePreviewUrl();

        setImageFile(imageToUpload);

        setPreviewUrl(
          URL.createObjectURL(
            imageToUpload
          )
        );

        setMessage(
          `WEB JPEG GENERATED AUTOMATICALLY · ${imageToUpload.name} · ${formatFileSize(
            imageToUpload.size
          )}`
        );

        setConvertingMaster(false);
      }

      if (imageToUpload) {
        uploadedImage =
          await uploadImage(
            imageToUpload
          );
      }

      if (masterFile) {
        uploadedMaster =
          await uploadMaster();
      }

      if (rawFile) {
        uploadedRaw = await uploadImage(rawFile);
      }

      if (stackedFile) {
        uploadedStacked = await uploadImage(stackedFile);
      }

      const captureRow = {
        title: form.title.trim(),

        subtitle:
          form.subtitle.trim(),

        category:
          form.category.trim() ||
          'Astrophotography',

        object_type:
          form.objectType.trim(),

        constellation:
          form.constellation.trim(),

        distance:
          form.distance.trim(),

        capture_date:
          form.captureDate.trim(),

        exposure:
          form.exposure.trim(),

        exposure_seconds:
          Number(form.exposureSeconds),

        frame_count:
          Number(form.frameCount),

        gain:
          Number(form.gain),

        total_integration_seconds:
          Number(form.exposureSeconds) * Number(form.frameCount),

        processing:
          form.processing.trim(),

        equipment:
          form.equipment.trim(),

        notes:
          form.notes.trim(),

        next_goal:
          form.nextGoal.trim(),

        image:
          uploadedImage?.image ||
          existingCapture?.image ||
          '',

        storage_path:
          uploadedImage?.storagePath ||
          existingCapture?.storage_path ||
          null,

        raw_image:
          uploadedRaw?.image ||
          existingCapture?.raw_image ||
          null,

        raw_storage_path:
          uploadedRaw?.storagePath ||
          existingCapture?.raw_storage_path ||
          null,

        stacked_image:
          uploadedStacked?.image ||
          existingCapture?.stacked_image ||
          null,

        stacked_storage_path:
          uploadedStacked?.storagePath ||
          existingCapture?.stacked_storage_path ||
          null,

        master_file_url:
          uploadedMaster?.url ||
          existingCapture?.master_file_url ||
          null,

        master_storage_path:
          uploadedMaster?.storagePath ||
          existingCapture?.master_storage_path ||
          null,

        master_file_name:
          uploadedMaster?.fileName ||
          existingCapture?.master_file_name ||
          null,

        master_file_size:
          uploadedMaster?.fileSize ??
          existingCapture?.master_file_size ??
          null,

        replay_raw_focus_x:
          form.replayRawFocusX.trim() === ''
            ? null
            : Number(form.replayRawFocusX),

        replay_raw_focus_y:
          form.replayRawFocusY.trim() === ''
            ? null
            : Number(form.replayRawFocusY),

        replay_stacked_focus_x:
          form.replayStackedFocusX.trim() === ''
            ? null
            : Number(form.replayStackedFocusX),

        replay_stacked_focus_y:
          form.replayStackedFocusY.trim() === ''
            ? null
            : Number(form.replayStackedFocusY),

        replay_final_focus_x:
          form.replayFinalFocusX.trim() === ''
            ? null
            : Number(form.replayFinalFocusX),

        replay_final_focus_y:
          form.replayFinalFocusY.trim() === ''
            ? null
            : Number(form.replayFinalFocusY),

        ra:
          form.ra.trim() === ''
            ? null
            : Number(form.ra),

        dec:
          form.dec.trim() === ''
            ? null
            : Number(form.dec),

        sort_order:
          form.sortOrder.trim() === ''
            ? 0
            : Number(form.sortOrder),

        source_operation_id:
          sourceOperation?.id ||
          existingCapture?.source_operation_id ||
          null,

        source_operation_designation:
          sourceOperation?.designation ||
          existingCapture?.source_operation_designation ||
          null,

        updated_at:
          new Date().toISOString()
      };

      if (
        form.ra.trim() !== '' &&
        Number.isNaN(captureRow.ra)
      ) {
        throw new Error(
          'Right ascension must be a number.'
        );
      }

      if (
        form.dec.trim() !== '' &&
        Number.isNaN(captureRow.dec)
      ) {
        throw new Error(
          'Declination must be a number.'
        );
      }

      const replayFocusFields = [
        ['RAW target X', captureRow.replay_raw_focus_x],
        ['RAW target Y', captureRow.replay_raw_focus_y],
        ['STACKED target X', captureRow.replay_stacked_focus_x],
        ['STACKED target Y', captureRow.replay_stacked_focus_y],
        ['FINAL target X', captureRow.replay_final_focus_x],
        ['FINAL target Y', captureRow.replay_final_focus_y]
      ];

      const invalidReplayFocusFields = replayFocusFields
        .filter(([, value]) => value !== null)
        .filter(([, value]) => Number.isNaN(value) || value < 0 || value > 1)
        .map(([label]) => label);

      if (invalidReplayFocusFields.length > 0) {
        throw new Error(
          `Replay target coordinates must be between 0 and 1. Fix: ${invalidReplayFocusFields.join(', ')}.`
        );
      }

      let saveError;
      let savedCapture = null;

      if (
        editingCaptureId === 'new'
      ) {
        const {
          data: insertedCapture,
          error: insertError
        } = await supabase
          .from('gallery')
          .insert(captureRow)
          .select('id, title')
          .single();

        savedCapture = insertedCapture;
        saveError = insertError;
      } else {
        const {
          error: updateError
        } = await supabase
          .from('gallery')
          .update(captureRow)
          .eq(
            'id',
            editingCaptureId
          );

        saveError = updateError;
      }

      if (saveError) {
        if (uploadedImage) {
          await deleteR2Object(
            uploadedImage.storagePath
          );
        }

        if (uploadedMaster) {
          await deleteR2Object(
            uploadedMaster.storagePath
          );
        }

        if (uploadedRaw) {
          await deleteR2Object(uploadedRaw.storagePath);
        }

        if (uploadedStacked) {
          await deleteR2Object(uploadedStacked.storagePath);
        }

        throw saveError;
      }

      if (
        editingCaptureId !== 'new' &&
        uploadedImage &&
        existingCapture?.image &&
        existingCapture?.storage_path &&
        existingCapture.image !==
          uploadedImage.image
      ) {
        if (
          isR2ImageUrl(
            existingCapture.image
          )
        ) {
          await deleteR2Object(
            existingCapture.storage_path
          );
        }
      }

      if (
        editingCaptureId !== 'new' &&
        uploadedMaster &&
        existingCapture?.master_storage_path &&
        existingCapture.master_storage_path !==
          uploadedMaster.storagePath
      ) {
        await deleteR2Object(
          existingCapture.master_storage_path
        );
      }

      if (
        editingCaptureId !== 'new' &&
        uploadedRaw &&
        existingCapture?.raw_storage_path &&
        existingCapture.raw_storage_path !== uploadedRaw.storagePath
      ) {
        await deleteR2Object(existingCapture.raw_storage_path);
      }

      if (
        editingCaptureId !== 'new' &&
        uploadedStacked &&
        existingCapture?.stacked_storage_path &&
        existingCapture.stacked_storage_path !== uploadedStacked.storagePath
      ) {
        await deleteR2Object(existingCapture.stacked_storage_path);
      }

      const wasNew =
        editingCaptureId === 'new';

      if (
        wasNew &&
        activeOperation &&
        savedCapture
      ) {
        const operationEventResult =
          await recordOperationEvent({
            operation: activeOperation,
            eventType:
              'CAPTURE_CREATED',
            eventLabel:
              'CAPTURE CREATED',
            resourceType: 'gallery',
            resourceId:
              savedCapture.id,
            resourceName:
              savedCapture.title ||
              captureRow.title,
            details: {
              objectType:
                captureRow.object_type,
              exposure:
                captureRow.exposure,
              captureDate:
                captureRow.capture_date
            }
          });

        if (
          !operationEventResult.success &&
          !operationEventResult.skipped
        ) {
          console.error(
            'Capture saved, but operation event logging failed:',
            operationEventResult.error
          );
        }
      }

      if (sourceOperation?.id) {
        const reportId =
          savedCapture?.id || editingCaptureId;

        const reportLinkResult = await recordOperationEvent({
          operation: {
            id: sourceOperation.id,
            designation: sourceOperation.designation
          },
          eventType: 'MISSION_REPORT_LINKED',
          eventLabel: 'MISSION REPORT LINKED',
          resourceType: 'gallery',
          resourceId: reportId,
          resourceName: captureRow.title,
          details: {
            reportTitle: captureRow.title
          }
        });

        if (
          !reportLinkResult.success &&
          !reportLinkResult.skipped
        ) {
          console.error(
            'Mission report saved, but operation link event failed:',
            reportLinkResult.error
          );
        }

        clearOperationReportHandoff();
        window.history.replaceState(
          {},
          '',
          '/admin/gallery'
        );
      }

      if (wasNew && savedCapture?.id) {
        const signalResult = await sendCuzBroSignal({
          topic: 'mission_captures',
          eventKey: `mission-capture:${savedCapture.id}`,
          subject: `New CuzBro Mission Capture · ${captureRow.title}`,
          headline: captureRow.title,
          summary:
            captureRow.notes ||
            'A new image has been added to the CuzBro Mission Archive.',
          detailLines: [
            captureRow.object_type
              ? `Object type: ${captureRow.object_type}`
              : '',
            captureRow.capture_date
              ? `Capture date: ${captureRow.capture_date}`
              : '',
            captureRow.exposure
              ? `Exposure: ${captureRow.exposure}`
              : ''
          ].filter(Boolean),
          ctaLabel: 'VIEW MISSION ARCHIVE',
          ctaUrl: 'https://cuzbro.net/#gallery'
        });

        if (!signalResult.ok) {
          setError(
            `Capture saved, but subscriber notification failed: ${signalResult.error}`
          );
        }
      }

      await loadCaptures();

      releasePreviewUrl();

      setEditingCaptureId(null);
      setForm(emptyCapture);
      setSourceOperation(null);
      setImageFile(null);
      setMasterFile(null);
      setRawFile(null);
      setStackedFile(null);
      setPreviewUrl('');
      setRawPreviewUrl('');
      setStackedPreviewUrl('');

      setMessage(
        uploadedMaster
          ? wasNew
            ? 'CAPTURE ADDED · TIFF MASTER + AUTO-GENERATED WEB JPEG ONLINE'
            : 'CAPTURE UPDATED · TIFF MASTER + AUTO-GENERATED WEB JPEG ONLINE'
          : wasNew
            ? 'CAPTURE ADDED TO MISSION ARCHIVE · R2 STORAGE ONLINE'
            : 'CAPTURE RECORD UPDATED'
      );
    } catch (saveException) {
      console.error(saveException);

      setConvertingMaster(false);

      setError(
        saveException.message ||
          'Capture save failed.'
      );
    }

    setSaving(false);
  }

  async function handleSetFeatured(
    capture
  ) {
    setMessage('');
    setError('');

    try {
      const {
        error: clearError
      } = await supabase
        .from('gallery')
        .update({
          is_featured: false
        })
        .eq('is_featured', true);

      if (clearError) {
        throw clearError;
      }

      const {
        error: featureError
      } = await supabase
        .from('gallery')
        .update({
          is_featured: true,
          updated_at:
            new Date().toISOString()
        })
        .eq('id', capture.id);

      if (featureError) {
        throw featureError;
      }

      setMessage(
        `${capture.title} SET AS FEATURED`
      );

      await loadCaptures();
    } catch (featureException) {
      console.error(featureException);

      setError(
        featureException.message ||
          'Featured capture update failed.'
      );
    }
  }

  async function handleDelete(capture) {
    const confirmed = window.confirm(
      `Delete ${capture.title} from the Mission Archive?`
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setError('');

    try {
      const remainingCaptures =
        captures.filter(
          (item) =>
            item.id !== capture.id
        );

      const {
        error: deleteError
      } = await supabase
        .from('gallery')
        .delete()
        .eq('id', capture.id);

      if (deleteError) {
        throw deleteError;
      }

      if (
        isR2ImageUrl(capture.image)
      ) {
        await deleteR2Object(
          capture.storage_path
        );
      }

      await deleteR2Object(
        capture.master_storage_path
      );

      if (
        capture.is_featured &&
        remainingCaptures.length > 0
      ) {
        const {
          error: featureError
        } = await supabase
          .from('gallery')
          .update({
            is_featured: true,
            updated_at:
              new Date().toISOString()
          })
          .eq(
            'id',
            remainingCaptures[0].id
          );

        if (featureError) {
          throw featureError;
        }
      }

      setMessage(
        `${capture.title} DELETED`
      );

      await loadCaptures();
    } catch (deleteException) {
      console.error(deleteException);

      setError(
        deleteException.message ||
          'Capture deletion failed.'
      );
    }
  }

  const filteredCaptures = captures.filter((capture) => {
    const query = captureSearch.trim().toLowerCase();
    const matchesText = !query || [
      capture.title, capture.subtitle, capture.object_type, capture.constellation,
      capture.equipment, capture.processing, capture.notes, capture.exposure
    ].some((value) => String(value || '').toLowerCase().includes(query));

    const matchesGain = !gainFilter || Number(capture.gain) === Number(gainFilter);
    const matchesExposure = !exposureFilter || Number(capture.exposure_seconds) === Number(exposureFilter);
    const matchesFrames = !framesFilter || Number(capture.frame_count) === Number(framesFilter);
    return matchesText && matchesGain && matchesExposure && matchesFrames;
  });

  return (
    <div className="admin-page admin-gallery-page">
      <header className="admin-header">
        <div className="admin-brand">
          <a
            href="/"
            aria-label="CuzBro homepage"
          >
            <img
              src={
                import.meta.env.BASE_URL +
                'assets/cuzbro-logo.png'
              }
              alt="CuzBro logo"
            />
          </a>

          <div>
            <span>
              SECURE CREW TERMINAL
            </span>

            <h1>Capture Control</h1>
          </div>
        </div>

        <button
          type="button"
          className="admin-logout"
          onClick={() => {
            window.location.href =
              '/admin';
          }}
        >
          <ArrowLeft size={17} />
          CONTROL CENTER
        </button>
      </header>

      <main className="admin-main">
        <section className="admin-log-heading">
          <div>
            <span className="admin-eyebrow">
              MISSION ARCHIVE
            </span>

            <h2>Capture Control</h2>

            <p>
              Upload astrophotography
              captures and maintain the
              public CuzBro Mission Archive.
            </p>
          </div>

          <button
            type="button"
            className="admin-new-mission"
            onClick={startNewCapture}
          >
            <ImagePlus size={18} />
            NEW CAPTURE
          </button>
        </section>

        {activeOperation && (
          <a
            className="admin-inline-operation"
            href="/admin/operation"
          >
            <span>
              <i />
              ACTIVE OPERATION
            </span>

            <strong>
              {activeOperation.designation}
            </strong>

            <small>
              NEW CAPTURES WILL BE RECORDED IN THE OPERATION TIMELINE · OPEN COMMAND →
            </small>
          </a>
        )}

        {message && (
          <div className="admin-success-message">
            {message}
          </div>
        )}

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        {editingCaptureId !== null && (
          <section ref={editorRef} className="admin-mission-editor">
            <div className="admin-editor-header">
              <div>
                <span className="admin-card-eyebrow">
                  CAPTURE EDITOR
                </span>

                <h3>
                  {editingCaptureId ===
                  'new'
                    ? 'New Mission Capture'
                    : `Edit ${form.title}`}
                </h3>
              </div>

              <button
                type="button"
                className="admin-editor-close"
                onClick={resetEditor}
              >
                <X size={20} />
              </button>
            </div>

            {sourceOperation && (
              <section className="admin-operation-handoff-banner">
                <span>
                  <Link2 size={18} />
                </span>

                <div>
                  <small>OPERATION HANDOFF</small>
                  <strong>{sourceOperation.designation}</strong>
                  <p>
                    This Mission Report will be permanently linked to
                    the source operation. Review the carried-over notes
                    before saving.
                  </p>
                </div>

                <FileText size={22} />
              </section>
            )}

            <form
              onSubmit={handleSave}
              noValidate
            >
              <section
                className={`admin-image-uploader admin-drop-zone${
                  imageDragActive
                    ? ' admin-drop-zone-active'
                    : ''
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setImageDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setImageDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();

                  if (
                    event.currentTarget.contains(
                      event.relatedTarget
                    )
                  ) {
                    return;
                  }

                  setImageDragActive(false);
                }}
                onDrop={handleImageDrop}
              >
                <div className="admin-image-preview">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Capture preview"
                    />
                  ) : (
                    <div className="admin-image-empty">
                      <Camera size={40} />

                      <span>
                        NO CAPTURE SELECTED
                      </span>
                    </div>
                  )}
                </div>

                <div className="admin-upload-controls">
                  <span className="admin-card-eyebrow">
                    IMAGE FILE
                  </span>

                  <h4>
                    Mission Capture
                  </h4>

                  <p>
                    Drop a JPG, PNG, or WEBP here,
                    or select one manually.
                    Selecting a TIFF master below
                    automatically generates a
                    full-dimension, quality-98
                    JPEG and places it here.
                  </p>

                  <strong className="admin-drop-zone-hint">
                    {imageDragActive
                      ? 'RELEASE DISPLAY IMAGE'
                      : 'DROP DISPLAY IMAGE HERE'}
                  </strong>

                  <label className="admin-file-button">
                    <Upload size={18} />

                    {imageFile
                      ? 'CHANGE IMAGE'
                      : editingCaptureId ===
                          'new'
                        ? 'SELECT IMAGE'
                        : 'REPLACE IMAGE'}

                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={
                        handleImageSelection
                      }
                    />
                  </label>

                  {imageFile && (
                    <small>
                      {imageFile.name}
                      {' · '}
                      {formatFileSize(
                        imageFile.size
                      )}
                      {masterFile
                        ? ' · AUTO-GENERATED FROM TIFF'
                        : ''}
                    </small>
                  )}
                </div>
              </section>

              <section
                className={`admin-image-uploader admin-master-uploader admin-drop-zone${
                  masterDragActive
                    ? ' admin-drop-zone-active'
                    : ''
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setMasterDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setMasterDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();

                  if (
                    event.currentTarget.contains(
                      event.relatedTarget
                    )
                  ) {
                    return;
                  }

                  setMasterDragActive(false);
                }}
                onDrop={handleMasterDrop}
              >
                <div className="admin-image-preview admin-master-preview">
                  <FileArchive size={42} />

                  <span>
                    {masterFile
                      ? 'TIFF MASTER SELECTED'
                      : editingCaptureId !== 'new' &&
                          editingCapture?.master_file_name
                        ? 'TIFF MASTER STORED'
                        : 'NO TIFF MASTER'}
                  </span>
                </div>

                <div className="admin-upload-controls">
                  <span className="admin-card-eyebrow">
                    FULL-RES MASTER
                  </span>

                  <h4>
                    Original TIFF
                  </h4>

                  <p>
                    Recommended workflow: drop one
                    TIFF here. Capture Control
                    automatically creates the
                    full-dimension quality-98 JPEG
                    used by the website, then
                    stores the original TIFF in R2
                    for full-size download.
                  </p>

                  <strong className="admin-drop-zone-hint">
                    {masterDragActive
                      ? 'RELEASE TIFF MASTER'
                      : 'DROP TIFF MASTER HERE'}
                  </strong>

                  <label className="admin-file-button">
                    <Upload size={18} />

                    {convertingMaster
                      ? 'GENERATING WEB JPEG...'
                      : masterFile
                        ? 'CHANGE TIFF MASTER'
                      : editingCaptureId !== 'new' &&
                          editingCapture?.master_storage_path
                        ? 'REPLACE TIFF MASTER'
                        : 'SELECT TIFF MASTER'}

                    <input
                      type="file"
                      accept=".tif,.tiff,image/tiff"
                      onChange={
                        handleMasterSelection
                      }
                      disabled={
                        convertingMaster ||
                        saving
                      }
                    />
                  </label>

                  {masterFile ? (
                    <small>
                      {masterFile.name}
                      {' · '}
                      {formatFileSize(
                        masterFile.size
                      )}
                    </small>
                  ) : (
                    editingCaptureId !== 'new' &&
                    editingCapture?.master_file_name && (
                      <small>
                        {
                          editingCapture.master_file_name
                        }
                        {' · '}
                        {formatFileSize(
                          editingCapture.master_file_size
                        )}
                      </small>
                    )
                  )}
                </div>
              </section>

              <section className="admin-replay-stage-upload-section">
                <div className="admin-replay-focus-section-header">
                  <div>
                    <span className="admin-card-eyebrow">MISSION REPLAY IMAGES</span>
                    <h4>Raw and stacked stages</h4>
                  </div>
                  <p>Upload one representative raw frame and the stacked result. JPG, PNG, WEBP, and TIFF are accepted; TIFF files are converted to web JPEGs in your browser.</p>
                </div>

                <div className="admin-replay-stage-upload-grid">
                  {[
                    {
                      stage: 'raw',
                      label: 'RAW',
                      description: 'One untouched light frame from the camera.',
                      file: rawFile,
                      preview: rawPreviewUrl || getCaptureImageUrl(editingCapture?.raw_image),
                      dragActive: rawDragActive,
                      setDragActive: setRawDragActive
                    },
                    {
                      stage: 'stacked',
                      label: 'STACKED',
                      description: 'The combined stack before final processing.',
                      file: stackedFile,
                      preview: stackedPreviewUrl || getCaptureImageUrl(editingCapture?.stacked_image),
                      dragActive: stackedDragActive,
                      setDragActive: setStackedDragActive
                    }
                  ].map((stageConfig) => (
                    <article
                      key={stageConfig.stage}
                      className={`admin-replay-stage-uploader admin-drop-zone${stageConfig.dragActive ? ' admin-drop-zone-active' : ''}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        stageConfig.setDragActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        stageConfig.setDragActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          stageConfig.setDragActive(false);
                        }
                      }}
                      onDrop={(event) => handleReplayStageDrop(event, stageConfig.stage)}
                    >
                      <div className="admin-replay-stage-preview">
                        {stageConfig.preview ? (
                          <img src={stageConfig.preview} alt={`${stageConfig.label} Mission Replay stage`} />
                        ) : (
                          <>
                            <ImagePlus size={38} />
                            <span>NO {stageConfig.label} IMAGE</span>
                          </>
                        )}
                      </div>

                      <div className="admin-replay-stage-controls">
                        <span className="admin-card-eyebrow">MISSION REPLAY</span>
                        <h4>{stageConfig.label}</h4>
                        <p>{stageConfig.description}</p>
                        <strong className="admin-drop-zone-hint">
                          {stageConfig.dragActive ? `RELEASE ${stageConfig.label} IMAGE` : `DROP ${stageConfig.label} IMAGE HERE`}
                        </strong>
                        <label className="admin-file-button">
                          <Upload size={18} />
                          {stageConfig.file || stageConfig.preview ? `CHANGE ${stageConfig.label}` : `SELECT ${stageConfig.label}`}
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff"
                            onChange={(event) => handleReplayStageSelection(event, stageConfig.stage)}
                            disabled={saving || convertingMaster}
                          />
                        </label>
                        {stageConfig.file && (
                          <small>{stageConfig.file.name} · {formatFileSize(stageConfig.file.size)}</small>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="admin-replay-focus-section">
                <div className="admin-replay-focus-section-header">
                  <div>
                    <span className="admin-card-eyebrow">
                      MISSION REPLAY TARGET LOCK
                    </span>

                    <h4>
                      Manual subject centering
                    </h4>
                  </div>

                  <p>
                    Click the target in each available phase image so Mission Replay can center the object exactly under the crosshair.
                  </p>
                </div>

                <div className="admin-replay-focus-grid">
                  <ReplayFocusPickerCard
                    label="FINAL / DISPLAY"
                    description="Used for the finished public image. Available for new uploads immediately."
                    imageUrl={
                      previewUrl ||
                      getCaptureImageUrl(
                        editingCapture?.image
                      )
                    }
                    xValue={form.replayFinalFocusX}
                    yValue={form.replayFinalFocusY}
                    onCoordinateChange={(
                      nextX,
                      nextY
                    ) => {
                      updateForm(
                        'replayFinalFocusX',
                        formatFocusCoordinate(nextX)
                      );
                      updateForm(
                        'replayFinalFocusY',
                        formatFocusCoordinate(nextY)
                      );
                    }}
                    onClear={() => {
                      updateForm(
                        'replayFinalFocusX',
                        ''
                      );
                      updateForm(
                        'replayFinalFocusY',
                        ''
                      );
                    }}
                  />

                  <ReplayFocusPickerCard
                    label="RAW"
                    description="Used at the opening of Mission Replay. Existing raw stage image required."
                    imageUrl={
                      rawPreviewUrl ||
                      getCaptureImageUrl(editingCapture?.raw_image)
                    }
                    xValue={form.replayRawFocusX}
                    yValue={form.replayRawFocusY}
                    onCoordinateChange={(
                      nextX,
                      nextY
                    ) => {
                      updateForm(
                        'replayRawFocusX',
                        formatFocusCoordinate(nextX)
                      );
                      updateForm(
                        'replayRawFocusY',
                        formatFocusCoordinate(nextY)
                      );
                    }}
                    onClear={() => {
                      updateForm(
                        'replayRawFocusX',
                        ''
                      );
                      updateForm(
                        'replayRawFocusY',
                        ''
                      );
                    }}
                  />

                  <ReplayFocusPickerCard
                    label="STACKED"
                    description="Used for signal accumulation / stacking. Existing stacked stage image required."
                    imageUrl={
                      stackedPreviewUrl ||
                      getCaptureImageUrl(editingCapture?.stacked_image)
                    }
                    xValue={form.replayStackedFocusX}
                    yValue={form.replayStackedFocusY}
                    onCoordinateChange={(
                      nextX,
                      nextY
                    ) => {
                      updateForm(
                        'replayStackedFocusX',
                        formatFocusCoordinate(nextX)
                      );
                      updateForm(
                        'replayStackedFocusY',
                        formatFocusCoordinate(nextY)
                      );
                    }}
                    onClear={() => {
                      updateForm(
                        'replayStackedFocusX',
                        ''
                      );
                      updateForm(
                        'replayStackedFocusY',
                        ''
                      );
                    }}
                  />
                </div>
              </section>

              <section className="target-autofill-panel">
                <div className="target-autofill-header">
                  <div>
                    <small>CHATGPT TARGET INTELLIGENCE</small>
                    <h3>SCAN ASTRONOMY METADATA</h3>
                    <p>Uses the title above as the target query. Suggestions remain separate until you apply them.</p>
                  </div>

                  <button
                    type="button"
                    className="target-autofill-scan"
                    onClick={scanTargetMetadata}
                    disabled={targetScanBusy || !form.title.trim()}
                  >
                    {targetScanBusy ? <RefreshCw size={18} className="is-spinning" /> : <Sparkles size={18} />}
                    {targetScanBusy ? 'SCANNING TARGET' : 'SCAN TARGET DATA'}
                  </button>
                </div>

                {targetScanError ? <div className="target-autofill-error">{targetScanError}</div> : null}

                {targetScanResult ? (
                  <div className="target-autofill-result">
                    <div className="target-autofill-match">
                      <CheckCircle2 size={22} />
                      <div>
                        <small>MATCHED TARGET</small>
                        <strong>{targetScanResult.displayName}</strong>
                        <span>{targetScanResult.catalogNames?.join(' · ')}</span>
                      </div>
                      <b>{String(targetScanResult.confidence || 'review').toUpperCase()}</b>
                    </div>

                    <div className="target-autofill-grid">
                      <div><span>OBJECT TYPE</span><strong>{targetScanResult.objectType || '—'}</strong></div>
                      <div><span>CONSTELLATION</span><strong>{targetScanResult.constellation || '—'}</strong></div>
                      <div><span>DISTANCE</span><strong>{targetScanResult.distance || '—'}</strong></div>
                      <div><span>RIGHT ASCENSION</span><strong>{targetScanResult.rightAscensionDisplay || '—'}</strong></div>
                      <div><span>DECLINATION</span><strong>{targetScanResult.declinationDisplay || '—'}</strong></div>
                      <div><span>MAGNITUDE / SIZE</span><strong>{targetScanResult.magnitude ?? '—'} · {targetScanResult.angularSize || '—'}</strong></div>
                    </div>

                    {targetScanResult.caution ? <p className="target-autofill-caution">{targetScanResult.caution}</p> : null}

                    <div className="target-autofill-actions">
                      <button type="button" onClick={() => applyTargetScan(false)}>FILL EMPTY FIELDS</button>
                      <button type="button" className="is-destructive" onClick={() => applyTargetScan(true)}>REPLACE METADATA</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="admin-form-grid">
                <label>
                  <span>TITLE</span>

                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) =>
                      updateForm(
                        'title',
                        event.target.value
                      )
                    }
                    placeholder="M51 Whirlpool Galaxy"
                    required
                  />
                </label>

                <label>
                  <span>SUBTITLE</span>

                  <input
                    type="text"
                    value={form.subtitle}
                    onChange={(event) =>
                      updateForm(
                        'subtitle',
                        event.target.value
                      )
                    }
                    placeholder="Interacting galaxy pair"
                    required
                  />
                </label>

                <label>
                  <span>CATEGORY</span>

                  <input
                    type="text"
                    value={form.category}
                    onChange={(event) =>
                      updateForm(
                        'category',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>OBJECT TYPE</span>

                  <input
                    type="text"
                    value={form.objectType}
                    onChange={(event) =>
                      updateForm(
                        'objectType',
                        event.target.value
                      )
                    }
                    placeholder="Galaxy"
                    required
                  />
                </label>

                <label>
                  <span>CONSTELLATION</span>

                  <input
                    type="text"
                    value={
                      form.constellation
                    }
                    onChange={(event) =>
                      updateForm(
                        'constellation',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>DISTANCE</span>

                  <input
                    type="text"
                    value={form.distance}
                    onChange={(event) =>
                      updateForm(
                        'distance',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>CAPTURE DATE</span>

                  <input
                    type="text"
                    value={
                      form.captureDate
                    }
                    onChange={(event) =>
                      updateForm(
                        'captureDate',
                        event.target.value
                      )
                    }
                    placeholder="July 2026"
                    required
                  />
                </label>

                <label>
                  <span>EXPOSURE SUMMARY</span>

                  <input
                    type="text"
                    value={form.exposure}
                    onChange={(event) =>
                      updateForm(
                        'exposure',
                        event.target.value
                      )
                    }
                    placeholder="500 × 10 sec (legacy display label)"
                    required
                  />
                </label>

                <label>
                  <span>EXPOSURE PER FRAME (SECONDS)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.exposureSeconds}
                    onChange={(event) => updateForm('exposureSeconds', event.target.value)}
                    placeholder="10"
                    required
                  />
                </label>

                <label>
                  <span>FRAMES CAPTURED</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.frameCount}
                    onChange={(event) => updateForm('frameCount', event.target.value)}
                    placeholder="500"
                    required
                  />
                </label>

                <label>
                  <span>CAMERA GAIN</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.gain}
                    onChange={(event) => updateForm('gain', event.target.value)}
                    placeholder="120"
                    required
                  />
                </label>

                <label>
                  <span>PROCESSING</span>

                  <input
                    type="text"
                    value={form.processing}
                    onChange={(event) =>
                      updateForm(
                        'processing',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>EQUIPMENT</span>

                  <input
                    type="text"
                    value={form.equipment}
                    onChange={(event) =>
                      updateForm(
                        'equipment',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label>
                  <span>RIGHT ASCENSION</span>

                  <input
                    type="number"
                    step="any"
                    value={form.ra}
                    onChange={(event) =>
                      updateForm(
                        'ra',
                        event.target.value
                      )
                    }
                    placeholder="13.498"
                  />
                </label>

                <label>
                  <span>DECLINATION</span>

                  <input
                    type="number"
                    step="any"
                    value={form.dec}
                    onChange={(event) =>
                      updateForm(
                        'dec',
                        event.target.value
                      )
                    }
                    placeholder="47.195"
                  />
                </label>

                <label>
                  <span>SORT ORDER</span>

                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) =>
                      updateForm(
                        'sortOrder',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>CAPTURE NOTES</span>

                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      updateForm(
                        'notes',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>

                <label className="admin-form-wide">
                  <span>NEXT GOAL</span>

                  <textarea
                    value={form.nextGoal}
                    onChange={(event) =>
                      updateForm(
                        'nextGoal',
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              </div>

              <div className="admin-editor-actions">
                <button
                  type="button"
                  className="admin-editor-cancel"
                  onClick={resetEditor}
                >
                  CANCEL
                </button>

                <button
                  type="submit"
                  className="admin-editor-save"
                  disabled={
                    saving ||
                    convertingMaster
                  }
                >
                  <Save size={17} />

                  {convertingMaster
                    ? 'GENERATING WEB JPEG...'
                    : saving
                      ? 'UPLOADING TO R2...'
                      : editingCaptureId ===
                        'new'
                      ? 'UPLOAD CAPTURE'
                      : 'SAVE CAPTURE'}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="admin-mission-list">
          <div className="admin-list-title">
            <Camera size={20} />

            <span>
              {captures.length}
              {' '}
              ARCHIVED CAPTURES
            </span>
          </div>

          <div className="captureDataFilters">
            <label>
              <span>SEARCH CAPTURE DATA</span>
              <input value={captureSearch} onChange={(event) => setCaptureSearch(event.target.value)} placeholder="Target, equipment, notes, processing…" />
            </label>
            <label>
              <span>GAIN</span>
              <input type="number" min="0" value={gainFilter} onChange={(event) => setGainFilter(event.target.value)} placeholder="Any" />
            </label>
            <label>
              <span>EXPOSURE (SEC)</span>
              <input type="number" min="0" step="0.001" value={exposureFilter} onChange={(event) => setExposureFilter(event.target.value)} placeholder="Any" />
            </label>
            <label>
              <span>FRAMES</span>
              <input type="number" min="1" step="1" value={framesFilter} onChange={(event) => setFramesFilter(event.target.value)} placeholder="Any" />
            </label>
          </div>

          {status === 'loading' && (
            <p className="admin-list-status">
              ACCESSING MISSION ARCHIVE...
            </p>
          )}

          {status === 'ready' &&
            filteredCaptures.map((capture) => (
              <article
                className="admin-capture-row"
                key={capture.id}
              >
                <div className="admin-capture-thumbnail">
                  <img
                    src={getCaptureImageUrl(
                      capture.image
                    )}
                    alt={capture.title}
                  />
                </div>

                <div className="admin-mission-summary">
                  <span className="admin-card-eyebrow">
                    {capture.object_type}
                  </span>

                  <h3>
                    {capture.title}
                  </h3>

                  <p>
                    {capture.subtitle}
                    {' · '}
                    {capture.capture_date}
                  </p>

                  <div className="captureDataChips">
                    <span>{capture.exposure_seconds ?? '—'} SEC / FRAME</span>
                    <span>{capture.frame_count ?? '—'} FRAMES</span>
                    <span>GAIN {capture.gain ?? '—'}</span>
                    <span>{capture.total_integration_seconds ? `${Math.round(capture.total_integration_seconds / 60)} MIN TOTAL` : 'TOTAL TBD'}</span>
                  </div>

                  {capture.master_file_name && (
                    <small>
                      TIFF MASTER ·{' '}
                      {formatFileSize(
                        capture.master_file_size
                      )}
                    </small>
                  )}
                </div>

                <div className="admin-mission-actions">
                  {capture.is_featured ? (
                    <button
                      type="button"
                      disabled
                    >
                      <Star
                        size={16}
                        fill="currentColor"
                      />
                      CURRENT FEATURE
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        handleSetFeatured(
                          capture
                        )
                      }
                    >
                      <Star size={16} />
                      SET AS FEATURED
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      startEditingCapture(
                        capture
                      )
                    }
                  >
                    <Pencil size={16} />
                    EDIT
                  </button>

                  <button
                    type="button"
                    className="admin-delete-button"
                    onClick={() =>
                      handleDelete(capture)
                    }
                  >
                    <Trash2 size={16} />
                    DELETE
                  </button>
                </div>
              </article>
            ))}
        </section>
      </main>
    </div>
  );
}