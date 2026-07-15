const CREW_MEMBERS = {
  'dve.hffman@gmail.com': {
    name: 'Dave',
    callSign: 'DAVE',
    role: 'Administrator'
  },

  'jhoff33@gmail.com': {
    name: 'Justin',
    callSign: 'JUSTIN',
    role: 'Administrator'
  },

  'gregg@computerav.com': {
    name: 'Chappy',
    callSign: 'CHAPPY',
    role: 'Administrator'
  },

  'guest@cuzbro.net': {
    name: 'Guest',
    callSign: 'GUEST',
    role: 'View Only'
  }
};

export function getCrewMember(email) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  return (
    CREW_MEMBERS[normalizedEmail] || {
      name: email || 'Unknown crew member',
      callSign: 'UNKNOWN',
      role: 'Crew'
    }
  );
}

export function getCrewName(email) {
  return getCrewMember(email).name;
}

export function getCrewCallSign(email) {
  return getCrewMember(email).callSign;
}

export function getCrewRole(email) {
  return getCrewMember(email).role;
}

export function isKnownCrewMember(email) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();

  return Boolean(CREW_MEMBERS[normalizedEmail]);
}

export function getAllCrewMembers() {
  return Object.entries(CREW_MEMBERS).map(
    ([email, member]) => ({
      email,
      ...member
    })
  );
}

export function findCrewMember(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  const match = getAllCrewMembers().find(
    (member) =>
      member.email.toLowerCase() === normalizedValue ||
      member.name.toLowerCase() === normalizedValue ||
      member.callSign.toLowerCase() === normalizedValue
  );

  return match || null;
}
