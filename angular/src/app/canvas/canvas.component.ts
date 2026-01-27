import { Component, OnInit, OnDestroy, inject, AfterViewInit, ElementRef, ViewChild, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, of, from, catchError, tap, finalize } from 'rxjs';
import { ConfigStateService } from '@abp/ng.core';
import { BoardService, BoardDto, BoardElementDto, CreateBoardElementDto } from '../shared/services/board.service';
import { ConnectionService } from '../shared/services/connection.service';
import { OfflineQueueService, QueuedOperation } from '../shared/services/offline-queue.service';
import { SignalRService } from '../shared/services/signalr.service';
import { ToastService } from '../shared/services/toast.service';
import { GenerationService } from '../shared/services/generation.service';
import { ConnectionLostBannerComponent } from '../shared/components/connection-lost-banner.component';
import { ToastContainerComponent } from '../shared/components/toast-container.component';
import * as fabric from 'fabric';

// Prism.js for syntax highlighting (Feature #121)
import * as Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';

interface GuestSession {
  guestId: string;
  guestName: string;
  boardId: string;
  shareToken: string;
}

type CanvasTool = 'select' | 'pen' | 'rectangle' | 'circle' | 'text';

interface CanvasColors {
  name: string;
  value: string;
}

// Interface for element data stored in database
interface ElementDataJson {
  v: number;
  type: 'stroke' | 'rectangle' | 'circle' | 'text';
  points?: number[][];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  content?: string;
  color: string;
  fillColor?: string;
  thickness?: number;
  fontSize?: number;
}

// Undo/Redo action types
type HistoryActionType = 'create' | 'delete' | 'modify';

// Interface for history state entry
interface HistoryEntry {
  actionType: HistoryActionType;
  elementId?: string; // Database element ID
  fabricObject?: fabric.FabricObject; // Reference to fabric object (for undo of delete)
  elementData?: string; // JSON string of element data
  previousData?: string; // For modify actions - the state before modification
  zIndex?: number;
}

// Interface for remote cursor tracking (Feature #106: Remote cursor displays for other participants)
interface RemoteCursor {
  connectionId: string;
  x: number;
  y: number;
  color: string;
  name: string;
  lastUpdate: number; // Timestamp of last update
}

// Interface for participant display (Feature #113: Participant avatars display in toolbar)
interface Participant {
  id: string;        // Connection ID or user ID
  name: string;      // Display name
  color: string;     // Avatar/cursor color
  initials: string;  // 1-2 character initials for avatar
  isSelf: boolean;   // True if this is the current user
}

// Interface for remote selection tracking (Feature #115: Selection highlight visible to other users)
interface RemoteSelection {
  connectionId: string;
  elementIds: string[];
  color: string;    // The user's cursor color for the highlight
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, ConnectionLostBannerComponent, ToastContainerComponent],
  template: `
    <div class="canvas-container">
      <div class="canvas-header">
        <button class="back-btn" (click)="goBack()">
          <i class="bi bi-arrow-left"></i>
          {{ isGuest ? 'Leave Board' : 'Back to Dashboard' }}
        </button>
        <h1 class="board-name" *ngIf="board">{{ board.name }}</h1>

        <!-- Spacer to push avatars to the right -->
        <div class="header-spacer"></div>

        <!-- Participant Avatars (Feature #113: Participant avatars display in toolbar) -->
        <!-- Per spec: Participant avatars in toolbar (max 5 shown + overflow count) -->
        <!-- Feature #114: Clicking opens participant panel showing all users -->
        <div class="participant-avatars-wrapper" *ngIf="board">
          <button
            class="participant-avatars-btn"
            (click)="toggleParticipantPanel()"
            [attr.aria-expanded]="isParticipantPanelOpen"
            aria-haspopup="true"
            aria-label="Show participants">
            <div class="participant-avatars">
              <!-- Show first 5 participants -->
              <div
                *ngFor="let participant of getDisplayedParticipants(); trackBy: trackParticipantById"
                class="participant-avatar"
                [style.backgroundColor]="participant.color"
                [class.self]="participant.isSelf"
                [title]="participant.name + (participant.isSelf ? ' (You)' : '')">
                {{ participant.initials }}
              </div>

              <!-- Overflow count if more than 5 participants -->
              <div
                *ngIf="getOverflowCount() > 0"
                class="participant-overflow"
                [title]="getOverflowCount() + ' more participants'">
                +{{ getOverflowCount() }}
              </div>
            </div>
          </button>

          <!-- Participant Panel (Feature #114: Participant panel shows all connected users) -->
          <!-- Per spec: Panel lists all participants with status (name, color, online status) -->
          <div
            class="participant-panel"
            *ngIf="isParticipantPanelOpen"
            role="dialog"
            aria-label="Participants panel">
            <div class="participant-panel-header">
              <h3>Participants</h3>
              <span class="participant-count">{{ getAllParticipants().length }}</span>
            </div>

            <!-- Empty state when solo (per spec: "Just you here" + share prompt) -->
            <div class="participant-panel-empty" *ngIf="getAllParticipants().length <= 1">
              <p class="empty-message">Just you here</p>
              <p class="empty-hint" *ngIf="!isGuest">Share this board to collaborate with others</p>
            </div>

            <!-- Participant list -->
            <div class="participant-panel-list" *ngIf="getAllParticipants().length > 0">
              <div
                *ngFor="let participant of getAllParticipants(); trackBy: trackParticipantById"
                class="participant-item"
                [class.self]="participant.isSelf">
                <!-- Avatar with color -->
                <div
                  class="participant-item-avatar"
                  [style.backgroundColor]="participant.color">
                  {{ participant.initials }}
                </div>
                <!-- Name and status -->
                <div class="participant-item-info">
                  <span class="participant-item-name">
                    {{ participant.name }}
                    <span class="self-indicator" *ngIf="participant.isSelf">(You)</span>
                  </span>
                  <!-- Online status indicator (per spec: Verify online status indicators shown) -->
                  <span class="participant-item-status online">
                    <span class="status-dot"></span>
                    Online
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Backdrop to close panel when clicking outside -->
          <div
            class="participant-panel-backdrop"
            *ngIf="isParticipantPanelOpen"
            (click)="closeParticipantPanel()">
          </div>
        </div>

        <div class="guest-badge" *ngIf="isGuest && guestSession">
          <i class="bi bi-person"></i>
          {{ guestSession.guestName }}
        </div>
        <div class="board-status" *ngIf="isLoading">Loading...</div>
      </div>

      <div class="canvas-workspace" *ngIf="board">
        <!-- Connection Lost Banner (per spec: appears at top of canvas) -->
        <app-connection-lost-banner></app-connection-lost-banner>

        <!-- Left Toolbar -->
        <div class="toolbar">
          <div class="tool-group">
            <button
              class="tool-btn"
              [class.active]="currentTool === 'select'"
              (click)="selectTool('select')"
              title="Selection Tool (V)">
              <i class="bi bi-cursor"></i>
            </button>
            <button
              class="tool-btn"
              [class.active]="currentTool === 'pen'"
              (click)="selectTool('pen')"
              title="Pen Tool (P)">
              <i class="bi bi-pencil"></i>
            </button>
            <button
              class="tool-btn"
              [class.active]="currentTool === 'rectangle'"
              (click)="selectTool('rectangle')"
              title="Rectangle Tool (R)">
              <i class="bi bi-square"></i>
            </button>
            <button
              class="tool-btn"
              [class.active]="currentTool === 'circle'"
              (click)="selectTool('circle')"
              title="Circle Tool (C)">
              <i class="bi bi-circle"></i>
            </button>
            <button
              class="tool-btn"
              [class.active]="currentTool === 'text'"
              (click)="selectTool('text')"
              title="Text Tool (T)">
              <i class="bi bi-type"></i>
            </button>
          </div>

          <div class="tool-divider"></div>

          <!-- Stroke Color Picker -->
          <div class="tool-group">
            <span class="tool-label">Stroke</span>
            <div class="color-picker" role="radiogroup" aria-label="Stroke color">
              <div
                *ngFor="let color of colors"
                class="color-swatch"
                [style.backgroundColor]="color.value"
                [class.active]="currentColor === color.value"
                [class.light]="color.value === '#ffffff'"
                (click)="selectColor(color.value)"
                (keydown.enter)="selectColor(color.value)"
                (keydown.space)="selectColor(color.value); $event.preventDefault()"
                [attr.tabindex]="0"
                role="radio"
                [attr.aria-checked]="currentColor === color.value"
                [attr.aria-label]="color.name + ' stroke color'"
                [title]="color.name">
              </div>
            </div>
          </div>

          <div class="tool-divider"></div>

          <!-- Fill Color Picker -->
          <div class="tool-group">
            <span class="tool-label">Fill</span>
            <div class="color-picker" role="radiogroup" aria-label="Fill color">
              <!-- No fill option -->
              <div
                class="color-swatch no-fill"
                [class.active]="currentFillColor === null"
                (click)="selectFillColor(null)"
                (keydown.enter)="selectFillColor(null)"
                (keydown.space)="selectFillColor(null); $event.preventDefault()"
                [attr.tabindex]="0"
                role="radio"
                [attr.aria-checked]="currentFillColor === null"
                aria-label="No fill"
                title="No Fill">
              </div>
              <div
                *ngFor="let color of colors"
                class="color-swatch"
                [style.backgroundColor]="color.value"
                [class.active]="currentFillColor === color.value"
                [class.light]="color.value === '#ffffff'"
                (click)="selectFillColor(color.value)"
                (keydown.enter)="selectFillColor(color.value)"
                (keydown.space)="selectFillColor(color.value); $event.preventDefault()"
                [attr.tabindex]="0"
                role="radio"
                [attr.aria-checked]="currentFillColor === color.value"
                [attr.aria-label]="color.name + ' fill color'"
                [title]="color.name + ' Fill'">
              </div>
            </div>
          </div>

          <div class="tool-divider"></div>

          <!-- Stroke Thickness -->
          <div class="tool-group">
            <button
              class="tool-btn thickness-btn"
              [class.active]="currentThickness === 2"
              (click)="selectThickness(2)"
              title="Thin (2px)">
              <div class="thickness-preview thin"></div>
            </button>
            <button
              class="tool-btn thickness-btn"
              [class.active]="currentThickness === 4"
              (click)="selectThickness(4)"
              title="Medium (4px)">
              <div class="thickness-preview medium"></div>
            </button>
            <button
              class="tool-btn thickness-btn"
              [class.active]="currentThickness === 8"
              (click)="selectThickness(8)"
              title="Thick (8px)">
              <div class="thickness-preview thick"></div>
            </button>
          </div>
        </div>

        <!-- Canvas Area -->
        <div class="canvas-wrapper" #canvasWrapper>
          <canvas #fabricCanvas id="fabricCanvas"></canvas>

          <!-- Remote Cursors Overlay (Feature #106: Remote cursor displays for other participants) -->
          <!-- Per spec: Remote cursor display (colored, labeled with name) -->
          <div class="remote-cursors-container">
            <div
              *ngFor="let cursor of getRemoteCursorsArray()"
              class="remote-cursor"
              [style.left.px]="cursor.x"
              [style.top.px]="cursor.y"
              [style.--cursor-color]="cursor.color"
              [class.stale]="isCursorStale(cursor)">
              <!-- Cursor pointer SVG -->
              <svg class="cursor-pointer" width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5.5 3.21V20.8C5.5 21.41 6.21 21.77 6.71 21.41L10.5 18.5L13.5 21.5C13.89 21.89 14.52 21.89 14.91 21.5L16.5 19.91C16.89 19.52 16.89 18.89 16.5 18.5L13.5 15.5L18.29 14.29C18.9 14.08 18.9 13.21 18.29 13L6.71 9.21C6.21 9.08 5.71 9.42 5.71 9.92L5.5 3.21Z"
                  [attr.fill]="cursor.color"
                  stroke="white"
                  stroke-width="1.5"/>
              </svg>
              <!-- Name label -->
              <div class="cursor-label" [style.backgroundColor]="cursor.color">
                {{ cursor.name || 'Anonymous' }}
              </div>
            </div>
          </div>

          <!-- Generate Component Button (Feature #117 + #118: Generate Component button appears on selection) -->
          <!-- Per spec: "Generate Component" button appears above selected region/elements -->
          <!-- Per spec: Loading state on selection during generation (~10s) -->
          <!-- Per spec: Keyboard shortcut Ctrl+G triggers generation when selection active -->
          <!-- Feature #131: Guest quota limited to 5 per session - disable button when quota reached -->
          <button
            *ngIf="showGenerateButton && selectedElementCount > 0"
            class="generate-component-btn"
            [class.generating]="isGenerating"
            [class.quota-exceeded]="isQuotaExceeded()"
            [disabled]="isGenerating || isQuotaExceeded()"
            [style.left.px]="generateButtonPosition.left"
            [style.top.px]="generateButtonPosition.top"
            (click)="onGenerateComponent()"
            [title]="getGenerateButtonTitle()">
            <i class="bi" [class.bi-magic]="!isGenerating && !isQuotaExceeded()" [class.bi-arrow-repeat]="isGenerating" [class.bi-x-circle]="isQuotaExceeded() && !isGenerating" [class.spin]="isGenerating"></i>
            {{ getGenerateButtonLabel() }}
          </button>
        </div>

        <!-- Code Panel (Feature #119: Code panel slides in on generation success) -->
        <!-- Per spec: Fixed width 420px, slides in from right -->
        <div
          class="code-panel"
          [class.open]="isCodePanelOpen"
          role="dialog"
          aria-label="Generated code panel">

          <!-- Code Panel Header -->
          <div class="code-panel-header">
            <h3>Generated Component</h3>
            <button
              class="code-panel-close"
              (click)="closeCodePanel()"
              title="Close panel (Escape)"
              aria-label="Close code panel">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <!-- Loading State (Feature #118: Shows loading during generation) -->
          <div class="code-panel-loading" *ngIf="isGenerating">
            <div class="loading-spinner"></div>
            <p>Generating component...</p>
            <p class="loading-hint">This may take up to 10 seconds</p>
          </div>

          <!-- Error State -->
          <div class="code-panel-error" *ngIf="generationError && !isGenerating">
            <i class="bi bi-exclamation-triangle"></i>
            <p>{{ generationError }}</p>
            <button class="btn-retry" (click)="retryGeneration()">
              <i class="bi bi-arrow-clockwise"></i>
              Try Again
            </button>
          </div>

          <!-- Generated Code Content (Feature #119 verification: panel contains generated code) -->
          <div class="code-panel-content" *ngIf="generatedCode && !isGenerating && !generationError">
            <!-- Component Name (editable, per spec) -->
            <div class="component-name-section">
              <label for="componentName">Component Name</label>
              <input
                type="text"
                id="componentName"
                [(ngModel)]="componentName"
                (blur)="enforceComponentNameFormat()"
                class="component-name-input"
                placeholder="ComponentName">
            </div>

            <!-- Live Preview (Feature #123: Sandboxed iframe shows component preview) -->
            <div class="preview-section">
              <div class="preview-header">
                <span class="preview-label">
                  <i class="bi bi-eye"></i>
                  Live Preview
                </span>
                <button
                  class="btn-refresh-preview"
                  (click)="refreshPreview()"
                  title="Refresh preview"
                  [disabled]="isPreviewLoading">
                  <i class="bi bi-arrow-clockwise" [class.spinning]="isPreviewLoading"></i>
                </button>
              </div>
              <div class="preview-container">
                <iframe
                  #previewIframe
                  class="preview-iframe"
                  [srcdoc]="previewHtml"
                  sandbox="allow-scripts"
                  title="Component preview"
                  (load)="onPreviewLoad()"
                  (error)="onPreviewError()">
                </iframe>
                <div class="preview-loading" *ngIf="isPreviewLoading">
                  <div class="preview-spinner"></div>
                </div>
                <div class="preview-error" *ngIf="previewError">
                  <i class="bi bi-exclamation-triangle"></i>
                  <span>{{ previewError }}</span>
                </div>
              </div>
            </div>

            <!-- Code Display (per spec: syntax-highlighted, dark theme) -->
            <div class="code-display">
              <div class="code-header">
                <span class="code-filename">{{ componentName }}.tsx</span>
                <button
                  class="btn-copy"
                  (click)="copyGeneratedCode()"
                  title="Copy code">
                  <i class="bi bi-clipboard"></i>
                  Copy
                </button>
              </div>
              <pre class="code-block"><code class="language-tsx" [innerHTML]="highlightedCode"></code></pre>
            </div>

            <!-- Generation Options (Feature #126, #127: Responsive and Include placeholders toggles) -->
            <!-- Per spec: Options toggles (responsive, placeholders) -->
            <div class="generation-options">
              <div class="option-group">
                <label class="option-toggle">
                  <input
                    type="checkbox"
                    [(ngModel)]="responsiveOption"
                    (change)="onOptionChange('responsive')">
                  <span class="toggle-slider"></span>
                  <span class="option-label">Responsive</span>
                </label>
                <span class="option-hint">Generate responsive styles</span>
              </div>
              <div class="option-group">
                <label class="option-toggle">
                  <input
                    type="checkbox"
                    [(ngModel)]="includePlaceholdersOption"
                    (change)="onOptionChange('placeholders')">
                  <span class="toggle-slider"></span>
                  <span class="option-label">Include Placeholders</span>
                </label>
                <span class="option-hint">Add placeholder text content</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="code-panel-actions">
              <button class="btn-regenerate" (click)="regenerateComponent()">
                <i class="bi bi-arrow-clockwise"></i>
                Regenerate
              </button>
            </div>

            <!-- Quota Display (per spec: "X / Y generations remaining") -->
            <div class="quota-display">
              <span class="quota-text">
                {{ generationsLimit - generationsUsed }} / {{ generationsLimit }} generations remaining
              </span>
              <span class="quota-warning" *ngIf="generationsLimit - generationsUsed <= 5">
                <i class="bi bi-exclamation-circle"></i>
                Running low
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar" *ngIf="board">
        <!-- Connection Status Indicator (per spec: green/yellow/red) -->
        <div class="status-item connection-status">
          <span
            class="connection-indicator"
            [class.connected]="connectionService.isConnected()"
            [class.connecting]="connectionService.isConnecting()"
            [class.disconnected]="connectionService.isDisconnected()"
            [attr.aria-label]="'Connection status: ' + connectionService.status()"
            role="status">
          </span>
          <span class="status-value"
            [class.connected]="connectionService.isConnected()"
            [class.connecting]="connectionService.isConnecting()"
            [class.disconnected]="connectionService.isDisconnected()">
            {{ connectionService.isConnected() ? 'Connected' : connectionService.isConnecting() ? 'Connecting...' : 'Disconnected' }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">Tool:</span>
          <span class="status-value">{{ getToolDisplayName() }}</span>
        </div>
        <div class="status-item" *ngIf="selectedElementCount > 0">
          <span class="status-label">Selected:</span>
          <span class="status-value">{{ selectedElementCount }} element{{ selectedElementCount > 1 ? 's' : '' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Elements:</span>
          <span class="status-value">{{ elementLoadCount }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Status:</span>
          <span class="status-value" [class.saving]="isSaving" [class.queued]="offlineQueueCount > 0">
            {{ getStatusDisplay() }}
          </span>
        </div>
        <div class="status-item" *ngIf="offlineQueueCount > 0">
          <span class="status-label">Queued:</span>
          <span class="status-value queued">{{ offlineQueueCount }} change{{ offlineQueueCount > 1 ? 's' : '' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Zoom:</span>
          <span class="status-value">{{ Math.round(zoomLevel * 100) }}%</span>
        </div>
      </div>

      <div class="error-state" *ngIf="error">
        <i class="bi bi-exclamation-triangle"></i>
        <h2>{{ isGuest ? 'Cannot Join Board' : 'Board Not Found' }}</h2>
        <p>{{ error }}</p>
        <button class="btn-primary" (click)="goBack()">{{ isGuest ? 'Go Home' : 'Return to Dashboard' }}</button>
      </div>

      <!-- Toast Container (per spec: notifications at bottom-left) -->
      <app-toast-container></app-toast-container>
    </div>
  `,
  styles: [`
    .canvas-container {
      min-height: 100vh;
      background: #0a0a0f;
      color: #ffffff;
      display: flex;
      flex-direction: column;
    }

    .canvas-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.5rem;
      background: rgba(26, 26, 37, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 100;
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 8px;
      color: #a5b4fc;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .back-btn:hover {
      background: rgba(99, 102, 241, 0.3);
      border-color: rgba(99, 102, 241, 0.5);
    }

    .back-btn:focus {
      outline: none;
    }

    .back-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3);
    }

    .board-name {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }

    /* Spacer to push avatars to the right */
    .header-spacer {
      flex: 1;
    }

    /* Participant Avatars (Feature #113) */
    /* Per spec: Participant avatars in toolbar (max 5 shown + overflow count) */
    .participant-avatars {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .participant-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: #ffffff;
      text-transform: uppercase;
      border: 2px solid transparent;
      transition: all 0.2s ease;
      cursor: default;
      /* Glassmorphism effect */
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .participant-avatar:hover {
      transform: scale(1.1);
      z-index: 1;
    }

    /* Self avatar has a distinct border */
    .participant-avatar.self {
      border-color: #ffffff;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    /* Overlap avatars slightly for a stacked appearance */
    .participant-avatar:not(:first-child) {
      margin-left: -8px;
    }

    .participant-avatar:hover {
      margin-left: 0;
    }

    .participant-avatar:hover + .participant-avatar {
      margin-left: -8px;
    }

    /* Overflow count badge */
    .participant-overflow {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: #ffffff;
      background: rgba(99, 102, 241, 0.6);
      border: 2px solid rgba(99, 102, 241, 0.8);
      margin-left: -8px;
      cursor: default;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .participant-overflow:hover {
      background: rgba(99, 102, 241, 0.8);
      transform: scale(1.1);
    }

    /* Participant Avatars Wrapper (Feature #114) */
    .participant-avatars-wrapper {
      position: relative;
    }

    .participant-avatars-btn {
      background: transparent;
      border: none;
      padding: 4px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .participant-avatars-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .participant-avatars-btn:focus {
      outline: none;
    }

    .participant-avatars-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    /* Participant Panel (Feature #114: Participant panel shows all connected users) */
    .participant-panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 280px;
      max-height: 400px;
      background: rgba(26, 26, 37, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      overflow: hidden;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .participant-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .participant-panel-header h3 {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #ffffff;
    }

    .participant-count {
      font-size: 0.75rem;
      font-weight: 500;
      color: #a1a1aa;
      background: rgba(99, 102, 241, 0.2);
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Empty state (per spec: "Just you here" + share prompt) */
    .participant-panel-empty {
      padding: 1.5rem 1rem;
      text-align: center;
    }

    .participant-panel-empty .empty-message {
      margin: 0 0 0.5rem 0;
      color: #a1a1aa;
      font-size: 0.875rem;
    }

    .participant-panel-empty .empty-hint {
      margin: 0;
      color: #71717a;
      font-size: 0.75rem;
    }

    /* Participant list */
    .participant-panel-list {
      max-height: 320px;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .participant-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 8px;
      transition: background 0.2s ease;
    }

    .participant-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .participant-item.self {
      background: rgba(99, 102, 241, 0.1);
    }

    .participant-item-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: 600;
      color: #ffffff;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .participant-item.self .participant-item-avatar {
      border: 2px solid #ffffff;
    }

    .participant-item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .participant-item-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .self-indicator {
      font-weight: 400;
      color: #a1a1aa;
      font-size: 0.75rem;
    }

    /* Online status indicator (per spec: Verify online status indicators shown) */
    .participant-item-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      color: #71717a;
    }

    .participant-item-status.online {
      color: #10b981;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: currentColor;
    }

    /* Backdrop for closing panel */
    .participant-panel-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999;
    }

    .guest-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 20px;
      color: #c4b5fd;
      font-size: 0.875rem;
      margin-left: 1rem;
    }

    .board-status {
      color: #a1a1aa;
    }

    .canvas-workspace {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .toolbar {
      width: 60px;
      background: rgba(26, 26, 37, 0.9);
      backdrop-filter: blur(12px);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.75rem 0.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      z-index: 10;
    }

    .tool-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .tool-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: #a1a1aa;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 1.125rem;
    }

    .tool-btn:hover {
      background: rgba(99, 102, 241, 0.1);
      color: #ffffff;
    }

    .tool-btn.active {
      background: rgba(99, 102, 241, 0.3);
      border-color: rgba(99, 102, 241, 0.5);
      color: #a5b4fc;
    }

    /* Focus indicators for keyboard navigation (per spec: 2px offset, accent color) */
    .tool-btn:focus {
      outline: none;
    }

    .tool-btn:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3);
    }

    .tool-btn.active:focus-visible {
      outline-color: #a5b4fc;
      box-shadow: 0 0 0 4px rgba(165, 180, 252, 0.3);
    }

    .tool-divider {
      width: 32px;
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0.5rem 0;
    }

    .color-picker {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px;
      padding: 4px;
    }

    .color-swatch {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.2s ease;
    }

    .color-swatch:hover {
      transform: scale(1.1);
    }

    .color-swatch.active {
      border-color: #a5b4fc;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
    }

    .color-swatch.light {
      border-color: rgba(255, 255, 255, 0.3);
    }

    .color-swatch.light.active {
      border-color: #a5b4fc;
    }

    .color-swatch.no-fill {
      background: linear-gradient(135deg, #ffffff 45%, transparent 45%, transparent 55%, #ffffff 55%),
                  linear-gradient(45deg, #ef4444 0%, #ef4444 100%);
      background-size: 100% 100%;
    }

    /* Focus indicators for color swatches (keyboard navigation support) */
    .color-swatch:focus {
      outline: none;
    }

    .color-swatch:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3);
      transform: scale(1.1);
    }

    .tool-label {
      font-size: 0.625rem;
      color: #8b8b94; /* Updated from #71717a for WCAG AA compliance (4.5:1+ contrast) */
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: center;
      margin-bottom: 0.25rem;
    }

    .thickness-btn {
      padding: 8px;
    }

    .thickness-preview {
      background: #ffffff;
      border-radius: 2px;
      width: 24px;
    }

    .thickness-preview.thin {
      height: 2px;
    }

    .thickness-preview.medium {
      height: 4px;
    }

    .thickness-preview.thick {
      height: 8px;
    }

    .canvas-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
      background: #1a1a25;
    }

    #fabricCanvas {
      position: absolute;
      top: 0;
      left: 0;
    }

    /* Remote Cursors Overlay (Feature #106: Remote cursor displays for other participants) */
    .remote-cursors-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none; /* Allow clicks to pass through to canvas */
      z-index: 100; /* Above canvas but below modals */
      overflow: hidden;
    }

    .remote-cursor {
      position: absolute;
      pointer-events: none;
      transition: left 0.05s linear, top 0.05s linear; /* Smooth cursor movement */
      z-index: 101;
    }

    .cursor-pointer {
      display: block;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
      transition: opacity 0.3s ease;
    }

    .remote-cursor.stale .cursor-pointer {
      opacity: 0.4; /* Per spec: Remote cursors fade to gray when stale */
      filter: grayscale(0.7) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .cursor-label {
      position: absolute;
      top: 18px;
      left: 14px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      color: white;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: opacity 0.3s ease;
    }

    .remote-cursor.stale .cursor-label {
      opacity: 0.4;
      filter: grayscale(0.7);
    }

    /* Generate Component Button (Feature #117: Generate Component button appears on selection) */
    /* Per spec: "Button positioned above selection", glassmorphism aesthetic */
    .generate-component-btn {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      z-index: 150; /* Above cursors but below modals */
      box-shadow:
        0 4px 12px rgba(99, 102, 241, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
      white-space: nowrap;
      pointer-events: auto;
    }

    .generate-component-btn:hover {
      transform: translateY(-2px);
      background: linear-gradient(135deg, rgba(99, 102, 241, 1) 0%, rgba(139, 92, 246, 1) 100%);
      box-shadow:
        0 6px 16px rgba(99, 102, 241, 0.5),
        0 3px 8px rgba(0, 0, 0, 0.4);
    }

    .generate-component-btn:active {
      transform: translateY(0);
      box-shadow:
        0 2px 8px rgba(99, 102, 241, 0.3),
        0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .generate-component-btn:focus {
      outline: none;
      box-shadow:
        0 4px 12px rgba(99, 102, 241, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.3),
        0 0 0 3px rgba(99, 102, 241, 0.5);
    }

    .generate-component-btn i {
      font-size: 1rem;
    }

    /* Feature #118: Loading state during generation */
    .generate-component-btn.generating {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.6) 0%, rgba(139, 92, 246, 0.6) 100%);
      cursor: wait;
      opacity: 0.9;
    }

    .generate-component-btn.generating:hover {
      transform: none;
      box-shadow:
        0 4px 12px rgba(99, 102, 241, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .generate-component-btn:disabled {
      cursor: not-allowed;
    }

    /* Feature #131: Quota exceeded state - disabled with red styling */
    .generate-component-btn.quota-exceeded {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.7) 0%, rgba(185, 28, 28, 0.7) 100%);
      cursor: not-allowed;
      opacity: 0.9;
    }

    .generate-component-btn.quota-exceeded:hover {
      transform: none;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.7) 0%, rgba(185, 28, 28, 0.7) 100%);
      box-shadow:
        0 4px 12px rgba(239, 68, 68, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.3);
    }

    /* Spin animation for loading icon */
    .generate-component-btn i.spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding: 0.5rem 1.5rem;
      background: rgba(26, 26, 37, 0.9);
      backdrop-filter: blur(12px);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 0.75rem;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .status-label {
      color: #8b8b94; /* Updated from #71717a for WCAG AA compliance (4.5:1+ contrast) */
    }

    .status-value {
      color: #a1a1aa;
    }

    .status-value.saving {
      color: #f59e0b;
    }

    .status-value.queued {
      color: #ef4444; /* Red color to indicate offline/queued state */
    }

    /* Connection Status Indicator Styles (Feature #101) */
    .connection-status {
      gap: 0.375rem;
    }

    .connection-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      transition: all 0.3s ease;
    }

    .connection-indicator.connected {
      background-color: #10b981; /* Green - per spec: success color */
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    }

    .connection-indicator.connecting {
      background-color: #f59e0b; /* Yellow/amber - per spec: warning color */
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
      animation: pulse 1.5s ease-in-out infinite;
    }

    .connection-indicator.disconnected {
      background-color: #ef4444; /* Red - per spec: error color */
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
    }

    .status-value.connected {
      color: #10b981;
    }

    .status-value.connecting {
      color: #f59e0b;
    }

    .status-value.disconnected {
      color: #ef4444;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.6;
        transform: scale(0.9);
      }
    }

    .error-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      text-align: center;
    }

    .error-state i {
      font-size: 3rem;
      color: #ef4444;
    }

    .error-state h2 {
      margin: 0;
      color: #ffffff;
    }

    .error-state p {
      margin: 0;
      color: #a1a1aa;
    }

    .btn-primary {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      border-radius: 8px;
      color: #ffffff;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
    }

    .btn-primary:focus {
      outline: none;
    }

    .btn-primary:focus-visible {
      outline: 2px solid #a5b4fc;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.4);
    }

    /* Code Panel Styles (Feature #119: Code panel slides in on generation success) */
    /* Per spec: Fixed width 420px, slides in from right */
    .code-panel {
      position: absolute;
      top: 0;
      right: 0;
      width: 420px;
      height: 100%;
      background: rgba(18, 18, 26, 0.98);
      backdrop-filter: blur(12px);
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 200;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
    }

    /* Slide-in animation (Feature #119: slides in from right) */
    .code-panel.open {
      transform: translateX(0);
    }

    .code-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(26, 26, 37, 0.9);
    }

    .code-panel-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
    }

    .code-panel-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #a1a1aa;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .code-panel-close:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .code-panel-close:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    /* Loading State */
    .code-panel-loading {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: #a1a1aa;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: codePanelSpin 1s linear infinite;
    }

    @keyframes codePanelSpin {
      to { transform: rotate(360deg); }
    }

    .code-panel-loading p {
      margin: 0;
      font-size: 0.875rem;
    }

    .loading-hint {
      color: #71717a;
      font-size: 0.75rem !important;
    }

    /* Error State */
    .code-panel-error {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 2rem;
      text-align: center;
    }

    .code-panel-error i {
      font-size: 2.5rem;
      color: #ef4444;
    }

    .code-panel-error p {
      margin: 0;
      color: #a1a1aa;
      font-size: 0.875rem;
    }

    .btn-retry {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 6px;
      color: #a5b4fc;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-retry:hover {
      background: rgba(99, 102, 241, 0.3);
    }

    /* Code Panel Content */
    .code-panel-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .component-name-section {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .component-name-section label {
      display: block;
      font-size: 0.75rem;
      color: #71717a;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .component-name-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      background: rgba(26, 26, 37, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #ffffff;
      font-size: 0.875rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }

    .component-name-input:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
    }

    /* Code Display */
    .code-display {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1.25rem;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .code-filename {
      font-size: 0.75rem;
      color: #a1a1aa;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }

    .btn-copy {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 4px;
      color: #a5b4fc;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-copy:hover {
      background: rgba(99, 102, 241, 0.3);
    }

    /* Live Preview Section (Feature #123) */
    .preview-section {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.625rem 1.25rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .preview-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .preview-label i {
      font-size: 0.875rem;
      color: #6366f1;
    }

    .btn-refresh-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: 4px;
      color: #a5b4fc;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-refresh-preview:hover:not(:disabled) {
      background: rgba(99, 102, 241, 0.25);
    }

    .btn-refresh-preview:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-refresh-preview i.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .preview-container {
      position: relative;
      height: 180px;
      background: #ffffff;
      overflow: hidden;
    }

    .preview-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #ffffff;
    }

    .preview-loading {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
    }

    .preview-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #e4e4e7;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .preview-error {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      font-size: 0.75rem;
      text-align: center;
      padding: 1rem;
    }

    .preview-error i {
      font-size: 1.5rem;
    }

    .code-block {
      flex: 1;
      margin: 0;
      padding: 1rem 1.25rem;
      background: rgba(0, 0, 0, 0.4);
      overflow: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.8125rem;
      line-height: 1.6;
      color: #e4e4e7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .code-block code {
      color: inherit;
      font-family: inherit;
    }

    /* Prism.js Dark Theme Syntax Highlighting (Feature #121) */
    /* Token colors optimized for dark background per design system */

    /* Comments - muted gray */
    .code-block .token.comment,
    .code-block .token.prolog,
    .code-block .token.doctype,
    .code-block .token.cdata {
      color: #71717a;
      font-style: italic;
    }

    /* Punctuation */
    .code-block .token.punctuation {
      color: #a1a1aa;
    }

    /* Namespace */
    .code-block .token.namespace {
      opacity: 0.7;
    }

    /* Properties, tags, booleans, numbers, constants */
    .code-block .token.property,
    .code-block .token.tag,
    .code-block .token.boolean,
    .code-block .token.number,
    .code-block .token.constant,
    .code-block .token.symbol {
      color: #f59e0b; /* Amber - warning color from design system */
    }

    /* Selectors, attributes, strings, chars */
    .code-block .token.selector,
    .code-block .token.attr-name,
    .code-block .token.string,
    .code-block .token.char,
    .code-block .token.builtin {
      color: #10b981; /* Green - success color from design system */
    }

    /* Operators, entities, URLs */
    .code-block .token.operator,
    .code-block .token.entity,
    .code-block .token.url,
    .code-block .language-css .token.string,
    .code-block .style .token.string {
      color: #22d3ee; /* Cyan for operators */
    }

    /* Keywords, at-rules, statements */
    .code-block .token.atrule,
    .code-block .token.attr-value,
    .code-block .token.keyword {
      color: #a855f7; /* Purple from design system */
    }

    /* Functions, classes */
    .code-block .token.function,
    .code-block .token.class-name {
      color: #6366f1; /* Indigo - primary accent from design system */
    }

    /* Regex, important */
    .code-block .token.regex,
    .code-block .token.important,
    .code-block .token.variable {
      color: #f472b6; /* Pink for special tokens */
    }

    /* Important emphasis */
    .code-block .token.important,
    .code-block .token.bold {
      font-weight: bold;
    }

    /* Italic */
    .code-block .token.italic {
      font-style: italic;
    }

    /* Entity cursor */
    .code-block .token.entity {
      cursor: help;
    }

    /* JSX/TSX specific - tag names */
    .code-block .token.tag .token.tag {
      color: #ef4444; /* Red - error color from design system, for tag names */
    }

    /* JSX/TSX - component names (PascalCase) */
    .code-block .token.tag .token.class-name {
      color: #3b82f6; /* Blue from canvas colors */
    }

    /* JSX/TSX - attribute names */
    .code-block .token.tag .token.attr-name {
      color: #f59e0b; /* Amber */
    }

    /* JSX/TSX - attribute values */
    .code-block .token.tag .token.attr-value {
      color: #10b981; /* Green */
    }

    /* JSX/TSX - spread operator */
    .code-block .token.tag .token.spread {
      color: #8b5cf6; /* Purple secondary */
    }

    /* TypeScript specific */
    .code-block .token.builtin {
      color: #22d3ee; /* Cyan for built-in types */
    }

    /* Type annotations */
    .code-block .token.type-annotation {
      color: #3b82f6; /* Blue */
    }

    /* Template strings */
    .code-block .token.template-string {
      color: #10b981; /* Green */
    }

    .code-block .token.template-string .token.interpolation {
      color: #f59e0b; /* Amber */
    }

    .code-block .token.template-string .token.interpolation-punctuation {
      color: #a855f7; /* Purple */
    }

    /* Generation Options (Feature #126, #127: Responsive and Include placeholders toggles) */
    .generation-options {
      padding: 1rem 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .option-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .option-toggle {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      user-select: none;
    }

    .option-toggle input[type="checkbox"] {
      /* Hide default checkbox but keep accessible */
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: relative;
      width: 36px;
      height: 20px;
      background: rgba(113, 113, 122, 0.4);
      border-radius: 10px;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #a1a1aa;
      border-radius: 50%;
      transition: all 0.2s ease;
    }

    .option-toggle input:checked + .toggle-slider {
      background: rgba(99, 102, 241, 0.6);
    }

    .option-toggle input:checked + .toggle-slider::before {
      transform: translateX(16px);
      background: #6366f1;
    }

    .option-toggle input:focus-visible + .toggle-slider {
      outline: 2px solid rgba(99, 102, 241, 0.5);
      outline-offset: 2px;
    }

    .option-label {
      font-size: 0.875rem;
      color: #ffffff;
      font-weight: 500;
    }

    .option-hint {
      font-size: 0.75rem;
      color: #71717a;
      margin-left: 44px; /* Align with label text (36px toggle + 8px gap) */
    }

    /* Action Buttons */
    .code-panel-actions {
      padding: 1rem 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 0.75rem;
    }

    .btn-regenerate {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 6px;
      color: #a5b4fc;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-regenerate:hover {
      background: rgba(99, 102, 241, 0.3);
    }

    /* Quota Display */
    .quota-display {
      padding: 0.75rem 1.25rem;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .quota-text {
      font-size: 0.75rem;
      color: #71717a;
    }

    .quota-warning {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #f59e0b;
    }
  `]
})
export class CanvasComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('fabricCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') canvasWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('previewIframe') previewIframeRef!: ElementRef<HTMLIFrameElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private boardService = inject(BoardService);
  private configState = inject(ConfigStateService); // For getting current user info (Feature #113)
  connectionService = inject(ConnectionService); // Exposed for testing connection loss banner
  private offlineQueueService = inject(OfflineQueueService); // For offline drawing support (Feature #103)
  private toastService = inject(ToastService); // For showing "Back online" toast (Feature #104)
  private signalRService = inject(SignalRService); // For real-time collaboration (Feature #100)
  private generationService = inject(GenerationService); // For AI code generation (Feature #118)

  // Track previous connection state for detecting reconnection
  private wasDisconnected = false;
  private isSyncingQueue = false;

  board: BoardDto | null = null;
  isLoading = true;
  error: string | null = null;
  isGuest = false;
  guestSession: GuestSession | null = null;

  // Canvas state
  canvas: fabric.Canvas | null = null;
  currentTool: CanvasTool = 'select';
  currentColor = '#000000';
  currentFillColor: string | null = null; // null means no fill (transparent)
  currentThickness = 4;
  zoomLevel = 1;
  selectedElementCount = 0;
  Math = Math;

  // Generate Component button state (Feature #117: Generate Component button appears on selection)
  // Per spec: "Generate Component" button appears above selection
  showGenerateButton = false;
  generateButtonPosition = { left: 0, top: 0 };

  // Code Panel state (Feature #119: Code panel slides in on generation success)
  // Per spec: Fixed width 420px, slides in from right
  isCodePanelOpen = false;
  isGenerating = false;
  generatedCode = '';
  highlightedCode = ''; // Feature #121: Syntax highlighted HTML
  componentName = 'GeneratedComponent';
  originalComponentName = 'GeneratedComponent'; // Feature #122: Track original name for code updates
  generationError: string | null = null;
  // Quota tracking (per spec: "X / Y generations remaining")
  generationsUsed = 0;
  generationsLimit = 30; // Default for authenticated users (per spec)

  // Generation Options (Feature #126, #127: Responsive and Include placeholders toggles)
  // Per spec: Generation options: Responsive (toggle), Include placeholders (toggle)
  responsiveOption = true; // Default: enabled
  includePlaceholdersOption = false; // Default: disabled

  // Live Preview state (Feature #123: Live preview renders generated component)
  // Per spec: Sandboxed iframe shows component preview
  previewHtml = '';
  isPreviewLoading = false;
  previewError: string | null = null;

  // Drawing state
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private currentShape: fabric.FabricObject | null = null;

  // Element tracking for database persistence
  private elementMap = new Map<string, fabric.FabricObject>(); // Maps element ID to Fabric object
  private nextZIndex = 0;
  isSaving = false;
  elementLoadCount = 0;

  // Offline queue tracking (Feature #103: Local drawing continues while offline)
  offlineQueueCount = 0; // Number of operations queued while offline
  private queueSubscription: Subscription | null = null;

  // Auto-save mechanism (5-second interval per spec)
  private readonly AUTO_SAVE_INTERVAL_MS = 5000; // 5 seconds
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private hasUnsavedChanges = false;
  private lastSaveTime: Date | null = null;
  private pendingSaveCount = 0; // Track concurrent save operations

  // Undo/Redo history stack (50-step limit per spec)
  private readonly MAX_HISTORY_SIZE = 50;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private isUndoRedoAction = false; // Flag to prevent recording during undo/redo

  // Zoom configuration (per spec: 0.1x to 10x range)
  private readonly MIN_ZOOM = 0.1;
  private readonly MAX_ZOOM = 10;
  private readonly ZOOM_STEP = 0.1; // 10% zoom increments

  // Space+drag panning state (per spec: Space+drag pans the canvas)
  private isSpacePressed = false;
  private isPanning = false;
  private lastPanPoint: { x: number; y: number } | null = null;

  // Two-finger touch panning state (per spec: Two-finger drag pans on touch devices)
  private isTouchPanning = false;
  private lastTouchPanPoint: { x: number; y: number } | null = null;
  private initialTouchDistance: number | null = null;
  private initialTouchZoom: number | null = null; // Store zoom level when pinch starts (Feature #93)

  // Remote cursor state (Feature #106: Remote cursor displays for other participants)
  // Per spec: Remote cursor display (colored, labeled with name), Cursor position sync (throttled ~30fps)
  remoteCursors: Map<string, RemoteCursor> = new Map();
  private readonly CURSOR_THROTTLE_MS = 33; // ~30fps throttle for cursor updates
  private lastCursorUpdateTime = 0;
  private cursorStaleTimeout = 5000; // Mark cursors as stale after 5 seconds of no updates
  private cursorCleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Cursor colors for remote participants (varied palette)
  private cursorColors = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#ec4899', // Pink
  ];

  // Self participant info (Feature #113: Participant avatars display in toolbar)
  // The current user's color - consistent across the session
  private selfCursorColor = '#6366f1'; // Indigo for self (matches brand)
  private selfName = 'You';

  // Maximum avatars to display before showing overflow
  private readonly MAX_DISPLAYED_AVATARS = 5;

  // Participant panel state (Feature #114: Participant panel shows all connected users)
  isParticipantPanelOpen = false;

  // Remote selections state (Feature #115: Selection highlight visible to other users)
  // Maps connectionId to their selected element IDs and highlight color
  private remoteSelections: Map<string, RemoteSelection> = new Map();
  // Stores highlight rectangles for remote selections (elementId -> fabric.Rect)
  private remoteSelectionHighlights: Map<string, fabric.FabricObject> = new Map();

  colors: CanvasColors[] = [
    { name: 'Black', value: '#000000' },
    { name: 'White', value: '#ffffff' },
    { name: 'Gray', value: '#6b7280' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Purple', value: '#a855f7' }
  ];

  /**
   * Constructor with effect to monitor connection status changes
   * Per spec (Feature #104): "Sync queued changes on reconnect"
   */
  constructor() {
    // Effect to monitor connection status changes
    // When connection is restored after being disconnected:
    // 1. Sync any queued operations
    // 2. Show "Back online" success toast
    effect(() => {
      const isConnected = this.connectionService.isConnected();

      if (isConnected && this.wasDisconnected) {
        console.log('[Connection] Connection restored! Syncing queued changes...');
        this.syncQueuedChanges();
      }

      // Track disconnected state for detecting reconnection
      if (!isConnected) {
        this.wasDisconnected = true;
      }
    });
  }

  ngOnInit(): void {
    const boardId = this.route.snapshot.paramMap.get('id');
    const isGuestParam = this.route.snapshot.queryParamMap.get('guest');

    // Subscribe to offline queue changes (Feature #103: Local drawing continues while offline)
    this.queueSubscription = this.offlineQueueService.queueChanged$.subscribe(queue => {
      // Only count operations for the current board
      if (boardId) {
        this.offlineQueueCount = queue.filter(op => op.boardId === boardId).length;
      } else {
        this.offlineQueueCount = queue.length;
      }
      console.log('[Offline] Queue changed, count:', this.offlineQueueCount);
    });

    // Check if this is a guest access
    if (isGuestParam === 'true') {
      this.isGuest = true;
      this.loadGuestSession(boardId);
    } else {
      // Try to load as authenticated user
      if (boardId) {
        this.loadBoard(boardId);
      } else {
        this.error = 'No board ID provided';
        this.isLoading = false;
      }
    }
  }

  ngAfterViewInit(): void {
    // Canvas initialization will be triggered after board loads
  }

  ngOnDestroy(): void {
    // Clean up auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Clean up cursor cleanup interval (Feature #106)
    if (this.cursorCleanupInterval) {
      clearInterval(this.cursorCleanupInterval);
      this.cursorCleanupInterval = null;
    }

    // Clean up queue subscription (Feature #103)
    if (this.queueSubscription) {
      this.queueSubscription.unsubscribe();
      this.queueSubscription = null;
    }

    // Disconnect from SignalR (Feature #100)
    this.signalRService.disconnect();

    if (this.canvas) {
      this.canvas.dispose();
    }
  }

  private initializeCanvas(): void {
    if (!this.canvasRef || !this.canvasWrapperRef || !this.board) {
      return;
    }

    const wrapper = this.canvasWrapperRef.nativeElement;
    const rect = wrapper.getBoundingClientRect();

    // Create Fabric.js canvas with marquee selection support and performance optimizations
    // Performance: renderOnAddRemove: false prevents re-render on each element add (Feature #94)
    // This is critical for smooth performance with 1000+ elements
    this.canvas = new fabric.Canvas(this.canvasRef.nativeElement, {
      width: rect.width,
      height: rect.height,
      backgroundColor: '#ffffff',
      selection: true,                     // Enable group selection (marquee)
      selectionColor: 'rgba(99, 102, 241, 0.15)',     // Light indigo fill for selection box
      selectionBorderColor: '#6366f1',     // Indigo border for selection box
      selectionLineWidth: 2,               // Selection box border width
      selectionFullyContained: false,      // Select objects that intersect (not just fully contained)
      preserveObjectStacking: true,
      // Performance optimizations for handling 1000+ elements (per spec: 60fps with 1000 elements)
      renderOnAddRemove: false,            // Don't re-render on each add/remove - we call renderAll() manually
      skipOffscreen: true                  // Enable viewport culling - only process visible elements
    });

    // Set up selection event handlers
    // Feature #115: Selection highlight visible to other users - broadcast selection changes
    // Feature #117: Generate Component button appears on selection
    this.canvas.on('selection:created', (e) => {
      this.selectedElementCount = e.selected?.length || 0;
      this.broadcastSelectionChange(e.selected || []);
      this.updateGenerateButtonPosition();
    });

    this.canvas.on('selection:updated', (e) => {
      this.selectedElementCount = e.selected?.length || 0;
      this.broadcastSelectionChange(e.selected || []);
      this.updateGenerateButtonPosition();
    });

    this.canvas.on('selection:cleared', () => {
      this.selectedElementCount = 0;
      this.broadcastSelectionChange([]);
      this.hideGenerateButton();
    });

    // Update button position when selection is moved or resized
    this.canvas.on('object:moving', () => this.updateGenerateButtonPosition());
    this.canvas.on('object:scaling', () => this.updateGenerateButtonPosition());

    // Set up drawing handlers
    this.canvas.on('mouse:down', (opt) => this.handleMouseDown(opt));
    this.canvas.on('mouse:move', (opt) => this.handleMouseMove(opt));
    this.canvas.on('mouse:up', (opt) => this.handleMouseUp(opt));

    // Load elements from database
    this.loadElements();

    // Apply selection mode
    this.updateCanvasMode();

    // Set up object modification handler for saving updates
    this.canvas.on('object:modified', (e) => {
      if (e.target) {
        this.saveElementUpdate(e.target);
      }
    });

    // Set up path created handler for pen tool
    this.canvas.on('path:created', (e) => {
      if (e.path) {
        this.saveNewElement(e.path, 'stroke');
      }
    });

    // Set up mouse wheel zoom handler
    this.canvas.on('mouse:wheel', (opt) => {
      this.handleMouseWheelZoom(opt.e as WheelEvent);
    });

    // Set up touch event handlers for two-finger panning (per spec: Two-finger drag pans on touch devices)
    this.setupTouchHandlers();

    // Start auto-save timer (5-second interval per spec)
    this.startAutoSaveTimer();

    // Connect to SignalR for real-time collaboration (Feature #100)
    this.connectToSignalR();
  }

  /**
   * Connect to SignalR hub for real-time collaboration
   * Per spec: SignalR connection establishes on board join
   */
  private connectToSignalR(): void {
    if (!this.board) {
      console.warn('[SignalR] Cannot connect - no board loaded');
      return;
    }

    const guestName = this.isGuest && this.guestSession ? this.guestSession.guestName : undefined;

    console.log('[SignalR] Connecting to board:', this.board.id);

    // Start cursor cleanup interval to remove stale cursors
    this.startCursorCleanupInterval();

    this.signalRService.connect(this.board.id, guestName)
      .then(() => {
        console.log('[SignalR] Successfully connected to board');
        // Set up cursor event handler AFTER connecting (Feature #106: Remote cursor displays)
        // The hubConnection must exist before we can register handlers
        this.setupCursorEventHandler();
      })
      .catch(error => {
        console.error('[SignalR] Failed to connect:', error);
        // Connection will retry automatically via the SignalR service
      });
  }

  /**
   * Set up event handler for remote cursor movements (Feature #106)
   * Per spec: Remote cursor display (colored, labeled with name)
   */
  private setupCursorEventHandler(): void {
    this.signalRService.on('OnCursorMoved', (data: { connectionId: string; x: number; y: number; timestamp: string }) => {
      this.handleRemoteCursorMove(data);
    });

    // Handle participant join to assign cursor color and show notification (Feature #111)
    this.signalRService.on('OnParticipantJoined', (data: { connectionId: string; guestName?: string }) => {
      console.log('[Cursor] Participant joined:', data.connectionId, data.guestName);

      // Initialize cursor when participant joins (will be positioned when they move)
      const color = this.getColorForConnection(data.connectionId);
      const participantName = data.guestName || 'User';
      this.remoteCursors.set(data.connectionId, {
        connectionId: data.connectionId,
        x: -100, // Start offscreen
        y: -100,
        color: color,
        name: participantName,
        lastUpdate: Date.now()
      });

      // Feature #111: Show join notification toast (per spec: subtle, 3s auto-dismiss)
      // Per spec: "Toast: User joined board (subtle, 3s auto-dismiss)"
      this.toastService.info(`${participantName} joined the board`, 3000);
    });

    // Handle participant leave to remove cursor and show notification (Feature #112)
    // Per spec: "Toast: User left board (subtle, 3s auto-dismiss)"
    this.signalRService.on('OnParticipantLeft', (data: { connectionId: string }) => {
      console.log('[Cursor] Participant left:', data.connectionId);

      // Get participant name before removing cursor
      const cursor = this.remoteCursors.get(data.connectionId);
      const participantName = cursor?.name || 'User';

      // Remove the cursor
      this.remoteCursors.delete(data.connectionId);

      // Feature #115: Clear remote selection highlights when participant leaves
      this.clearAllRemoteSelectionsForParticipant(data.connectionId);

      // Feature #112: Show leave notification toast (per spec: subtle, 3s auto-dismiss)
      this.toastService.info(`${participantName} left the board`, 3000);
    });

    // Feature #108: Handle element creation from other participants
    // Per spec: "Drawing an element appears for all users"
    this.signalRService.on('OnElementCreated', (data: { id: string; elementData: string; zIndex: number }) => {
      console.log('[SignalR] Remote element created:', data);
      this.handleRemoteElementCreated(data);
    });

    // Feature #109: Handle element updates from other participants
    // Per spec: "Element updates broadcast to participants - Moving/resizing elements syncs to all users"
    // Note: Backend sends PascalCase (ElementId, Data), TypeScript uses camelCase
    this.signalRService.on('OnElementUpdated', (data: { ElementId: string; Data: any }) => {
      console.log('[SignalR] Remote element updated:', data);
      // Parse elementData if it's a string, otherwise use directly
      const elementData: ElementDataJson = typeof data.Data === 'string' ? JSON.parse(data.Data) : data.Data;
      this.handleRemoteElementUpdated(data.ElementId, elementData);
    });

    // Feature #110: Handle element deletion from other participants
    // Per spec: "Deleting elements removes for all users"
    this.signalRService.on('OnElementsDeleted', (elementIds: string[]) => {
      console.log('[SignalR] Remote elements deleted:', elementIds);
      this.handleRemoteElementsDeleted(elementIds);
    });

    // Feature #115: Handle selection change from other participants
    // Per spec: "Selection highlight visible to other users - When User A selects element, User B sees highlight"
    this.signalRService.on('OnSelectionChanged', (data: { ConnectionId: string; ElementIds: string[]; Timestamp: string }) => {
      console.log('[SignalR] Remote selection changed:', data);
      this.handleRemoteSelectionChange(data);
    });
  }

  /**
   * Handle element creation from a remote participant (Feature #108)
   * Per spec: "Drawing an element appears for all users" - "Verify User B did not need to refresh"
   */
  private handleRemoteElementCreated(data: { id: string; elementData: string; zIndex: number }): void {
    if (!this.canvas) {
      console.warn('[SignalR] Cannot render remote element - canvas not ready');
      return;
    }

    // Check if element already exists (prevent duplicates)
    if (this.elementMap.has(data.id)) {
      console.log('[SignalR] Element already exists, skipping:', data.id);
      return;
    }

    try {
      const elementData: ElementDataJson = JSON.parse(data.elementData);
      const fabricObj = this.elementDataToFabricObject(elementData);

      if (fabricObj) {
        // Store element ID on the Fabric object
        (fabricObj as any)._elementId = data.id;
        (fabricObj as any)._isRemote = true; // Mark as remote element
        this.elementMap.set(data.id, fabricObj);

        // Set selection state based on current tool
        fabricObj.selectable = this.currentTool === 'select';
        fabricObj.evented = this.currentTool === 'select';

        // Add to canvas
        this.canvas.add(fabricObj);
        this.canvas.renderAll();

        // Update element count
        this.elementLoadCount++;

        console.log('[SignalR] Remote element rendered successfully:', data.id);
      }
    } catch (e) {
      console.error('[SignalR] Failed to render remote element:', e);
    }
  }

  /**
   * Handle element update from a remote participant (Feature #109)
   * Per spec: "Element updates broadcast to participants - Moving/resizing elements syncs to all users"
   *
   * This method:
   * 1. Finds the existing element in the canvas by ID
   * 2. Updates its properties based on the received data
   * 3. Re-renders the canvas to show the change
   */
  private handleRemoteElementUpdated(elementId: string, data: ElementDataJson): void {
    if (!this.canvas) {
      console.warn('[SignalR] Cannot update remote element - canvas not ready');
      return;
    }

    // Find the existing element in our element map
    const existingObj = this.elementMap.get(elementId);
    if (!existingObj) {
      console.warn('[SignalR] Element not found for update:', elementId);
      return;
    }

    try {
      // Update the element properties based on type
      switch (data.type) {
        case 'stroke':
          // For strokes (paths), we need to recreate the path
          // since Fabric.js paths are not easily mutable
          if (data.points && data.points.length > 0) {
            let pathStr = `M ${data.points[0][0]} ${data.points[0][1]}`;
            for (let i = 1; i < data.points.length; i++) {
              pathStr += ` L ${data.points[i][0]} ${data.points[i][1]}`;
            }
            // Remove old path and create new one
            this.canvas.remove(existingObj);
            const newPath = new fabric.Path(pathStr, {
              stroke: data.color,
              strokeWidth: data.thickness || 4,
              fill: '',
              strokeLineCap: 'round',
              strokeLineJoin: 'round',
              selectable: this.currentTool === 'select',
              hasControls: true,
              hasBorders: true
            });
            (newPath as any)._elementId = elementId;
            (newPath as any)._isRemote = true;
            this.elementMap.set(elementId, newPath);
            this.canvas.add(newPath);
          }
          break;

        case 'rectangle':
          existingObj.set({
            left: data.x || 0,
            top: data.y || 0,
            width: data.width || 100,
            height: data.height || 100,
            stroke: data.color,
            strokeWidth: data.thickness || 4,
            fill: data.fillColor || 'transparent'
          });
          existingObj.setCoords(); // Update bounding box
          break;

        case 'circle':
          existingObj.set({
            left: (data.cx || 0) - (data.radius || 50),
            top: (data.cy || 0) - (data.radius || 50),
            radius: data.radius || 50,
            stroke: data.color,
            strokeWidth: data.thickness || 4,
            fill: data.fillColor || 'transparent'
          });
          existingObj.setCoords();
          break;

        case 'text':
          if (existingObj instanceof fabric.IText) {
            existingObj.set({
              left: data.x || 0,
              top: data.y || 0,
              text: data.content || '',
              fontSize: data.fontSize || 20,
              fill: data.color
            });
            existingObj.setCoords();
          }
          break;
      }

      // Re-render the canvas to show the update
      this.canvas.renderAll();

      // Feature #115: Update any remote selection highlights for this element
      this.updateRemoteSelectionHighlightForElement(elementId);

      console.log('[SignalR] Remote element updated successfully:', elementId);
    } catch (e) {
      console.error('[SignalR] Failed to update remote element:', e);
    }
  }

  /**
   * Handle element deletion from a remote participant (Feature #110)
   * Per spec: "Deleting elements removes for all users" - "Verify User B did not need to refresh"
   */
  private handleRemoteElementsDeleted(elementIds: string[]): void {
    if (!this.canvas) {
      console.warn('[SignalR] Cannot delete remote elements - canvas not ready');
      return;
    }

    let deletedCount = 0;

    elementIds.forEach(elementId => {
      // Find the element in our map
      const existingObj = this.elementMap.get(elementId);
      if (existingObj) {
        // Remove from canvas
        this.canvas!.remove(existingObj);
        // Remove from element map
        this.elementMap.delete(elementId);
        deletedCount++;
        this.elementLoadCount--;

        // Feature #115: Remove any remote selection highlights for this element
        this.removeRemoteSelectionHighlightsForElement(elementId);
      } else {
        console.warn('[SignalR] Element not found for deletion:', elementId);
      }
    });

    if (deletedCount > 0) {
      // Deselect any active objects that may have been deleted
      this.canvas.discardActiveObject();
      // Re-render the canvas
      this.canvas.renderAll();
      console.log('[SignalR] Remote elements deleted successfully:', deletedCount, 'of', elementIds.length);
    }
  }

  /**
   * Handle incoming cursor movement from remote participant (Feature #106)
   */
  private handleRemoteCursorMove(data: { connectionId: string; x: number; y: number; timestamp: string }): void {
    // Convert canvas coordinates to screen coordinates
    const screenCoords = this.canvasToScreenCoordinates(data.x, data.y);

    const existingCursor = this.remoteCursors.get(data.connectionId);

    if (existingCursor) {
      // Update existing cursor position
      existingCursor.x = screenCoords.x;
      existingCursor.y = screenCoords.y;
      existingCursor.lastUpdate = Date.now();
    } else {
      // Create new cursor for this participant
      const color = this.getColorForConnection(data.connectionId);
      this.remoteCursors.set(data.connectionId, {
        connectionId: data.connectionId,
        x: screenCoords.x,
        y: screenCoords.y,
        color: color,
        name: 'User', // Will be updated when we get participant info
        lastUpdate: Date.now()
      });
    }
  }

  /**
   * Convert canvas coordinates to screen coordinates for cursor display
   */
  private canvasToScreenCoordinates(canvasX: number, canvasY: number): { x: number; y: number } {
    if (!this.canvas) {
      return { x: canvasX, y: canvasY };
    }

    // Apply viewport transform (pan and zoom)
    const vpt = this.canvas.viewportTransform!;
    const screenX = canvasX * vpt[0] + vpt[4];
    const screenY = canvasY * vpt[3] + vpt[5];

    return { x: screenX, y: screenY };
  }

  /**
   * Get a consistent color for a connection ID (Feature #106)
   */
  private getColorForConnection(connectionId: string): string {
    // Hash the connection ID to get a consistent color index
    let hash = 0;
    for (let i = 0; i < connectionId.length; i++) {
      hash = ((hash << 5) - hash) + connectionId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const index = Math.abs(hash) % this.cursorColors.length;
    return this.cursorColors[index];
  }

  /**
   * Broadcast selection change to other participants (Feature #115)
   * Per spec: "Selection highlight visible to others (user's color)"
   */
  private broadcastSelectionChange(selectedObjects: fabric.FabricObject[]): void {
    // Get element IDs from selected objects
    const elementIds: string[] = [];
    for (const obj of selectedObjects) {
      const elementId = (obj as any)._elementId;
      if (elementId) {
        elementIds.push(elementId);
      }
    }

    // Broadcast via SignalR
    this.signalRService.updateSelection(elementIds);
    console.log('[Selection] Broadcasting selection change:', elementIds.length, 'elements');
  }

  /**
   * Update the Generate Component button position based on selection bounding box (Feature #117)
   * Per spec: "Button positioned above selection"
   */
  private updateGenerateButtonPosition(): void {
    if (!this.canvas) {
      this.hideGenerateButton();
      return;
    }

    const activeObject = this.canvas.getActiveObject();
    if (!activeObject) {
      this.hideGenerateButton();
      return;
    }

    // Get the bounding rect of the selection (works for single objects and groups)
    const boundingRect = activeObject.getBoundingRect();

    // Calculate center of selection horizontally
    const centerX = boundingRect.left + (boundingRect.width / 2);

    // Position button above the selection with some padding
    // Button will be positioned so its center aligns with the selection center
    const buttonWidth = 180; // Approximate button width
    const buttonHeight = 36; // Approximate button height
    const padding = 12; // Space between button and selection

    // Calculate left position (center the button)
    let left = centerX - (buttonWidth / 2);

    // Calculate top position (above the selection)
    let top = boundingRect.top - buttonHeight - padding;

    // Ensure button stays within canvas bounds
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();

    // Clamp left position
    if (left < 8) {
      left = 8;
    } else if (left + buttonWidth > canvasWidth - 8) {
      left = canvasWidth - buttonWidth - 8;
    }

    // If button would be above canvas, put it below the selection instead
    if (top < 8) {
      top = boundingRect.top + boundingRect.height + padding;
    }

    // Update position and show button
    this.generateButtonPosition = { left, top };
    this.showGenerateButton = true;
    console.log('[Generate] Button position updated:', { left, top, selectionBounds: boundingRect });
  }

  /**
   * Hide the Generate Component button (Feature #117)
   */
  private hideGenerateButton(): void {
    this.showGenerateButton = false;
  }

  /**
   * Handle Generate Component button click (Feature #117 + #118)
   * Per spec: Exports selection to PNG and initiates AI code generation
   *
   * Feature #118 verification steps:
   * 1. Select sketch elements on canvas
   * 2. Click 'Generate Component' button
   * 3. Verify loading state on selection
   * 4. Verify API request sent
   * 5. Wait for completion (~10s)
   */
  onGenerateComponent(): void {
    if (!this.canvas || !this.board || this.selectedElementCount === 0) {
      console.log('[Generate] No elements selected or canvas not ready');
      return;
    }

    // Don't allow generation while already generating
    if (this.isGenerating) {
      console.log('[Generate] Generation already in progress');
      this.toastService.warning('Generation already in progress...', 2000);
      return;
    }

    // Feature #131: Check quota before generating
    if (this.isQuotaExceeded()) {
      console.log('[Generate] Quota exceeded:', this.generationsUsed, '/', this.generationsLimit);
      if (this.isGuest) {
        this.toastService.warning(
          `You've reached your limit of ${this.generationsLimit} generations per session. Register for more!`,
          5000
        );
      } else {
        this.toastService.warning(
          `You've reached your limit of ${this.generationsLimit} generations per month.`,
          5000
        );
      }
      return;
    }

    const activeObjects = this.canvas.getActiveObjects();
    console.log('[Generate] Starting component generation from', activeObjects.length, 'selected elements');

    // Step 1: Set loading state
    this.isGenerating = true;
    this.generationError = null;

    // Step 2: Show loading toast
    this.toastService.info('Exporting selection and preparing for AI analysis...', 3000);

    // Step 3: Export selection to PNG (base64)
    try {
      const imageBase64 = this.exportSelectionToBase64(activeObjects);
      if (!imageBase64) {
        throw new Error('Failed to export selection to image');
      }

      console.log('[Generate] Selection exported to PNG, size:', Math.round(imageBase64.length / 1024), 'KB');

      // Step 4: Generate component name suggestion based on selection
      const componentName = this.generateComponentNameSuggestion(activeObjects);
      console.log('[Generate] Suggested component name:', componentName);

      // Step 5: Call generation service (using mock for now since AI APIs may not be configured)
      // In production this would use: this.generationService.generateComponent(...)
      // Feature #126, #127: Pass toggle options to generation service
      console.log('[Generate] Options:', { responsive: this.responsiveOption, includePlaceholders: this.includePlaceholdersOption });
      this.generationService.generateComponentMock({
        boardId: this.board.id,
        imageBase64,
        componentName,
        options: {
          responsive: this.responsiveOption,
          includePlaceholders: this.includePlaceholdersOption
        }
      }).subscribe({
        next: (result) => {
          console.log('[Generate] Generation completed successfully:', result.componentName);
          this.isGenerating = false;
          this.generatedCode = result.code;
          this.highlightedCode = this.highlightCode(result.code); // Feature #121: Apply syntax highlighting
          this.componentName = result.componentName;
          this.originalComponentName = result.componentName; // Feature #122: Track original for code updates
          this.isCodePanelOpen = true;
          this.generationsUsed++;

          // Feature #131: Save guest generation count to localStorage
          if (this.isGuest) {
            this.saveGuestGenerationCount();
            console.log('[Quota] Guest generations:', this.generationsUsed, '/', this.generationsLimit);
          }

          // Feature #123: Update live preview with generated code
          this.updatePreview();

          // Show success toast per spec: "Toast: Generation complete (with 'View' button, 5s)"
          this.toastService.success(
            `Component "${result.componentName}" generated in ${(result.durationMs / 1000).toFixed(1)}s`,
            5000
          );
        },
        error: (error) => {
          console.error('[Generate] Generation failed:', error);
          this.isGenerating = false;
          this.generationError = error.message || 'Generation failed. Please try again.';

          // Show error toast per spec: "Toast: Generation failed (stays until dismissed)"
          this.toastService.error(this.generationError, 0); // 0 = doesn't auto-dismiss
        }
      });

    } catch (error: any) {
      console.error('[Generate] Export failed:', error);
      this.isGenerating = false;
      this.generationError = error.message || 'Failed to export selection';
      this.toastService.error('Failed to export selection for generation', 5000);
    }
  }

  /**
   * Export selected elements to a base64-encoded PNG image
   * Per spec: Export selection to PNG (base64) for AI analysis
   */
  private exportSelectionToBase64(selectedObjects: fabric.FabricObject[]): string | null {
    if (!this.canvas || selectedObjects.length === 0) {
      return null;
    }

    try {
      // Get the bounding box of all selected objects
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const obj of selectedObjects) {
        const boundingRect = obj.getBoundingRect();
        minX = Math.min(minX, boundingRect.left);
        minY = Math.min(minY, boundingRect.top);
        maxX = Math.max(maxX, boundingRect.left + boundingRect.width);
        maxY = Math.max(maxY, boundingRect.top + boundingRect.height);
      }

      // Add padding around the selection
      const padding = 20;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      // Calculate dimensions
      const width = maxX - minX;
      const height = maxY - minY;

      // Create a temporary canvas for export
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext('2d');

      if (!ctx) {
        console.error('[Generate] Failed to get 2D context for export');
        return null;
      }

      // Fill with white background (for better AI recognition)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Use Fabric.js toDataURL with multiplier for better quality
      // Export just the selected area
      const dataUrl = this.canvas.toDataURL({
        format: 'png',
        quality: 1.0,
        left: minX,
        top: minY,
        width,
        height,
        multiplier: 2 // Higher quality export
      });

      // Extract base64 data (remove data:image/png;base64, prefix)
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      console.log('[Generate] Exported selection area:', { width, height, base64Length: base64.length });

      return base64;
    } catch (error) {
      console.error('[Generate] Error exporting selection:', error);
      return null;
    }
  }

  /**
   * Generate a suggested component name based on selected elements
   * Uses heuristics to suggest meaningful names
   */
  private generateComponentNameSuggestion(selectedObjects: fabric.FabricObject[]): string {
    // Count element types
    const typeCounts: Record<string, number> = {};

    for (const obj of selectedObjects) {
      const type = (obj as any).type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    console.log('[Generate] Element type counts:', typeCounts);

    // Generate name based on dominant type
    if (typeCounts['i-text'] || typeCounts['text']) {
      return 'TextCard';
    }
    if (typeCounts['rect'] && selectedObjects.length > 3) {
      return 'CardLayout';
    }
    if (typeCounts['rect']) {
      return 'BoxComponent';
    }
    if (typeCounts['circle'] || typeCounts['ellipse']) {
      return 'CircleWidget';
    }
    if (typeCounts['path']) {
      return 'SketchElement';
    }
    if (selectedObjects.length > 5) {
      return 'ComplexLayout';
    }

    return 'GeneratedComponent';
  }

  /**
   * Close the code panel (Feature #119)
   * Per spec: Close button (X) to dismiss panel
   */
  closeCodePanel(): void {
    this.isCodePanelOpen = false;
    console.log('[CodePanel] Panel closed');
  }

  /**
   * Handle generation option toggle changes (Feature #126, #127)
   * Per spec: Generation options: Responsive (toggle), Include placeholders (toggle)
   * Logs the option change for debugging and future regeneration
   */
  onOptionChange(option: 'responsive' | 'placeholders'): void {
    if (option === 'responsive') {
      console.log('[CodePanel] Responsive option changed:', this.responsiveOption);
    } else if (option === 'placeholders') {
      console.log('[CodePanel] Include placeholders option changed:', this.includePlaceholdersOption);
    }
    // Note: Changes will take effect on next regeneration
  }

  /**
   * Copy the generated code to clipboard (Feature #119)
   * Per spec: Copy code button (one-click, success toast)
   */
  copyGeneratedCode(): void {
    if (!this.generatedCode) {
      this.toastService.warning('No code to copy', 2000);
      return;
    }

    navigator.clipboard.writeText(this.generatedCode).then(() => {
      console.log('[CodePanel] Code copied to clipboard');
      this.toastService.success('Code copied to clipboard!', 2000);
    }).catch((error) => {
      console.error('[CodePanel] Failed to copy code:', error);
      this.toastService.error('Failed to copy code', 3000);
    });
  }

  /**
   * Apply syntax highlighting to code using Prism.js (Feature #121)
   * Per spec: Code in panel has proper syntax highlighting
   * Uses TSX grammar for TypeScript + JSX highlighting
   */
  highlightCode(code: string): string {
    if (!code) {
      return '';
    }
    try {
      // Use TSX grammar for React + TypeScript components
      const highlighted = Prism.highlight(code, Prism.languages['tsx'], 'tsx');
      console.log('[CodePanel] Syntax highlighting applied successfully');
      return highlighted;
    } catch (error) {
      console.warn('[CodePanel] Syntax highlighting failed, returning plain code:', error);
      // Fallback to HTML-escaped plain text
      return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  /**
   * Enforce PascalCase component name format (Feature #119 + #122)
   * Per spec: Component name (editable, PascalCase enforced)
   * Feature #122: Code updates with new name
   */
  enforceComponentNameFormat(): void {
    if (!this.componentName) {
      this.componentName = 'GeneratedComponent';
      this.updateCodeWithNewName();
      return;
    }

    // Remove any non-alphanumeric characters except underscores
    let cleanName = this.componentName.replace(/[^a-zA-Z0-9_]/g, '');

    // If starts with number, prefix with 'Component'
    if (/^[0-9]/.test(cleanName)) {
      cleanName = 'Component' + cleanName;
    }

    // Convert to PascalCase
    // Split by underscores or when a lowercase is followed by uppercase
    const words = cleanName.split(/[_]|(?<=[a-z])(?=[A-Z])/);
    this.componentName = words
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    // Ensure it's not empty after processing
    if (!this.componentName) {
      this.componentName = 'GeneratedComponent';
    }

    console.log('[CodePanel] Component name formatted:', this.componentName);

    // Feature #122: Update code with new component name
    this.updateCodeWithNewName();
  }

  /**
   * Update generated code with new component name (Feature #122)
   * Replaces all occurrences of the original component name with the new name
   */
  private updateCodeWithNewName(): void {
    if (!this.generatedCode || !this.originalComponentName || this.componentName === this.originalComponentName) {
      return;
    }

    console.log('[CodePanel] Updating code with new name:', this.originalComponentName, '->', this.componentName);

    // Replace the original component name with the new name in the code
    // This handles: function declarations, export statements, JSX tags, etc.
    const escapedOriginal = this.originalComponentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`\\b${escapedOriginal}\\b`, 'g');
    this.generatedCode = this.generatedCode.replace(nameRegex, this.componentName);

    // Update syntax highlighting
    this.highlightedCode = this.highlightCode(this.generatedCode);

    // Feature #123: Update preview when code changes
    this.updatePreview();

    // Update the original name to the new name for future edits
    this.originalComponentName = this.componentName;
  }

  /**
   * Retry failed generation (Feature #119)
   */
  retryGeneration(): void {
    console.log('[CodePanel] Retrying generation...');
    this.generationError = null;
    this.onGenerateComponent();
  }

  /**
   * Regenerate the component with current selection (Feature #119)
   * Per spec: Regenerate button
   */
  regenerateComponent(): void {
    console.log('[CodePanel] Regenerating component...');
    // Close current panel and regenerate
    this.generatedCode = '';
    this.generationError = null;
    this.onGenerateComponent();
  }

  /**
   * Generate preview HTML for the sandboxed iframe (Feature #123)
   * Per spec: Live preview iframe (sandboxed) shows component preview
   * The preview renders the React + Tailwind component in a sandboxed environment
   */
  private generatePreviewHtml(code: string): string {
    // Extract the component's JSX return statement to render statically
    // Since we can't run React in the iframe without bundling,
    // we'll extract the JSX and render it with Tailwind CSS loaded

    // Find the return statement in the component
    const returnMatch = code.match(/return\s*\(\s*([\s\S]*?)\s*\);?\s*(?:}|$)/);
    let jsxContent = '';

    if (returnMatch) {
      jsxContent = returnMatch[1];
      // Clean up the JSX for HTML rendering
      // Replace className with class for HTML
      jsxContent = jsxContent.replace(/className=/g, 'class=');
      // Remove TypeScript/JSX expressions like {variable} or {() => void}
      jsxContent = jsxContent.replace(/\{[^}]*\}/g, '');
      // Convert self-closing React tags to proper HTML
      jsxContent = jsxContent.replace(/<(\w+)([^>]*)\s*\/>/g, '<$1$2></$1>');
    } else {
      // If we can't extract JSX, show a placeholder
      jsxContent = '<div class="p-4 text-center text-gray-500">Preview unavailable</div>';
    }

    // Create a complete HTML document with Tailwind CDN
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 8px;
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    /* Remove any parent access - sandbox enforced */
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${jsxContent}
</body>
</html>`;
  }

  /**
   * Update the live preview with the current generated code (Feature #123)
   * Called when code is generated or refreshed
   */
  updatePreview(): void {
    if (!this.generatedCode) {
      this.previewHtml = '';
      this.previewError = null;
      return;
    }

    this.isPreviewLoading = true;
    this.previewError = null;
    console.log('[Preview] Generating preview HTML...');

    try {
      this.previewHtml = this.generatePreviewHtml(this.generatedCode);
      console.log('[Preview] Preview HTML generated successfully');
    } catch (error) {
      console.error('[Preview] Failed to generate preview:', error);
      this.previewError = 'Failed to render preview';
      this.isPreviewLoading = false;
    }
  }

  /**
   * Refresh the live preview (Feature #123)
   * Per spec: User can refresh the preview
   */
  refreshPreview(): void {
    console.log('[Preview] Refreshing preview...');
    this.updatePreview();
  }

  /**
   * Handle preview iframe load event (Feature #123)
   * Called when the iframe finishes loading
   */
  onPreviewLoad(): void {
    this.isPreviewLoading = false;
    console.log('[Preview] Preview loaded successfully');
  }

  /**
   * Handle preview iframe error event (Feature #123)
   * Called when the iframe fails to load
   */
  onPreviewError(): void {
    this.isPreviewLoading = false;
    this.previewError = 'Preview failed to load';
    console.error('[Preview] Preview failed to load');
  }

  /**
   * Handle remote selection change from another participant (Feature #115)
   * Per spec: "When User A selects element, User B sees highlight"
   */
  private handleRemoteSelectionChange(data: { ConnectionId: string; ElementIds: string[]; Timestamp: string }): void {
    console.log('[Selection] Remote selection changed:', data.ConnectionId, data.ElementIds);

    const connectionId = data.ConnectionId;
    const elementIds = data.ElementIds || [];

    // Get the color for this participant
    const color = this.getColorForConnection(connectionId);

    // Clear existing highlights for this participant
    this.clearRemoteSelectionHighlights(connectionId);

    if (elementIds.length === 0) {
      // User deselected - remove their selection from our tracking
      this.remoteSelections.delete(connectionId);
      return;
    }

    // Store the selection
    this.remoteSelections.set(connectionId, {
      connectionId,
      elementIds,
      color
    });

    // Create highlight rectangles for each selected element
    this.createRemoteSelectionHighlights(connectionId, elementIds, color);
  }

  /**
   * Create highlight rectangles around elements selected by a remote user (Feature #115)
   */
  private createRemoteSelectionHighlights(connectionId: string, elementIds: string[], color: string): void {
    if (!this.canvas) return;

    for (const elementId of elementIds) {
      const element = this.elementMap.get(elementId);
      if (!element) {
        console.warn('[Selection] Element not found for remote highlight:', elementId);
        continue;
      }

      // Get the bounding box of the element
      const boundingRect = element.getBoundingRect();

      // Create a highlight rectangle around the element
      // Use a dashed stroke in the participant's color
      const highlight = new fabric.Rect({
        left: boundingRect.left - 4,
        top: boundingRect.top - 4,
        width: boundingRect.width + 8,
        height: boundingRect.height + 8,
        fill: 'transparent',
        stroke: color,
        strokeWidth: 2,
        strokeDashArray: [5, 5], // Dashed line to distinguish from local selection
        selectable: false,
        evented: false,
        excludeFromExport: true
      });

      // Mark this as a remote selection highlight
      (highlight as any)._isRemoteHighlight = true;
      (highlight as any)._remoteConnectionId = connectionId;
      (highlight as any)._targetElementId = elementId;

      // Store and add to canvas
      const highlightKey = `${connectionId}:${elementId}`;
      this.remoteSelectionHighlights.set(highlightKey, highlight);
      this.canvas.add(highlight);
    }

    this.canvas.renderAll();
  }

  /**
   * Clear highlight rectangles for a specific participant (Feature #115)
   */
  private clearRemoteSelectionHighlights(connectionId: string): void {
    if (!this.canvas) return;

    // Find and remove all highlights for this connection
    const keysToRemove: string[] = [];
    this.remoteSelectionHighlights.forEach((highlight, key) => {
      if (key.startsWith(`${connectionId}:`)) {
        this.canvas!.remove(highlight);
        keysToRemove.push(key);
      }
    });

    // Remove from our tracking map
    for (const key of keysToRemove) {
      this.remoteSelectionHighlights.delete(key);
    }

    if (keysToRemove.length > 0) {
      this.canvas.renderAll();
    }
  }

  /**
   * Clear all remote selection highlights for a participant who left (Feature #115)
   */
  private clearAllRemoteSelectionsForParticipant(connectionId: string): void {
    this.clearRemoteSelectionHighlights(connectionId);
    this.remoteSelections.delete(connectionId);
  }

  /**
   * Remove all remote selection highlights for a specific element (Feature #115)
   * Called when an element is deleted
   */
  private removeRemoteSelectionHighlightsForElement(elementId: string): void {
    if (!this.canvas) return;

    // Find and remove all highlights targeting this element
    const keysToRemove: string[] = [];
    this.remoteSelectionHighlights.forEach((highlight, key) => {
      if (key.endsWith(`:${elementId}`)) {
        this.canvas!.remove(highlight);
        keysToRemove.push(key);
      }
    });

    // Remove from our tracking map
    for (const key of keysToRemove) {
      this.remoteSelectionHighlights.delete(key);
    }

    // Update remoteSelections map to remove this element from any selections
    this.remoteSelections.forEach((selection) => {
      const index = selection.elementIds.indexOf(elementId);
      if (index !== -1) {
        selection.elementIds.splice(index, 1);
      }
    });
  }

  /**
   * Update remote selection highlights when an element is moved/resized (Feature #115)
   * Call this after an element is modified to keep highlights in sync
   */
  private updateRemoteSelectionHighlightForElement(elementId: string): void {
    if (!this.canvas) return;

    const element = this.elementMap.get(elementId);
    if (!element) return;

    const boundingRect = element.getBoundingRect();

    // Find all highlights targeting this element
    this.remoteSelectionHighlights.forEach((highlight, key) => {
      if (key.endsWith(`:${elementId}`)) {
        // Update the highlight position and size
        highlight.set({
          left: boundingRect.left - 4,
          top: boundingRect.top - 4,
          width: boundingRect.width + 8,
          height: boundingRect.height + 8
        });
        highlight.setCoords();
      }
    });

    this.canvas.renderAll();
  }

  /**
   * Start interval to clean up stale cursors (Feature #106)
   * Per spec: Remote cursors fade to gray when stale
   */
  private startCursorCleanupInterval(): void {
    // Clear any existing interval
    if (this.cursorCleanupInterval) {
      clearInterval(this.cursorCleanupInterval);
    }

    // Check for stale cursors every 2 seconds
    this.cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 30000; // Remove cursors after 30 seconds of no updates

      this.remoteCursors.forEach((cursor, connectionId) => {
        if (now - cursor.lastUpdate > staleThreshold) {
          console.log('[Cursor] Removing stale cursor:', connectionId);
          this.remoteCursors.delete(connectionId);
        }
      });
    }, 2000);
  }

  /**
   * Get remote cursors as array for template iteration (Feature #106)
   */
  getRemoteCursorsArray(): RemoteCursor[] {
    return Array.from(this.remoteCursors.values());
  }

  /**
   * Check if a cursor is stale (no updates for 5 seconds) (Feature #106)
   * Per spec: Remote cursors fade to gray when stale
   */
  isCursorStale(cursor: RemoteCursor): boolean {
    return Date.now() - cursor.lastUpdate > this.cursorStaleTimeout;
  }

  // ========== Participant Avatars (Feature #113) ==========
  /**
   * Get all participants including self (Feature #113, #114)
   * Per spec: Participant avatars in toolbar (max 5 shown + overflow count)
   * Per spec: Panel lists all participants with status (name, color, online status)
   */
  getAllParticipants(): Participant[] {
    const participants: Participant[] = [];

    // Add self first (always displayed)
    const selfName = this.getSelfDisplayName();
    participants.push({
      id: 'self',
      name: selfName,
      color: this.selfCursorColor,
      initials: this.getInitials(selfName),
      isSelf: true
    });

    // Add remote participants from remote cursors
    this.remoteCursors.forEach((cursor, connectionId) => {
      participants.push({
        id: connectionId,
        name: cursor.name || 'Anonymous',
        color: cursor.color,
        initials: this.getInitials(cursor.name || 'Anonymous'),
        isSelf: false
      });
    });

    return participants;
  }

  /**
   * Get display name for current user (Feature #113)
   */
  private getSelfDisplayName(): string {
    // For guests, use the guest session name
    if (this.isGuest && this.guestSession) {
      return this.guestSession.guestName;
    }

    // For authenticated users, try to get from ABP config state
    const currentUser = this.configState.getOne('currentUser');
    if (currentUser) {
      // Try display name first, then username, then email
      return (currentUser as any).name ||
             (currentUser as any).userName ||
             (currentUser as any).email?.split('@')[0] ||
             'You';
    }

    return 'You';
  }

  /**
   * Get initials from a name (1-2 characters) (Feature #113)
   */
  private getInitials(name: string): string {
    if (!name || name.length === 0) {
      return '?';
    }

    // Split by spaces and get first letter of each word
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }

    // Single word - use first 1-2 characters
    return name.substring(0, Math.min(2, name.length)).toUpperCase();
  }

  /**
   * Get participants to display (max 5) (Feature #113)
   * Per spec: max 5 shown + overflow count
   */
  getDisplayedParticipants(): Participant[] {
    const all = this.getAllParticipants();
    return all.slice(0, this.MAX_DISPLAYED_AVATARS);
  }

  /**
   * Get count of participants not displayed (Feature #113)
   */
  getOverflowCount(): number {
    const all = this.getAllParticipants();
    return Math.max(0, all.length - this.MAX_DISPLAYED_AVATARS);
  }

  /**
   * TrackBy function for participant ngFor (Feature #113)
   */
  trackParticipantById(index: number, participant: Participant): string {
    return participant.id;
  }

  /**
   * Toggle participant panel visibility (Feature #114)
   * Per spec: Participant panel shows all connected users
   */
  toggleParticipantPanel(): void {
    this.isParticipantPanelOpen = !this.isParticipantPanelOpen;
    console.log('[Participants] Panel toggled:', this.isParticipantPanelOpen ? 'open' : 'closed');
  }

  /**
   * Close participant panel (Feature #114)
   */
  closeParticipantPanel(): void {
    this.isParticipantPanelOpen = false;
    console.log('[Participants] Panel closed');
  }

  /**
   * Broadcast local cursor position to other participants (Feature #106)
   * Per spec: Cursor position sync (throttled ~30fps)
   */
  private broadcastCursorPosition(opt: fabric.TPointerEventInfo<fabric.TPointerEvent>): void {
    // Throttle cursor updates to ~30fps (every 33ms)
    const now = Date.now();
    if (now - this.lastCursorUpdateTime < this.CURSOR_THROTTLE_MS) {
      return;
    }
    this.lastCursorUpdateTime = now;

    // Get canvas coordinates (not screen coordinates)
    // Other participants will convert to their own screen coordinates based on their viewport
    const pointer = this.canvas!.getViewportPoint(opt.e);

    // Send cursor position via SignalR
    this.signalRService.updateCursor(pointer.x, pointer.y).catch(error => {
      // Don't log every error - cursor updates are frequent and connection issues
      // will be handled by the connection status indicator
    });
  }

  /**
   * Start the auto-save timer that runs every 5 seconds
   * The timer checks if there are unsaved changes and triggers a save
   */
  private startAutoSaveTimer(): void {
    // Clear any existing timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    console.log('[AutoSave] Starting auto-save timer (5 second interval)');

    // Set up the 5-second interval timer
    this.autoSaveTimer = setInterval(() => {
      this.performAutoSave();
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Perform auto-save operation
   * This is called every 5 seconds to check and save any dirty elements
   */
  private performAutoSave(): void {
    // If there are pending save operations, skip this cycle
    if (this.pendingSaveCount > 0) {
      console.log('[AutoSave] Save already in progress, skipping');
      return;
    }

    // If there are unsaved changes, they will be saved immediately
    // This auto-save acts as a safety net for any changes that might have been missed
    // In the current implementation, changes are saved immediately, so this mainly
    // serves to update the "last saved" timestamp and provide user feedback

    // Update last save time if no pending operations
    if (this.pendingSaveCount === 0 && !this.isSaving) {
      this.lastSaveTime = new Date();
      console.log('[AutoSave] Auto-save check complete at', this.lastSaveTime.toISOString());
    }
  }

  /**
   * Mark that changes have been made (call this when canvas is modified)
   */
  private markDirty(): void {
    this.hasUnsavedChanges = true;
  }

  /**
   * Mark that changes have been saved
   */
  private markSaved(): void {
    this.hasUnsavedChanges = false;
    this.lastSaveTime = new Date();
  }

  // Load elements from database
  private loadElements(): void {
    if (!this.board) return;

    this.boardService.getElements(this.board.id).subscribe({
      next: (elements: BoardElementDto[]) => {
        this.elementLoadCount = elements.length;
        this.nextZIndex = elements.length > 0
          ? Math.max(...elements.map(e => e.zIndex)) + 1
          : 0;

        // Only render elements from database - no demo elements
        this.renderElements(elements);
      },
      error: (err) => {
        console.error('Failed to load elements:', err);
      }
    });
  }

  // Add demo elements for testing marquee selection
  private addDemoElements(): void {
    if (!this.canvas) return;

    // Add a blue rectangle
    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 150,
      height: 100,
      fill: '#3b82f6',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      selectable: true,
      hasControls: true,
      hasBorders: true
    });

    // Add a green circle
    const circle = new fabric.Circle({
      left: 300,
      top: 100,
      radius: 50,
      fill: '#22c55e',
      stroke: '#16a34a',
      strokeWidth: 2,
      selectable: true,
      hasControls: true,
      hasBorders: true
    });

    // Add a text element
    const text = new fabric.IText('Hello SketchFlow', {
      left: 100,
      top: 250,
      fontSize: 24,
      fill: '#000000',
      fontFamily: 'Inter, sans-serif',
      selectable: true,
      hasControls: true,
      hasBorders: true
    });

    // Add a purple triangle
    const triangle = new fabric.Triangle({
      left: 350,
      top: 250,
      width: 100,
      height: 100,
      fill: '#a855f7',
      stroke: '#7e22ce',
      strokeWidth: 2,
      selectable: true,
      hasControls: true,
      hasBorders: true
    });

    this.canvas.add(rect, circle, text, triangle);
    this.canvas.renderAll();
  }

  // Render elements loaded from database
  private renderElements(elements: BoardElementDto[]): void {
    if (!this.canvas) return;

    // Sort by zIndex to render in correct order
    elements.sort((a, b) => a.zIndex - b.zIndex);

    elements.forEach((element) => {
      try {
        const data: ElementDataJson = JSON.parse(element.elementData);
        const fabricObj = this.elementDataToFabricObject(data);

        if (fabricObj) {
          // Store element ID on the Fabric object
          (fabricObj as any)._elementId = element.id;
          this.elementMap.set(element.id, fabricObj);

          // Set selection state based on current tool
          fabricObj.selectable = this.currentTool === 'select';
          fabricObj.evented = this.currentTool === 'select';

          this.canvas!.add(fabricObj);
        }
      } catch (e) {
        console.error('Failed to parse element data:', e);
      }
    });

    this.canvas.renderAll();
  }

  // Convert element data JSON to Fabric.js object
  private elementDataToFabricObject(data: ElementDataJson): fabric.FabricObject | null {
    switch (data.type) {
      case 'stroke':
        if (data.points && data.points.length > 0) {
          let pathStr = `M ${data.points[0][0]} ${data.points[0][1]}`;
          for (let i = 1; i < data.points.length; i++) {
            pathStr += ` L ${data.points[i][0]} ${data.points[i][1]}`;
          }
          return new fabric.Path(pathStr, {
            stroke: data.color,
            strokeWidth: data.thickness || 4,
            fill: '',
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: true,
            hasControls: true,
            hasBorders: true
          });
        }
        return null;

      case 'rectangle':
        return new fabric.Rect({
          left: data.x || 0,
          top: data.y || 0,
          width: data.width || 100,
          height: data.height || 100,
          stroke: data.color,
          strokeWidth: data.thickness || 4,
          fill: data.fillColor || 'transparent',
          selectable: true,
          hasControls: true,
          hasBorders: true
        });

      case 'circle':
        return new fabric.Circle({
          left: (data.cx || 0) - (data.radius || 50),
          top: (data.cy || 0) - (data.radius || 50),
          radius: data.radius || 50,
          stroke: data.color,
          strokeWidth: data.thickness || 4,
          fill: data.fillColor || 'transparent',
          selectable: true,
          hasControls: true,
          hasBorders: true
        });

      case 'text':
        return new fabric.IText(data.content || '', {
          left: data.x || 0,
          top: data.y || 0,
          fontSize: data.fontSize || 20,
          fill: data.color,
          fontFamily: 'Inter, sans-serif',
          selectable: true,
          hasControls: true,
          hasBorders: true
        });

      default:
        return null;
    }
  }

  // Save a new element to the database
  // Per spec (Feature #103): "Local drawing continues while offline (in-memory queue)"
  // Elements are added to canvas first, then saved to DB. If offline, they're queued for later sync.
  private saveNewElement(obj: fabric.FabricObject, type: 'stroke' | 'rectangle' | 'circle' | 'text'): void {
    if (!this.board) return;

    const elementData = this.fabricObjectToElementData(obj, type);
    const elementDataStr = JSON.stringify(elementData);
    const zIndex = this.nextZIndex++;

    // Generate a temporary ID for the element (used for tracking before server assigns real ID)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    (obj as any)._tempId = tempId;

    // The element is already on the canvas (added before this method is called)
    // Increment element count immediately so user sees it
    this.elementLoadCount++;

    const dto: CreateBoardElementDto = {
      elementData: elementDataStr,
      zIndex: zIndex
    };

    // Check if offline - if so, queue the operation instead of sending to server
    // Per spec: "Local drawing continues while offline (in-memory queue)"
    if (!this.offlineQueueService.isOnline) {
      console.log('[Offline] Queuing create operation for element (temp id:', tempId, ')');

      // Queue the operation for later sync
      const queuedOp = this.offlineQueueService.enqueue(
        'create',
        this.board.id,
        tempId, // Use temp ID as element reference
        elementDataStr,
        zIndex
      );

      // Store the queued operation ID on the object for later reference
      (obj as any)._queuedOpId = queuedOp.id;

      // Mark as dirty (needs sync)
      this.markDirty();

      // Record in history for undo support (using temp ID)
      this.recordHistory({
        actionType: 'create',
        elementId: tempId,
        fabricObject: obj,
        elementData: elementDataStr,
        zIndex: zIndex
      });

      return; // Don't attempt network request when offline
    }

    // Track pending save operation
    this.isSaving = true;
    this.pendingSaveCount++;
    this.markDirty();

    console.log('[AutoSave] Saving new element...');

    this.boardService.createElement(this.board.id, dto).subscribe({
      next: (savedElement) => {
        // Store mapping of element ID to Fabric object
        (obj as any)._elementId = savedElement.id;
        delete (obj as any)._tempId; // Remove temp ID now that we have real ID
        this.elementMap.set(savedElement.id, obj);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
        this.markSaved();

        console.log('[AutoSave] Element saved successfully, id:', savedElement.id);

        // Record in history for undo support
        this.recordHistory({
          actionType: 'create',
          elementId: savedElement.id,
          fabricObject: obj,
          elementData: elementDataStr,
          zIndex: zIndex
        });

        // Feature #108: Broadcast element creation to other participants via SignalR
        // Per spec: "Element creation broadcasts to participants"
        this.signalRService.createElement({
          id: savedElement.id,
          elementData: elementDataStr,
          zIndex: zIndex
        }).catch(err => console.error('[SignalR] Failed to broadcast element creation:', err));
      },
      error: (err) => {
        console.error('Failed to save element:', err);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;

        // On network error, queue the operation for later sync
        // Per spec: "Local drawing continues while offline"
        // The element is already visible on canvas - don't remove it
        console.log('[Offline] Save failed, queuing create operation for later sync');

        const queuedOp = this.offlineQueueService.enqueue(
          'create',
          this.board!.id,
          tempId,
          elementDataStr,
          zIndex
        );
        (obj as any)._queuedOpId = queuedOp.id;

        // Record in history for undo support (using temp ID)
        this.recordHistory({
          actionType: 'create',
          elementId: tempId,
          fabricObject: obj,
          elementData: elementDataStr,
          zIndex: zIndex
        });
      }
    });
  }

  // Save element updates to the database
  // Per spec (Feature #103): "Local drawing continues while offline (in-memory queue)"
  // Updates are applied locally first, then synced to server. If offline, they're queued.
  private saveElementUpdate(obj: fabric.FabricObject): void {
    if (!this.board) return;

    const elementId = (obj as any)._elementId;
    const tempId = (obj as any)._tempId;

    // If the element doesn't have an ID yet (offline-created element), skip update
    // The create operation will include the latest state when synced
    if (!elementId && !tempId) return;

    const type = this.getObjectType(obj);
    const elementData = this.fabricObjectToElementData(obj, type);
    const elementDataStr = JSON.stringify(elementData);

    // If this is an offline-created element (has tempId but no elementId), update the queued create operation
    if (!elementId && tempId) {
      console.log('[Offline] Updating queued create operation for temp element:', tempId);
      // The element will be created with the latest state when synced
      return;
    }

    // Check if offline - if so, queue the update operation
    // Per spec: "Local drawing continues while offline (in-memory queue)"
    if (!this.offlineQueueService.isOnline) {
      console.log('[Offline] Queuing update operation for element:', elementId);

      // Queue the operation for later sync (last-write-wins per spec)
      this.offlineQueueService.enqueue(
        'update',
        this.board.id,
        elementId,
        elementDataStr
      );

      this.markDirty();
      return; // Don't attempt network request when offline
    }

    // Track pending save operation
    this.isSaving = true;
    this.pendingSaveCount++;
    this.markDirty();

    console.log('[AutoSave] Updating element:', elementId);

    this.boardService.updateElement(this.board.id, elementId, {
      elementData: elementDataStr
    }).subscribe({
      next: () => {
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
        this.markSaved();
        console.log('[AutoSave] Element updated successfully');

        // Broadcast update to other participants via SignalR (Feature #109)
        // Per spec: "Element updates broadcast to participants - Moving/resizing elements syncs to all users"
        const updateData = JSON.parse(elementDataStr);
        this.signalRService.updateElement(elementId, updateData);
        console.log('[SignalR] Broadcasting element update:', elementId);
      },
      error: (err) => {
        console.error('Failed to update element:', err);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;

        // On network error, queue the operation for later sync
        // Per spec: "Local drawing continues while offline"
        // The element change is already visible on canvas
        console.log('[Offline] Update failed, queuing for later sync');

        this.offlineQueueService.enqueue(
          'update',
          this.board!.id,
          elementId,
          elementDataStr
        );
      }
    });
  }

  /**
   * Sync queued changes when connection is restored
   * Per spec (Feature #104): "Sync queued changes on reconnect"
   *
   * This method:
   * 1. Gets all queued operations for the current board
   * 2. Processes them in order (create, update, delete)
   * 3. Dequeues each operation after successful sync
   * 4. Shows "Back online" success toast
   */
  private async syncQueuedChanges(): Promise<void> {
    if (!this.board || this.isSyncingQueue) {
      return;
    }

    const queuedOps = this.offlineQueueService.getQueueForBoard(this.board.id);

    if (queuedOps.length === 0) {
      console.log('[Sync] No queued operations to sync');
      // Still show "Back online" toast even if no queued operations
      this.toastService.showBackOnline();
      this.wasDisconnected = false;
      return;
    }

    console.log(`[Sync] Starting sync of ${queuedOps.length} queued operations`);
    this.isSyncingQueue = true;

    // Process operations in timestamp order (oldest first)
    const sortedOps = this.offlineQueueService.getOperationsForSync()
      .filter(op => op.boardId === this.board!.id);

    let successCount = 0;
    let errorCount = 0;

    for (const op of sortedOps) {
      try {
        await this.processSyncOperation(op);
        this.offlineQueueService.dequeue(op.id);
        successCount++;
        console.log(`[Sync] Successfully synced operation: ${op.type} ${op.elementId || 'new element'}`);
      } catch (err) {
        errorCount++;
        console.error(`[Sync] Failed to sync operation: ${op.type}`, err);
        // Don't dequeue failed operations - they'll be retried on next reconnect
      }
    }

    this.isSyncingQueue = false;
    this.wasDisconnected = false;

    // Show "Back online" success toast
    // Per spec: "Verify 'Back online' success toast appears"
    if (successCount > 0) {
      console.log(`[Sync] Sync completed: ${successCount} successful, ${errorCount} failed`);
      this.toastService.showBackOnline();
    } else if (errorCount === 0) {
      // No errors but also no successful syncs - still show back online
      this.toastService.showBackOnline();
    } else {
      // Some operations failed - show warning
      this.toastService.warning(`Back online. ${errorCount} change(s) couldn't be synced.`);
    }

    // Mark saved if no errors
    if (errorCount === 0) {
      this.markSaved();
    }
  }

  /**
   * Process a single queued operation
   */
  private processSyncOperation(op: QueuedOperation): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.board) {
        reject(new Error('No board loaded'));
        return;
      }

      switch (op.type) {
        case 'create':
          if (!op.elementData) {
            reject(new Error('No element data for create operation'));
            return;
          }
          this.boardService.createElement(this.board.id, {
            elementData: op.elementData,
            zIndex: op.zIndex
          }).subscribe({
            next: (savedElement) => {
              // Update the fabric object with the server-assigned ID
              // Find the object by its temp ID and update it
              if (op.elementId) {
                this.canvas?.getObjects().forEach(obj => {
                  if ((obj as any)._tempId === op.elementId) {
                    (obj as any)._elementId = savedElement.id;
                    this.elementMap.set(savedElement.id, obj);
                    console.log(`[Sync] Updated temp element ${op.elementId} with server ID ${savedElement.id}`);
                  }
                });
              }
              resolve();
            },
            error: (err) => reject(err)
          });
          break;

        case 'update':
          if (!op.elementId || !op.elementData) {
            reject(new Error('Missing element ID or data for update operation'));
            return;
          }
          this.boardService.updateElement(this.board.id, op.elementId, {
            elementData: op.elementData
          }).subscribe({
            next: () => resolve(),
            error: (err) => reject(err)
          });
          break;

        case 'delete':
          if (!op.elementId) {
            reject(new Error('Missing element ID for delete operation'));
            return;
          }
          this.boardService.deleteElements(this.board.id, [op.elementId]).subscribe({
            next: () => resolve(),
            error: (err) => reject(err)
          });
          break;

        default:
          reject(new Error(`Unknown operation type: ${op.type}`));
      }
    });
  }

  // Get element type from Fabric.js object
  private getObjectType(obj: fabric.FabricObject): 'stroke' | 'rectangle' | 'circle' | 'text' {
    if (obj instanceof fabric.Path) return 'stroke';
    if (obj instanceof fabric.Rect) return 'rectangle';
    if (obj instanceof fabric.Circle) return 'circle';
    if (obj instanceof fabric.IText || obj instanceof fabric.Text) return 'text';
    return 'stroke';
  }

  // Convert Fabric.js object to element data JSON
  private fabricObjectToElementData(obj: fabric.FabricObject, type: 'stroke' | 'rectangle' | 'circle' | 'text'): ElementDataJson {
    const base: ElementDataJson = {
      v: 1,
      type: type,
      color: String(obj.stroke || obj.fill || '#000000'),
      thickness: obj.strokeWidth || 4
    };

    if (type === 'stroke' && obj instanceof fabric.Path) {
      const points: number[][] = [];
      const pathData = obj.path as any[];
      if (pathData) {
        pathData.forEach((segment) => {
          if (segment[0] === 'M' || segment[0] === 'L') {
            points.push([segment[1] as number, segment[2] as number]);
          }
        });
      }
      base.points = points;
    } else if (type === 'rectangle' && obj instanceof fabric.Rect) {
      base.x = obj.left || 0;
      base.y = obj.top || 0;
      base.width = obj.width || 0;
      base.height = obj.height || 0;
      base.fillColor = String(obj.fill) || 'transparent';
    } else if (type === 'circle' && obj instanceof fabric.Circle) {
      base.cx = (obj.left || 0) + (obj.radius || 0);
      base.cy = (obj.top || 0) + (obj.radius || 0);
      base.radius = obj.radius || 50;
      base.fillColor = String(obj.fill) || 'transparent';
    } else if (type === 'text' && (obj instanceof fabric.IText || obj instanceof fabric.Text)) {
      base.x = obj.left || 0;
      base.y = obj.top || 0;
      base.content = obj.text || '';
      base.fontSize = obj.fontSize || 20;
      base.color = String(obj.fill) || '#000000';
    }

    return base;
  }

  private handleMouseDown(opt: fabric.TPointerEventInfo<fabric.TPointerEvent>): void {
    if (!this.canvas) {
      return;
    }

    // Skip drawing if two-finger touch panning is active (per spec: elements do not draw during pan)
    if (this.isTouchPanning) {
      return;
    }

    // Handle Space+drag panning (per spec: Space+drag pans the canvas)
    if (this.isSpacePressed) {
      this.isPanning = true;
      const e = opt.e as MouseEvent;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.defaultCursor = 'grabbing';
      this.canvas.hoverCursor = 'grabbing';
      console.log('[Canvas] Started panning');
      return;
    }

    // Handle Shift+click for multi-selection in select mode
    if (this.currentTool === 'select' && opt.e.shiftKey && opt.target) {
      this.handleShiftClickSelection(opt.target);
      return;
    }

    // If in select mode without shift, let fabric handle normal selection
    if (this.currentTool === 'select') {
      return;
    }

    const pointer = this.canvas.getViewportPoint(opt.e);
    this.isDrawing = true;
    this.startX = pointer.x;
    this.startY = pointer.y;

    if (this.currentTool === 'rectangle') {
      this.currentShape = new fabric.Rect({
        left: this.startX,
        top: this.startY,
        width: 0,
        height: 0,
        fill: this.currentFillColor || 'transparent',
        stroke: this.currentColor,
        strokeWidth: this.currentThickness,
        selectable: true,
        hasControls: true,
        hasBorders: true
      });
      this.canvas.add(this.currentShape);
    } else if (this.currentTool === 'circle') {
      this.currentShape = new fabric.Circle({
        left: this.startX,
        top: this.startY,
        radius: 0,
        fill: this.currentFillColor || 'transparent',
        stroke: this.currentColor,
        strokeWidth: this.currentThickness,
        selectable: true,
        hasControls: true,
        hasBorders: true
      });
      this.canvas.add(this.currentShape);
    } else if (this.currentTool === 'text') {
      const text = new fabric.IText('Type here', {
        left: this.startX,
        top: this.startY,
        fontSize: 20,
        fill: this.currentColor,
        fontFamily: 'Inter, sans-serif',
        selectable: true,
        hasControls: true,
        hasBorders: true
      });
      this.canvas.add(text);
      this.canvas.setActiveObject(text);
      text.enterEditing();
      this.isDrawing = false;

      // Save text element when editing is exited
      text.on('editing:exited', () => {
        // Only save if this is a new element (no _elementId yet)
        if (!(text as any)._elementId) {
          this.saveNewElement(text, 'text');
        }
      });
    }
  }

  private handleMouseMove(opt: fabric.TPointerEventInfo<fabric.TPointerEvent>): void {
    if (!this.canvas) {
      return;
    }

    // Broadcast cursor position for remote participants (Feature #106: Remote cursor displays)
    // Per spec: Cursor position sync (throttled ~30fps)
    this.broadcastCursorPosition(opt);

    // Skip drawing if two-finger touch panning is active (per spec: elements do not draw during pan)
    if (this.isTouchPanning) {
      return;
    }

    // Handle panning when Space is held (per spec: Space+drag pans the canvas)
    if (this.isPanning && this.lastPanPoint) {
      const e = opt.e as MouseEvent;
      const deltaX = e.clientX - this.lastPanPoint.x;
      const deltaY = e.clientY - this.lastPanPoint.y;

      // Get current viewport transform
      const vpt = this.canvas.viewportTransform!;
      vpt[4] += deltaX;
      vpt[5] += deltaY;
      this.canvas.setViewportTransform(vpt);

      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.requestRenderAll();
      return;
    }

    // Normal drawing mode - need to be drawing and have a shape
    if (!this.isDrawing || !this.currentShape) {
      return;
    }

    const pointer = this.canvas.getViewportPoint(opt.e);

    if (this.currentTool === 'rectangle') {
      const rect = this.currentShape as fabric.Rect;
      const width = pointer.x - this.startX;
      const height = pointer.y - this.startY;

      if (width < 0) {
        rect.set({ left: pointer.x });
      }
      if (height < 0) {
        rect.set({ top: pointer.y });
      }

      rect.set({
        width: Math.abs(width),
        height: Math.abs(height)
      });
    } else if (this.currentTool === 'circle') {
      const circle = this.currentShape as fabric.Circle;
      const radius = Math.sqrt(
        Math.pow(pointer.x - this.startX, 2) +
        Math.pow(pointer.y - this.startY, 2)
      ) / 2;

      const centerX = (this.startX + pointer.x) / 2;
      const centerY = (this.startY + pointer.y) / 2;

      circle.set({
        left: centerX - radius,
        top: centerY - radius,
        radius: radius
      });
    }

    this.canvas.renderAll();
  }

  private handleMouseUp(_opt: fabric.TPointerEventInfo<fabric.TPointerEvent>): void {
    // Save the newly created shape to database
    if (this.isDrawing && this.currentShape) {
      if (this.currentTool === 'rectangle') {
        this.saveNewElement(this.currentShape, 'rectangle');
      } else if (this.currentTool === 'circle') {
        this.saveNewElement(this.currentShape, 'circle');
      }
    }

    this.isDrawing = false;
    this.currentShape = null;
  }

  private updateCanvasMode(): void {
    if (!this.canvas) return;

    if (this.currentTool === 'select') {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.canvas.forEachObject((obj) => {
        obj.selectable = true;
        obj.evented = true;
      });
    } else if (this.currentTool === 'pen') {
      this.canvas.isDrawingMode = true;
      this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
      this.canvas.freeDrawingBrush.color = this.currentColor;
      this.canvas.freeDrawingBrush.width = this.currentThickness;
      this.canvas.selection = false;
    } else {
      this.canvas.isDrawingMode = false;
      this.canvas.selection = false;
      this.canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
    }
  }

  selectTool(tool: CanvasTool): void {
    this.currentTool = tool;
    this.updateCanvasMode();

    // Deselect all objects when switching tools
    if (this.canvas && tool !== 'select') {
      this.canvas.discardActiveObject();
      this.canvas.renderAll();
    }
  }

  selectColor(color: string): void {
    this.currentColor = color;
    if (this.canvas?.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = color;
    }
  }

  selectFillColor(color: string | null): void {
    this.currentFillColor = color;
  }

  selectThickness(thickness: number): void {
    this.currentThickness = thickness;
    if (this.canvas?.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.width = thickness;
    }
  }

  getToolDisplayName(): string {
    const names: Record<CanvasTool, string> = {
      select: 'Selection (V)',
      pen: 'Pen (P)',
      rectangle: 'Rectangle (R)',
      circle: 'Circle (C)',
      text: 'Text (T)'
    };
    return names[this.currentTool];
  }

  /**
   * Get the status display text for the status bar
   * Per spec (Feature #103): Shows offline/queued status when applicable
   */
  getStatusDisplay(): string {
    if (this.offlineQueueCount > 0) {
      return 'Offline';
    }
    if (this.isSaving) {
      return 'Saving...';
    }
    return 'Saved';
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    // Handle Space key for panning (per spec: Space+drag pans the canvas)
    if (event.code === 'Space' && !this.isSpacePressed) {
      // Don't activate pan mode if typing in a text field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Don't activate pan mode if editing text in canvas
      const activeObject = this.canvas?.getActiveObject();
      if (activeObject instanceof fabric.IText && activeObject.isEditing) {
        return;
      }

      event.preventDefault();
      this.isSpacePressed = true;
      console.log('[Canvas] Space key pressed - pan mode enabled');

      // Change cursor to indicate pan mode
      if (this.canvas) {
        this.canvas.defaultCursor = 'grab';
        this.canvas.hoverCursor = 'grab';
      }
      return;
    }

    // Don't trigger shortcuts when typing in text (except for Ctrl combinations)
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      // Only allow Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y in text inputs for undo/redo
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
    }

    // Check if we're editing text in fabric (but still allow undo/redo)
    const activeObject = this.canvas?.getActiveObject();
    const isEditingText = activeObject instanceof fabric.IText && activeObject.isEditing;

    // Handle Undo: Ctrl+Z
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
      return;
    }

    // Handle Redo: Ctrl+Shift+Z or Ctrl+Y
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      this.redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    // Handle Select All: Ctrl+A
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAllObjects();
      return;
    }

    // Handle Zoom In: Ctrl++ or Ctrl+=
    if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      this.zoomIn();
      return;
    }

    // Handle Zoom Out: Ctrl+-
    if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      this.zoomOut();
      return;
    }

    // Handle Reset Zoom: Ctrl+0
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      this.resetZoom();
      return;
    }

    // Handle Fit Content in View: Ctrl+1
    if ((event.ctrlKey || event.metaKey) && event.key === '1') {
      event.preventDefault();
      this.fitContentInView();
      return;
    }

    // Handle Generate Component: Ctrl+G (Feature #117)
    // Per spec: "Ctrl+G: Generate (when selection active)"
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      if (this.selectedElementCount > 0) {
        this.onGenerateComponent();
      }
      return;
    }

    // Skip tool shortcuts if editing text
    if (isEditingText) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'v':
        this.selectTool('select');
        break;
      case 'p':
        this.selectTool('pen');
        break;
      case 'r':
        this.selectTool('rectangle');
        break;
      case 'c':
        this.selectTool('circle');
        break;
      case 't':
        this.selectTool('text');
        break;
      case 'delete':
      case 'backspace':
        this.deleteSelectedObjects();
        break;
      case 'escape':
        // Feature #129: Escape key closes code panel if open
        if (this.isCodePanelOpen) {
          this.closeCodePanel();
        } else if (this.canvas) {
          // Otherwise, deselect elements on canvas
          this.canvas.discardActiveObject();
          this.canvas.renderAll();
        }
        break;
      case 'arrowleft':
        event.preventDefault();
        this.moveSelectedElements(-this.getNudgeAmount(event.shiftKey), 0);
        break;
      case 'arrowright':
        event.preventDefault();
        this.moveSelectedElements(this.getNudgeAmount(event.shiftKey), 0);
        break;
      case 'arrowup':
        event.preventDefault();
        this.moveSelectedElements(0, -this.getNudgeAmount(event.shiftKey));
        break;
      case 'arrowdown':
        event.preventDefault();
        this.moveSelectedElements(0, this.getNudgeAmount(event.shiftKey));
        break;
    }
  }

  /**
   * Get the nudge amount for arrow key movement
   * @param shiftPressed - Whether shift key is held (for larger nudge)
   * @returns The number of pixels to nudge
   */
  private getNudgeAmount(shiftPressed: boolean): number {
    return shiftPressed ? 10 : 1;
  }

  /**
   * Move selected elements by the given delta
   * @param deltaX - Horizontal movement in pixels
   * @param deltaY - Vertical movement in pixels
   */
  private moveSelectedElements(deltaX: number, deltaY: number): void {
    if (!this.canvas) return;

    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length === 0) {
      console.log('[Canvas] No elements selected to move');
      return;
    }

    // Move each selected object
    activeObjects.forEach((obj) => {
      obj.set({
        left: (obj.left || 0) + deltaX,
        top: (obj.top || 0) + deltaY
      });
      obj.setCoords(); // Update object's coordinates for selection/hit testing
    });

    // Update the active selection if there is one (for group movement)
    const activeObject = this.canvas.getActiveObject();
    if (activeObject && activeObjects.length > 1) {
      activeObject.set({
        left: (activeObject.left || 0) + deltaX,
        top: (activeObject.top || 0) + deltaY
      });
      activeObject.setCoords();
    }

    this.canvas.requestRenderAll();

    // Save updates to database for each moved element
    activeObjects.forEach((obj) => {
      this.saveElementUpdate(obj);
    });

    console.log(`[Canvas] Moved ${activeObjects.length} element(s) by (${deltaX}, ${deltaY})`);
  }

  /**
   * Handle keyup events to detect when Space key is released
   * This ends pan mode and restores normal tool behavior
   */
  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space' && this.isSpacePressed) {
      this.isSpacePressed = false;
      this.isPanning = false;
      this.lastPanPoint = null;
      console.log('[Canvas] Space key released - pan mode disabled');

      // Restore default cursor
      if (this.canvas) {
        this.canvas.defaultCursor = 'default';
        this.canvas.hoverCursor = 'move';
      }
    }
  }

  @HostListener('window:resize')
  handleResize(): void {
    if (!this.canvas || !this.canvasWrapperRef) return;

    const wrapper = this.canvasWrapperRef.nativeElement;
    const rect = wrapper.getBoundingClientRect();

    this.canvas.setDimensions({
      width: rect.width,
      height: rect.height
    });

    this.canvas.renderAll();
  }

  /**
   * Select all objects on canvas (Ctrl+A)
   */
  private selectAllObjects(): void {
    if (!this.canvas) return;

    const allObjects = this.canvas.getObjects();
    if (allObjects.length === 0) {
      // No objects to select
      return;
    }

    if (allObjects.length === 1) {
      // Single object - set it as active
      this.canvas.setActiveObject(allObjects[0]);
    } else {
      // Multiple objects - create ActiveSelection
      const selection = new fabric.ActiveSelection(allObjects, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
    }

    this.canvas.requestRenderAll();
    this.selectedElementCount = this.canvas.getActiveObjects().length;
    console.log(`[Canvas] Selected all ${this.selectedElementCount} objects`);
  }

  /**
   * Handle Shift+click selection to add/remove objects from the current selection
   */
  private handleShiftClickSelection(target: fabric.FabricObject): void {
    if (!this.canvas) return;

    const activeObjects = this.canvas.getActiveObjects();

    if (activeObjects.includes(target)) {
      // Object is already selected - remove it from selection
      const newSelection = activeObjects.filter(obj => obj !== target);
      if (newSelection.length > 0) {
        if (newSelection.length === 1) {
          // Single object - set it as active
          this.canvas.setActiveObject(newSelection[0]);
        } else {
          // Multiple objects - create ActiveSelection
          const selection = new fabric.ActiveSelection(newSelection, { canvas: this.canvas });
          this.canvas.setActiveObject(selection);
        }
      } else {
        // No objects left - clear selection
        this.canvas.discardActiveObject();
      }
    } else {
      // Object is not selected - add it to selection
      const newSelection = [...activeObjects, target];
      if (newSelection.length === 1) {
        this.canvas.setActiveObject(newSelection[0]);
      } else {
        const selection = new fabric.ActiveSelection(newSelection, { canvas: this.canvas });
        this.canvas.setActiveObject(selection);
      }
    }

    this.canvas.requestRenderAll();
    this.selectedElementCount = this.canvas.getActiveObjects().length;
  }

  private deleteSelectedObjects(): void {
    if (!this.canvas || !this.board) return;

    const activeObjects = this.canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      // Collect element IDs to delete from database and record history
      const elementIds: string[] = [];

      activeObjects.forEach((obj) => {
        const elementId = (obj as any)._elementId;
        if (elementId) {
          elementIds.push(elementId);

          // Record delete action in history before removing
          const type = this.getObjectType(obj);
          const elementData = this.fabricObjectToElementData(obj, type);
          this.recordHistory({
            actionType: 'delete',
            elementId: elementId,
            fabricObject: obj,
            elementData: JSON.stringify(elementData),
            zIndex: this.nextZIndex - 1
          });

          this.elementMap.delete(elementId);
        }
        this.canvas!.remove(obj);
      });

      this.canvas.discardActiveObject();
      this.canvas.renderAll();

      // Delete from database if there are element IDs
      if (elementIds.length > 0) {
        this.isSaving = true;
        this.boardService.deleteElements(this.board.id, elementIds).subscribe({
          next: () => {
            this.isSaving = false;
            this.elementLoadCount -= elementIds.length;

            // Feature #110: Broadcast element deletion to other participants via SignalR
            // Per spec: "Element deletion broadcasts to participants"
            this.signalRService.deleteElements(elementIds)
              .catch(err => console.error('[SignalR] Failed to broadcast element deletion:', err));
          },
          error: (err) => {
            console.error('Failed to delete elements:', err);
            this.isSaving = false;
          }
        });
      }
    }
  }

  /**
   * Record an action in the undo history stack
   */
  private recordHistory(entry: HistoryEntry): void {
    // Don't record if we're currently executing an undo/redo
    if (this.isUndoRedoAction) return;

    this.undoStack.push(entry);

    // Limit stack size to MAX_HISTORY_SIZE (50 steps per spec)
    if (this.undoStack.length > this.MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    // Clear redo stack when a new action is recorded
    this.redoStack = [];
  }

  /**
   * Undo the last action (Ctrl+Z)
   */
  private undo(): void {
    if (!this.canvas || this.undoStack.length === 0) {
      console.log('Undo: Nothing to undo');
      return;
    }

    const entry = this.undoStack.pop()!;
    this.isUndoRedoAction = true;

    try {
      switch (entry.actionType) {
        case 'create':
          // Undo create = remove the element
          if (entry.fabricObject) {
            this.canvas.remove(entry.fabricObject);
            this.canvas.renderAll();
            this.elementLoadCount--;

            // Delete from database
            if (entry.elementId && this.board) {
              this.boardService.deleteElements(this.board.id, [entry.elementId]).subscribe({
                error: (err) => console.error('Failed to delete during undo:', err)
              });
              this.elementMap.delete(entry.elementId);
            }
          }
          break;

        case 'delete':
          // Undo delete = restore the element
          if (entry.fabricObject && entry.elementData) {
            this.canvas.add(entry.fabricObject);
            this.canvas.renderAll();
            this.elementLoadCount++;

            // Re-create in database
            if (this.board) {
              const dto = {
                elementData: entry.elementData,
                zIndex: entry.zIndex || this.nextZIndex++
              };
              this.boardService.createElement(this.board.id, dto).subscribe({
                next: (savedElement) => {
                  (entry.fabricObject as any)._elementId = savedElement.id;
                  entry.elementId = savedElement.id;
                  this.elementMap.set(savedElement.id, entry.fabricObject!);
                },
                error: (err) => console.error('Failed to restore during undo:', err)
              });
            }
          }
          break;

        case 'modify':
          // Undo modify = restore previous state
          // Not yet implemented (for MVP, focus on create/delete)
          break;
      }

      // Add to redo stack
      this.redoStack.push(entry);

    } finally {
      this.isUndoRedoAction = false;
    }
  }

  /**
   * Redo the last undone action (Ctrl+Shift+Z or Ctrl+Y)
   */
  private redo(): void {
    if (!this.canvas || this.redoStack.length === 0) {
      console.log('Redo: Nothing to redo');
      return;
    }

    const entry = this.redoStack.pop()!;
    this.isUndoRedoAction = true;

    try {
      switch (entry.actionType) {
        case 'create':
          // Redo create = add the element back
          if (entry.fabricObject && entry.elementData) {
            this.canvas.add(entry.fabricObject);
            this.canvas.renderAll();
            this.elementLoadCount++;

            // Re-create in database
            if (this.board) {
              const dto = {
                elementData: entry.elementData,
                zIndex: entry.zIndex || this.nextZIndex++
              };
              this.boardService.createElement(this.board.id, dto).subscribe({
                next: (savedElement) => {
                  (entry.fabricObject as any)._elementId = savedElement.id;
                  entry.elementId = savedElement.id;
                  this.elementMap.set(savedElement.id, entry.fabricObject!);
                },
                error: (err) => console.error('Failed to recreate during redo:', err)
              });
            }
          }
          break;

        case 'delete':
          // Redo delete = remove the element again
          if (entry.fabricObject) {
            this.canvas.remove(entry.fabricObject);
            this.canvas.renderAll();
            this.elementLoadCount--;

            // Delete from database
            if (entry.elementId && this.board) {
              this.boardService.deleteElements(this.board.id, [entry.elementId]).subscribe({
                error: (err) => console.error('Failed to delete during redo:', err)
              });
              this.elementMap.delete(entry.elementId);
            }
          }
          break;

        case 'modify':
          // Redo modify = apply the new state
          // Not yet implemented (for MVP, focus on create/delete)
          break;
      }

      // Add back to undo stack
      this.undoStack.push(entry);

    } finally {
      this.isUndoRedoAction = false;
    }
  }

  /**
   * Zoom in by one step (Ctrl++ or zoom in button)
   * Increases zoom level by ZOOM_STEP (10%)
   */
  zoomIn(): void {
    if (!this.canvas) return;

    const newZoom = Math.min(this.zoomLevel + this.ZOOM_STEP, this.MAX_ZOOM);
    this.setZoom(newZoom);
    console.log(`[Canvas] Zoom in: ${Math.round(this.zoomLevel * 100)}%`);
  }

  /**
   * Zoom out by one step (Ctrl+- or zoom out button)
   * Decreases zoom level by ZOOM_STEP (10%)
   */
  zoomOut(): void {
    if (!this.canvas) return;

    const newZoom = Math.max(this.zoomLevel - this.ZOOM_STEP, this.MIN_ZOOM);
    this.setZoom(newZoom);
    console.log(`[Canvas] Zoom out: ${Math.round(this.zoomLevel * 100)}%`);
  }

  /**
   * Reset zoom to 100% (Ctrl+0)
   */
  resetZoom(): void {
    if (!this.canvas) return;

    this.setZoom(1);
    console.log('[Canvas] Zoom reset to 100%');
  }

  /**
   * Fit all content in viewport (Ctrl+1)
   * Calculates bounding box of all objects and sets zoom/pan to show everything
   */
  fitContentInView(): void {
    if (!this.canvas) return;

    const objects = this.canvas.getObjects();
    if (objects.length === 0) {
      // No content to fit - just reset to center
      this.resetZoom();
      console.log('[Canvas] Fit content: No objects, reset to 100%');
      return;
    }

    // Get the bounding box that contains all objects
    const boundingBox = this.getObjectsBoundingBox(objects);
    if (!boundingBox) {
      this.resetZoom();
      return;
    }

    const { minX, minY, maxX, maxY } = boundingBox;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Add padding (10% on each side)
    const paddingFactor = 0.1;
    const paddedWidth = contentWidth * (1 + paddingFactor * 2);
    const paddedHeight = contentHeight * (1 + paddingFactor * 2);

    // Get canvas dimensions
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();

    // Calculate zoom to fit content with padding
    const zoomX = canvasWidth / paddedWidth;
    const zoomY = canvasHeight / paddedHeight;
    let fitZoom = Math.min(zoomX, zoomY);

    // Clamp zoom to valid range
    fitZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, fitZoom));

    // Calculate the center of the content
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    // Reset viewport transform first
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    // Apply zoom
    this.canvas.setZoom(fitZoom);
    this.zoomLevel = fitZoom;

    // Calculate the translation needed to center the content
    const vpCenter = this.canvas.getCenterPoint();
    const panX = vpCenter.x - contentCenterX * fitZoom;
    const panY = vpCenter.y - contentCenterY * fitZoom;

    // Get current viewport transform and apply pan
    const vpt = this.canvas.viewportTransform!;
    vpt[4] = panX;
    vpt[5] = panY;
    this.canvas.setViewportTransform(vpt);

    this.canvas.requestRenderAll();
    console.log(`[Canvas] Fit content in view: ${objects.length} objects, zoom: ${Math.round(fitZoom * 100)}%`);
  }

  /**
   * Calculate the bounding box that contains all given objects
   * @param objects - Array of fabric objects
   * @returns The bounding box coordinates or null if no valid objects
   */
  private getObjectsBoundingBox(objects: fabric.Object[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (objects.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const obj of objects) {
      // Get the bounding rect for each object (includes transformations)
      const boundingRect = obj.getBoundingRect();

      minX = Math.min(minX, boundingRect.left);
      minY = Math.min(minY, boundingRect.top);
      maxX = Math.max(maxX, boundingRect.left + boundingRect.width);
      maxY = Math.max(maxY, boundingRect.top + boundingRect.height);
    }

    if (minX === Infinity || minY === Infinity) return null;

    return { minX, minY, maxX, maxY };
  }

  /**
   * Set the canvas zoom level
   * @param zoom - The new zoom level (0.1 to 10)
   */
  private setZoom(zoom: number): void {
    if (!this.canvas) return;

    // Clamp zoom to valid range
    const clampedZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));

    // Get canvas center point for zoom
    const center = this.canvas.getCenterPoint();

    // Apply zoom centered on canvas center
    this.canvas.zoomToPoint(center, clampedZoom);
    this.zoomLevel = clampedZoom;

    this.canvas.requestRenderAll();
  }

  /**
   * Handle mouse wheel zoom
   * @param event - The wheel event
   */
  private handleMouseWheelZoom(event: WheelEvent): void {
    if (!this.canvas) return;

    event.preventDefault();
    event.stopPropagation();

    const delta = event.deltaY;
    let newZoom = this.zoomLevel;

    if (delta < 0) {
      // Scroll up = zoom in
      newZoom = Math.min(this.zoomLevel * 1.1, this.MAX_ZOOM);
    } else {
      // Scroll down = zoom out
      newZoom = Math.max(this.zoomLevel / 1.1, this.MIN_ZOOM);
    }

    // Get the point under the mouse for zoom centering
    const pointer = this.canvas.getViewportPoint(event);
    this.canvas.zoomToPoint(pointer, newZoom);
    this.zoomLevel = newZoom;

    this.canvas.requestRenderAll();
    console.log(`[Canvas] Mouse wheel zoom: ${Math.round(this.zoomLevel * 100)}%`);
  }

  /**
   * Set up touch event handlers for two-finger panning
   * Per spec: Two-finger drag pans on touch devices
   */
  private setupTouchHandlers(): void {
    if (!this.canvasWrapperRef) return;

    const wrapper = this.canvasWrapperRef.nativeElement;
    const upperCanvas = wrapper.querySelector('.upper-canvas') as HTMLCanvasElement;
    const targetElement = upperCanvas || wrapper;

    // Touch start - detect two-finger gesture
    targetElement.addEventListener('touchstart', (e: TouchEvent) => this.handleTouchStart(e), { passive: false });

    // Touch move - handle panning
    targetElement.addEventListener('touchmove', (e: TouchEvent) => this.handleTouchMove(e), { passive: false });

    // Touch end - stop panning
    targetElement.addEventListener('touchend', (e: TouchEvent) => this.handleTouchEnd(e), { passive: false });
    targetElement.addEventListener('touchcancel', (e: TouchEvent) => this.handleTouchEnd(e), { passive: false });

    console.log('[Canvas] Touch event handlers set up for two-finger panning');
  }

  /**
   * Handle touch start event
   * When two fingers are detected, initiate panning mode
   */
  private handleTouchStart(event: TouchEvent): void {
    if (!this.canvas) return;

    // Two-finger touch detected - start panning
    if (event.touches.length === 2) {
      // Prevent default to stop any drawing while panning
      event.preventDefault();

      this.isTouchPanning = true;

      // Calculate the midpoint between the two touches
      const midpoint = this.getTouchMidpoint(event.touches[0], event.touches[1]);
      this.lastTouchPanPoint = midpoint;

      // Store initial distance and zoom for pinch-to-zoom (Feature #93)
      this.initialTouchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
      this.initialTouchZoom = this.zoomLevel;

      // Disable canvas interactions during pan
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();

      console.log('[Canvas] Two-finger touch panning started');
    }
  }

  /**
   * Handle touch move event
   * Pan the canvas when two fingers are moving together
   * Pinch-to-zoom when fingers spread apart or come together (Feature #93)
   */
  private handleTouchMove(event: TouchEvent): void {
    if (!this.canvas) return;

    // Only handle when two fingers are down and we're in touch panning mode
    if (this.isTouchPanning && event.touches.length === 2 && this.lastTouchPanPoint) {
      // Prevent default to stop drawing and scrolling
      event.preventDefault();

      // Calculate the current midpoint
      const currentMidpoint = this.getTouchMidpoint(event.touches[0], event.touches[1]);

      // === PINCH-TO-ZOOM (Feature #93) ===
      // Calculate current distance between fingers
      const currentDistance = this.getTouchDistance(event.touches[0], event.touches[1]);

      if (this.initialTouchDistance && this.initialTouchZoom && currentDistance > 0) {
        // Calculate zoom scale based on finger distance ratio
        const scale = currentDistance / this.initialTouchDistance;
        let newZoom = this.initialTouchZoom * scale;

        // Clamp zoom to valid range (per spec: 0.1x to 10x)
        newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newZoom));

        // Only update if zoom actually changed
        if (Math.abs(newZoom - this.zoomLevel) > 0.001) {
          // Get the canvas element's bounding rect for coordinate conversion
          const canvasElement = this.canvas.getElement();
          const rect = canvasElement.getBoundingClientRect();

          // Convert midpoint to canvas coordinates
          const zoomPointX = currentMidpoint.x - rect.left;
          const zoomPointY = currentMidpoint.y - rect.top;

          // Apply zoom centered on pinch midpoint
          this.canvas.zoomToPoint(new fabric.Point(zoomPointX, zoomPointY), newZoom);
          this.zoomLevel = newZoom;

          console.log(`[Canvas] Pinch zoom: ${(newZoom * 100).toFixed(0)}%`);
        }
      }

      // === PANNING ===
      // Calculate the delta from last position
      const deltaX = currentMidpoint.x - this.lastTouchPanPoint.x;
      const deltaY = currentMidpoint.y - this.lastTouchPanPoint.y;

      // Apply panning to viewport transform
      const vpt = this.canvas.viewportTransform!;
      vpt[4] += deltaX;
      vpt[5] += deltaY;
      this.canvas.setViewportTransform(vpt);

      // Update last point
      this.lastTouchPanPoint = currentMidpoint;

      this.canvas.requestRenderAll();
    }
  }

  /**
   * Handle touch end event
   * Stop panning and pinch-zoom when fingers are lifted
   */
  private handleTouchEnd(event: TouchEvent): void {
    // Stop panning/zooming if less than 2 fingers are now touching
    if (this.isTouchPanning && event.touches.length < 2) {
      this.isTouchPanning = false;
      this.lastTouchPanPoint = null;
      this.initialTouchDistance = null;
      this.initialTouchZoom = null; // Reset pinch-zoom state (Feature #93)
      console.log('[Canvas] Two-finger touch gesture ended');
    }
  }

  /**
   * Calculate the midpoint between two touch points
   */
  private getTouchMidpoint(touch1: Touch, touch2: Touch): { x: number; y: number } {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }

  /**
   * Calculate the distance between two touch points
   * Used for pinch-to-zoom detection (Feature #93)
   */
  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  loadGuestSession(boardId: string | null): void {
    // Get guest session from localStorage
    const sessionData = localStorage.getItem('sketchflow_guest_session');

    if (!sessionData) {
      this.error = 'Guest session not found. Please join via a share link.';
      this.isLoading = false;
      return;
    }

    try {
      this.guestSession = JSON.parse(sessionData) as GuestSession;

      // Verify the board ID matches the session
      if (this.guestSession.boardId !== boardId) {
        this.error = 'Invalid guest session for this board.';
        this.isLoading = false;
        return;
      }

      // Feature #131: Initialize guest quota (5 generations per session per spec)
      this.initializeGuestQuota();

      // Load board using share token (anonymous endpoint)
      this.loadBoardByShareToken(this.guestSession.shareToken);
    } catch (e) {
      console.error('Failed to parse guest session:', e);
      this.error = 'Invalid guest session. Please join via a share link.';
      this.isLoading = false;
    }
  }

  /**
   * Initialize guest generation quota (Feature #131: Guest quota limited to 5 per session)
   * Per spec: "Guest: 5 generations per browser session"
   * Uses localStorage to persist generation count across page refreshes within the same session
   */
  private initializeGuestQuota(): void {
    // Set guest limit to 5 per spec
    this.generationsLimit = 5;
    console.log('[Quota] Initializing guest quota: limit = 5');

    // Load used generations from localStorage (tied to guest session)
    const guestId = this.guestSession?.guestId;
    if (guestId) {
      const storageKey = `sketchflow_guest_generations_${guestId}`;
      const storedCount = localStorage.getItem(storageKey);
      if (storedCount) {
        this.generationsUsed = parseInt(storedCount, 10) || 0;
        console.log('[Quota] Loaded guest generation count:', this.generationsUsed);
      } else {
        this.generationsUsed = 0;
        console.log('[Quota] New guest session, starting with 0 generations');
      }
    }
  }

  /**
   * Save guest generation count to localStorage (Feature #131)
   * Called after each successful generation for guests
   */
  private saveGuestGenerationCount(): void {
    if (!this.isGuest || !this.guestSession?.guestId) return;

    const storageKey = `sketchflow_guest_generations_${this.guestSession.guestId}`;
    localStorage.setItem(storageKey, this.generationsUsed.toString());
    console.log('[Quota] Saved guest generation count:', this.generationsUsed);
  }

  /**
   * Check if generation quota has been exceeded (Feature #131)
   * Per spec: "At limit: Generate button disabled, upgrade/wait prompt"
   */
  isQuotaExceeded(): boolean {
    return this.generationsUsed >= this.generationsLimit;
  }

  /**
   * Get the appropriate title for the Generate button (Feature #131)
   */
  getGenerateButtonTitle(): string {
    if (this.isGenerating) {
      return 'Generating...';
    }
    if (this.isQuotaExceeded()) {
      if (this.isGuest) {
        return `Limit reached (${this.generationsLimit} generations per session). Register for more!`;
      }
      return `Limit reached (${this.generationsLimit} generations per month). Upgrade for more!`;
    }
    return `Generate Component (Ctrl+G) - ${this.generationsLimit - this.generationsUsed} remaining`;
  }

  /**
   * Get the appropriate label for the Generate button (Feature #131)
   */
  getGenerateButtonLabel(): string {
    if (this.isGenerating) {
      return 'Generating...';
    }
    if (this.isQuotaExceeded()) {
      return 'Limit Reached';
    }
    return 'Generate Component';
  }

  loadBoardByShareToken(shareToken: string): void {
    this.boardService.getByShareToken(shareToken).subscribe({
      next: (board) => {
        if (board) {
          this.board = board;
          this.isLoading = false;
          // Initialize canvas after view is ready
          setTimeout(() => this.initializeCanvas(), 0);
        } else {
          this.error = 'Board not found or share link has expired.';
          this.isLoading = false;
        }
      },
      error: (err) => {
        console.error('Failed to load board:', err);
        this.error = 'Could not load this board. The share link may be invalid.';
        this.isLoading = false;
      }
    });
  }

  loadBoard(id: string): void {
    this.boardService.get(id).subscribe({
      next: (board) => {
        this.board = board;
        this.isLoading = false;
        // Initialize canvas after view is ready
        setTimeout(() => this.initializeCanvas(), 0);
      },
      error: (err) => {
        console.error('Failed to load board:', err);
        // Check if this might be a guest trying to access without proper session
        const sessionData = localStorage.getItem('sketchflow_guest_session');
        if (sessionData) {
          try {
            const guestSession = JSON.parse(sessionData) as GuestSession;
            if (guestSession.boardId === id) {
              // Redirect to guest mode
              this.isGuest = true;
              this.guestSession = guestSession;
              this.loadBoardByShareToken(guestSession.shareToken);
              return;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        this.error = 'Could not load this board. It may have been deleted or you may not have access.';
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    if (this.isGuest) {
      // Clear guest session and go home
      localStorage.removeItem('sketchflow_guest_session');
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  /**
   * Performance test method - generates 1000 elements programmatically
   * and measures frame rate during rendering, panning, and zooming.
   *
   * This can be called from browser console via:
   * ng.getComponent(document.querySelector('app-canvas')).runPerformanceTest()
   *
   * Per spec: "Smooth 60fps rendering up to 1000 elements"
   */
  runPerformanceTest(): void {
    if (!this.canvas) {
      console.error('[Performance Test] Canvas not initialized');
      return;
    }

    console.log('[Performance Test] Starting performance test with 1000 elements...');
    const startTime = performance.now();

    // Store initial element count
    const initialElementCount = this.canvas.getObjects().length;

    // Generate 1000 random elements across the canvas area
    const elements: fabric.FabricObject[] = [];
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();

    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * canvasWidth * 2 - canvasWidth / 2;
      const y = Math.random() * canvasHeight * 2 - canvasHeight / 2;
      const elementType = Math.floor(Math.random() * 3); // 0=rect, 1=circle, 2=text
      const color = this.colors[Math.floor(Math.random() * this.colors.length)].value;

      let element: fabric.FabricObject;

      switch (elementType) {
        case 0: // Rectangle
          element = new fabric.Rect({
            left: x,
            top: y,
            width: 50 + Math.random() * 100,
            height: 50 + Math.random() * 100,
            fill: color,
            stroke: '#000000',
            strokeWidth: 2,
            selectable: true,
            hasControls: true,
            hasBorders: true
          });
          break;
        case 1: // Circle
          element = new fabric.Circle({
            left: x,
            top: y,
            radius: 25 + Math.random() * 50,
            fill: color,
            stroke: '#000000',
            strokeWidth: 2,
            selectable: true,
            hasControls: true,
            hasBorders: true
          });
          break;
        case 2: // Text
        default:
          element = new fabric.IText(`Element ${i + 1}`, {
            left: x,
            top: y,
            fontSize: 12 + Math.random() * 16,
            fill: color,
            fontFamily: 'Inter, sans-serif',
            selectable: true,
            hasControls: true,
            hasBorders: true
          });
          break;
      }

      elements.push(element);
    }

    // Add all elements to canvas
    const addStartTime = performance.now();
    elements.forEach(el => this.canvas!.add(el));
    const addEndTime = performance.now();

    // Render the canvas
    const renderStartTime = performance.now();
    this.canvas.renderAll();
    const renderEndTime = performance.now();

    // Update element count display
    this.elementLoadCount = this.canvas.getObjects().length;

    const totalTime = performance.now() - startTime;

    console.log('[Performance Test] Results:');
    console.log(`  - Elements added: 1000 (total on canvas: ${this.elementLoadCount})`);
    console.log(`  - Element creation time: ${(addStartTime - startTime).toFixed(2)}ms`);
    console.log(`  - Canvas add time: ${(addEndTime - addStartTime).toFixed(2)}ms`);
    console.log(`  - Render time: ${(renderEndTime - renderStartTime).toFixed(2)}ms`);
    console.log(`  - Total time: ${totalTime.toFixed(2)}ms`);
    console.log('[Performance Test] Starting frame rate test (5 seconds of panning)...');

    // Frame rate measurement during panning
    let frameCount = 0;
    let lastFrameTime = performance.now();
    let testDuration = 5000; // 5 seconds
    let testStartTime = performance.now();
    let minFps = Infinity;
    let maxFps = 0;
    let fpsReadings: number[] = [];

    const measureFrameRate = () => {
      const currentTime = performance.now();
      const deltaTime = currentTime - lastFrameTime;

      if (deltaTime > 0) {
        const instantFps = 1000 / deltaTime;
        fpsReadings.push(instantFps);
        minFps = Math.min(minFps, instantFps);
        maxFps = Math.max(maxFps, instantFps);
      }

      frameCount++;
      lastFrameTime = currentTime;

      // Simulate panning by modifying viewport
      const vpt = this.canvas!.viewportTransform!;
      vpt[4] += Math.sin(currentTime / 200) * 2; // Oscillate pan position
      vpt[5] += Math.cos(currentTime / 200) * 2;
      this.canvas!.setViewportTransform(vpt);
      this.canvas!.requestRenderAll();

      if (currentTime - testStartTime < testDuration) {
        requestAnimationFrame(measureFrameRate);
      } else {
        // Test complete - report results
        const avgFps = fpsReadings.reduce((a, b) => a + b, 0) / fpsReadings.length;

        console.log('[Performance Test] Frame Rate Results:');
        console.log(`  - Frame count: ${frameCount}`);
        console.log(`  - Average FPS: ${avgFps.toFixed(1)}`);
        console.log(`  - Min FPS: ${minFps.toFixed(1)}`);
        console.log(`  - Max FPS: ${maxFps.toFixed(1)}`);
        console.log(`  - 60fps target: ${avgFps >= 55 ? 'PASS ✓' : 'FAIL ✗'}`);

        // Reset viewport to center
        this.canvas!.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.canvas!.renderAll();

        console.log('[Performance Test] Complete!');
        console.log(`[Performance Test] To clear test elements, call: clearPerformanceTestElements()`);

        // Store reference for cleanup
        (window as any).sketchflowTestElements = elements;
      }
    };

    requestAnimationFrame(measureFrameRate);
  }

  /**
   * Clear elements created by runPerformanceTest()
   * Call from browser console:
   * ng.getComponent(document.querySelector('app-canvas')).clearPerformanceTestElements()
   */
  clearPerformanceTestElements(): void {
    if (!this.canvas) {
      console.error('[Performance Test] Canvas not initialized');
      return;
    }

    const testElements = (window as any).sketchflowTestElements;
    if (!testElements || !Array.isArray(testElements)) {
      console.log('[Performance Test] No test elements to clear');
      return;
    }

    console.log(`[Performance Test] Removing ${testElements.length} test elements...`);
    testElements.forEach((el: fabric.FabricObject) => {
      this.canvas!.remove(el);
    });
    this.canvas.renderAll();
    this.elementLoadCount = this.canvas.getObjects().length;

    delete (window as any).sketchflowTestElements;
    console.log('[Performance Test] Test elements cleared');
  }
}
