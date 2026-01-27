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

          <!-- Color Picker -->
          <div class="tool-group">
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

    // Create Fabric.js canvas with marquee selection support
    this.canvas = new fabric.Canvas(this.canvasRef.nativeElement, {
      width: rect.width,
      height: rect.height,
      backgroundColor: '#ffffff',
      selection: true,                     // Enable group selection (marquee)
      selectionColor: 'rgba(99, 102, 241, 0.15)',     // Light indigo fill for selection box
      selectionBorderColor: '#6366f1',     // Indigo border for selection box
      selectionLineWidth: 2,               // Selection box border width
      selectionFullyContained: false,      // Select objects that intersect (not just fully contained)
      preserveObjectStacking: true
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
    const zIndex = this.nextZIndex++;

    const dto: CreateBoardElementDto = {
      elementData: JSON.stringify(elementData),
      zIndex: zIndex
    };

    this.isSaving = true;
    this.boardService.createElement(this.board.id, dto).subscribe({
      next: (savedElement) => {
        // Store mapping of element ID to Fabric object
        (obj as any)._elementId = savedElement.id;
        this.elementMap.set(savedElement.id, obj);
        this.isSaving = false;
        this.elementLoadCount++;
      },
      error: (err) => {
        console.error('Failed to save element:', err);
        this.isSaving = false;
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

    this.isSaving = true;
    this.boardService.updateElement(this.board.id, elementId, {
      elementData: JSON.stringify(elementData)
    }).subscribe({
      next: () => {
        this.isSaving = false;
      },
      error: (err) => {
        console.error('Failed to update element:', err);
        this.isSaving = false;
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
        fill: 'transparent',
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
        fill: 'transparent',
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
    if (!this.canvas || !this.isDrawing || !this.currentShape) {
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
    // Don't trigger shortcuts when typing in text
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Check if we're editing text in fabric
    const activeObject = this.canvas?.getActiveObject();
    if (activeObject instanceof fabric.IText && activeObject.isEditing) {
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
      // Collect element IDs to delete from database
      const elementIds: string[] = [];

      activeObjects.forEach((obj) => {
        const elementId = (obj as any)._elementId;
        if (elementId) {
          elementIds.push(elementId);
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
}
