# SketchFlow

> Transform sketches into production-ready React code with real-time collaboration

## Overview

SketchFlow is a real-time collaborative whiteboard application that bridges the gap between design ideation and code implementation. Users can draw wireframes, UI sketches, and diagrams together in real-time, then select any hand-drawn sketch and click "Generate Component" to transform it into production-ready React + Tailwind code using AI.

### Key Features

- **Real-time Collaboration**: Multiple users can draw and collaborate on the same canvas simultaneously with live cursor sync
- **AI Code Generation**: Select any sketch and generate production-ready React + Tailwind components using GPT-4 Vision + Claude
- **Infinite Canvas**: Smooth 60fps rendering with zoom, pan, and viewport culling for optimal performance
- **Drawing Tools**: Pen, Rectangle, Circle, and Text tools with 8 colors and 3 stroke thicknesses
- **Share Links**: Generate shareable links for guests to join boards without registration
- **Dark Theme**: Elite design system with glassmorphism effects and cinematic animations

### Target Audience

Cross-functional product teams of 3-10 people (developers, designers, PMs) at startups and scale-ups where speed and iteration matter.

## Technology Stack

### Frontend
- **Angular 17+** (standalone components)
- **Fabric.js** for canvas rendering
- **SignalR** for real-time communication
- Custom "Elite" dark theme with glassmorphism

### Backend
- **ABP.io with .NET 10** (DDD, CQRS patterns)
- **SQL Server** (single-tenant)
- **SignalR** for real-time features
- **MassTransit + RabbitMQ** for messaging
- **ABP Identity + Google OAuth** for authentication

### AI Services
- **GPT-4 Vision API** for sketch analysis
- **Claude Code CLI** for React + Tailwind code generation

## Prerequisites

- [.NET 10.0+ SDK](https://dotnet.microsoft.com/download/dotnet)
- [Node.js 20+](https://nodejs.org/en)
- SQL Server (local or Docker)
- RabbitMQ (Docker recommended)
- OpenAI API key (GPT-4 Vision)
- Anthropic API key (Claude Code CLI)

## Quick Start

The easiest way to get started is using the init script:

```bash
# Make the script executable (first time only)
chmod +x init.sh

# Run the setup script
./init.sh
```

This will:
1. Check prerequisites
2. Set up Docker containers for SQL Server and RabbitMQ (if Docker available)
3. Restore NuGet packages
4. Run database migrations
5. Install frontend dependencies

### Manual Setup

If you prefer manual setup:

1. **Install ABP CLI** (optional but recommended):
   ```bash
   dotnet tool install -g Volo.Abp.Studio.Cli
   ```

2. **Restore dependencies**:
   ```bash
   dotnet restore
   abp install-libs  # Optional: install client-side ABP libraries
   ```

3. **Generate development certificate**:
   ```bash
   cd src/SketchFlow.HttpApi.Host
   dotnet dev-certs https -v -ep openiddict.pfx -p 7cd49d9b-654d-4e26-b3a9-80c41bbbbb2f
   ```

4. **Run database migrations**:
   ```bash
   cd src/SketchFlow.DbMigrator
   dotnet run
   ```

5. **Install frontend dependencies**:
   ```bash
   cd angular
   yarn install  # or npm install
   ```

## Running the Application

### Start Backend

```bash
cd src/SketchFlow.HttpApi.Host
dotnet run
```

The API will be available at: `https://localhost:44325`
Swagger UI: `https://localhost:44325/swagger`

### Start Frontend

```bash
cd angular
yarn start  # or npm start
```

The Angular app will be available at: `http://localhost:4200`

## Configuration

### Connection Strings

Update `appsettings.json` in `SketchFlow.HttpApi.Host` and `SketchFlow.DbMigrator`:

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=SketchFlow;Trusted_Connection=True;TrustServerCertificate=true"
  }
}
```

### API Keys

Add to `appsettings.json` or environment variables:

```json
{
  "AIServices": {
    "OpenAI": {
      "ApiKey": "your-openai-api-key"
    },
    "Anthropic": {
      "ApiKey": "your-anthropic-api-key"
    }
  }
}
```

## Solution Structure

```
SketchFlow2.0/
├── angular/                    # Angular 17+ frontend
│   ├── src/
│   │   ├── app/               # Application components
│   │   └── environments/      # Environment configs
│   └── ...
├── src/
│   ├── SketchFlow.Application/           # Application services
│   ├── SketchFlow.Application.Contracts/ # DTOs, interfaces
│   ├── SketchFlow.Domain/                # Domain entities, services
│   ├── SketchFlow.Domain.Shared/         # Shared enums, constants
│   ├── SketchFlow.EntityFrameworkCore/   # EF Core, repositories
│   ├── SketchFlow.HttpApi/               # API controllers
│   ├── SketchFlow.HttpApi.Host/          # API host, SignalR hubs
│   └── SketchFlow.DbMigrator/            # Database migrations
├── test/                       # Unit and integration tests
├── prompts/                    # AI agent prompts and specs
├── init.sh                     # Development setup script
└── features.db                 # Feature tracking database
```

## Feature Tracking

Features are tracked in `features.db` (SQLite). The project includes 273 comprehensive features covering:

- Security & Access Control
- Navigation Integrity
- Real Data Verification
- Workflow Completeness
- Error Handling
- UI-Backend Integration
- State & Persistence
- And more...

## License

Proprietary - All rights reserved

## Additional Resources

- [ABP Framework Documentation](https://abp.io/docs/latest)
- [Angular Documentation](https://angular.dev)
- [Fabric.js Documentation](http://fabricjs.com/docs/)
- [SignalR Documentation](https://docs.microsoft.com/aspnet/core/signalr/)
