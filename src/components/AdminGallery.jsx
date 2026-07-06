import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  Pencil,
  Save,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { supabase } from '../supabase.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

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

  const [imageFile, setImageFile] =
    useState(null);

  const [previewUrl, setPreviewUrl] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

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
    setImageFile(null);
    setPreviewUrl('');
    setMessage('');
    setError('');
  }

  function startNewCapture() {
    releasePreviewUrl();

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
    setPreviewUrl('');
    setMessage('');
    setError('');
  }

  function startEditingCapture(capture) {
    releasePreviewUrl();

    setEditingCaptureId(capture.id);
    setForm(
      databaseRowToForm(capture)
    );

    setImageFile(null);

    setPreviewUrl(
      getCaptureImageUrl(capture.image)
    );

    setMessage('');
    setError('');
  }

  function handleImageSelection(event) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(
        'Select a valid image file.'
      );

      event.target.value = '';

      return;
    }

    releasePreviewUrl();

    setImageFile(file);

    setPreviewUrl(
      URL.createObjectURL(file)
    );

    setError('');
  }

  async function uploadImage() {
    if (!imageFile) {
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
            imageFile.type,

          'X-Filename':
            imageFile.name
        },

        body: imageFile
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

  async function deleteR2Image(
    image,
    storagePath
  ) {
    if (
      !image ||
      !storagePath ||
      !isR2ImageUrl(image)
    ) {
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
          'R2 image deletion failed.'
      );
    }
  }

  async function handleSave(event) {
    event.preventDefault();

    setSaving(true);
    setMessage('');
    setError('');

    let uploadedImage = null;

    try {
      if (
        editingCaptureId === 'new' &&
        !imageFile
      ) {
        throw new Error(
          'Select an image before creating a new capture.'
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

      if (imageFile) {
        uploadedImage =
          await uploadImage();
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

      if (
        editingCaptureId === 'new'
      ) {
        const {
          error: insertError
        } = await supabase
          .from('gallery')
          .insert(captureRow);

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
          await deleteR2Image(
            uploadedImage.image,
            uploadedImage.storagePath
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
        await deleteR2Image(
          existingCapture.image,
          existingCapture.storage_path
        );
      }

      const wasNew =
        editingCaptureId === 'new';

      await loadCaptures();

      releasePreviewUrl();

      setEditingCaptureId(null);
      setForm(emptyCapture);
      setImageFile(null);
      setPreviewUrl('');

      setMessage(
        wasNew
          ? 'CAPTURE ADDED TO MISSION ARCHIVE · R2 STORAGE ONLINE'
          : 'CAPTURE RECORD UPDATED'
      );
    } catch (saveException) {
      console.error(saveException);

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

      await deleteR2Image(
        capture.image,
        capture.storage_path
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

            <form onSubmit={handleSave}>
              <section className="admin-image-uploader">
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
                    Select the processed image
                    that should appear in the
                    public Mission Archive.
                    New image uploads are stored
                    in Cloudflare R2.
                  </p>

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
                      accept="image/*"
                      onChange={
                        handleImageSelection
                      }
                    />
                  </label>

                  {imageFile && (
                    <small>
                      {imageFile.name}
                      {' · '}
                      {(
                        imageFile.size /
                        1024 /
                        1024
                      ).toFixed(1)}
                      {' MB'}
                    </small>
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
                  disabled={saving}
                >
                  <Save size={17} />

                  {saving
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