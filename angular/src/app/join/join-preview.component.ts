import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardService, BoardDto } from '../shared/services/board.service';

@Component({
  selector: 'app-join-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="join-container">
      <!-- Loading State -->
      <div class="join-card loading-state" *ngIf="isLoading">
        <div class="loading-spinner"></div>
        <p>Loading board information...</p>
      </div>

      <!-- Error State (Invalid Share Link) -->
      <div class="join-card error-state" *ngIf="error && !isLoading">
        <i class="bi bi-exclamation-triangle error-icon"></i>
        <h2>Invalid Share Link</h2>
        <p class="error-message">{{ error }}</p>
        <button class="btn-secondary" (click)="goHome()">Go to Home</button>
      </div>

      <!-- Join Preview State -->
      <div class="join-card preview-state" *ngIf="board && !isLoading && !error">
        <div class="board-preview">
          <div class="board-icon">
            <i class="bi bi-easel2"></i>
          </div>
          <h1 class="board-name">{{ board.name }}</h1>
          <div class="board-info">
            <div class="board-owner">
              <i class="bi bi-person-circle"></i>
              <span>{{ board.ownerName }}</span>
            </div>
            <div class="board-participants">
              <i class="bi bi-people"></i>
              <span>{{ board.participantCount }} {{ board.participantCount === 1 ? 'participant' : 'participants' }}</span>
            </div>
          </div>
        </div>

        <div class="join-form">
          <label for="guestName" class="form-label">Enter your name to join</label>
          <input
            type="text"
            id="guestName"
            class="form-input"
            [(ngModel)]="guestName"
            placeholder="Your name"
            maxlength="100"
            (keyup.enter)="joinBoard()"
            autofocus
          />
          <p class="form-hint" *ngIf="guestName.length > 0 && guestName.length < 2">
            Name must be at least 2 characters
          </p>
        </div>

        <button
          class="btn-primary join-btn"
          (click)="joinBoard()"
          [disabled]="!canJoin || isJoining"
        >
          <span *ngIf="!isJoining">Join Board</span>
          <span *ngIf="isJoining">
            <span class="spinner-small"></span>
            Joining...
          </span>
        </button>

        <div class="guest-notice">
          <i class="bi bi-info-circle"></i>
          <span>You're joining as a guest. <a routerLink="/account/login">Sign in</a> for more features.</span>
        </div>
      </div>

      <!-- Background decoration -->
      <div class="bg-decoration"></div>
    </div>
  `,
  styles: [`
    .join-container {
      min-height: 100vh;
      background: #0a0a0f;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
    }

    .bg-decoration {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                  radial-gradient(circle at 70% 70%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }

    .join-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 420px;
      background: rgba(26, 26, 37, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 2.5rem;
      text-align: center;
    }

    /* Loading State */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .loading-state p {
      color: #a1a1aa;
      margin: 0;
    }

    /* Error State */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .error-icon {
      font-size: 3rem;
      color: #ef4444;
    }

    .error-state h2 {
      margin: 0;
      color: #ffffff;
      font-size: 1.5rem;
    }

    .error-message {
      color: #a1a1aa;
      margin: 0;
    }

    /* Preview State */
    .board-preview {
      margin-bottom: 2rem;
    }

    .board-icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }

    .board-icon i {
      font-size: 2.5rem;
      color: #a5b4fc;
    }

    .board-name {
      font-size: 1.75rem;
      font-weight: 600;
      color: #ffffff;
      margin: 0 0 0.5rem;
    }

    .board-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      margin-top: 0.75rem;
    }

    .board-owner,
    .board-participants {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #a1a1aa;
      font-size: 0.875rem;
    }

    .board-owner i,
    .board-participants i {
      font-size: 1rem;
      color: #71717a;
    }

    /* Join Form */
    .join-form {
      margin-bottom: 1.5rem;
      text-align: left;
    }

    .form-label {
      display: block;
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .form-input {
      width: 100%;
      padding: 0.875rem 1rem;
      background: rgba(10, 10, 15, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #ffffff;
      font-size: 1rem;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }

    .form-input::placeholder {
      color: #71717a;
    }

    .form-input:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }

    .form-hint {
      margin: 0.5rem 0 0;
      color: #f59e0b;
      font-size: 0.75rem;
    }

    /* Buttons */
    .btn-primary {
      width: 100%;
      padding: 0.875rem 1.5rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      border-radius: 8px;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .btn-secondary {
      padding: 0.75rem 1.5rem;
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 8px;
      color: #a5b4fc;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: rgba(99, 102, 241, 0.3);
    }

    .spinner-small {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      display: inline-block;
    }

    /* Guest Notice */
    .guest-notice {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #71717a;
      font-size: 0.8125rem;
    }

    .guest-notice a {
      color: #a5b4fc;
      text-decoration: none;
    }

    .guest-notice a:hover {
      text-decoration: underline;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 480px) {
      .join-card {
        padding: 1.5rem;
      }

      .board-name {
        font-size: 1.5rem;
      }
    }
  `]
})
export class JoinPreviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private boardService = inject(BoardService);

  board: BoardDto | null = null;
  isLoading = true;
  isJoining = false;
  error: string | null = null;
  guestName = '';

  get canJoin(): boolean {
    return this.guestName.trim().length >= 2;
  }

  ngOnInit(): void {
    const shareToken = this.route.snapshot.paramMap.get('shareToken');
    if (shareToken) {
      this.loadBoardPreview(shareToken);
    } else {
      this.error = 'No share token provided';
      this.isLoading = false;
    }
  }

  loadBoardPreview(shareToken: string): void {
    this.boardService.getByShareToken(shareToken).subscribe({
      next: (board) => {
        if (board) {
          this.board = board;
        } else {
          this.error = 'This share link is invalid or has expired.';
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load board preview:', err);
        this.error = 'Unable to load board information. Please try again.';
        this.isLoading = false;
      }
    });
  }

  joinBoard(): void {
    if (!this.canJoin || !this.board) return;

    this.isJoining = true;

    // Store guest session info in localStorage
    const guestSession = {
      guestId: this.generateGuestId(),
      guestName: this.guestName.trim(),
      boardId: this.board.id,
      shareToken: this.route.snapshot.paramMap.get('shareToken')
    };

    localStorage.setItem('sketchflow_guest_session', JSON.stringify(guestSession));

    // Navigate to canvas with guest flag
    this.router.navigate(['/canvas', this.board.id], {
      queryParams: { guest: 'true' }
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  private generateGuestId(): string {
    // Generate a UUID-like string for guest identification
    return 'guest_' + crypto.randomUUID();
  }
}
