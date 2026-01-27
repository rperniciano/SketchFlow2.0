using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SketchFlow.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardElements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AppBoardElements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BoardId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatorGuestSessionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    ElementData = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ZIndex = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppBoardElements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AppBoardElements_AppBoards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "AppBoards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AppBoardElements_BoardId",
                table: "AppBoardElements",
                column: "BoardId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppBoardElements");
        }
    }
}
