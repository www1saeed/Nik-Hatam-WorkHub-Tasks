import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { TaskAttachment } from './tasks.service';

@Injectable({ providedIn: 'root' })
export class PhotoAlbumService {
  private readonly http = inject(HttpClient);

  /**
   * List/search/sort photos in the shared album.
   */
  async list(params?: {
    query?: string;
    album_key?: string;
    sort_by?: 'created_at' | 'size_bytes' | 'title';
    sort_dir?: 'asc' | 'desc';
  }): Promise<TaskAttachment[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: TaskAttachment[] }>(`${API_BASE_URL}/photos`, {
        params: {
          query: params?.query ?? '',
          album_key: params?.album_key ?? '',
          sort_by: params?.sort_by ?? 'created_at',
          sort_dir: params?.sort_dir ?? 'desc',
        },
      })
    );
    return response.data ?? [];
  }

  /**
   * Edit photo title.
   */
  async update(id: number, payload: { title: string }): Promise<TaskAttachment> {
    const response = await firstValueFrom(
      this.http.put<{ data: TaskAttachment }>(`${API_BASE_URL}/photos/${id}`, payload)
    );
    return response.data;
  }

  /**
   * Delete photo from album.
   */
  async remove(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/photos/${id}`)
    );
  }
}
