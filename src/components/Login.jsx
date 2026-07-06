import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function Login({ forcePasswordReset = false }) {
  const [mode, setMode] = useState(
  forcePasswordReset ? 'reset' : 'login'
);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset');
        setError('');
        setMessage('');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    setError('');
    setMessage('');

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (loginError) {
      setError(loginError.message);
    }

    setLoading(false);
  }

  async function handleForgotPassword(event) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (!email) {
      setError('Enter your email address first.');
      return;
    }

    setLoading(true);

    const redirectTo = import.meta.env.DEV
  ? 'http://localhost:5173/'
  : 'https://cuzbro.net/';

    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage(
        'Recovery transmission sent. Check your email for the password reset link.'
      );
    }

    setLoading(false);
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
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

    setMessage('Access credentials updated.');

    setNewPassword('');
    setConfirmPassword('');

    setLoading(false);
  }

  if (mode === 'reset') {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>CuzBro</h1>
          <p>Reset Access Credentials</p>

          <form onSubmit={handleUpdatePassword}>
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(event.target.value)
              }
              autoComplete="new-password"
              required
            />

            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              autoComplete="new-password"
              required
            />

            <button type="submit" disabled={loading}>
              {loading
                ? 'UPDATING...'
                : 'UPDATE ACCESS CREDENTIALS'}
            </button>
          </form>

          {error && (
            <p className="login-error">{error}</p>
          )}

          {message && (
            <p className="login-message">{message}</p>
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

          <button type="submit" disabled={loading}>
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
          <p className="login-error">{error}</p>
        )}

        {message && (
          <p className="login-message">{message}</p>
        )}
      </div>
    </div>
  );
}