import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Types of operations that can be queued for offline sync
 */
export type QueuedOperationType = 'create' | 'update' | 'delete';

/**
 * Interface for a queued operation
 * Per spec: "Local drawing continues while offline (in-memory queue)"
 */
export interface QueuedOperation {
  id: string;           // Unique ID for this queued operation
  type: QueuedOperationType;
  boardId: string;
  elementId?: string;   // For update/delete operations
  elementData?: string; // JSON string of element data (for create/update)
  zIndex?: number;      // For create operations
  timestamp: number;    // When the operation was queued
}

/**
 * OfflineQueueService
 *
 * Manages network connectivity detection and queues operations when offline.
 * Per spec from connection_handling:
 * - "Local drawing continues while offline (in-memory queue)"
 * - "Sync queued changes on reconnect"
 */
@Injectable({
  providedIn: 'root'
})
export class OfflineQueueService {
  // Network status observable
  private _isOnline = new BehaviorSubject<boolean>(navigator.onLine);

  // Queue of operations to sync when back online
  private _queue: QueuedOperation[] = [];

  // Observable for queue changes
  private _queueChanged = new BehaviorSubject<QueuedOperation[]>([]);

  constructor() {
    this.setupNetworkListeners();
    console.log('[OfflineQueue] Service initialized, online:', navigator.onLine);
  }

  /**
   * Observable that emits true when online, false when offline
   */
  get isOnline$(): Observable<boolean> {
    return this._isOnline.asObservable();
  }

  /**
   * Current online status
   */
  get isOnline(): boolean {
    return this._isOnline.value;
  }

  /**
   * Observable for queue changes
   */
  get queueChanged$(): Observable<QueuedOperation[]> {
    return this._queueChanged.asObservable();
  }

  /**
   * Get the current queue (read-only copy)
   */
  get queue(): QueuedOperation[] {
    return [...this._queue];
  }

  /**
   * Get the number of queued operations
   */
  get queueLength(): number {
    return this._queue.length;
  }

  /**
   * Set up browser event listeners for online/offline detection
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('[OfflineQueue] Network status changed: ONLINE');
      this._isOnline.next(true);
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineQueue] Network status changed: OFFLINE');
      this._isOnline.next(false);
    });
  }

  /**
   * Add an operation to the queue
   * @param type - The type of operation (create, update, delete)
   * @param boardId - The board ID
   * @param elementId - The element ID (for update/delete)
   * @param elementData - The element data JSON string (for create/update)
   * @param zIndex - The z-index (for create)
   * @returns The queued operation with its unique ID
   */
  enqueue(
    type: QueuedOperationType,
    boardId: string,
    elementId?: string,
    elementData?: string,
    zIndex?: number
  ): QueuedOperation {
    const operation: QueuedOperation = {
      id: this.generateId(),
      type,
      boardId,
      elementId,
      elementData,
      zIndex,
      timestamp: Date.now()
    };

    // For update operations, check if there's already a queued update for this element
    // If so, replace it with the new update (last-write-wins per spec)
    if (type === 'update' && elementId) {
      const existingIndex = this._queue.findIndex(
        op => op.type === 'update' && op.elementId === elementId && op.boardId === boardId
      );
      if (existingIndex !== -1) {
        this._queue[existingIndex] = operation;
        console.log('[OfflineQueue] Replaced existing update operation for element:', elementId);
        this._queueChanged.next([...this._queue]);
        return operation;
      }
    }

    // For delete operations, remove any queued create/update for this element
    if (type === 'delete' && elementId) {
      this._queue = this._queue.filter(
        op => !(op.elementId === elementId && op.boardId === boardId)
      );
    }

    this._queue.push(operation);
    console.log('[OfflineQueue] Queued operation:', type, 'Queue length:', this._queue.length);
    this._queueChanged.next([...this._queue]);

    return operation;
  }

  /**
   * Remove an operation from the queue (after successful sync)
   * @param operationId - The ID of the operation to remove
   */
  dequeue(operationId: string): void {
    const index = this._queue.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this._queue.splice(index, 1);
      console.log('[OfflineQueue] Dequeued operation:', operationId, 'Queue length:', this._queue.length);
      this._queueChanged.next([...this._queue]);
    }
  }

  /**
   * Get all queued operations for a specific board
   * @param boardId - The board ID to filter by
   */
  getQueueForBoard(boardId: string): QueuedOperation[] {
    return this._queue.filter(op => op.boardId === boardId);
  }

  /**
   * Clear all queued operations for a specific board
   * @param boardId - The board ID
   */
  clearQueueForBoard(boardId: string): void {
    this._queue = this._queue.filter(op => op.boardId !== boardId);
    console.log('[OfflineQueue] Cleared queue for board:', boardId, 'Queue length:', this._queue.length);
    this._queueChanged.next([...this._queue]);
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    this._queue = [];
    console.log('[OfflineQueue] Queue cleared');
    this._queueChanged.next([]);
  }

  /**
   * Generate a unique ID for queued operations
   */
  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if there are any queued operations
   */
  hasQueuedOperations(): boolean {
    return this._queue.length > 0;
  }

  /**
   * Get operations in order (oldest first) for syncing
   */
  getOperationsForSync(): QueuedOperation[] {
    return [...this._queue].sort((a, b) => a.timestamp - b.timestamp);
  }
}
