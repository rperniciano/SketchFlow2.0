using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SketchFlow.Migrations
{
    /// <inheritdoc />
    public partial class AddUserProfileExtensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CursorColor",
                table: "AbpUsers",
                type: "nvarchar(7)",
                maxLength: 7,
                nullable: true,
                defaultValue: "#6366f1");

            migrationBuilder.AddColumn<string>(
                name: "DefaultStrokeColor",
                table: "AbpUsers",
                type: "nvarchar(7)",
                maxLength: 7,
                nullable: true,
                defaultValue: "#000000");

            migrationBuilder.AddColumn<int>(
                name: "DefaultStrokeThickness",
                table: "AbpUsers",
                type: "int",
                nullable: false,
                defaultValue: 4);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CursorColor",
                table: "AbpUsers");

            migrationBuilder.DropColumn(
                name: "DefaultStrokeColor",
                table: "AbpUsers");

            migrationBuilder.DropColumn(
                name: "DefaultStrokeThickness",
                table: "AbpUsers");
        }
    }
}
