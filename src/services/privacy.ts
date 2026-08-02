// PHI/PII protection layer. CLINICAL Rx never stores patient identifiers, but
// this scans free-text before export/share and warns if anything identifying
// was found, so users never accidentally leak real patient data.
const NAME_RE = /\b(Dr|Mr|Mrs|Ms)\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/;
const PHONE_RE = /(?:\+?234|0)\d{9,10}/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const ID_RE = /\b(?:NHIS|NHS|MRN|HOSP)\s*[#/]?\s*[A-Z0-9-]{3,}\b/i;

export interface PrivacyFinding {
  type: 'name' | 'phone' | 'email' | 'id';
  match: string;
}

export function scanForPhi(text: string): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  if (NAME_RE.test(text)) findings.push({ type: 'name', match: 'Possible person name' });
  if (PHONE_RE.test(text)) findings.push({ type: 'phone', match: 'Possible phone number' });
  if (EMAIL_RE.test(text)) findings.push({ type: 'email', match: 'Possible email address' });
  if (ID_RE.test(text)) findings.push({ type: 'id', match: 'Possible patient/hospital ID' });
  return findings;
}

export function privacyWarning(findings: PrivacyFinding[]): string {
  const labels: Record<string, string> = { name: 'names', phone: 'phone numbers', email: 'emails', id: 'patient IDs' };
  return findings.map((f) => labels[f.type]).filter((v, i, a) => a.indexOf(v) === i).join(', ');
}
