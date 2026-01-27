import { Component, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BoardService, BoardDto } from '../shared/services/board.service';

interface Board {
  id: string;
  name: string;
  lastModified: Date;
  participantCount: number;
  thumbnailUrl?: string;
  shareToken: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  encapsulation: ViewEncapsulation.None
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private boardService = inject(BoardService);

  boards: Board[] = [];
  trashedBoards: Board[] = [];
  searchQuery = '';
  activeTab: 'boards' | 'trash' = 'boards';
  isCreateModalOpen = false;
  newBoardName = '';
  isLoading = true;
  isCreating = false;

  // Share modal state
  isShareModalOpen = false;
  shareBoard_: Board | null = null;
  shareLink = '';
  shareLinkCopied = false;

  ngOnInit(): void {
    this.loadBoards();
  }

  loadBoards(): void {
    this.isLoading = true;

    this.boardService.getList({ maxResultCount: 100 }).subscribe({
      next: (result) => {
        this.boards = result.items.map(b => this.mapBoardDtoToBoard(b));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load boards:', err);
        this.isLoading = false;
        // Fallback to empty array on error
        this.boards = [];
      }
    });
  }

  loadTrashedBoards(): void {
    this.boardService.getTrash({ maxResultCount: 100 }).subscribe({
      next: (result) => {
        this.trashedBoards = result.items.map(b => this.mapBoardDtoToBoard(b));
      },
      error: (err) => {
        console.error('Failed to load trashed boards:', err);
        this.trashedBoards = [];
      }
    });
  }

  private mapBoardDtoToBoard(dto: BoardDto): Board {
    return {
      id: dto.id,
      name: dto.name,
      lastModified: new Date(dto.lastModificationTime || dto.creationTime),
      participantCount: dto.participantCount || 1,
      shareToken: dto.shareToken
    };
  }

  get filteredBoards(): Board[] {
    if (!this.searchQuery.trim()) {
      return this.boards;
    }
    const query = this.searchQuery.toLowerCase();
    return this.boards.filter(board =>
      board.name.toLowerCase().includes(query)
    );
  }

  get hasBoards(): boolean {
    return this.boards.length > 0;
  }

  get hasFilteredBoards(): boolean {
    return this.filteredBoards.length > 0;
  }

  get isSearching(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  switchTab(tab: 'boards' | 'trash'): void {
    this.activeTab = tab;
    if (tab === 'trash') {
      this.loadTrashedBoards();
    }
  }

  openCreateModal(): void {
    // Use browser prompt as a workaround for modal CSS stacking context issue with ABP Lepton theme
    const boardName = window.prompt('Enter board name:', 'My awesome sketch');
    if (boardName && boardName.trim()) {
      this.newBoardName = boardName.trim();
      this.createBoard();
    }
  }

  closeCreateModal(): void {
    this.isCreateModalOpen = false;
    this.newBoardName = '';
  }

  createBoard(): void {
    if (!this.newBoardName.trim() || this.isCreating) {
      return;
    }

    this.isCreating = true;

    this.boardService.create({ name: this.newBoardName.trim() }).subscribe({
      next: (board) => {
        this.isCreating = false;
        this.closeCreateModal();
        // Add board to the list immediately for optimistic UI
        this.boards.unshift({
          id: board.id,
          name: board.name,
          lastModified: new Date(),
          participantCount: 1,
          shareToken: board.shareToken
        });
        // Navigate to the canvas
        this.router.navigate(['/canvas', board.id]);
      },
      error: (err) => {
        console.error('Failed to create board:', err);
        this.isCreating = false;
        // Check for board limit error
        const errorCode = err?.error?.error?.code || err?.error?.code;
        if (errorCode === 'SketchFlow:BoardLimitReached') {
          alert('You have reached the maximum limit of 50 boards. Please delete some boards to create new ones.');
        } else {
          alert('Failed to create board. Please try again.');
        }
      }
    });
  }

  openBoard(board: Board): void {
    this.router.navigate(['/canvas', board.id]);
  }

  renameBoard(board: Board): void {
    // Use browser prompt as a workaround for modal CSS stacking context issue with ABP Lepton theme
    const newName = window.prompt('Enter new board name:', board.name);
    if (newName && newName.trim() && newName.trim() !== board.name) {
      this.boardService.update(board.id, { name: newName.trim() }).subscribe({
        next: (updatedBoard) => {
          // Update the board in the local list
          const index = this.boards.findIndex(b => b.id === board.id);
          if (index > -1) {
            this.boards[index].name = updatedBoard.name;
            this.boards[index].lastModified = new Date(updatedBoard.lastModificationTime || updatedBoard.creationTime);
          }
        },
        error: (err) => {
          console.error('Failed to rename board:', err);
          alert('Failed to rename board. Please try again.');
        }
      });
    }
  }

  shareBoard(board: Board): void {
    // Use browser dialogs as a workaround for modal CSS stacking context issue with ABP Lepton theme
    const shareLink = this.generateShareLink(board.shareToken);

    // Show share link in prompt (allows easy copying) with option to regenerate
    const message = `Share link for "${board.name}":\n\n${shareLink}\n\nClick OK to copy to clipboard, or Cancel to close.`;

    // Use a loop to allow regeneration
    this.showShareDialog(board, shareLink);
  }

  private showShareDialog(board: Board, shareLink: string): void {
    // First, copy the link to clipboard
    navigator.clipboard.writeText(shareLink).then(() => {
      // Ask if user wants to regenerate
      const regenerate = window.confirm(
        `Share link copied to clipboard!\n\n${shareLink}\n\nDo you want to regenerate the share link?\n(This will invalidate the old link)`
      );

      if (regenerate) {
        this.regenerateShareTokenWithCallback(board, (newLink) => {
          this.showShareDialog(board, newLink);
        });
      }
    }).catch(() => {
      // Clipboard failed, show prompt for manual copy
      const regenerate = window.confirm(
        `Share link:\n\n${shareLink}\n\n(Copy the link above manually)\n\nDo you want to regenerate the share link?\n(This will invalidate the old link)`
      );

      if (regenerate) {
        this.regenerateShareTokenWithCallback(board, (newLink) => {
          this.showShareDialog(board, newLink);
        });
      }
    });
  }

  closeShareModal(): void {
    this.isShareModalOpen = false;
    this.shareBoard_ = null;
    this.shareLink = '';
    this.shareLinkCopied = false;
  }

  private generateShareLink(shareToken: string): string {
    // Generate the share link based on current location
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${shareToken}`;
  }

  copyShareLink(): void {
    navigator.clipboard.writeText(this.shareLink).then(() => {
      this.shareLinkCopied = true;
      // Reset copied state after 2 seconds
      setTimeout(() => {
        this.shareLinkCopied = false;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy share link:', err);
      alert('Failed to copy link. Please copy it manually.');
    });
  }

  private regenerateShareTokenWithCallback(board: Board, callback: (newLink: string) => void): void {
    this.boardService.regenerateShareToken(board.id).subscribe({
      next: (newToken) => {
        // Update the token in the boards list
        const boardIndex = this.boards.findIndex(b => b.id === board.id);
        if (boardIndex > -1) {
          this.boards[boardIndex].shareToken = newToken;
        }
        board.shareToken = newToken;
        const newLink = this.generateShareLink(newToken);
        alert(`Share link regenerated!\n\nNew link: ${newLink}\n\nThe old link no longer works.`);
        callback(newLink);
      },
      error: (err) => {
        console.error('Failed to regenerate share token:', err);
        alert('Failed to regenerate share link. Please try again.');
      }
    });
  }

  regenerateShareToken(): void {
    if (!this.shareBoard_) return;

    this.boardService.regenerateShareToken(this.shareBoard_.id).subscribe({
      next: (newToken) => {
        if (this.shareBoard_) {
          this.shareBoard_.shareToken = newToken;
          this.shareLink = this.generateShareLink(newToken);
          // Update the token in the boards list
          const boardIndex = this.boards.findIndex(b => b.id === this.shareBoard_?.id);
          if (boardIndex > -1) {
            this.boards[boardIndex].shareToken = newToken;
          }
        }
      },
      error: (err) => {
        console.error('Failed to regenerate share token:', err);
        alert('Failed to regenerate share link. Please try again.');
      }
    });
  }

  deleteBoard(board: Board): void {
    this.boardService.delete(board.id).subscribe({
      next: () => {
        // Remove from boards list
        const index = this.boards.findIndex(b => b.id === board.id);
        if (index > -1) {
          this.boards.splice(index, 1);
        }
        // Add to trashed boards for UI consistency
        this.trashedBoards.unshift(board);
      },
      error: (err) => {
        console.error('Failed to delete board:', err);
        alert('Failed to delete board. Please try again.');
      }
    });
  }

  restoreBoard(board: Board): void {
    this.boardService.restore(board.id).subscribe({
      next: (restoredBoard) => {
        // Remove from trashed boards
        const index = this.trashedBoards.findIndex(b => b.id === board.id);
        if (index > -1) {
          this.trashedBoards.splice(index, 1);
        }
        // Add to boards list
        this.boards.unshift(this.mapBoardDtoToBoard(restoredBoard));
      },
      error: (err) => {
        console.error('Failed to restore board:', err);
        alert('Failed to restore board. Please try again.');
      }
    });
  }

  permanentlyDeleteBoard(board: Board): void {
    if (!confirm('Are you sure you want to permanently delete this board? This action cannot be undone.')) {
      return;
    }

    this.boardService.permanentDelete(board.id).subscribe({
      next: () => {
        // Remove from trashed boards
        const index = this.trashedBoards.findIndex(b => b.id === board.id);
        if (index > -1) {
          this.trashedBoards.splice(index, 1);
        }
      },
      error: (err) => {
        console.error('Failed to permanently delete board:', err);
        alert('Failed to permanently delete board. Please try again.');
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
  }
}
