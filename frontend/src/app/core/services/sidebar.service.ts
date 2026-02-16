import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private readonly toggleSubject = new Subject<void>();
  readonly toggle$ = this.toggleSubject.asObservable();

  toggle(): void {
    this.toggleSubject.next();
  }
}
