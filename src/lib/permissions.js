const ADMIN_EMAILS = new Set([
  'dve.hffman@gmail.com',
  'jhoff33@gmail.com',
  'gregg@computerav.com'
]);

const DEFAULT_GUEST_EMAIL = 'guest@cuzbro.net';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function getGuestEmail() {
  return normalizeEmail(
    import.meta.env.VITE_GUEST_EMAIL || DEFAULT_GUEST_EMAIL
  );
}

export function getAccessLevel(user) {
  if (!user) return 'none';

  const email = normalizeEmail(user.email);
  const declaredRole = normalizeEmail(
    user.app_metadata?.role || user.user_metadata?.role
  );

  if (ADMIN_EMAILS.has(email) || declaredRole === 'admin') {
    return 'admin';
  }

  if (email === getGuestEmail() || declaredRole === 'guest') {
    return 'guest';
  }

  return 'none';
}

export function isAdminUser(user) {
  return getAccessLevel(user) === 'admin';
}

export function isGuestUser(user) {
  return getAccessLevel(user) === 'guest';
}

export function canWrite(user) {
  return isAdminUser(user);
}
