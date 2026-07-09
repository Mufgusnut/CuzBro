import { useEffect, useMemo, useState } from 'react';
import {
  Antenna,
  Check,
  Mail,
  Radio,
  Satellite,
  Telescope
} from 'lucide-react';
import {
  invokeCuzBroSignals,
  SIGNAL_TOPICS
} from '../lib/signals.js';

const DEFAULT_PREFERENCES = {
  mission_reports: true,
  telescope_site: true,
  mission_captures: false,
  observatory_updates: false
};

const TOPIC_META = [
  {
    key: 'mission_reports',
    icon: Radio,
    title: SIGNAL_TOPICS.mission_reports,
    description:
      'Receive a transmission when a new Captain’s Log / Mission Report is published.'
  },
  {
    key: 'telescope_site',
    icon: Satellite,
    title: SIGNAL_TOPICS.telescope_site,
    description:
      'Know when the active telescope site moves between Eliot, Congers, and New York City.'
  },
  {
    key: 'mission_captures',
    icon: Telescope,
    title: SIGNAL_TOPICS.mission_captures,
    description:
      'Get notified when a new image is added to the Mission Archive.'
  },
  {
    key: 'observatory_updates',
    icon: Antenna,
    title: SIGNAL_TOPICS.observatory_updates,
    description:
      'Receive major gear milestones and observatory system upgrades.'
  }
];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanSignalQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete('signal');
  url.searchParams.delete('token');

  window.history.replaceState(
    {},
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
}

export default function CuzBroSignals() {
  const [email, setEmail] = useState('');
  const [preferences, setPreferences] = useState(
    DEFAULT_PREFERENCES
  );
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manageToken, setManageToken] = useState('');
  const [manageMode, setManageMode] = useState(false);

  const selectedCount = useMemo(
    () =>
      Object.values(preferences).filter(Boolean).length,
    [preferences]
  );

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );
    const action = params.get('signal');
    const token = params.get('token');

    if (!action || !token) return;

    async function handleSignalLink() {
      setStatus('working');
      setError('');
      setMessage('');

      try {
        if (action === 'confirm') {
          const result = await invokeCuzBroSignals({
            action: 'confirm',
            token
          });

          setEmail(result.email || '');
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...(result.preferences || {})
          });
          setManageToken(
            result.unsubscribeToken || token
          );
          setManageMode(true);
          setMessage(
            'SIGNAL LINK CONFIRMED · CUZBRO TRANSMISSIONS ACTIVE'
          );
        } else if (action === 'manage') {
          const result = await invokeCuzBroSignals({
            action: 'manage',
            token
          });

          setEmail(result.email || '');
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...(result.preferences || {})
          });
          setManageToken(token);
          setManageMode(true);
          setMessage(
            'SIGNAL PREFERENCES LOADED'
          );
        } else if (action === 'unsubscribe') {
          await invokeCuzBroSignals({
            action: 'unsubscribe',
            token
          });

          setManageToken('');
          setManageMode(false);
          setMessage(
            'UNSUBSCRIBED · CUZBRO SIGNALS DISCONNECTED'
          );
        }
      } catch (linkError) {
        console.error(linkError);
        setError(
          linkError?.message ||
          'Signal link could not be processed.'
        );
      } finally {
        setStatus('ready');
        cleanSignalQuery();
        window.setTimeout(() => {
          document
            .getElementById('signals')
            ?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
        }, 50);
      }
    }

    handleSignalLink();
  }, []);

  function togglePreference(key) {
    setPreferences((current) => ({
      ...current,
      [key]: !current[key]
    }));
    setMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);

    if (
      !normalizedEmail ||
      !normalizedEmail.includes('@')
    ) {
      setError('Enter a valid email address.');
      return;
    }

    if (selectedCount < 1) {
      setError(
        'Select at least one CuzBro signal.'
      );
      return;
    }

    setStatus('working');
    setError('');
    setMessage('');

    try {
      if (manageMode && manageToken) {
        await invokeCuzBroSignals({
          action: 'preferences',
          token: manageToken,
          preferences
        });

        setMessage(
          'SIGNAL PREFERENCES UPDATED'
        );
      } else {
        await invokeCuzBroSignals({
          action: 'subscribe',
          email: normalizedEmail,
          preferences
        });

        setMessage(
          'CONFIRMATION TRANSMISSION SENT · CHECK YOUR EMAIL'
        );
      }
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError?.message ||
        'CuzBro Signals request failed.'
      );
    } finally {
      setStatus('ready');
    }
  }

  async function handleUnsubscribe() {
    if (!manageToken) return;

    setStatus('working');
    setError('');
    setMessage('');

    try {
      await invokeCuzBroSignals({
        action: 'unsubscribe',
        token: manageToken
      });

      setManageToken('');
      setManageMode(false);
      setEmail('');
      setPreferences(DEFAULT_PREFERENCES);
      setMessage(
        'UNSUBSCRIBED · CUZBRO SIGNALS DISCONNECTED'
      );
    } catch (unsubscribeError) {
      console.error(unsubscribeError);
      setError(
        unsubscribeError?.message ||
        'Unsubscribe request failed.'
      );
    } finally {
      setStatus('ready');
    }
  }

  return (
    <section
      className="signalsSection"
      id="signals"
    >
      <div className="signalsShell">
        <div className="signalsIntro">
          <span className="signalsEyebrow">
            <Antenna size={15} />
            PUBLIC TRANSMISSION CHANNEL
          </span>

          <h2>CuzBro Signals</h2>

          <p>
            Subscribe to mission and observatory
            transmissions. Pick only the signals you
            actually want.
          </p>

          <div className="signalsFrequency">
            <Mail size={17} />
            <span>
              Confirmation required. Every message
              includes manage and unsubscribe links.
            </span>
          </div>
        </div>

        <form
          className="signalsForm"
          onSubmit={handleSubmit}
        >
          <label className="signalsEmailField">
            <span>EMAIL ADDRESS</span>
            <input
              type="email"
              value={email}
              disabled={manageMode}
              placeholder="crewfriend@example.com"
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />
          </label>

          <div className="signalsTopicGrid">
            {TOPIC_META.map((topic) => {
              const Icon = topic.icon;
              const active =
                Boolean(preferences[topic.key]);

              return (
                <button
                  key={topic.key}
                  type="button"
                  className={
                    active
                      ? 'signalsTopic active'
                      : 'signalsTopic'
                  }
                  aria-pressed={active}
                  onClick={() =>
                    togglePreference(topic.key)
                  }
                >
                  <span className="signalsTopicIcon">
                    <Icon size={18} />
                  </span>

                  <span className="signalsTopicCopy">
                    <strong>{topic.title}</strong>
                    <small>
                      {topic.description}
                    </small>
                  </span>

                  <span className="signalsCheck">
                    {active && <Check size={15} />}
                  </span>
                </button>
              );
            })}
          </div>

          {message && (
            <p className="signalsMessage">
              {message}
            </p>
          )}

          {error && (
            <p className="signalsError">
              {error}
            </p>
          )}

          <div className="signalsActions">
            <button
              type="submit"
              className="signalsSubmit"
              disabled={status === 'working'}
            >
              {status === 'working'
                ? 'TRANSMITTING...'
                : manageMode
                  ? 'UPDATE SIGNALS'
                  : 'SUBSCRIBE TO SIGNALS'}
            </button>

            {manageMode && manageToken && (
              <button
                type="button"
                className="signalsUnsubscribe"
                disabled={status === 'working'}
                onClick={handleUnsubscribe}
              >
                UNSUBSCRIBE
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
