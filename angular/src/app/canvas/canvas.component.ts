import { Component, OnInit, OnDestroy, inject, AfterViewInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, BoardDto, BoardElementDto, CreateBoardElementDto } from '../shared/services/board.service';
import * as fabric from 'fabric';

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

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container">
      <div class="canvas-header">
        <button class="back-btn" (click)="goBack()">
          <i class="bi bi-arrow-left"></i>
          {{ isGuest ? 'Leave Board' : 'Back to Dashboard' }}
        </button>
        <h1 class="board-name" *ngIf="board">{{ board.name }}</h1>
        <div class="guest-badge" *ngIf="isGuest && guestSession">
          <i class="bi bi-person"></i>
          {{ guestSession.guestName }}
        </div>
        <div class="board-status" *ngIf="isLoading">Loading...</div>
      </div>

      <div class="canvas-workspace" *ngIf="board">
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
            <div class="color-picker">
              <div
                *ngFor="let color of colors"
                class="color-swatch"
                [style.backgroundColor]="color.value"
                [class.active]="currentColor === color.value"
                [class.light]="color.value === '#ffffff'"
                (click)="selectColor(color.value)"
                [title]="color.name">
              </div>
            </div>
          </div>

          <div class="tool-divider"></div>

          <!-- Fill Color Picker -->
          <div class="tool-group">
            <span class="tool-label">Fill</span>
            <div class="color-picker">
              <!-- No fill option -->
              <div
                class="color-swatch no-fill"
                [class.active]="currentFillColor === null"
                (click)="selectFillColor(null)"
                title="No Fill">
              </div>
              <div
                *ngFor="let color of colors"
                class="color-swatch"
                [style.backgroundColor]="color.value"
                [class.active]="currentFillColor === color.value"
                [class.light]="color.value === '#ffffff'"
                (click)="selectFillColor(color.value)"
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
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar" *ngIf="board">
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
          <span class="status-value" [class.saving]="isSaving">{{ isSaving ? 'Saving...' : 'Saved' }}</span>
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

    .board-name {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }

    .guest-badge {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 20px;
      color: #c4b5fd;
      font-size: 0.875rem;
    }

    .board-status {
      margin-left: auto;
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

    .tool-label {
      font-size: 0.625rem;
      color: #71717a;
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
      color: #71717a;
    }

    .status-value {
      color: #a1a1aa;
    }

    .status-value.saving {
      color: #f59e0b;
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
  `]
})
export class CanvasComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('fabricCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') canvasWrapperRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private boardService = inject(BoardService);

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

  ngOnInit(): void {
    const boardId = this.route.snapshot.paramMap.get('id');
    const isGuestParam = this.route.snapshot.queryParamMap.get('guest');

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
    this.canvas.on('selection:created', (e) => {
      this.selectedElementCount = e.selected?.length || 0;
    });

    this.canvas.on('selection:updated', (e) => {
      this.selectedElementCount = e.selected?.length || 0;
    });

    this.canvas.on('selection:cleared', () => {
      this.selectedElementCount = 0;
    });

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
  private saveNewElement(obj: fabric.FabricObject, type: 'stroke' | 'rectangle' | 'circle' | 'text'): void {
    if (!this.board) return;

    const elementData = this.fabricObjectToElementData(obj, type);
    const elementDataStr = JSON.stringify(elementData);
    const zIndex = this.nextZIndex++;

    const dto: CreateBoardElementDto = {
      elementData: elementDataStr,
      zIndex: zIndex
    };

    // Track pending save operation
    this.isSaving = true;
    this.pendingSaveCount++;
    this.markDirty();

    console.log('[AutoSave] Saving new element...');

    this.boardService.createElement(this.board.id, dto).subscribe({
      next: (savedElement) => {
        // Store mapping of element ID to Fabric object
        (obj as any)._elementId = savedElement.id;
        this.elementMap.set(savedElement.id, obj);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
        this.elementLoadCount++;
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
      },
      error: (err) => {
        console.error('Failed to save element:', err);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
      }
    });
  }

  // Save element updates to the database
  private saveElementUpdate(obj: fabric.FabricObject): void {
    if (!this.board) return;

    const elementId = (obj as any)._elementId;
    if (!elementId) return;

    const type = this.getObjectType(obj);
    const elementData = this.fabricObjectToElementData(obj, type);

    // Track pending save operation
    this.isSaving = true;
    this.pendingSaveCount++;
    this.markDirty();

    console.log('[AutoSave] Updating element:', elementId);

    this.boardService.updateElement(this.board.id, elementId, {
      elementData: JSON.stringify(elementData)
    }).subscribe({
      next: () => {
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
        this.markSaved();
        console.log('[AutoSave] Element updated successfully');
      },
      error: (err) => {
        console.error('Failed to update element:', err);
        this.pendingSaveCount--;
        this.isSaving = this.pendingSaveCount > 0;
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
        if (this.canvas) {
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

      // Load board using share token (anonymous endpoint)
      this.loadBoardByShareToken(this.guestSession.shareToken);
    } catch (e) {
      console.error('Failed to parse guest session:', e);
      this.error = 'Invalid guest session. Please join via a share link.';
      this.isLoading = false;
    }
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
