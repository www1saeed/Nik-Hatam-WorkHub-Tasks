import { Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './layout/app-header.component';
import { PrimeNG } from 'primeng/config';
import { LanguageService } from './core/services/language.service';
import { ThemeService } from './core/services/theme.service';
import { PrimeNgLocale } from './core/utils/primeng-locale';
import { distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ServiceWorkerBootstrapService } from './core/services/service-worker-bootstrap.service';

@Component({
  selector: 'app-root',
  imports: [AppHeaderComponent, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly primeConfig = inject(PrimeNG);
  private readonly languageService = inject(LanguageService);
  private readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly serviceWorkerBootstrap = inject(ServiceWorkerBootstrapService);

  constructor() {
    // Ensure theme is initialized at app startup.
    this.themeService.getTheme();
    // Register service worker early so offline-first task sync can receive
    // wake messages even for users who never opened push settings.
    void this.serviceWorkerBootstrap.ensureRegistered();

    const current = this.languageService.getLanguage();
    PrimeNgLocale.apply(this.primeConfig, current);
    this.languageService.current$
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((locale) => {
        PrimeNgLocale.apply(this.primeConfig, locale);
      });
  }
}
