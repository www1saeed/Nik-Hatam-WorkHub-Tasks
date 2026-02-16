import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import type { AdminRole } from './admin-users.service';

/**
 * Permission shape used by role management UI.
 */
export interface AdminPermission {
  id: number;
  name: string;
  slug: string;
}

/**
 * Role details including permissions for edit views.
 */
export interface AdminRoleDetail extends AdminRole {
  permissions: AdminPermission[];
}

@Injectable({ providedIn: 'root' })
export class AdminRolesService {
  private readonly http = inject(HttpClient);

  /**
   * List roles with their permissions for the admin table.
   */
  async list(): Promise<AdminRoleDetail[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: AdminRoleDetail[] }>(`${API_BASE_URL}/roles`)
    );
    return response.data ?? [];
  }

  /**
   * Create a new role with optional permission assignments.
   */
  async create(payload: { name: string; slug: string; permission_ids?: number[] }): Promise<AdminRoleDetail> {
    const response = await firstValueFrom(
      this.http.post<{ data: AdminRoleDetail }>(`${API_BASE_URL}/roles`, payload)
    );
    return response.data;
  }

  /**
   * Update a role and its permission set.
   */
  async update(id: number, payload: { name: string; slug: string; permission_ids?: number[] }): Promise<AdminRoleDetail> {
    const response = await firstValueFrom(
      this.http.put<{ data: AdminRoleDetail }>(`${API_BASE_URL}/roles/${id}`, payload)
    );
    return response.data;
  }

  /**
   * Delete a role.
   */
  async remove(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${API_BASE_URL}/roles/${id}`)
    );
  }
}
