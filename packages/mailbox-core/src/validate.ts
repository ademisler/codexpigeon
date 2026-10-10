import type { ValidationWarning } from "./types";

const MAX_MESSAGE_BYTES = 16 * 1024;

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|token|password|passwd|secret|cookie)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}/i,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/
];

const riskyPatterns = [
  /\brm\s+-rf\b/i,
  /\bdelete\s+all\b/i,
  /\bdrop\s+database\b/i,
  /\brotate\s+(?:key|secret|token|password)s?\b/i,
  /\bpush\s+to\s+prod(?:uction)?\b/i,
  /\bchmod\s+777\b/i
];

export function validateInboxMessage(body: string): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const bytes = Buffer.byteLength(body, "utf8");

  if (bytes > MAX_MESSAGE_BYTES) {
    warnings.push({
      code: "message_too_large",
      message: `Message is ${bytes} bytes; maximum supported size is ${MAX_MESSAGE_BYTES} bytes.`
    });
  }

  if (secretPatterns.some((pattern) => pattern.test(body))) {
    warnings.push({
      code: "possible_secret",
      message: "Message appears to contain a secret or credential-like value."
    });
  }

  if (riskyPatterns.some((pattern) => pattern.test(body))) {
    warnings.push({
      code: "risky_instruction",
      message: "Message appears to request a risky or destructive action."
    });
  }

  return warnings;
}
