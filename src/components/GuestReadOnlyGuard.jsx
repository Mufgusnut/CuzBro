import { useEffect } from 'react';

function requestDetails(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  return { url, method };
}

function isAuthRequest(url) {
  return /\/auth\/v1\//i.test(url);
}

export default function GuestReadOnlyGuard({ active }) {
  useEffect(() => {
    if (!active) return undefined;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
      const { url, method } = requestDetails(input, init);
      const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

      if (!isRead && !isAuthRequest(url)) {
        window.dispatchEvent(
          new CustomEvent('cuzbro:guest-write-blocked', {
            detail: { url, method }
          })
        );

        return new Response(
          JSON.stringify({
            message: 'Guest access is view-only. This action was blocked.'
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="guest-read-only-banner" role="status">
      <strong>GUEST ACCESS</strong>
      <span>View only · controls and data changes are disabled</span>
    </div>
  );
}
