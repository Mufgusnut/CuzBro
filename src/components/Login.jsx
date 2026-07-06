import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function Login({
  forcePasswordReset = false
}) {
  const [mode, setMode] = useState(
    forcePasswordReset ? 'reset' : 'login'
  );

  const [email, setEmail] = useState('');

  const [password, setPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword
  ] = useState('');

  const [error, setError] = useState('');

  const [message, setMessage] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [
    recoveryStatus,
    setRecoveryStatus
  ] = useState(
    forcePasswordReset
      ? 'checking'
      : 'idle'
  );

  useEffect(() => {
    if (forcePasswordReset) {
      setMode('reset');
      setRecoveryStatus('checking');
    }
  }, [forcePasswordReset]);

  useEffect(() => {
    let mounted = true;

    async function initializeRecovery() {
      const searchParams =
        new URLSearchParams(
          window.location.search
        );

      const authCode =
        searchParams.get('code');

      const hashParams =
        new URLSearchParams(
          window.location.hash.replace(
            /^#/,
            ''
          )
        );

      const accessToken =
        hashParams.get('access_token');

      const refreshToken =
        hashParams.get('refresh_token');

      const recoveryType =
        hashParams.get('type');

      try {
        /*
         * PKCE recovery callback:
         * ?code=...
         */
        if (authCode) {
          const {
            error: exchangeError
          } =
            await supabase.auth
              .exchangeCodeForSession(
                authCode
              );

          if (exchangeError) {
            throw exchangeError;
          }
        }

        /*
         * Implicit recovery callback:
         * #access_token=...&refresh_token=...
         */
        if (
          recoveryType === 'recovery' &&
          accessToken &&
          refreshToken
        ) {
          const {
            error: sessionError
          } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });

          if (sessionError) {
            throw sessionError;
          }
        }

        const {
          data: { session },
          error: getSessionError
        } =
          await supabase.auth.getSession();

        if (getSessionError) {
          throw getSessionError;
        }

        if (!mounted) {
          return;
        }

        if (session) {
          setRecoveryStatus('ready');
          setError('');

          /*
           * Remove recovery credentials from
           * the visible browser URL.
           */
          window.history.replaceState(
            {},
            '',
            '/admin?reset-password=true'
          );
        } else {
          setRecoveryStatus('invalid');

          setError(
            'The recovery link could not create an active session. Request a new password reset email and open the newest link.'
          );
        }
      } catch (recoveryError) {
        console.error(
          'Password recovery initialization failed:',
          recoveryError
        );

        if (!mounted) {
          return;
        }

        setRecoveryStatus('invalid');

        setError(
          recoveryError.message ||
            'The recovery link could not be verified.'
        );
      }
    }

    if (forcePasswordReset) {
      initializeRecovery();
    }

    const {
      data: { subscription }
    } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) {
            return;
          }

          if (
            event === 'PASSWORD_RECOVERY'
          ) {
            setMode('reset');

            setRecoveryStatus(
              session ? 'ready' : 'checking'
            );

            setError('');
            setMessage('');
          }
        }
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [forcePasswordReset]);

  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    setError('');
    setMessage('');

    const { error: loginError } =
      await supabase.auth
        .signInWithPassword({
          email,
          password
        });

    if (loginError) {
      setError(loginError.message);
    }

    setLoading(false);
  }

  async function handleForgotPassword(
    event
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (!email) {
      setError(
        'Enter your email address first.'
      );

      return;
    }

    setLoading(true);

    const redirectTo = import.meta.env.DEV
      ? 'http://localhost:5173/admin?reset-password=true'
      : 'https://cuzbro.net/admin?reset-password=true';

    const { error: resetError } =
      await supabase.auth
        .resetPasswordForEmail(email, {
          redirectTo
        });

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage(
        'Recovery transmission sent. Check your email for the newest password reset link.'
      );
    }

    setLoading(false);
  }

  async function handleUpdatePassword(
    event
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (recoveryStatus !== 'ready') {
      setError(
        'Recovery authentication is still unavailable. Open the newest password reset email.'
      );

      return;
    }

    if (newPassword.length < 8) {
      setError(
        'Your new password must be at least 8 characters.'
      );

      return;
    }

    if (
      newPassword !== confirmPassword
    ) {
      setError(
        'The passwords do not match.'
      );

      return;
    }

    setLoading(true);

    const { error: updateError } =
      await supabase.auth.updateUser({
        password: newPassword
      });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);

      return;
    }

    setNewPassword('');
    setConfirmPassword('');

    setMessage(
      'Access credentials updated. Entering Observatory Control...'
    );

    setLoading(false);

    window.history.replaceState(
      {},
      '',
      '/admin'
    );

    window.setTimeout(() => {
      window.location.href = '/admin';
    }, 1200);
  }

  if (mode === 'reset') {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>CuzBro</h1>

          <p>
            Reset Access Credentials
          </p>

          {recoveryStatus ===
            'checking' && (
            <p className="login-message">
              VERIFYING RECOVERY
              TRANSMISSION...
            </p>
          )}

          <form
            onSubmit={
              handleUpdatePassword
            }
          >
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(
                  event.target.value
                )
              }
              autoComplete="new-password"
              required
              disabled={
                recoveryStatus !== 'ready'
              }
            />

            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              autoComplete="new-password"
              required
              disabled={
                recoveryStatus !== 'ready'
              }
            />

            <button
              type="submit"
              disabled={
                loading ||
                recoveryStatus !== 'ready'
              }
            >
              {loading
                ? 'UPDATING...'
                : recoveryStatus ===
                    'checking'
                  ? 'VERIFYING RECOVERY...'
                  : 'UPDATE ACCESS CREDENTIALS'}
            </button>
          </form>

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          {message && (
            <p className="login-message">
              {message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>CuzBro</h1>

        <p>Observatory Access</p>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            autoComplete="email"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'ACCESSING...'
              : 'ENTER OBSERVATORY'}
          </button>
        </form>

        <button
          type="button"
          className="login-forgot-button"
          onClick={handleForgotPassword}
          disabled={loading}
        >
          FORGOT ACCESS CREDENTIALS?
        </button>

        {error && (
          <p className="login-error">
            {error}
          </p>
        )}

        {message && (
          <p className="login-message">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}