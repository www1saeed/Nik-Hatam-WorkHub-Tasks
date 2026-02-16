import { TestBed } from '@angular/core/testing';
import { SidebarService } from './sidebar.service';

describe('SidebarService', () => {
  let service: SidebarService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SidebarService]
    });
    service = TestBed.inject(SidebarService);
  });

  it('emits toggle events', () => {
    let emitted = 0;
    const sub = service.toggle$.subscribe(() => {
      emitted += 1;
    });

    service.toggle();
    service.toggle();
    expect(emitted).toBe(2);
    sub.unsubscribe();
  });
});
