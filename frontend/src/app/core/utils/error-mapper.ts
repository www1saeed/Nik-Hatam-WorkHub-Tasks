import { HttpErrorResponse } from '@angular/common/http';

export type FieldErrors = Record<string, string>;

const MESSAGE_MAP: { match: RegExp; key: string }[] = [
  { match: /credentials are incorrect/i, key: 'auth.errors.invalid_credentials' },
  { match: /verify your email/i, key: 'auth.errors.email_unverified' },
  { match: /email has already been taken/i, key: 'auth.errors.email_taken' },
  { match: /username has already been taken/i, key: 'auth.errors.username_taken' },
  { match: /slug has already been taken/i, key: 'admin.errors.slug_taken' },
  { match: /name has already been taken/i, key: 'admin.errors.name_taken' },
  { match: /forbidden/i, key: 'admin.errors.forbidden' },
  { match: /invalid or expired verification code/i, key: 'auth.errors.code_invalid' },
  { match: /invalid or expired reset token/i, key: 'auth.errors.reset_token_invalid' },
  { match: /does not have an email/i, key: 'admin.users.reset_no_email' },
  { match: /password.+(must be at least|format is invalid|must contain)/i, key: 'auth.errors.password_policy' },
  { match: /completion token/i, key: 'auth.social.missing_token' },
  { match: /telegram authentication/i, key: 'auth.telegram.invalid' },
  { match: /validation/i, key: 'auth.errors.validation' },
];

const FIELD_MESSAGE_MAP: { match: RegExp; key: string }[] = [
  { match: /email has already been taken/i, key: 'auth.errors.email_taken' },
  { match: /username has already been taken/i, key: 'auth.errors.username_taken' },
  { match: /slug has already been taken/i, key: 'admin.errors.slug_taken' },
  { match: /name has already been taken/i, key: 'admin.errors.name_taken' },
  { match: /forbidden/i, key: 'admin.errors.forbidden' },
  { match: /invalid or expired verification code/i, key: 'auth.errors.code_invalid' },
  { match: /invalid or expired reset token/i, key: 'auth.errors.reset_token_invalid' },
  { match: /completion token/i, key: 'auth.social.missing_token' },
  { match: /telegram authentication/i, key: 'auth.telegram.invalid' },
  { match: /required/i, key: 'auth.errors.required' },
  { match: /(email.+invalid|invalid.+email)/i, key: 'auth.errors.email_invalid' },
  { match: /password.+(must be at least|format is invalid|must contain)/i, key: 'auth.errors.password_policy' },
  { match: /password/i, key: 'auth.errors.password_policy' },
];

export const mapMessageToKey = (message?: string | null): string | null => {
  if (!message) {
    return null;
  }
  const entry = MESSAGE_MAP.find((item) => item.match.test(message));
  return entry ? entry.key : null;
};

export const mapFieldMessageToKey = (message?: string | null): string | null => {
  if (!message) {
    return null;
  }
  const entry = FIELD_MESSAGE_MAP.find((item) => item.match.test(message));
  return entry ? entry.key : null;
};

export const parseHttpError = (error: unknown): { generalKey: string | null; fieldErrors: FieldErrors } => {
  const fieldErrors: FieldErrors = {};

  if (!(error instanceof HttpErrorResponse)) {
    return { generalKey: 'auth.errors.unknown', fieldErrors };
  }

  const data = error.error as { message?: string; errors?: Record<string, string[] | string> } | null;
  const generalKey = mapMessageToKey(data?.message) ?? 'auth.errors.unknown';

  if (data?.errors) {
    Object.entries(data.errors).forEach(([field, messages]) => {
      const value = Array.isArray(messages) ? messages[0] : messages;
      const mapped = mapFieldMessageToKey(value);
      if (mapped) {
        fieldErrors[field] = mapped;
      }
    });
  }

  return { generalKey, fieldErrors };
};
