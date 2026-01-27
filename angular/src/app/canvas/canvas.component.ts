import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, BoardDto } from '../shared/services/board.service';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container">
      <div class="canvas-header">
        <button class="back-btn" (click)="goBack()">
          <i class="bi bi-arrow-left"></i>
          Back to Dashboard
        </button>
        <h1 class="board-name" *ngIf="board">{{ board.name }}</h1>
        <div class="board-status" *ngIf="isLoading">Loading...</div>
      </div>
      <div class="canvas-area" *ngIf="board">
        <div class="canvas-placeholder">
          <i class="bi bi-easel2 placeholder-icon"></i>
          <h2>Canvas Coming Soon</h2>
          <p>Board ID: {{ board.id }}</p>
          <p>This is where the Fabric.js canvas will be implemented.</p>
        </div>
      </div>
      <div class="error-state" *ngIf="error">
        <i class="bi bi-exclamation-triangle"></i>
        <h2>Board Not Found</h2>
        <p>{{ error }}</p>
        <button class="btn-primary" (click)="goBack()">Return to Dashboard</button>
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

    .board-status {
      margin-left: auto;
      color: #a1a1aa;
    }

    .canvas-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas-placeholder {
      text-align: center;
      padding: 3rem;
      background: rgba(26, 26, 37, 0.6);
      border: 2px dashed rgba(99, 102, 241, 0.3);
      border-radius: 16px;
    }

    .placeholder-icon {
      font-size: 4rem;
      color: #6366f1;
      margin-bottom: 1rem;
    }

    .canvas-placeholder h2 {
      margin: 0 0 0.5rem;
      color: #ffffff;
    }

    .canvas-placeholder p {
      margin: 0.5rem 0;
      color: #a1a1aa;
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
export class CanvasComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private boardService = inject(BoardService);

  board: BoardDto | null = null;
  isLoading = true;
  error: string | null = null;

  ngOnInit(): void {
    const boardId = this.route.snapshot.paramMap.get('id');
    if (boardId) {
      this.loadBoard(boardId);
    } else {
      this.error = 'No board ID provided';
      this.isLoading = false;
    }
  }

  loadBoard(id: string): void {
    this.boardService.get(id).subscribe({
      next: (board) => {
        this.board = board;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load board:', err);
        this.error = 'Could not load this board. It may have been deleted or you may not have access.';
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
