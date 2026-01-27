import { Injectable, inject, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { ConnectionService } from './connection.service';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * SignalR service for real-time board collaboration
 * Per spec: SignalR connection establishes on board join
 */
@Injectable({
  providedIn: 'root'
})
export class SignalRService implements OnDestroy {
  private connectionService = inject(ConnectionService);

  private hubConnection: signalR.HubConnection | null = null;
  private currentBoardId: string | null = null;

  // Observable for connection state changes
  private _connectionState$ = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );
  public connectionState$ = this._connectionState$.asObservable();

  // Hub URL (use signalRUrl if available, otherwise fall back to API URL)
  private get hubUrl(): string {
    const baseUrl = (environment as any).signalRUrl || environment.apis.default.url;
    return `${baseUrl}/signalr/board`;
  }

  /**
   * Connect to the SignalR hub for a specific board
   * @param boardId The ID of the board to join
   * @param guestName Optional name for guest users
   */
  async connect(boardId: string, guestName?: string): Promise<void> {
    console.log('[SignalR] Connecting to hub for board:', boardId);

    // If already connected to the same board, skip
    if (this.hubConnection &&
        this.hubConnection.state === signalR.HubConnectionState.Connected &&
        this.currentBoardId === boardId) {
      console.log('[SignalR] Already connected to this board');
      return;
    }

    // Disconnect from previous board if any
    if (this.hubConnection) {
      await this.disconnect();
    }

    // Build the SignalR connection
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, {
        // Skip negotiation for WebSocket-only transport (faster)
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets |
                   signalR.HttpTransportType.ServerSentEvents |
                   signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect({
        // Custom reconnect delays (per spec: 2s, 5s, 10s, 30s)
        nextRetryDelayInMilliseconds: (retryContext) => {
          const delays = [2000, 5000, 10000, 30000];
          const index = Math.min(retryContext.previousRetryCount, delays.length - 1);
          console.log(`[SignalR] Reconnect attempt ${retryContext.previousRetryCount + 1} in ${delays[index]}ms`);
          return delays[index];
        }
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Set up event handlers
    this.setupEventHandlers();

    try {
      // Start the connection
      this.connectionService.setConnecting();
      await this.hubConnection.start();
      console.log('[SignalR] Connected successfully');

      // Join the board room
      await this.hubConnection.invoke('JoinBoard', boardId, guestName);
      this.currentBoardId = boardId;

      this.connectionService.setConnected();
      this._connectionState$.next(signalR.HubConnectionState.Connected);

    } catch (error) {
      console.error('[SignalR] Connection failed:', error);
      this.connectionService.setDisconnected();
      this._connectionState$.next(signalR.HubConnectionState.Disconnected);
      throw error;
    }
  }

  /**
   * Disconnect from the SignalR hub
   */
  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      try {
        // Leave the current board if connected
        if (this.currentBoardId &&
            this.hubConnection.state === signalR.HubConnectionState.Connected) {
          await this.hubConnection.invoke('LeaveBoard', this.currentBoardId);
        }

        await this.hubConnection.stop();
        console.log('[SignalR] Disconnected');
      } catch (error) {
        console.error('[SignalR] Error during disconnect:', error);
      }

      this.hubConnection = null;
      this.currentBoardId = null;
      this._connectionState$.next(signalR.HubConnectionState.Disconnected);
    }
  }

  /**
   * Set up event handlers for the hub connection
   */
  private setupEventHandlers(): void {
    if (!this.hubConnection) return;

    // Connection state change handlers
    this.hubConnection.onclose((error) => {
      console.log('[SignalR] Connection closed', error);
      this.connectionService.setDisconnected();
      this._connectionState$.next(signalR.HubConnectionState.Disconnected);
    });

    this.hubConnection.onreconnecting((error) => {
      console.log('[SignalR] Reconnecting...', error);
      this.connectionService.setConnecting();
      this._connectionState$.next(signalR.HubConnectionState.Reconnecting);
    });

    this.hubConnection.onreconnected((connectionId) => {
      console.log('[SignalR] Reconnected with ID:', connectionId);
      this.connectionService.setConnected();
      this._connectionState$.next(signalR.HubConnectionState.Connected);

      // Rejoin the board after reconnection
      if (this.currentBoardId) {
        this.hubConnection?.invoke('JoinBoard', this.currentBoardId)
          .catch(err => console.error('[SignalR] Failed to rejoin board:', err));
      }
    });

    // Board-specific event handlers
    this.hubConnection.on('OnBoardJoined', (data) => {
      console.log('[SignalR] Joined board:', data);
    });

    this.hubConnection.on('OnParticipantJoined', (data) => {
      console.log('[SignalR] Participant joined:', data);
    });

    this.hubConnection.on('OnParticipantLeft', (data) => {
      console.log('[SignalR] Participant left:', data);
    });

    this.hubConnection.on('OnCursorMoved', (data) => {
      // Will be used for remote cursor display
      // console.log('[SignalR] Cursor moved:', data);
    });

    this.hubConnection.on('OnElementCreated', (data) => {
      console.log('[SignalR] Element created:', data);
    });

    this.hubConnection.on('OnElementUpdated', (data) => {
      console.log('[SignalR] Element updated:', data);
    });

    this.hubConnection.on('OnElementsDeleted', (data) => {
      console.log('[SignalR] Elements deleted:', data);
    });

    this.hubConnection.on('OnSelectionChanged', (data) => {
      console.log('[SignalR] Selection changed:', data);
    });
  }

  /**
   * Get the current connection state
   */
  get connectionState(): signalR.HubConnectionState {
    return this.hubConnection?.state ?? signalR.HubConnectionState.Disconnected;
  }

  /**
   * Check if currently connected
   */
  get isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  /**
   * Send cursor position update
   */
  async updateCursor(x: number, y: number): Promise<void> {
    if (this.isConnected && this.currentBoardId) {
      try {
        await this.hubConnection!.invoke('UpdateCursor', this.currentBoardId, x, y);
      } catch (error) {
        console.error('[SignalR] Failed to update cursor:', error);
      }
    }
  }

  /**
   * Broadcast element creation
   */
  async createElement(elementData: any): Promise<void> {
    if (this.isConnected && this.currentBoardId) {
      try {
        await this.hubConnection!.invoke('CreateElement', this.currentBoardId, elementData);
      } catch (error) {
        console.error('[SignalR] Failed to create element:', error);
      }
    }
  }

  /**
   * Broadcast element update
   */
  async updateElement(elementId: string, elementData: any): Promise<void> {
    if (this.isConnected && this.currentBoardId) {
      try {
        await this.hubConnection!.invoke('UpdateElement', this.currentBoardId, elementId, elementData);
      } catch (error) {
        console.error('[SignalR] Failed to update element:', error);
      }
    }
  }

  /**
   * Broadcast element deletion
   */
  async deleteElements(elementIds: string[]): Promise<void> {
    if (this.isConnected && this.currentBoardId) {
      try {
        await this.hubConnection!.invoke('DeleteElements', this.currentBoardId, elementIds);
      } catch (error) {
        console.error('[SignalR] Failed to delete elements:', error);
      }
    }
  }

  /**
   * Broadcast selection change to other participants
   * Feature #115: Selection highlight visible to other users
   * @param elementIds Array of selected element IDs (empty array for deselection)
   */
  async updateSelection(elementIds: string[]): Promise<void> {
    if (this.isConnected && this.currentBoardId) {
      try {
        await this.hubConnection!.invoke('UpdateSelection', this.currentBoardId, elementIds);
      } catch (error) {
        console.error('[SignalR] Failed to update selection:', error);
      }
    }
  }

  /**
   * Register a handler for a specific hub event
   * @param eventName The name of the event to listen for
   * @param handler The handler function
   */
  on(eventName: string, handler: (...args: any[]) => void): void {
    this.hubConnection?.on(eventName, handler);
  }

  /**
   * Remove a handler for a specific hub event
   * @param eventName The name of the event
   * @param handler The handler function to remove
   */
  off(eventName: string, handler?: (...args: any[]) => void): void {
    if (handler) {
      this.hubConnection?.off(eventName, handler);
    } else {
      this.hubConnection?.off(eventName);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
