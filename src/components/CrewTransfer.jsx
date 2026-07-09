import {
  ArrowLeft,
  Check,
  Download,
  File,
  FolderUp,
  Pencil,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState
} from 'react';
import { supabase } from '../supabase.js';
import {
  getCrewName
} from '../lib/crew.js';
import {
  logCrewActivity
} from '../lib/audit.js';
import {
  recordOperationEvent,
  useActiveOperation
} from '../lib/operations.js';

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

const MAX_TRANSFER_FILE_BYTES =
  99 * 1024 * 1024;

const TRANSFER_TAG_OPTIONS = [
  'M51',
  'RAW',
  'UNSTACKED',
  'DAVE',
  'ASI294MC',
  'WEBSITE',
  'LOGO',
  'APPROVED',
  'STACKED',
  'SIRIL',
  'OTHER'
];

function normalizeTag(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function uniqueTags(tags = []) {
  return Array.from(
    new Set(
      tags
        .map(normalizeTag)
        .filter(Boolean)
        .filter((tag) => tag !== 'OTHER')
    )
  );
}

function resolveSelectedTags(selectedTags, customTag) {
  return uniqueTags([
    ...selectedTags,
    selectedTags.includes('OTHER')
      ? customTag
      : ''
  ]);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);

  if (size >= 1024 * 1024 * 1024) {
    return `${(
      size /
      1024 /
      1024 /
      1024
    ).toFixed(2)} GB`;
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

function formatDate(dateValue) {
  if (!dateValue) {
    return 'Unknown date';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }
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

export default function CrewTransfer() {
  const {
    activeOperation
  } = useActiveOperation();

  const [transferName, setTransferName] =
    useState('');

  const [selectedFiles, setSelectedFiles] =
    useState([]);

  const [files, setFiles] =
    useState([]);

  const [status, setStatus] =
    useState('loading');

  const [uploading, setUploading] =
    useState(false);

  const [uploadProgress, setUploadProgress] =
    useState({
      current: 0,
      total: 0,
      fileName: ''
    });

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [isDragging, setIsDragging] =
    useState(false);

  const [fileTags, setFileTags] =
    useState({});

  const [searchQuery, setSearchQuery] =
    useState('');

  const [activeTagFilters, setActiveTagFilters] =
    useState([]);

  const [uploadTags, setUploadTags] =
    useState([]);

  const [customUploadTag, setCustomUploadTag] =
    useState('');

  const [editingTagsKey, setEditingTagsKey] =
    useState('');

  const [editingTags, setEditingTags] =
    useState([]);

  const [customEditTag, setCustomEditTag] =
    useState('');

  const [savingTags, setSavingTags] =
    useState(false);

  async function loadTransfers() {
    setStatus('loading');
    setError('');

    try {
      const accessToken =
        await getCrewAccessToken();

      const response = await fetch(
        `${GALLERY_API}/transfer/list`,
        {
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
            'Crew Transfer list failed.'
        );
      }

      const nextFiles = result.files || [];

      // The R2 transfer list is the source of truth for whether files exist.
      // Publish it immediately so a Supabase tag-metadata problem can never
      // make real Crew Transfer files disappear from the interface.
      setFiles(nextFiles);

      const {
        data: tagRows,
        error: tagLoadError
      } = await supabase
        .from('crew_transfer_file_tags')
        .select('file_key, tags');

      if (tagLoadError) {
        console.error(
          'Crew Transfer tags could not be loaded:',
          tagLoadError
        );

        setFileTags({});
        setError(
          `Files loaded, but Crew Transfer tags could not be loaded: ${tagLoadError.message}`
        );
        setStatus('ready');
        return;
      }

      const nextFileTags = Object.fromEntries(
        (tagRows || []).map((row) => [
          row.file_key,
          uniqueTags(row.tags || [])
        ])
      );

      setFileTags(nextFileTags);
      setStatus('ready');
    } catch (loadError) {
      console.error(loadError);

      setError(
        loadError.message ||
          'Crew Transfer could not be loaded.'
      );

      setStatus('error');
    }
  }

  useEffect(() => {
    loadTransfers();
  }, []);

  useEffect(() => {
    if (
      activeOperation?.designation &&
      !transferName.trim()
    ) {
      setTransferName(
        activeOperation.designation
      );
    }
  }, [
    activeOperation?.id,
    activeOperation?.designation
  ]);

  const allAvailableTags = useMemo(() => {
    return uniqueTags([
      ...TRANSFER_TAG_OPTIONS,
      ...Object.values(fileTags).flat()
    ]);
  }, [fileTags]);

  const filteredFiles = useMemo(() => {
    const cleanSearch = searchQuery
      .trim()
      .toLowerCase();

    return files.filter((file) => {
      const tags = fileTags[file.key] || [];
      const matchesSearch = !cleanSearch || [
        file.fileName,
        file.transferName,
        ...tags
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(cleanSearch)
        );

      const matchesTags =
        activeTagFilters.length === 0 ||
        activeTagFilters.every((tag) =>
          tags.includes(tag)
        );

      return matchesSearch && matchesTags;
    });
  }, [
    activeTagFilters,
    fileTags,
    files,
    searchQuery
  ]);

  const groupedTransfers =
    useMemo(() => {
      const groups = new Map();

      filteredFiles.forEach((file) => {
        const name =
          file.transferName ||
          'Crew Transfer';

        if (!groups.has(name)) {
          groups.set(name, {
            name,
            files: [],
            uploaded: file.uploaded,
            uploadedBy: file.uploadedBy
          });
        }

        const group = groups.get(name);

        group.files.push(file);

        if (
          new Date(file.uploaded) >
          new Date(group.uploaded)
        ) {
          group.uploaded = file.uploaded;
        }
      });

      return Array.from(
        groups.values()
      )
        .map((group) => ({
          ...group,
          totalSize:
            group.files.reduce(
              (sum, file) =>
                sum +
                Number(file.size || 0),
              0
            )
        }))
        .sort(
          (a, b) =>
            new Date(b.uploaded) -
            new Date(a.uploaded)
        );
    }, [filteredFiles]);

  function toggleTag(tag, setter) {
    setter((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    );
  }

  function toggleTagFilter(tag) {
    setActiveTagFilters((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    );
  }

  function startTagEdit(file) {
    setEditingTagsKey(file.key);
    setEditingTags(fileTags[file.key] || []);
    setCustomEditTag('');
    setMessage('');
    setError('');
  }

  function cancelTagEdit() {
    setEditingTagsKey('');
    setEditingTags([]);
    setCustomEditTag('');
  }

  async function saveFileTags(file) {
    const tags = resolveSelectedTags(
      editingTags,
      customEditTag
    );

    setSavingTags(true);
    setMessage('');
    setError('');

    try {
      if (tags.length === 0) {
        const { error: deleteTagError } =
          await supabase
            .from('crew_transfer_file_tags')
            .delete()
            .eq('file_key', file.key);

        if (deleteTagError) {
          throw deleteTagError;
        }
      } else {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        const { error: saveTagError } =
          await supabase
            .from('crew_transfer_file_tags')
            .upsert(
              {
                file_key: file.key,
                tags,
                updated_by_email:
                  session?.user?.email || '',
                updated_at:
                  new Date().toISOString()
              },
              {
                onConflict: 'file_key'
              }
            );

        if (saveTagError) {
          throw saveTagError;
        }
      }

      setFileTags((current) => ({
        ...current,
        [file.key]: tags
      }));

      setMessage(
        `${file.fileName} TAGS UPDATED`
      );

      cancelTagEdit();
    } catch (tagError) {
      console.error(tagError);

      setError(
        tagError.message ||
          'Crew Transfer tags could not be saved.'
      );
    }

    setSavingTags(false);
  }

  async function saveUploadedFileTags({
    accessToken,
    transferName: uploadedTransferName,
    uploadedFiles,
    tags,
    uploadStartedAt
  }) {
    if (!tags.length) {
      return;
    }

    const listResponse = await fetch(
      `${GALLERY_API}/transfer/list`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    const listResult =
      await listResponse.json();

    if (!listResponse.ok) {
      throw new Error(
        listResult.error ||
          'Uploaded files could not be matched for tagging.'
      );
    }

    const candidates = (listResult.files || [])
      .filter((file) =>
        file.transferName === uploadedTransferName &&
        new Date(file.uploaded).getTime() >=
          uploadStartedAt - 5 * 60 * 1000
      )
      .sort(
        (a, b) =>
          new Date(b.uploaded) -
          new Date(a.uploaded)
      );

    const usedKeys = new Set();
    const rows = uploadedFiles
      .map((uploadedFile) => {
        const matchedFile = candidates.find(
          (file) =>
            !usedKeys.has(file.key) &&
            file.fileName === uploadedFile.name
        );

        if (!matchedFile) {
          return null;
        }

        usedKeys.add(matchedFile.key);

        return {
          file_key: matchedFile.key,
          tags,
          updated_at:
            new Date().toISOString()
        };
      })
      .filter(Boolean);

    if (rows.length !== uploadedFiles.length) {
      throw new Error(
        'Files uploaded, but their tag metadata could not be matched completely. Use EDIT TAGS on the files to add them manually.'
      );
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    rows.forEach((row) => {
      row.updated_by_email =
        session?.user?.email || '';
    });

    const { error: tagSaveError } =
      await supabase
        .from('crew_transfer_file_tags')
        .upsert(rows, {
          onConflict: 'file_key'
        });

    if (tagSaveError) {
      throw tagSaveError;
    }
  }

  function acceptTransferFiles(
    pickedFiles
  ) {
    const filesToAccept =
      Array.from(pickedFiles || []);

    if (!filesToAccept.length) {
      return;
    }

    const tooLarge =
      filesToAccept.find(
        (file) =>
          file.size >
          MAX_TRANSFER_FILE_BYTES
      );

    if (tooLarge) {
      setError(
        `${tooLarge.name} is over the current 99 MB per-file upload limit.`
      );

      return;
    }

    setSelectedFiles(filesToAccept);
    setMessage('');
    setError('');
  }

  function handleFileSelection(event) {
    acceptTransferFiles(
      event.target.files
    );

    event.target.value = '';
  }

  function handleTransferDragOver(event) {
    event.preventDefault();

    if (!uploading) {
      setIsDragging(true);
    }
  }

  function handleTransferDragLeave(event) {
    event.preventDefault();

    if (
      event.currentTarget.contains(
        event.relatedTarget
      )
    ) {
      return;
    }

    setIsDragging(false);
  }

  function handleTransferDrop(event) {
    event.preventDefault();

    setIsDragging(false);

    if (uploading) {
      return;
    }

    acceptTransferFiles(
      event.dataTransfer.files
    );
  }

  async function handleUpload(event) {
    event.preventDefault();

    const cleanTransferName =
      transferName.trim();

    if (!cleanTransferName) {
      setError(
        'Enter a transfer name.'
      );

      return;
    }

    if (!selectedFiles.length) {
      setError(
        'Select at least one file.'
      );

      return;
    }

    const selectedBatchTags =
      resolveSelectedTags(
        uploadTags,
        customUploadTag
      );

    const uploadStartedAt = Date.now();

    setUploading(true);
    setMessage('');
    setError('');

    try {
      const accessToken =
        await getCrewAccessToken();

      for (
        let index = 0;
        index < selectedFiles.length;
        index += 1
      ) {
        const file =
          selectedFiles[index];

        setUploadProgress({
          current: index + 1,
          total: selectedFiles.length,
          fileName: file.name
        });

        const response = await fetch(
          `${GALLERY_API}/transfer/upload`,
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${accessToken}`,

              'Content-Type':
                file.type ||
                'application/octet-stream',

              'X-Filename':
                file.name,

              'X-Transfer-Name':
                cleanTransferName
            },

            body: file
          }
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              `Upload failed for ${file.name}.`
          );
        }
      }

      await saveUploadedFileTags({
        accessToken,
        transferName: cleanTransferName,
        uploadedFiles: selectedFiles,
        tags: selectedBatchTags,
        uploadStartedAt
      });

      const totalBytes =
        selectedFiles.reduce(
          (total, file) =>
            total +
            Number(file.size || 0),
          0
        );

      const auditResult =
        await logCrewActivity({
          action: 'TRANSFER_UPLOAD',
          category: 'TRANSFER',
          resourceType: 'crew_transfer',
          resourceName: cleanTransferName,
          details: {
            fileCount:
              selectedFiles.length,
            totalBytes,
            tags: selectedBatchTags,
            files:
              selectedFiles.map(
                (file) => ({
                  name: file.name,
                  size: file.size,
                  type:
                    file.type ||
                    'application/octet-stream'
                })
              )
          }
        });

      if (!auditResult.success) {
        console.error(
          'Transfer uploaded, but Black Box logging failed:',
          auditResult.error
        );
      }

      if (activeOperation) {
        const operationEventResult =
          await recordOperationEvent({
            operation: activeOperation,
            eventType:
              'TRANSFER_UPLOAD',
            eventLabel:
              'CREW TRANSFER UPLOAD',
            resourceType:
              'crew_transfer',
            resourceName:
              cleanTransferName,
            details: {
              fileCount:
                selectedFiles.length,
              totalBytes,
              tags: selectedBatchTags,
              files:
                selectedFiles.map(
                  (file) => file.name
                )
            }
          });

        if (
          !operationEventResult.success &&
          !operationEventResult.skipped
        ) {
          console.error(
            'Transfer uploaded, but operation event logging failed:',
            operationEventResult.error
          );
        }
      }

      setMessage(
        `${selectedFiles.length} ${
          selectedFiles.length === 1
            ? 'FILE'
            : 'FILES'
        } UPLOADED TO PRIVATE CREW TRANSFER`
      );

      setTransferName('');
      setSelectedFiles([]);
      setUploadTags([]);
      setCustomUploadTag('');

      await loadTransfers();
    } catch (uploadError) {
      console.error(uploadError);

      setError(
        uploadError.message ||
          'Crew Transfer upload failed.'
      );
    }

    setUploadProgress({
      current: 0,
      total: 0,
      fileName: ''
    });

    setUploading(false);
  }

  async function downloadFile(file) {
    setMessage('');
    setError('');

    try {
      const accessToken =
        await getCrewAccessToken();

      const response = await fetch(
        `${GALLERY_API}/transfer/download/${encodeURIComponent(
          file.key
        )}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        let downloadError =
          'Private download failed.';

        try {
          const result =
            await response.json();

          downloadError =
            result.error ||
            downloadError;
        } catch {
          // Response was not JSON.
        }

        throw new Error(downloadError);
      }

      const blob =
        await response.blob();

      const objectUrl =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement('a');

      anchor.href = objectUrl;
      anchor.download =
        file.fileName ||
        'cuzbro-transfer-file';

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);

      const auditResult =
        await logCrewActivity({
          action: 'TRANSFER_DOWNLOAD',
          category: 'TRANSFER',
          resourceType:
            'crew_transfer_file',
          resourceId: file.key,
          resourceName:
            file.fileName,
          details: {
            transferName:
              file.transferName ||
              'Crew Transfer',
            fileSize:
              Number(file.size || 0)
          }
        });

      if (!auditResult.success) {
        console.error(
          'Download completed, but Black Box logging failed:',
          auditResult.error
        );
      }
    } catch (downloadError) {
      console.error(downloadError);

      setError(
        downloadError.message ||
          'Private download failed.'
      );
    }
  }

  async function deleteFile(file) {
    const confirmed = window.confirm(
      `Delete ${file.fileName} from Crew Transfer?`
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setError('');

    try {
      const accessToken =
        await getCrewAccessToken();

      const response = await fetch(
        `${GALLERY_API}/transfer/${encodeURIComponent(
          file.key
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
            'Transfer file deletion failed.'
        );
      }

      const { error: tagDeleteError } =
        await supabase
          .from('crew_transfer_file_tags')
          .delete()
          .eq('file_key', file.key);

      if (tagDeleteError) {
        console.error(
          'Transfer file deleted, but tag cleanup failed:',
          tagDeleteError
        );
      }

      const auditResult =
        await logCrewActivity({
          action:
            'TRANSFER_FILE_DELETE',
          category: 'TRANSFER',
          resourceType:
            'crew_transfer_file',
          resourceId: file.key,
          resourceName:
            file.fileName,
          details: {
            transferName:
              file.transferName ||
              'Crew Transfer',
            fileSize:
              Number(file.size || 0)
          }
        });

      if (!auditResult.success) {
        console.error(
          'File deleted, but Black Box logging failed:',
          auditResult.error
        );
      }

      setMessage(
        `${file.fileName} DELETED`
      );

      await loadTransfers();
    } catch (deleteError) {
      console.error(deleteError);

      setError(
        deleteError.message ||
          'Transfer file deletion failed.'
      );
    }
  }

  async function deleteTransfer(group) {
    const confirmed = window.confirm(
      `Delete the entire "${group.name}" transfer and all ${group.files.length} files?`
    );

    if (!confirmed) {
      return;
    }

    setMessage('');
    setError('');

    try {
      const accessToken =
        await getCrewAccessToken();

      for (const file of group.files) {
        const response = await fetch(
          `${GALLERY_API}/transfer/${encodeURIComponent(
            file.key
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
              `Could not delete ${file.fileName}.`
          );
        }
      }

      const transferKeys = group.files.map(
        (file) => file.key
      );

      if (transferKeys.length) {
        const { error: tagDeleteError } =
          await supabase
            .from('crew_transfer_file_tags')
            .delete()
            .in('file_key', transferKeys);

        if (tagDeleteError) {
          console.error(
            'Transfer deleted, but tag cleanup failed:',
            tagDeleteError
          );
        }
      }

      const auditResult =
        await logCrewActivity({
          action: 'TRANSFER_DELETE',
          category: 'TRANSFER',
          resourceType:
            'crew_transfer',
          resourceName: group.name,
          details: {
            fileCount:
              group.files.length,
            totalBytes:
              Number(
                group.totalSize || 0
              ),
            files:
              group.files.map(
                (file) =>
                  file.fileName
              )
          }
        });

      if (!auditResult.success) {
        console.error(
          'Transfer deleted, but Black Box logging failed:',
          auditResult.error
        );
      }

      setMessage(
        `${group.name} TRANSFER DELETED`
      );

      await loadTransfers();
    } catch (deleteError) {
      console.error(deleteError);

      setError(
        deleteError.message ||
          'Transfer deletion failed.'
      );
    }
  }

  return (
    <div className="admin-page admin-transfer-page">
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

            <h1>Crew Transfer</h1>
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
              PRIVATE CREW EXCHANGE
            </span>

            <h2>Crew Transfer</h2>

            <p>
              Securely exchange raw captures,
              processing files, and mission data
              with authenticated CuzBro crew.
            </p>
          </div>

          <button
            type="button"
            className="admin-new-mission"
            onClick={loadTransfers}
            disabled={status === 'loading'}
          >
            <RefreshCw size={18} />
            REFRESH
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
              TRANSFER NAME PRELOADED · OPEN COMMAND →
            </small>
          </a>
        )}

        <section
          className={`admin-transfer-uploader${
            isDragging
              ? ' admin-transfer-uploader-dragging'
              : ''
          }`}
          onDragEnter={handleTransferDragOver}
          onDragOver={handleTransferDragOver}
          onDragLeave={handleTransferDragLeave}
          onDrop={handleTransferDrop}
        >
          <div className="admin-transfer-uploader-icon">
            <FolderUp size={36} />
          </div>

          <div className="admin-transfer-uploader-copy">
            <span className="admin-card-eyebrow">
              NEW PRIVATE TRANSFER
            </span>

            <h3>Send Files to the Crew</h3>

            <p>
              Drag and drop multiple files into
              this transfer bay, or select them
              manually. Each file is stored
              privately in R2 and requires an
              authenticated CuzBro session to
              list or download.
            </p>

            <strong className="admin-transfer-drop-hint">
              {isDragging
                ? 'RELEASE TO LOAD FILES'
                : 'DROP FILES ANYWHERE IN THIS BAY'}
            </strong>
          </div>

          <form
            className="admin-transfer-form"
            onSubmit={handleUpload}
            noValidate
          >
            <label>
              <span>TRANSFER NAME</span>

              <input
                type="text"
                value={transferName}
                onChange={(event) =>
                  setTransferName(
                    event.target.value
                  )
                }
                placeholder="M51 Raw Lights - July 6"
                disabled={uploading}
              />
            </label>

            <div className="admin-transfer-tag-field">
              <span>TAGS</span>

              <p>
                Select any tags that apply to this upload batch.
              </p>

              <div className="admin-transfer-tag-options">
                {TRANSFER_TAG_OPTIONS.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className={uploadTags.includes(tag) ? 'active' : ''}
                    onClick={() => toggleTag(tag, setUploadTags)}
                    disabled={uploading}
                  >
                    {uploadTags.includes(tag) && <Check size={13} />}
                    {tag}
                  </button>
                ))}
              </div>

              {uploadTags.includes('OTHER') && (
                <input
                  className="admin-transfer-custom-tag-input"
                  type="text"
                  value={customUploadTag}
                  onChange={(event) =>
                    setCustomUploadTag(event.target.value)
                  }
                  placeholder="CUSTOM TAG"
                  disabled={uploading}
                />
              )}

              {resolveSelectedTags(uploadTags, customUploadTag).length > 0 && (
                <div className="admin-transfer-selected-tag-summary">
                  {resolveSelectedTags(uploadTags, customUploadTag).map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                </div>
              )}
            </div>

            <label className="admin-transfer-file-picker">
              <Upload size={19} />

              <span>
                {selectedFiles.length
                  ? `${selectedFiles.length} FILES SELECTED`
                  : 'SELECT FILES'}
              </span>

              <input
                type="file"
                multiple
                onChange={
                  handleFileSelection
                }
                disabled={uploading}
              />
            </label>

            {selectedFiles.length > 0 && (
              <div className="admin-transfer-selection">
                <div>
                  <strong>
                    {selectedFiles.length}{' '}
                    {selectedFiles.length === 1
                      ? 'FILE'
                      : 'FILES'}
                  </strong>

                  <span>
                    {formatFileSize(
                      selectedFiles.reduce(
                        (sum, file) =>
                          sum + file.size,
                        0
                      )
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedFiles([])
                  }
                  disabled={uploading}
                  aria-label="Clear selected files"
                >
                  <X size={18} />
                </button>

                <ul>
                  {selectedFiles.map(
                    (file) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                      >
                        <File size={15} />

                        <span>
                          {file.name}
                        </span>

                        <small>
                          {formatFileSize(
                            file.size
                          )}
                        </small>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

            {uploading && (
              <div className="admin-transfer-progress">
                <span>
                  UPLOADING{' '}
                  {uploadProgress.current}
                  {' / '}
                  {uploadProgress.total}
                </span>

                <strong>
                  {uploadProgress.fileName}
                </strong>

                <div>
                  <i
                    style={{
                      width:
                        uploadProgress.total
                          ? `${(
                              uploadProgress.current /
                              uploadProgress.total
                            ) * 100}%`
                          : '0%'
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="admin-editor-save admin-transfer-upload-button"
              disabled={uploading}
            >
              <Upload size={17} />

              {uploading
                ? 'UPLOADING PRIVATE FILES...'
                : 'UPLOAD TO CREW TRANSFER'}
            </button>
          </form>
        </section>

        <section className="admin-transfer-list">
          <div className="admin-list-title">
            <FolderUp size={20} />

            <span>
              {groupedTransfers.length}{' '}
              {groupedTransfers.length === 1
                ? 'PRIVATE TRANSFER'
                : 'PRIVATE TRANSFERS'}
            </span>
          </div>

          <div className="admin-transfer-organizer">
            <label className="admin-transfer-search">
              <Search size={17} />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                placeholder="SEARCH FILES OR TAGS"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear Crew Transfer search"
                >
                  <X size={15} />
                </button>
              )}
            </label>

            <div className="admin-transfer-filter-block">
              <div className="admin-transfer-filter-heading">
                <span>
                  <Tag size={15} />
                  FILTER BY TAG
                </span>

                {(activeTagFilters.length > 0 || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTagFilters([]);
                      setSearchQuery('');
                    }}
                  >
                    CLEAR FILTERS
                  </button>
                )}
              </div>

              <div className="admin-transfer-filter-tags">
                <button
                  type="button"
                  className={activeTagFilters.length === 0 ? 'active' : ''}
                  onClick={() => setActiveTagFilters([])}
                >
                  ALL
                </button>

                {allAvailableTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className={activeTagFilters.includes(tag) ? 'active' : ''}
                    onClick={() => toggleTagFilter(tag)}
                  >
                    {activeTagFilters.includes(tag) && <Check size={12} />}
                    {tag}
                  </button>
                ))}
              </div>

              <small>
                {filteredFiles.length} OF {files.length} FILES SHOWN
                {activeTagFilters.length > 1 ? ' · ALL SELECTED TAGS REQUIRED' : ''}
              </small>
            </div>
          </div>

          {status === 'loading' && (
            <p className="admin-list-status">
              ACCESSING PRIVATE R2 TRANSFERS...
            </p>
          )}

          {status === 'ready' &&
            groupedTransfers.length === 0 && (
              <div className="admin-transfer-empty">
                <FolderUp size={34} />

                <strong>
                  NO PRIVATE TRANSFERS
                </strong>

                <span>
                  Upload raw captures or mission
                  files to start a crew exchange.
                </span>
              </div>
            )}

          {status === 'ready' &&
            files.length > 0 &&
            groupedTransfers.length === 0 && (
              <div className="admin-transfer-empty admin-transfer-filter-empty">
                <Search size={34} />

                <strong>NO MATCHING FILES</strong>

                <span>
                  Try another search or remove one of the active tag filters.
                </span>
              </div>
            )}

          {status === 'ready' &&
            groupedTransfers.map(
              (group) => (
                <article
                  className="admin-transfer-group"
                  key={group.name}
                >
                  <div className="admin-transfer-group-header">
                    <div>
                      <span className="admin-card-eyebrow">
                        PRIVATE CREW TRANSFER
                      </span>

                      <h3>{group.name}</h3>

                      <p>
                        Uploaded by{' '}
                        {getCrewName(
                          group.uploadedBy
                        )}
                        {' · '}
                        {formatDate(
                          group.uploaded
                        )}
                      </p>
                    </div>

                    <div className="admin-transfer-group-stats">
                      <div>
                        <span>FILES</span>

                        <strong>
                          {group.files.length}
                        </strong>
                      </div>

                      <div>
                        <span>TOTAL SIZE</span>

                        <strong>
                          {formatFileSize(
                            group.totalSize
                          )}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="admin-delete-button"
                        onClick={() =>
                          deleteTransfer(group)
                        }
                      >
                        <Trash2 size={16} />
                        DELETE TRANSFER
                      </button>
                    </div>
                  </div>

                  <div className="admin-transfer-files">
                    {group.files.map(
                      (file) => (
                        <div
                          className="admin-transfer-file"
                          key={file.key}
                        >
                          <div className="admin-transfer-file-icon">
                            <File size={19} />
                          </div>

                          <div className="admin-transfer-file-name">
                            <strong>
                              {file.fileName}
                            </strong>

                            <span>
                              {formatFileSize(
                                file.size
                              )}
                              {' · '}
                              {formatDate(
                                file.uploaded
                              )}
                            </span>

                            {(fileTags[file.key] || []).length > 0 && (
                              <div className="admin-transfer-file-tags">
                                {(fileTags[file.key] || []).map((tag) => (
                                  <button
                                    type="button"
                                    key={tag}
                                    className={activeTagFilters.includes(tag) ? 'active' : ''}
                                    onClick={() => toggleTagFilter(tag)}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="admin-transfer-file-actions">
                            <button
                              type="button"
                              onClick={() =>
                                downloadFile(file)
                              }
                            >
                              <Download size={16} />
                              DOWNLOAD
                            </button>

                            <button
                              type="button"
                              className="admin-transfer-tag-edit-button"
                              onClick={() => startTagEdit(file)}
                            >
                              <Pencil size={15} />
                              EDIT TAGS
                            </button>

                            <button
                              type="button"
                              className="admin-delete-button"
                              onClick={() =>
                                deleteFile(file)
                              }
                            >
                              <Trash2 size={16} />
                              DELETE
                            </button>
                          </div>

                          {editingTagsKey === file.key && (
                            <div className="admin-transfer-tag-editor">
                              <div className="admin-transfer-tag-editor-heading">
                                <span>
                                  <Tag size={15} />
                                  EDIT FILE TAGS
                                </span>

                                <button
                                  type="button"
                                  onClick={cancelTagEdit}
                                  aria-label="Close tag editor"
                                >
                                  <X size={16} />
                                </button>
                              </div>

                              <div className="admin-transfer-tag-options">
                                {TRANSFER_TAG_OPTIONS.map((tag) => (
                                  <button
                                    type="button"
                                    key={tag}
                                    className={editingTags.includes(tag) ? 'active' : ''}
                                    onClick={() => toggleTag(tag, setEditingTags)}
                                    disabled={savingTags}
                                  >
                                    {editingTags.includes(tag) && <Check size={13} />}
                                    {tag}
                                  </button>
                                ))}

                                {allAvailableTags
                                  .filter((tag) => !TRANSFER_TAG_OPTIONS.includes(tag))
                                  .map((tag) => (
                                    <button
                                      type="button"
                                      key={tag}
                                      className={editingTags.includes(tag) ? 'active' : ''}
                                      onClick={() => toggleTag(tag, setEditingTags)}
                                      disabled={savingTags}
                                    >
                                      {editingTags.includes(tag) && <Check size={13} />}
                                      {tag}
                                    </button>
                                  ))}
                              </div>

                              {editingTags.includes('OTHER') && (
                                <input
                                  className="admin-transfer-custom-tag-input"
                                  type="text"
                                  value={customEditTag}
                                  onChange={(event) =>
                                    setCustomEditTag(event.target.value)
                                  }
                                  placeholder="CUSTOM TAG"
                                  disabled={savingTags}
                                />
                              )}

                              <div className="admin-transfer-tag-editor-actions">
                                <button
                                  type="button"
                                  onClick={cancelTagEdit}
                                  disabled={savingTags}
                                >
                                  CANCEL
                                </button>

                                <button
                                  type="button"
                                  className="admin-editor-save"
                                  onClick={() => saveFileTags(file)}
                                  disabled={savingTags}
                                >
                                  <Check size={15} />
                                  {savingTags ? 'SAVING...' : 'SAVE TAGS'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </article>
              )
            )}
        </section>
      </main>
    </div>
  );
}
