import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService, TelegramAuthPayload } from '../core/services/auth.service';
import { parseHttpError } from '../core/utils/error-mapper';

export const TELEGRAM_WIDGET_VERSION = '22';

type TelegramAuthResponse = TelegramAuthPayload & { photo_url?: string };

declare global {
  interface Window {
    __nhTelegramAuth?: (user: TelegramAuthResponse) => void;
  }
}

@Component({
  selector: 'app-telegram-login',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './telegram-login.component.html',
  styleUrl: './telegram-login.component.scss'
})
export class TelegramLoginComponent implements AfterViewInit, OnDestroy, OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  errorMessage = '';
  isLoading = false;
  isConfigured = false;
  private botName = '';
  private viewReady = false;

  async ngOnInit(): Promise<void> {
    try {
      const config = await this.authService.getTelegramConfig();
      this.botName = config?.bot_username ?? '';
      this.isConfigured = Boolean(this.botName);
      if (this.viewReady && this.isConfigured) {
        // Ensure the @if block renders before injecting the widget.
        this.cdr.detectChanges();
        setTimeout(() => this.renderWidget(), 0);
      }
    } catch {
      this.isConfigured = false;
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.isConfigured) {
      this.cdr.detectChanges();
      setTimeout(() => this.renderWidget(), 0);
    }
  }

  ngOnDestroy(): void {
    delete window.__nhTelegramAuth;
  }

  private async handleAuth(payload: TelegramAuthPayload): Promise<void> {
    if (!this.botName) {
      this.errorMessage = 'auth.telegram.missing_bot';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await this.authService.telegramLogin(payload);
      this.authService.applyLoginResponse(response);
      void this.router.navigateByUrl('/dashboard');
    } catch (error) {
      const httpError = error as { status?: number; error?: { completion_token?: string } };
      if (httpError?.status === 409 && httpError?.error?.completion_token) {
        void this.router.navigate(['/complete-profile'], {
          queryParams: {
            token: httpError.error.completion_token,
            first_name: payload.first_name ?? '',
            last_name: payload.last_name ?? '',
            username: payload.username ? `tlg.${payload.username}`.toLowerCase() : `tlg.${payload.id}`.toLowerCase()
          }
        });
        return;
      }
      const parsed = parseHttpError(error);
      this.errorMessage = parsed.generalKey ?? 'auth.errors.unknown';
    } finally {
      this.isLoading = false;
    }
  }

  private renderWidget(): void {
    const container = this.host.nativeElement.querySelector('[data-telegram-container]');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    window.__nhTelegramAuth = (user: TelegramAuthResponse) => {
      void this.handleAuth(user);
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://telegram.org/js/telegram-widget.js?${TELEGRAM_WIDGET_VERSION}`;
    script.setAttribute('data-telegram-login', this.botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', '__nhTelegramAuth(user)');
    container.appendChild(script);
  }
}
