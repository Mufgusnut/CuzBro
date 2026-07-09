import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  FileArchive,
  FileText,
  Link2,
  ImagePlus,
  Pencil,
  Save,
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

const emptyCapture = {
  title: '',
  subtitle: '',
  category: 'Astrophotography',
  objectType: '',
  constellation: '',
  distance: '',
  captureDate: '',
  exposure: '',
  processing: '',
  equipment: '',
  notes: '',
  nextGoal: '',
  ra: '',
  dec: '',
  sortOrder: ''
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
        : String(capture.sort_order)
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
  const {
    activeOperation
  } = useActiveOperation();

  const [captures, setCaptures] =
    useState([]);

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

  const [previewUrl, setPreviewUrl] =
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

  const [
    imageDragActive,
    setImageDragActive
  ] = useState(false);

  const [
    masterDragActive,
    setMasterDragActive
  ] = useState(false);

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
    setMessage(
      `OPERATION HANDOFF LOADED · ${String(
        handoff.operation.designation || 'OPERATION'
      ).toUpperCase()}`
    );
    setError('');
  }, [captures, handoffLoaded, status]);

  useEffect(() => {
    return () => {
      if (
        previewUrl.startsWith('blob:')
      ) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function releasePreviewUrl() {
    if (
      previewUrl.startsWith('blob:')
    ) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  function resetEditor() {
    releasePreviewUrl();

    setEditingCaptureId(null);
    setForm(emptyCapture);
    setSourceOperation(null);
    setImageFile(null);
    setMasterFile(null);
    setPreviewUrl('');
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
    setPreviewUrl('');
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

    setPreviewUrl(
      getCaptureImageUrl(capture.image)
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

    try {
      const requiredFields = [
        ['Title', form.title],
        ['Subtitle', form.subtitle],
        ['Category', form.category],
        ['Object Type', form.objectType],
        ['Constellation', form.constellation],
        ['Distance', form.distance],
        ['Capture Date', form.captureDate],
        ['Exposure', form.exposure],
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
      setPreviewUrl('');

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
          <section className="admin-mission-editor">
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
                          captures.find(
                            (capture) =>
                              capture.id ===
                              editingCaptureId
                          )?.master_file_name
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
                          captures.find(
                            (capture) =>
                              capture.id ===
                              editingCaptureId
                          )?.master_storage_path
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
                    captures.find(
                      (capture) =>
                        capture.id ===
                        editingCaptureId
                    )?.master_file_name && (
                      <small>
                        {
                          captures.find(
                            (capture) =>
                              capture.id ===
                              editingCaptureId
                          ).master_file_name
                        }
                        {' · '}
                        {formatFileSize(
                          captures.find(
                            (capture) =>
                              capture.id ===
                              editingCaptureId
                          ).master_file_size
                        )}
                      </small>
                    )
                  )}
                </div>
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
                  <span>EXPOSURE</span>

                  <input
                    type="text"
                    value={form.exposure}
                    onChange={(event) =>
                      updateForm(
                        'exposure',
                        event.target.value
                      )
                    }
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

          {status === 'loading' && (
            <p className="admin-list-status">
              ACCESSING MISSION ARCHIVE...
            </p>
          )}

          {status === 'ready' &&
            captures.map((capture) => (
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