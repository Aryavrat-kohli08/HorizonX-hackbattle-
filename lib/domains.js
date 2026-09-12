export function registrableDomain(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

export function isThirdParty(pageHost, requestHost) {
  if (!pageHost || !requestHost) return false;
  return registrableDomain(pageHost) !== registrableDomain(requestHost);
}

export function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith("." + domain);
}