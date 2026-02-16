import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { ProfileService } from '../../core/services/profile.service';
import { ProfileComponent } from './profile.component';
import { UiLocale } from '../../core/utils/locale';

@Pipe({ name: 'transloco', standalone: true })
class MockTranslocoPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let component: ProfileComponent;
  let currentLang: UiLocale = 'en';
  let routeParams: Record<string, string> = {};

  const profileService = {
    fetchProfile: vi.fn(),
    fetchUserProfile: vi.fn(),
    updateProfile: vi.fn(),
    updateUserProfile: vi.fn(),
    checkAvailability: vi.fn(),
    checkUserAvailability: vi.fn(),
  };
  const authService = {
    refreshUser: vi.fn(),
  };
  const languageService = {
    current$: of<UiLocale>('en'),
    getLanguage: vi.fn(() => currentLang),
  };
  const transloco = {
    langChanges$: of('en'),
    translate: vi.fn((key: string) => key),
  };
  const router = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    currentLang = 'en';
    routeParams = {};
    profileService.fetchProfile.mockResolvedValue({
      username: 'saeed',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      phone_numbers: [{ number: '09120000000', type: 'mobile' }],
      addresses: [{ address: 'Tehran', type: 'private' }],
      birth_date: '2000-01-01',
      social_providers: ['telegram'],
    });
    profileService.fetchUserProfile.mockResolvedValue({
      username: 'admin-user',
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@test.dev',
      phone_numbers: [],
      addresses: [],
      birth_date: '2001-02-03',
    });
    profileService.updateProfile.mockResolvedValue({});
    profileService.checkAvailability.mockResolvedValue({ username_available: true, email_available: true });
    authService.refreshUser.mockResolvedValue(null);

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        { provide: ProfileService, useValue: profileService },
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
        { provide: TranslocoService, useValue: transloco },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            get snapshot() {
              return {
                paramMap: convertToParamMap(routeParams),
              };
            },
          },
        },
      ],
    })
      .overrideComponent(ProfileComponent, {
        remove: { imports: [TranslocoPipe] },
        add: { imports: [MockTranslocoPipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(false);
    await fixture.whenStable();
    fixture.detectChanges(false);
  });

  it('adds and removes phone/address rows', () => {
    component.startEdit();
    component.addPhone();
    component.addAddress();
    expect(component.phoneNumbers.length).toBeGreaterThan(1);
    expect(component.addresses.length).toBeGreaterThan(1);

    component.removePhone(component.phoneNumbers.length - 1);
    component.removeAddress(component.addresses.length - 1);
    expect(component.phoneNumbers.length).toBe(1);
    expect(component.addresses.length).toBe(1);
  });

  it('formats id number in fa locale with persian digits', () => {
    currentLang = 'fa';
    const value = component.formatIdNumber('1234567890');
    expect(value).not.toBe('123-456789-0');
  });

  it('renders read-only profile with social icon and can open edit form', () => {
    expect(fixture.nativeElement.querySelector('.profile__social-icon--telegram')).toBeTruthy();

    const buttonList = fixture.nativeElement.querySelectorAll('.profile__button') as NodeListOf<HTMLButtonElement>;
    const buttons = Array.from(buttonList);
    const editButton = buttons.find((el: HTMLButtonElement) => el.textContent?.includes('profile.edit')) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges(false);

    expect(fixture.nativeElement.querySelector('form.profile__form')).toBeTruthy();
  });

  it('opens password modal from read-only profile', () => {
    const buttonList = fixture.nativeElement.querySelectorAll('.profile__button') as NodeListOf<HTMLButtonElement>;
    const buttons = Array.from(buttonList);
    const passwordButton = buttons.find((el: HTMLButtonElement) => el.textContent?.includes('profile.change_password')) as HTMLButtonElement;
    passwordButton.click();
    fixture.detectChanges(false);

    expect(fixture.nativeElement.querySelector('.profile-modal')).toBeTruthy();
  });

  it('shows admin back button and hides password button in admin view', async () => {
    routeParams = { id: '9' };
    const adminFixture = TestBed.createComponent(ProfileComponent);
    adminFixture.detectChanges(false);
    await adminFixture.whenStable();
    adminFixture.detectChanges(false);

    const text = adminFixture.nativeElement.textContent as string;
    expect(text).toContain('profile.back_to_users');
    expect(text).not.toContain('profile.change_password');
  });

  it('does not save when required fields are invalid', async () => {
    component.startEdit();
    component.form.patchValue({
      first_name: '',
      last_name: '',
      email: '',
    });

    await component.save();
    expect(profileService.updateProfile).not.toHaveBeenCalled();
  });

  it('opens and closes password modal and resets messages', () => {
    component.passwordErrorMessage = 'x';
    component.passwordSuccessMessage = 'y';
    component.openPasswordModal();
    expect(component.showPasswordModal).toBe(true);
    expect(component.passwordErrorMessage).toBe('');
    expect(component.passwordSuccessMessage).toBe('');

    component.closePasswordModal();
    expect(component.showPasswordModal).toBe(false);
  });

  it('submits password change with valid payload', async () => {
    component.openPasswordModal();
    component.passwordForm.patchValue({
      current_password: 'OldPass123!',
      new_password: 'NewPass123!',
      new_password_confirmation: 'NewPass123!',
    });

    await component.submitPasswordChange();

    expect(profileService.updateProfile).toHaveBeenCalled();
    expect(component.passwordSuccessMessage).toBe('profile.password_changed');
  });

  it('maps type keys and birth date formatting branches', () => {
    expect(component.getTypeKey('mobile')).toBe('profile.type.mobile');
    expect(component.getTypeKey('unknown')).toBeNull();

    currentLang = 'en';
    expect(component.formatBirthDate('2020-01-02')).toBe('2020-01-02');
    currentLang = 'fa';
    expect(component.formatBirthDate('2020-01-02')).not.toBe('2020-01-02');
  });

  it('saves profile and normalizes username to lowercase', async () => {
    const callsBefore = profileService.updateProfile.mock.calls.length;
    component.startEdit();
    component.form.patchValue({
      username: 'Upper.Case',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      birth_date: '2000-01-01',
      id_number: '',
      iban: '',
    });

    profileService.updateProfile.mockResolvedValueOnce({
      username: 'upper.case',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      birth_date: '2000-01-01',
      id_number: '',
      iban: '',
      phone_numbers: [{ number: '09120000000', type: 'mobile' }],
      addresses: [{ address: 'Tehran', type: 'private' }],
    });

    await component.save();

    expect(profileService.updateProfile.mock.calls.length).toBeGreaterThan(callsBefore);
    const payload = profileService.updateProfile.mock.calls.at(-1)?.[0] as { username?: string };
    expect(payload.username).toBe('upper.case');
    expect(component.isEditing).toBe(false);
  });

  it('maps save failure to error message', async () => {
    const callsBefore = profileService.updateProfile.mock.calls.length;
    component.startEdit();
    component.form.patchValue({
      username: 'error.user',
      first_name: 'Saeed',
      last_name: 'Hatami',
      email: 'saeed@test.dev',
      birth_date: '2000-01-01',
      id_number: '',
      iban: '',
    });
    profileService.updateProfile.mockRejectedValueOnce(new Error('save failed'));

    await component.save();
    expect(profileService.updateProfile.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(component.errorMessage).toBe('profile.save_failed');
  });

  it('handles avatar drag/drop and clear', () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

    const over = { preventDefault: vi.fn() } as unknown as DragEvent;
    component.onAvatarDragOver(over);
    expect(component.isDraggingAvatar).toBe(true);

    const leave = { preventDefault: vi.fn() } as unknown as DragEvent;
    component.onAvatarDragLeave(leave);
    expect(component.isDraggingAvatar).toBe(false);

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    const drop = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;
    component.onAvatarDrop(drop);
    expect(component.avatarPreview).toBe('blob:test');

    component.clearAvatar();
    expect(component.avatarRemove).toBe(true);
    expect(component.avatarPreview).toBeNull();
    createObjectUrlSpy.mockRestore();
  });

  it('maps field-level validation keys for profile and password forms', () => {
    component.startEdit();
    component.form.get('email')?.setErrors({ email: true });
    component.form.get('email')?.markAsTouched();
    expect(component.getErrorKey('email')).toBe('profile.email_invalid');

    component.form.get('username')?.setErrors({ usernameTaken: true });
    component.form.get('username')?.markAsTouched();
    expect(component.getErrorKey('username')).toBe('profile.username_taken');

    component.passwordForm.get('new_password')?.setErrors({ minlength: { requiredLength: 8, actualLength: 3 } });
    component.passwordForm.get('new_password')?.markAsTouched();
    expect(component.getPasswordErrorKey('new_password')).toBe('auth.errors.password_policy');
  });

  it('handles password change failure', async () => {
    component.openPasswordModal();
    component.passwordForm.patchValue({
      current_password: 'OldPass123!',
      new_password: 'NewPass123!',
      new_password_confirmation: 'NewPass123!',
    });
    profileService.updateProfile.mockRejectedValueOnce(new Error('password failed'));

    await component.submitPasswordChange();
    expect(component.passwordErrorMessage).toBe('profile.password_change_failed');
    expect(component.isPasswordSubmitting).toBe(false);
  });
});
