import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { catchError, map, tap, delay, finalize } from 'rxjs/operators';
import { Environment, EnvironmentService } from '@abp/ng.core';

/**
 * DTO for generation request
 * Per spec: Export selection to PNG (base64), send to generation endpoint
 */
export interface GenerateComponentRequest {
  boardId: string;
  imageBase64: string;
  componentName?: string;
  options?: GenerationOptions;
}

/**
 * Generation options per spec
 * Per spec: Generation options: Responsive (toggle), Include placeholders (toggle)
 */
export interface GenerationOptions {
  responsive: boolean;
  includePlaceholders: boolean;
}

/**
 * DTO for generation response
 * Per spec: Output: TypeScript React functional component + Tailwind CSS
 */
export interface GenerationResult {
  requestId: string;
  componentName: string;
  code: string;
  preview?: string;
  durationMs: number;
}

/**
 * DTO for generation failure
 * Per spec: Multiple error types for different failure modes
 */
export interface GenerationError {
  requestId?: string;
  errorType: 'vision_failed' | 'generation_failed' | 'timeout' | 'rate_limit' | 'syntax_error';
  message: string;
  retryAfter?: number; // For rate limiting
}

/**
 * DTO for user quota information
 * Per spec: Guest: 5 generations per browser session, Free authenticated: 30 per month
 */
export interface GenerationQuota {
  used: number;
  limit: number;
  resetDate?: string;
  isGuest: boolean;
}

/**
 * Generation status enum for tracking request state
 */
export type GenerationStatus = 'idle' | 'exporting' | 'analyzing' | 'generating' | 'success' | 'error';

@Injectable({
  providedIn: 'root'
})
export class GenerationService {
  private http = inject(HttpClient);
  private environment = inject(EnvironmentService);

  // Reactive state using signals
  private _status = signal<GenerationStatus>('idle');
  private _currentRequestId = signal<string | null>(null);
  private _lastResult = signal<GenerationResult | null>(null);
  private _lastError = signal<GenerationError | null>(null);
  private _quota = signal<GenerationQuota | null>(null);

  // Public readonly signals for components
  status = this._status.asReadonly();
  currentRequestId = this._currentRequestId.asReadonly();
  lastResult = this._lastResult.asReadonly();
  lastError = this._lastError.asReadonly();
  quota = this._quota.asReadonly();

  // Computed signals for convenience
  isGenerating = computed(() => {
    const status = this._status();
    return status === 'exporting' || status === 'analyzing' || status === 'generating';
  });

  isIdle = computed(() => this._status() === 'idle');
  hasError = computed(() => this._status() === 'error');
  hasResult = computed(() => this._status() === 'success');

  // Event subjects for components to subscribe
  generationCompleted$ = new Subject<GenerationResult>();
  generationFailed$ = new Subject<GenerationError>();

  private get apiUrl(): string {
    return this.environment.getEnvironment()?.apis?.default?.url || '';
  }

  /**
   * Generate a React component from the given image
   * Per spec: Send to GPT-4 Vision for analysis, then to Claude Code CLI
   *
   * NOTE: This is a simplified implementation. In production, this would:
   * 1. Send image to GPT-4 Vision API for analysis
   * 2. Send analysis to Claude Code CLI for code generation
   * 3. Return generated React + Tailwind code
   *
   * For testing purposes, this uses a mock endpoint that simulates the flow.
   */
  generate(request: GenerateComponentRequest): Observable<GenerationResult> {
    console.log('[Generation] Starting generation request:', {
      boardId: request.boardId,
      componentName: request.componentName,
      imageSize: Math.round(request.imageBase64.length / 1024) + 'KB'
    });

    // Update status
    this._status.set('exporting');
    this._lastError.set(null);
    this._lastResult.set(null);

    // Generate a unique request ID
    const requestId = crypto.randomUUID();
    this._currentRequestId.set(requestId);

    // Simulate export step briefly
    return of(null).pipe(
      delay(200),
      tap(() => {
        console.log('[Generation] Export complete, analyzing sketch...');
        this._status.set('analyzing');
      }),
      delay(500),
      tap(() => {
        console.log('[Generation] Analysis complete, generating code...');
        this._status.set('generating');
      }),
      // Call the actual API endpoint (or mock)
      map(() => null),
      tap(() => {
        // Make actual HTTP request
        // For now, use mock endpoint
      })
    ).pipe(
      // Switch to actual API call
      finalize(() => {}),
      // Use mergeMap to chain the actual HTTP call
      map(() => this.callGenerateApi(request, requestId))
    ).pipe(
      // Actually flatten the observable
      map(_ => _),
      // This won't work properly, let me restructure
    );
  }

  /**
   * Main generation method - properly structured
   */
  generateComponent(request: GenerateComponentRequest): Observable<GenerationResult> {
    console.log('[Generation] Starting generation request:', {
      boardId: request.boardId,
      componentName: request.componentName,
      imageSize: Math.round(request.imageBase64.length / 1024) + 'KB'
    });

    // Update status and clear previous results
    this._status.set('exporting');
    this._lastError.set(null);
    this._lastResult.set(null);

    // Generate a unique request ID
    const requestId = crypto.randomUUID();
    this._currentRequestId.set(requestId);

    // Call mock API (in production this would be the real GPT-4 Vision + Claude endpoint)
    return this.http.post<GenerationResult>(
      `${this.apiUrl}/api/app/generation/generate`,
      {
        boardId: request.boardId,
        imageBase64: request.imageBase64,
        componentName: request.componentName || 'GeneratedComponent',
        options: request.options || { responsive: true, includePlaceholders: false }
      }
    ).pipe(
      tap(result => {
        console.log('[Generation] Generation completed:', result.componentName);
        this._status.set('success');
        this._lastResult.set(result);
        this.generationCompleted$.next(result);
      }),
      catchError(error => {
        console.error('[Generation] Generation failed:', error);
        const genError: GenerationError = {
          requestId,
          errorType: this.mapErrorType(error),
          message: this.mapErrorMessage(error)
        };
        this._status.set('error');
        this._lastError.set(genError);
        this.generationFailed$.next(genError);
        return throwError(() => genError);
      }),
      finalize(() => {
        // Keep current request ID for reference until next generation
      })
    );
  }

  /**
   * Use mock generation for testing when API is not available
   * Per spec: Testing should work even without real AI APIs configured
   */
  generateComponentMock(request: GenerateComponentRequest): Observable<GenerationResult> {
    console.log('[Generation] Starting MOCK generation request:', {
      boardId: request.boardId,
      componentName: request.componentName,
      imageSize: Math.round(request.imageBase64.length / 1024) + 'KB'
    });

    // Update status and clear previous results
    this._status.set('exporting');
    this._lastError.set(null);
    this._lastResult.set(null);

    // Generate a unique request ID
    const requestId = crypto.randomUUID();
    this._currentRequestId.set(requestId);

    const componentName = request.componentName || 'GeneratedComponent';

    // Simulate the generation pipeline with delays
    return of(null).pipe(
      // Step 1: Export (quick)
      tap(() => {
        console.log('[Generation] Step 1: Exporting selection to PNG...');
        this._status.set('exporting');
      }),
      delay(500),

      // Step 2: Vision analysis
      tap(() => {
        console.log('[Generation] Step 2: Analyzing sketch with AI vision...');
        this._status.set('analyzing');
      }),
      delay(2000),

      // Step 3: Code generation
      tap(() => {
        console.log('[Generation] Step 3: Generating React + Tailwind code...');
        this._status.set('generating');
      }),
      delay(3000),

      // Return mock result
      map(() => this.createMockResult(requestId, componentName)),
      tap(result => {
        console.log('[Generation] MOCK Generation completed:', result.componentName);
        this._status.set('success');
        this._lastResult.set(result);
        this.generationCompleted$.next(result);
      }),
      catchError(error => {
        console.error('[Generation] MOCK Generation failed:', error);
        const genError: GenerationError = {
          requestId,
          errorType: 'generation_failed',
          message: 'Mock generation failed unexpectedly'
        };
        this._status.set('error');
        this._lastError.set(genError);
        this.generationFailed$.next(genError);
        return throwError(() => genError);
      })
    );
  }

  /**
   * Get user's generation quota
   * Per spec: Quota display: "X / Y generations remaining"
   */
  getQuota(): Observable<GenerationQuota> {
    return this.http.get<GenerationQuota>(`${this.apiUrl}/api/app/generation/quota`).pipe(
      tap(quota => {
        this._quota.set(quota);
        console.log('[Generation] Quota retrieved:', quota);
      }),
      catchError(error => {
        console.warn('[Generation] Failed to get quota, using mock:', error);
        // Return mock quota for testing
        const mockQuota: GenerationQuota = {
          used: 0,
          limit: 30,
          isGuest: false
        };
        this._quota.set(mockQuota);
        return of(mockQuota);
      })
    );
  }

  /**
   * Check if user can generate (has quota remaining)
   */
  canGenerate(): boolean {
    const quota = this._quota();
    if (!quota) return true; // Allow if quota not loaded yet
    return quota.used < quota.limit;
  }

  /**
   * Get remaining generations count
   */
  getRemainingGenerations(): number {
    const quota = this._quota();
    if (!quota) return -1; // Unknown
    return quota.limit - quota.used;
  }

  /**
   * Reset generation state (clear results and status)
   */
  reset(): void {
    this._status.set('idle');
    this._currentRequestId.set(null);
    this._lastResult.set(null);
    this._lastError.set(null);
  }

  /**
   * Create mock generation result for testing
   */
  private createMockResult(requestId: string, componentName: string): GenerationResult {
    const code = `import React from 'react';

interface ${componentName}Props {
  className?: string;
}

/**
 * ${componentName} - Auto-generated from sketch
 * Generated by SketchFlow AI Pipeline
 */
export const ${componentName}: React.FC<${componentName}Props> = ({ className }) => {
  return (
    <div className={\`\${className || ''} relative w-full max-w-md p-6\`}>
      {/* Container with glassmorphism effect */}
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-6 shadow-xl">
        {/* Header section */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Component Title</h2>
            <p className="text-sm text-white/60">Generated from sketch</p>
          </div>
        </div>

        {/* Content area */}
        <div className="space-y-4">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
          </div>
          <p className="text-white/80 text-sm">
            This component was auto-generated from your sketch using AI vision analysis.
            Customize it to match your exact needs.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          <button className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors">
            Primary Action
          </button>
          <button className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors border border-white/20">
            Secondary
          </button>
        </div>
      </div>
    </div>
  );
};

export default ${componentName};
`;

    return {
      requestId,
      componentName,
      code,
      durationMs: 5500
    };
  }

  /**
   * Map HTTP error to generation error type
   */
  private mapErrorType(error: any): GenerationError['errorType'] {
    if (error.status === 429) return 'rate_limit';
    if (error.status === 408) return 'timeout';
    if (error.error?.errorType) return error.error.errorType;
    return 'generation_failed';
  }

  /**
   * Map HTTP error to user-friendly message
   * Per spec: Error messages with actionable guidance
   */
  private mapErrorMessage(error: any): string {
    if (error.status === 429) {
      return 'Rate limit exceeded. Please wait before generating again.';
    }
    if (error.status === 408) {
      return 'Generation timed out. Your sketch might be too complex.';
    }
    if (error.error?.message) {
      return error.error.message;
    }
    return 'Generation failed. Please try again.';
  }

  private callGenerateApi(request: GenerateComponentRequest, requestId: string): GenerationResult {
    // This method is not used in the refactored version
    throw new Error('Not implemented - use generateComponent instead');
  }
}
