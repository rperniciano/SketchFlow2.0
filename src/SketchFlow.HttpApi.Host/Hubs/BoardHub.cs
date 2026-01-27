using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;

namespace SketchFlow.Hubs;

/// <summary>
/// SignalR Hub for real-time collaboration on boards.
/// Handles WebSocket connections for canvas synchronization.
/// Per spec: SignalR connection establishes on board join
/// </summary>
public class BoardHub : Hub
{
    private readonly ILogger<BoardHub> _logger;

    // Track which board each connection is associated with
    // Key: ConnectionId, Value: BoardId
    private static readonly ConcurrentDictionary<string, string> ConnectionBoardMap = new();

    public BoardHub(ILogger<BoardHub> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Called when a client connects to the hub.
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    /// <summary>
    /// Called when a client disconnects from the hub.
    /// Feature #112: Broadcast OnParticipantLeft when client disconnects (e.g., closes tab)
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
        {
            _logger.LogWarning(exception, "Client disconnected with error: {ConnectionId}", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        }

        // Check if this connection was associated with a board and notify others
        if (ConnectionBoardMap.TryRemove(Context.ConnectionId, out var boardId))
        {
            _logger.LogInformation(
                "Client {ConnectionId} disconnected from board {BoardId}, notifying participants",
                Context.ConnectionId,
                boardId);

            // Notify other participants that this user left
            await Clients.Group(boardId).SendAsync("OnParticipantLeft", new
            {
                ConnectionId = Context.ConnectionId,
                Timestamp = DateTime.UtcNow
            });
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Join a board room to receive updates for that board.
    /// Per spec: JoinBoard(boardId, guestName?)
    /// </summary>
    /// <param name="boardId">The ID of the board to join</param>
    /// <param name="guestName">Optional name for guest users</param>
    public async Task JoinBoard(string boardId, string? guestName = null)
    {
        // Track the connection-to-board mapping for disconnect handling
        ConnectionBoardMap[Context.ConnectionId] = boardId;

        await Groups.AddToGroupAsync(Context.ConnectionId, boardId);

        _logger.LogInformation(
            "Client {ConnectionId} joined board {BoardId} (Guest: {GuestName})",
            Context.ConnectionId,
            boardId,
            guestName ?? "N/A");

        // Notify the caller that they successfully joined
        await Clients.Caller.SendAsync("OnBoardJoined", new
        {
            BoardId = boardId,
            ConnectionId = Context.ConnectionId,
            Timestamp = DateTime.UtcNow
        });

        // Notify other participants that someone joined
        await Clients.OthersInGroup(boardId).SendAsync("OnParticipantJoined", new
        {
            ConnectionId = Context.ConnectionId,
            GuestName = guestName,
            Timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Leave a board room.
    /// Per spec: LeaveBoard(boardId)
    /// </summary>
    /// <param name="boardId">The ID of the board to leave</param>
    public async Task LeaveBoard(string boardId)
    {
        // Remove the connection-to-board mapping
        ConnectionBoardMap.TryRemove(Context.ConnectionId, out _);

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, boardId);

        _logger.LogInformation(
            "Client {ConnectionId} left board {BoardId}",
            Context.ConnectionId,
            boardId);

        // Notify other participants that someone left
        await Clients.OthersInGroup(boardId).SendAsync("OnParticipantLeft", new
        {
            ConnectionId = Context.ConnectionId,
            Timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Update cursor position for real-time cursor sync.
    /// Per spec: UpdateCursor(boardId, x, y)
    /// </summary>
    public async Task UpdateCursor(string boardId, double x, double y)
    {
        await Clients.OthersInGroup(boardId).SendAsync("OnCursorMoved", new
        {
            ConnectionId = Context.ConnectionId,
            X = x,
            Y = y,
            Timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Broadcast element creation to other participants.
    /// Per spec: CreateElement(boardId, elementData)
    /// </summary>
    public async Task CreateElement(string boardId, object elementData)
    {
        await Clients.OthersInGroup(boardId).SendAsync("OnElementCreated", elementData);

        _logger.LogDebug("Element created on board {BoardId} by {ConnectionId}", boardId, Context.ConnectionId);
    }

    /// <summary>
    /// Broadcast element update to other participants.
    /// Per spec: UpdateElement(boardId, elementId, elementData)
    /// </summary>
    public async Task UpdateElement(string boardId, string elementId, object elementData)
    {
        await Clients.OthersInGroup(boardId).SendAsync("OnElementUpdated", new
        {
            ElementId = elementId,
            Data = elementData
        });

        _logger.LogDebug("Element {ElementId} updated on board {BoardId}", elementId, boardId);
    }

    /// <summary>
    /// Broadcast element deletion to other participants.
    /// Per spec: DeleteElements(boardId, elementIds[])
    /// </summary>
    public async Task DeleteElements(string boardId, string[] elementIds)
    {
        await Clients.OthersInGroup(boardId).SendAsync("OnElementsDeleted", elementIds);

        _logger.LogDebug("Elements deleted on board {BoardId}: {Count} elements", boardId, elementIds.Length);
    }

    /// <summary>
    /// Broadcast selection change to other participants.
    /// Feature #115: Selection highlight visible to other users
    /// Per spec: "When User A selects element, User B sees highlight"
    /// </summary>
    /// <param name="boardId">The ID of the board</param>
    /// <param name="elementIds">Array of selected element IDs (empty array means deselection)</param>
    public async Task UpdateSelection(string boardId, string[] elementIds)
    {
        await Clients.OthersInGroup(boardId).SendAsync("OnSelectionChanged", new
        {
            ConnectionId = Context.ConnectionId,
            ElementIds = elementIds,
            Timestamp = DateTime.UtcNow
        });

        _logger.LogDebug(
            "Selection updated on board {BoardId} by {ConnectionId}: {Count} elements",
            boardId,
            Context.ConnectionId,
            elementIds.Length);
    }
}
