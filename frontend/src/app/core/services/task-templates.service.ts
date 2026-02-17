import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

export interface TaskTemplate {
  id: number;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class TaskTemplatesService {
  private readonly http = inject(HttpClient);

  /**
   * Search reusable task template titles by free text query.
   *
   * Backend behavior:
   * - performs a LIKE-based title lookup
   * - returns templates sorted by backend default ordering
   *
   * UI usage:
   * - powers the autocomplete in task creation/edit dialogs
   * - allows selecting existing routine labels quickly
   */
  async search(query: string): Promise<TaskTemplate[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: TaskTemplate[] }>(`${API_BASE_URL}/task-templates`, {
        params: { query },
      })
    );
    return response.data ?? [];
  }

  /**
   * List task templates for admin configuration CRUD table.
   */
  async list(): Promise<TaskTemplate[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: TaskTemplate[] }>(`${API_BASE_URL}/task-templates`)
    );
    return response.data ?? [];
  }

  /**
   * Create one task template title.
   */
  async create(payload: { title: string }): Promise<TaskTemplate> {
    const response = await firstValueFrom(
      this.http.post<{ data: TaskTemplate }>(`${API_BASE_URL}/task-templates`, payload)
    );
    return response.data;
  }

  /**
   * Update one task template title.
   */
  async update(id: number, payload: { title: string }): Promise<TaskTemplate> {
    const response = await firstValueFrom(
      this.http.put<{ data: TaskTemplate }>(`${API_BASE_URL}/task-templates/${id}`, payload)
    );
    return response.data;
  }

  /**
   * Delete one task template.
   */
  async remove(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/task-templates/${id}`)
    );
  }
}
