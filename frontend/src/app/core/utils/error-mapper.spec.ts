import { HttpErrorResponse } from '@angular/common/http';
import { mapFieldMessageToKey, mapMessageToKey, parseHttpError } from './error-mapper';

describe('error-mapper', () => {
  it('maps known general messages', () => {
    expect(mapMessageToKey('The provided credentials are incorrect.')).toBe('auth.errors.invalid_credentials');
    expect(mapMessageToKey('Please verify your email address before logging in.')).toBe('auth.errors.email_unverified');
    expect(mapMessageToKey('random')).toBeNull();
  });

  it('maps known field messages', () => {
    expect(mapFieldMessageToKey('The email has already been taken.')).toBe('auth.errors.email_taken');
    expect(mapFieldMessageToKey('The username has already been taken.')).toBe('auth.errors.username_taken');
    expect(mapFieldMessageToKey('required')).toBe('auth.errors.required');
    expect(mapFieldMessageToKey('')).toBeNull();
  });

  it('parses http errors with general and field keys', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: {
        message: 'Validation failed',
        errors: {
          email: ['The email has already been taken.'],
          username: 'The username has already been taken.'
        }
      }
    });

    const parsed = parseHttpError(error);
    expect(parsed.generalKey).toBe('auth.errors.validation');
    expect(parsed.fieldErrors['email']).toBe('auth.errors.email_taken');
    expect(parsed.fieldErrors['username']).toBe('auth.errors.username_taken');
  });

  it('returns unknown for non-http errors', () => {
    const parsed = parseHttpError(new Error('boom'));
    expect(parsed.generalKey).toBe('auth.errors.unknown');
    expect(parsed.fieldErrors).toEqual({});
  });
});

