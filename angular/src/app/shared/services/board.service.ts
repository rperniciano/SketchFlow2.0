import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Environment, EnvironmentService } from '@abp/ng.core';

export interface BoardDto {
  id: string;
  ownerId: string;
  ownerName: string;
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

export interface BoardElementDto {
  id: string;
  boardId: string;
  creatorUserId?: string;
  creatorGuestSessionId?: string;
  elementData: string;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBoardElementDto {
  elementData: string;
  zIndex?: number;
}

export interface UpdateBoardElementDto {
  elementData: string;
  zIndex?: number;
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
    return this.http.post<void>(`${this.apiUrl}/api/app/board/${id}/permanent-delete`, {});
  }

  regenerateShareToken(id: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/api/app/board/${id}/regenerate-share-token`, {}, { responseType: 'text' });
  }

  getByShareToken(shareToken: string): Observable<BoardDto | null> {
    const params = new HttpParams().set('shareToken', shareToken);
    return this.http.get<BoardDto | null>(`${this.apiUrl}/api/app/board/by-share-token`, { params });
  }

  // ============ BOARD ELEMENTS ============
  // Note: ABP auto-API conventions put the action name before the parameter

  getElements(boardId: string): Observable<BoardElementDto[]> {
    return this.http.get<BoardElementDto[]>(`${this.apiUrl}/api/app/board/elements/${boardId}`);
  }

  createElement(boardId: string, input: CreateBoardElementDto): Observable<BoardElementDto> {
    return this.http.post<BoardElementDto>(`${this.apiUrl}/api/app/board/element/${boardId}`, input);
  }

  updateElement(boardId: string, elementId: string, input: UpdateBoardElementDto): Observable<BoardElementDto> {
    return this.http.put<BoardElementDto>(`${this.apiUrl}/api/app/board/element/${boardId}/${elementId}`, input);
  }

  deleteElements(boardId: string, elementIds: string[]): Observable<void> {
    return this.http.request<void>('DELETE', `${this.apiUrl}/api/app/board/elements/${boardId}`, {
      body: elementIds
    });
  }
}
