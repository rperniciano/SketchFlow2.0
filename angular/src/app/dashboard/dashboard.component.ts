import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Board {
  id: string;
  name: string;
  lastModified: Date;
  participantCount: number;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);

  boards: Board[] = [];
  trashedBoards: Board[] = [];
  searchQuery = '';
  activeTab: 'boards' | 'trash' = 'boards';
  isCreateModalOpen = false;
  newBoardName = '';
  isLoading = true;

  ngOnInit(): void {
    this.loadBoards();
  }

  loadBoards(): void {
    // TODO: Replace with actual API call
    // For now, simulate an empty state for new users
    this.isLoading = false;
    this.boards = [];
    this.trashedBoards = [];
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
  }

  openCreateModal(): void {
    console.log('openCreateModal called, setting isCreateModalOpen to true');
    this.isCreateModalOpen = true;
    this.newBoardName = '';
    console.log('isCreateModalOpen is now:', this.isCreateModalOpen);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen = false;
    this.newBoardName = '';
  }

  createBoard(): void {
    if (!this.newBoardName.trim()) {
      return;
    }

    // TODO: Replace with actual API call
    const newBoard: Board = {
      id: crypto.randomUUID(),
      name: this.newBoardName.trim(),
      lastModified: new Date(),
      participantCount: 1
    };

    this.boards.unshift(newBoard);
    this.closeCreateModal();

    // Navigate to the canvas
    this.router.navigate(['/canvas', newBoard.id]);
  }

  openBoard(board: Board): void {
    this.router.navigate(['/canvas', board.id]);
  }

  renameBoard(board: Board): void {
    // TODO: Implement rename modal
    console.log('Rename board:', board);
  }

  shareBoard(board: Board): void {
    // TODO: Implement share modal
    console.log('Share board:', board);
  }

  deleteBoard(board: Board): void {
    // Soft delete - move to trash
    const index = this.boards.indexOf(board);
    if (index > -1) {
      this.boards.splice(index, 1);
      this.trashedBoards.unshift(board);
    }
  }

  restoreBoard(board: Board): void {
    const index = this.trashedBoards.indexOf(board);
    if (index > -1) {
      this.trashedBoards.splice(index, 1);
      this.boards.unshift(board);
    }
  }

  permanentlyDeleteBoard(board: Board): void {
    const index = this.trashedBoards.indexOf(board);
    if (index > -1) {
      this.trashedBoards.splice(index, 1);
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
  }
}
