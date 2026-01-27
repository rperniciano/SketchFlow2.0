import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Environment, EnvironmentService } from '@abp/ng.core';

export interface BoardDto {
  id: string;
  ownerId: string;
  name: string;
  shareToken: string;
  settings?: string;
  creationTime: string;
  lastModificationTime?: string;
  isDeleted: boolean;
  deletionTime?: string;
  participantCount: number;
}

export interface CreateBoardDto {
  name: string;
}

export interface UpdateBoardDto {
  name: string;
  settings?: string;
}

export interface GetBoardListDto {
  filter?: string;
  skipCount?: number;
  maxResultCount?: number;
  includeDeleted?: boolean;
}

export interface PagedResultDto<T> {
  totalCount: number;
  items: T[];
}

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private http = inject(HttpClient);
  private environment = inject(EnvironmentService);

  private get apiUrl(): string {
    return this.environment.getEnvironment()?.apis?.default?.url || '';
  }

  getList(input?: GetBoardListDto): Observable<PagedResultDto<BoardDto>> {
    let params = new HttpParams();
    if (input?.filter) {
      params = params.set('Filter', input.filter);
    }
    if (input?.skipCount !== undefined) {
      params = params.set('SkipCount', input.skipCount.toString());
    }
    if (input?.maxResultCount !== undefined) {
      params = params.set('MaxResultCount', input.maxResultCount.toString());
    }
    if (input?.includeDeleted !== undefined) {
      params = params.set('IncludeDeleted', input.includeDeleted.toString());
    }

    return this.http.get<PagedResultDto<BoardDto>>(`${this.apiUrl}/api/app/board`, { params });
  }

  getTrash(input?: GetBoardListDto): Observable<PagedResultDto<BoardDto>> {
    let params = new HttpParams();
    if (input?.skipCount !== undefined) {
      params = params.set('SkipCount', input.skipCount.toString());
    }
    if (input?.maxResultCount !== undefined) {
      params = params.set('MaxResultCount', input.maxResultCount.toString());
    }

    return this.http.get<PagedResultDto<BoardDto>>(`${this.apiUrl}/api/app/board/trash`, { params });
  }

  get(id: string): Observable<BoardDto> {
    return this.http.get<BoardDto>(`${this.apiUrl}/api/app/board/${id}`);
  }

  create(input: CreateBoardDto): Observable<BoardDto> {
    return this.http.post<BoardDto>(`${this.apiUrl}/api/app/board`, input);
  }

  update(id: string, input: UpdateBoardDto): Observable<BoardDto> {
    return this.http.put<BoardDto>(`${this.apiUrl}/api/app/board/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/app/board/${id}`);
  }

  restore(id: string): Observable<BoardDto> {
    return this.http.post<BoardDto>(`${this.apiUrl}/api/app/board/${id}/restore`, {});
  }

  permanentDelete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/api/app/board/${id}/permanent`);
  }

  regenerateShareToken(id: string): Observable<string> {
    return this.http.post<string>(`${this.apiUrl}/api/app/board/${id}/regenerate-share-token`, {});
  }

  getByShareToken(shareToken: string): Observable<BoardDto | null> {
    return this.http.get<BoardDto | null>(`${this.apiUrl}/api/app/board/by-share-token/${shareToken}`);
  }
}
