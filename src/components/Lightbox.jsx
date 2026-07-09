import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
  ZoomIn,
  RotateCcw
} from 'lucide-react';

import {
  TransformWrapper,
  TransformComponent
} from 'react-zoom-pan-pinch';

function normalizeMissionTargetName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMissionStardate(dateString) {
  const date = new Date(
    `${dateString}T12:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const year = date.getFullYear();
  const start = new Date(year, 0, 0);

  const dayOfYear = Math.floor(
    (date - start) / 86400000
  );

  return `${year}.${String(
    dayOfYear
  ).padStart(3, '0')}`;
}

function getMissionAnchor(entry) {
  return String(
    entry?.id ||
      entry?.mission ||
      'mission'
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getTargetSpecificMissionNote(
  entry,
  targetTitle
) {
  const normalizedTarget =
    normalizeMissionTargetName(targetTitle);

  if (
    !normalizedTarget ||
    !entry?.targetNotes
  ) {
    return null;
  }

  const matchingKey = Object.keys(
    entry.targetNotes
  ).find(
    (key) =>
      normalizeMissionTargetName(key) ===
      normalizedTarget
  );

  return matchingKey
    ? entry.targetNotes[matchingKey]
    : null;
}

function getMatchingMissionLogs(
  entries,
  targetTitle
) {
  const normalizedTarget =
    normalizeMissionTargetName(targetTitle);

  if (!normalizedTarget) {
    return [];
  }

  return [...(entries || [])]
    .filter((entry) =>
      (entry.targets || []).some(
        (target) =>
          normalizeMissionTargetName(
            target
          ) === normalizedTarget
      )
    )
    .sort(
      (a, b) =>
        new Date(b.date) -
        new Date(a.date)
    );
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


function BeforeAfterViewer({
  photo,
  finalImageUrl,
  isCinema = false,
  onEnterCinema
}) {
  const stages = [
    photo.rawImage
      ? {
          key: 'raw',
          label: 'RAW',
          image: getCaptureImageUrl(photo.rawImage)
        }
      : null,
    photo.stackedImage
      ? {
          key: 'stacked',
          label: 'STACKED',
          image: getCaptureImageUrl(photo.stackedImage)
        }
      : null,
    {
      key: 'final',
      label: 'FINAL',
      image: finalImageUrl
    }
  ].filter(Boolean);

  const getDefaultLeftStage = () =>
    stages.find((stage) => stage.key !== 'final') ||
    stages[0];

  const [displayMode, setDisplayMode] =
    useState('comparison');

  const [leftStageKey, setLeftStageKey] =
    useState(getDefaultLeftStage().key);

  const [rightStageKey, setRightStageKey] =
    useState('final');

  const [slider, setSlider] =
    useState(50);

  useEffect(() => {
    const nextLeft = getDefaultLeftStage();

    setDisplayMode('comparison');
    setLeftStageKey(nextLeft.key);
    setRightStageKey('final');
    setSlider(50);
  }, [photo.id]);

  const leftStage =
    stages.find((stage) => stage.key === leftStageKey) ||
    stages[0];

  const rightStage =
    stages.find((stage) => stage.key === rightStageKey) ||
    stages[stages.length - 1];

  if (stages.length <= 1) {
    return (
      <div className="reportImageFrame">
        <img
          className="reportImage"
          src={finalImageUrl}
          alt={photo.title}
        />
      </div>
    );
  }

  return (
    <div
      className={
        isCinema
          ? 'processingComparison cinemaComparison'
          : 'processingComparison'
      }
    >
      <div className="processingComparisonHeader">
        <div className="processingComparisonTitle">
          <small>PROCESSING EVOLUTION</small>
          <strong>Before / After Viewer</strong>
        </div>

        {!isCinema && onEnterCinema && (
          <button
            type="button"
            className="processingCinemaButton"
            onClick={onEnterCinema}
          >
            <Search size={16} />
            Enter Cinema Mode
          </button>
        )}

        <div
          className="processingDisplayModeTabs"
          aria-label="Viewer mode"
        >
          <button
            type="button"
            className={displayMode === 'comparison' ? 'active' : ''}
            onClick={() => setDisplayMode('comparison')}
          >
            COMPARISON MODE
          </button>

          <button
            type="button"
            className={displayMode === 'final' ? 'active' : ''}
            onClick={() => setDisplayMode('final')}
          >
            FINAL
          </button>
        </div>
      </div>

      {displayMode === 'comparison' ? (
        <>
          <div className="processingSideSelectors">
            <label>
              <span>LEFT SIDE</span>

              <select
                value={leftStageKey}
                onChange={(event) =>
                  setLeftStageKey(event.target.value)
                }
              >
                {stages.map((stage) => (
                  <option
                    key={`left-${stage.key}`}
                    value={stage.key}
                  >
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>RIGHT SIDE</span>

              <select
                value={rightStageKey}
                onChange={(event) =>
                  setRightStageKey(event.target.value)
                }
              >
                {stages.map((stage) => (
                  <option
                    key={`right-${stage.key}`}
                    value={stage.key}
                  >
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="processingCompareStage">
            <img
              className="processingCompareBase"
              src={leftStage.image}
              alt={`${photo.title} ${leftStage.label.toLowerCase()} stage`}
            />

            <div
              className="processingCompareFinalClip"
              style={{
                clipPath: `inset(0 ${100 - slider}% 0 0)`
              }}
            >
              <img
                className="processingCompareFinal"
                src={rightStage.image}
                alt={`${photo.title} ${rightStage.label.toLowerCase()} stage`}
              />
            </div>

            <div
              className="processingCompareDivider"
              style={{ left: `${slider}%` }}
              aria-hidden="true"
            >
              <span>↔</span>
            </div>

            <span className="processingCompareLabel before">
              {leftStage.label}
            </span>

            <span className="processingCompareLabel after">
              {rightStage.label}
            </span>

            <input
              className="processingCompareRange"
              type="range"
              min="0"
              max="100"
              value={slider}
              onChange={(event) =>
                setSlider(Number(event.target.value))
              }
              aria-label={`Compare ${leftStage.label} with ${rightStage.label}`}
            />
          </div>

          <p className="processingComparisonHint">
            Drag right to reveal more {rightStage.label}. Drag left to reveal more {leftStage.label}.
          </p>
        </>
      ) : (
        <div className="processingFinalStage">
          <img
            src={finalImageUrl}
            alt={`${photo.title} final published image`}
          />
        </div>
      )}
    </div>
  );
}


export default function Lightbox({
  selectedPhoto,
  gallery,
  captainsLog = [],
  selectedIndex,
  setSelectedIndex,
  viewerMode,
  setViewerMode,
  closeLightbox,
  showPreviousPhoto,
  showNextPhoto
}) {
  if (!selectedPhoto) {
    return null;
  }

  const isCinema =
    viewerMode === 'cinema' ||
    viewerMode === 'inspect';

  const matchingLogs =
    getMatchingMissionLogs(
      captainsLog,
      selectedPhoto.title
    );

  const latestLog =
    matchingLogs[0] || null;

  const latestTargetNote = latestLog
    ? getTargetSpecificMissionNote(
        latestLog,
        selectedPhoto.title
      )
    : null;

  const imageUrl = getCaptureImageUrl(
    selectedPhoto.image
  );

  const hasProcessingComparison = Boolean(
    selectedPhoto.rawImage || selectedPhoto.stackedImage
  );

  const handleImageClick = () => {
    if (viewerMode === 'report') {
      setViewerMode('cinema');
    }
  };

  const exitCinema = () => {
    setViewerMode('report');
  };

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
    >
      <div className="missionViewer">
        {isCinema && (
          <button
            type="button"
            className="cinemaExitButton"
            onClick={exitCinema}
            aria-label="Exit cinema mode"
          >
            <X size={20} />
            <span>EXIT CINEMA</span>
          </button>
        )}

        <div className="missionTopbar">
          <div className="missionBrand">
            <span className="crosshair">
              ⊕
            </span>

            <strong>
              MISSION REPORT
            </strong>

            <span>
              {String(
                selectedIndex + 1
              ).padStart(2, '0')}
              {' / '}
              {String(
                gallery.length
              ).padStart(2, '0')}
            </span>
          </div>

          <button
            type="button"
            className="lightboxClose"
            onClick={closeLightbox}
            aria-label="Close mission report"
          >
            <X />
          </button>
        </div>

        <button
          type="button"
          className="lightboxArrow left"
          onClick={showPreviousPhoto}
          aria-label="Previous capture"
        >
          <ChevronLeft />
        </button>

        <button
          type="button"
          className="lightboxArrow right"
          onClick={showNextPhoto}
          aria-label="Next capture"
        >
          <ChevronRight />
        </button>

        <div className="missionGrid">
          <section
            className={
              isCinema
                ? 'missionImagePanel cinemaMode'
                : 'missionImagePanel'
            }
          >
            {viewerMode === 'report' ? (
              hasProcessingComparison ? (
                <BeforeAfterViewer
                  photo={selectedPhoto}
                  finalImageUrl={imageUrl}
                  onEnterCinema={handleImageClick}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="zoomHint"
                    onClick={handleImageClick}
                  >
                    <Search size={16} />
                    Enter Cinema Mode
                  </button>

                  <div className="reportImageFrame">
                    <img
                      className="reportImage"
                      src={imageUrl}
                      alt={selectedPhoto.title}
                      onClick={handleImageClick}
                    />
                  </div>
                </>
              )
            ) : hasProcessingComparison ? (
              <BeforeAfterViewer
                photo={selectedPhoto}
                finalImageUrl={imageUrl}
                isCinema
              />
            ) : (
              <TransformWrapper
                key={selectedPhoto.id}
                initialScale={1}
                minScale={1}
                maxScale={4}
                centerOnInit
                centerZoomedOut
                limitToBounds
                panning={{
                  disabled: false
                }}
                wheel={{
                  step: 0.12
                }}
                pinch={{
                  step: 5
                }}
                doubleClick={{
                  mode: 'zoomIn',
                  step: 0.5
                }}
              >
                {({
                  zoomIn,
                  resetTransform,
                  centerView
                }) => (
                  <>
                    <div className="zoomTools">
                      <button
                        type="button"
                        onClick={() =>
                          zoomIn(0.5)
                        }
                      >
                        <ZoomIn size={16} />
                        Zoom
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          resetTransform();

                          requestAnimationFrame(
                            () => {
                              centerView(1);
                            }
                          );
                        }}
                      >
                        <RotateCcw size={16} />
                        Reset
                      </button>
                    </div>

                    <TransformComponent
                      wrapperClass="zoomWrapper"
                      contentClass="zoomContent"
                    >
                      <div className="zoomImageStage">
                        <img
                          className="zoomableImage"
                          src={imageUrl}
                          alt={
                            selectedPhoto.title
                          }
                          draggable="false"
                        />
                      </div>
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            )}

            <p className="imageCaption">
              {selectedPhoto.title}
              {' — '}
              {selectedPhoto.subtitle}
            </p>
          </section>

          <aside
            className={
              isCinema
                ? 'missionPanel hiddenPanel'
                : 'missionPanel'
            }
          >
            <small>MISSION REPORT</small>

            <h2>{selectedPhoto.title}</h2>

            <h3>
              {selectedPhoto.subtitle}
            </h3>

            <div className="missionFacts">
              <div>
                <b>Object Type</b>

                <span>
                  {selectedPhoto.objectType ||
                    selectedPhoto.category ||
                    'Astrophotography'}
                </span>
              </div>

              <div>
                <b>Captured</b>

                <span>
                  {selectedPhoto.captureDate ||
                    selectedPhoto.date ||
                    'Unknown'}
                </span>
              </div>

              <div>
                <b>Constellation</b>

                <span>
                  {selectedPhoto.constellation ||
                    'Unknown'}
                </span>
              </div>

              <div>
                <b>Exposure</b>

                <span>
                  {selectedPhoto.exposure ||
                    'Not listed'}
                </span>
              </div>

              <div>
                <b>Distance</b>

                <span>
                  {selectedPhoto.distance ||
                    'Unknown'}
                </span>
              </div>

              <div>
                <b>Processing</b>

                <span>
                  {selectedPhoto.processing ||
                    'Not listed'}
                </span>
              </div>
            </div>

            {selectedPhoto.sourceOperationDesignation && (
              <section className="missionSourceOperation">
                <small>SOURCE OPERATION</small>
                <strong>
                  {selectedPhoto.sourceOperationDesignation}
                </strong>
                <span>
                  Mission Report generated from an archived CuzBro
                  crew operation.
                </span>
              </section>
            )}

            <h4>Equipment</h4>

            <p>
              {selectedPhoto.equipment}
            </p>

            <h4>Observing Notes</h4>

            <p>{selectedPhoto.notes}</p>

            <section
              className={
                matchingLogs.length
                  ? 'missionLogSummary'
                  : 'missionLogSummary empty'
              }
            >
              <div className="missionLogSummaryHeader">
                <span>
                  <small>
                    Captain&apos;s Log
                  </small>

                  <h4>
                    {matchingLogs.length
                      ? `${matchingLogs.length} ${
                          matchingLogs.length ===
                          1
                            ? 'Mission'
                            : 'Missions'
                        } Linked`
                      : 'No Field Reports Linked'}
                  </h4>
                </span>

                {latestLog && (
                  <i>
                    Stardate{' '}
                    {formatMissionStardate(
                      latestLog.date
                    )}
                  </i>
                )}
              </div>

              {latestLog ? (
                <>
                  <div className="missionLogLatest">
                    <b>Latest Mission</b>

                    <strong>
                      {latestLog.mission}
                    </strong>

                    <span>
                      {latestLog.id}
                    </span>
                  </div>

                  <p>
                    {latestTargetNote?.notes ||
                      latestLog.summary}
                  </p>

                  {(latestTargetNote?.lesson ||
                    latestLog.nextMission) && (
                    <div className="missionLogLesson">
                      <b>
                        Latest Lesson
                      </b>

                      <p>
                        {latestTargetNote?.lesson ||
                          latestLog.nextMission}
                      </p>
                    </div>
                  )}

                  <a
                    href={`/captains-log#${getMissionAnchor(
                      latestLog
                    )}`}
                  >
                    View Latest Captain&apos;s
                    Log →
                  </a>
                </>
              ) : (
                <p>
                  No Captain&apos;s Log entry is
                  linked to{' '}
                  {selectedPhoto.title} yet.
                  Future field reports will
                  appear here automatically.
                </p>
              )}
            </section>

            {selectedPhoto.masterFileUrl && (
              <section className="missionMasterDownload">
                <span>
                  FULL-RES MASTER
                </span>

                <h4>
                  Original TIFF
                </h4>

                <p>
                  {selectedPhoto.masterFileName ||
                    'Full-resolution TIFF'}
                  {selectedPhoto.masterFileSize
                    ? ` · ${formatFileSize(
                        selectedPhoto.masterFileSize
                      )}`
                    : ''}
                </p>

                <a
                  href={
                    selectedPhoto.masterFileUrl
                  }
                >
                  <Download size={17} />
                  DOWNLOAD FULL-SIZE IMAGE
                </a>
              </section>
            )}

            <h4>Next Goal</h4>

            <p>
              {selectedPhoto.nextGoal ||
                'Capture again with improved settings.'}
            </p>
          </aside>
        </div>

        <div
          className={
            isCinema
              ? 'missionFilmstrip hiddenFilmstrip'
              : 'missionFilmstrip'
          }
        >
          <button
            type="button"
            className="filmNav"
            onClick={showPreviousPhoto}
            aria-label="Previous capture"
          >
            <ChevronLeft />
          </button>

          <div className="filmItems">
            {gallery.map(
              (photo, index) => (
                <button
                  type="button"
                  key={photo.id || photo.title}
                  className={
                    index === selectedIndex
                      ? 'filmCard active'
                      : 'filmCard'
                  }
                  onClick={() => {
                    setViewerMode('report');
                    setSelectedIndex(index);
                  }}
                >
                  <img
                    src={getCaptureImageUrl(
                      photo.image
                    )}
                    alt={photo.title}
                  />

                  <strong>
                    {photo.title}
                  </strong>

                  <span>
                    {photo.subtitle}
                  </span>
                </button>
              )
            )}
          </div>

          <button
            type="button"
            className="filmNav"
            onClick={showNextPhoto}
            aria-label="Next capture"
          >
            <ChevronRight />
          </button>
        </div>

        <div
          className={
            isCinema
              ? 'missionFooter hiddenFilmstrip'
              : 'missionFooter'
          }
        >
          <span>
            Click image for cinema view
          </span>

          <span>
            Pinch / scroll to zoom
          </span>

          <span>Drag to pan</span>

          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}