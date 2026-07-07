import {
  ArrowLeft,
  Download,
  File,
  FolderUp,
  RefreshCw,
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

const GALLERY_API =
  'https://cuzbro-gallery-api.dve-hffman.workers.dev';

const MAX_TRANSFER_FILE_BYTES =
  99 * 1024 * 1024;

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

      setFiles(result.files || []);
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

  const groupedTransfers =
    useMemo(() => {
      const groups = new Map();

      files.forEach((file) => {
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
    }, [files]);

  function handleFileSelection(event) {
    const pickedFiles =
      Array.from(
        event.target.files || []
      );

    if (!pickedFiles.length) {
      return;
    }

    const tooLarge =
      pickedFiles.find(
        (file) =>
          file.size >
          MAX_TRANSFER_FILE_BYTES
      );

    if (tooLarge) {
      setError(
        `${tooLarge.name} is over the current 99 MB per-file upload limit.`
      );

      event.target.value = '';

      return;
    }

    setSelectedFiles(pickedFiles);
    setMessage('');
    setError('');
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

      setMessage(
        `${selectedFiles.length} ${
          selectedFiles.length === 1
            ? 'FILE'
            : 'FILES'
        } UPLOADED TO PRIVATE CREW TRANSFER`
      );

      setTransferName('');
      setSelectedFiles([]);

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

        <section className="admin-transfer-uploader">
          <div className="admin-transfer-uploader-icon">
            <FolderUp size={36} />
          </div>

          <div className="admin-transfer-uploader-copy">
            <span className="admin-card-eyebrow">
              NEW PRIVATE TRANSFER
            </span>

            <h3>Send Files to the Crew</h3>

            <p>
              Select multiple files at once.
              Each file is stored privately in
              R2 and requires an authenticated
              CuzBro session to list or download.
            </p>
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
                              className="admin-delete-button"
                              onClick={() =>
                                deleteFile(file)
                              }
                            >
                              <Trash2 size={16} />
                              DELETE
                            </button>
                          </div>
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
