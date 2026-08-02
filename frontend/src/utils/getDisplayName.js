/**
 * Return the display name for a user, respecting Business Elite accounts.
 * BUSINESS_ELITE accounts show the company name everywhere instead of
 * the applicant's personal name.
 */
export default function getDisplayName(user, { fallback = 'User' } = {}) {
  if (!user) return fallback;
  const isBusiness = user.accountType === 'business_elite'
    || user.account_type === 'business_elite';
  if (isBusiness && user.companyName) return user.companyName;
  if (isBusiness && user.company_name) return user.company_name;

  const first = user.firstName || user.first_name || '';
  const last  = user.lastName  || user.last_name  || '';
  const full  = `${first} ${last}`.trim();
  return full || fallback;
}

/**
 * Return just the first letter for avatar display.
 */
export function getAvatarLetter(user, { fallback = 'U' } = {}) {
  const name = getDisplayName(user, { fallback: '' });
  return (name ? name.charAt(0) : fallback).toUpperCase();
}
