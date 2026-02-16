import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import type { AdminPermission } from './admin-roles.service';
export type { AdminPermission } from './admin-roles.service';

@Injectable({ providedIn: 'root' })
export class AdminPermissionsService {
  private readonly http = inject(HttpClient);

  /**
   * List permissions for the admin permissions table.
   */
  async list(): Promise<AdminPermission[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: AdminPermission[] }>(`${API_BASE_URL}/permissions`)
    );
    return response.data ?? [];
  }

  /**
   * Create a permission.
   */
  async create(payload: { name: string; slug: string }): Promise<AdminPermission> {
    const response = await firstValueFrom(
      this.http.post<{ data: AdminPermission }>(`${API_BASE_URL}/permissions`, payload)
    );
    return response.data;
  }

  /**
   * Update a permission.
   */
  async update(id: number, payload: { name: string; slug: string }): Promise<AdminPermission> {
    const response = await firstValueFrom(
      this.http.put<{ data: AdminPermission }>(`${API_BASE_URL}/permissions/${id}`, payload)
    );
    return response.data;
  }

  /**
   * Delete a permission.
   */
  async remove(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/permissions/${id}`)
    );
  }
}
