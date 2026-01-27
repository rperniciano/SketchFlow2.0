#!/bin/bash

# ===============================================================
# SketchFlow - Development Environment Setup Script
# ===============================================================
# This script sets up and runs the development environment for
# SketchFlow, a real-time collaborative whiteboard application.
#
# Technologies:
# - Backend: ABP.io with .NET 10, SignalR, SQL Server
# - Frontend: Angular 17+ with Fabric.js
# - Infrastructure: RabbitMQ (for MassTransit messaging)
# ===============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}===============================================================${NC}"
echo -e "${BLUE}           SketchFlow Development Environment Setup            ${NC}"
echo -e "${BLUE}===============================================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print step headers
print_step() {
    echo -e "\n${YELLOW}>>> $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ===============================================================
# Prerequisites Check
# ===============================================================
print_step "Checking prerequisites..."

# Check .NET SDK
if command_exists dotnet; then
    DOTNET_VERSION=$(dotnet --version)
    print_success ".NET SDK found: $DOTNET_VERSION"
else
    print_error ".NET SDK not found. Please install .NET 10 SDK"
    echo "Download from: https://dotnet.microsoft.com/download/dotnet"
    exit 1
fi

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js 20+"
    echo "Download from: https://nodejs.org/"
    exit 1
fi

# Check npm or yarn
if command_exists yarn; then
    PACKAGE_MANAGER="yarn"
    print_success "Yarn found: $(yarn --version)"
elif command_exists npm; then
    PACKAGE_MANAGER="npm"
    print_success "npm found: $(npm --version)"
else
    print_error "Neither npm nor yarn found. Please install a package manager."
    exit 1
fi

# Check ABP CLI (optional but recommended)
if command_exists abp; then
    ABP_VERSION=$(abp --version 2>/dev/null || echo "unknown")
    print_success "ABP CLI found: $ABP_VERSION"
else
    print_info "ABP CLI not found (optional). Install with: dotnet tool install -g Volo.Abp.Studio.Cli"
fi

# Check Docker (optional, for SQL Server and RabbitMQ)
if command_exists docker; then
    print_success "Docker found: $(docker --version)"
    DOCKER_AVAILABLE=true
else
    print_info "Docker not found. You'll need to manually set up SQL Server and RabbitMQ."
    DOCKER_AVAILABLE=false
fi

# ===============================================================
# Infrastructure Setup (Docker-based, if available)
# ===============================================================
if [ "$DOCKER_AVAILABLE" = true ]; then
    print_step "Setting up infrastructure with Docker..."

    # Check if SQL Server container is running
    if docker ps -a --format '{{.Names}}' | grep -q '^sketchflow-sqlserver$'; then
        if docker ps --format '{{.Names}}' | grep -q '^sketchflow-sqlserver$'; then
            print_success "SQL Server container already running"
        else
            echo "Starting existing SQL Server container..."
            docker start sketchflow-sqlserver
            print_success "SQL Server container started"
        fi
    else
        echo "Creating SQL Server container..."
        docker run -d \
            --name sketchflow-sqlserver \
            -e "ACCEPT_EULA=Y" \
            -e "MSSQL_SA_PASSWORD=YourStrong@Passw0rd" \
            -p 1433:1433 \
            mcr.microsoft.com/mssql/server:2022-latest
        print_success "SQL Server container created and started"
        echo "Waiting for SQL Server to be ready..."
        sleep 10
    fi

    # Check if RabbitMQ container is running
    if docker ps -a --format '{{.Names}}' | grep -q '^sketchflow-rabbitmq$'; then
        if docker ps --format '{{.Names}}' | grep -q '^sketchflow-rabbitmq$'; then
            print_success "RabbitMQ container already running"
        else
            echo "Starting existing RabbitMQ container..."
            docker start sketchflow-rabbitmq
            print_success "RabbitMQ container started"
        fi
    else
        echo "Creating RabbitMQ container..."
        docker run -d \
            --name sketchflow-rabbitmq \
            -p 5672:5672 \
            -p 15672:15672 \
            rabbitmq:3-management
        print_success "RabbitMQ container created and started"
    fi
fi

# ===============================================================
# Backend Setup
# ===============================================================
print_step "Setting up backend..."

cd "$SCRIPT_DIR"

# Restore NuGet packages
echo "Restoring NuGet packages..."
dotnet restore
print_success "NuGet packages restored"

# Install ABP libs if abp CLI is available
if command_exists abp; then
    echo "Installing ABP client-side libraries..."
    abp install-libs -y 2>/dev/null || true
    print_success "ABP libraries installed"
fi

# Generate development certificate if not exists
CERT_PATH="$SCRIPT_DIR/src/SketchFlow.HttpApi.Host/openiddict.pfx"
if [ ! -f "$CERT_PATH" ]; then
    echo "Generating OpenIddict development certificate..."
    cd "$SCRIPT_DIR/src/SketchFlow.HttpApi.Host"
    dotnet dev-certs https -v -ep openiddict.pfx -p 7cd49d9b-654d-4e26-b3a9-80c41bbbbb2f 2>/dev/null || true
    print_success "Development certificate generated"
    cd "$SCRIPT_DIR"
else
    print_success "Development certificate already exists"
fi

# Run database migrations
print_step "Running database migrations..."
cd "$SCRIPT_DIR/src/SketchFlow.DbMigrator"
dotnet run --no-build 2>/dev/null || dotnet run
print_success "Database migrations completed"
cd "$SCRIPT_DIR"

# ===============================================================
# Frontend Setup
# ===============================================================
print_step "Setting up frontend..."

cd "$SCRIPT_DIR/angular"

# Install dependencies
echo "Installing frontend dependencies..."
if [ "$PACKAGE_MANAGER" = "yarn" ]; then
    yarn install
else
    npm install
fi
print_success "Frontend dependencies installed"

cd "$SCRIPT_DIR"

# ===============================================================
# Summary and Instructions
# ===============================================================
echo ""
echo -e "${GREEN}===============================================================${NC}"
echo -e "${GREEN}           Setup Complete! Ready to run SketchFlow             ${NC}"
echo -e "${GREEN}===============================================================${NC}"
echo ""
echo -e "${BLUE}To start the application:${NC}"
echo ""
echo "  1. Start the Backend (in a terminal):"
echo "     cd $SCRIPT_DIR/src/SketchFlow.HttpApi.Host"
echo "     dotnet run"
echo ""
echo "  2. Start the Frontend (in another terminal):"
echo "     cd $SCRIPT_DIR/angular"
if [ "$PACKAGE_MANAGER" = "yarn" ]; then
    echo "     yarn start"
else
    echo "     npm start"
fi
echo ""
echo -e "${BLUE}Access the application:${NC}"
echo "  - Angular App:     http://localhost:4200"
echo "  - API (Swagger):   https://localhost:44325/swagger"
echo ""
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo -e "${BLUE}Infrastructure (Docker):${NC}"
    echo "  - SQL Server:      localhost:1433 (sa / YourStrong@Passw0rd)"
    echo "  - RabbitMQ:        localhost:5672"
    echo "  - RabbitMQ Admin:  http://localhost:15672 (guest / guest)"
    echo ""
fi
echo -e "${BLUE}API Keys Required:${NC}"
echo "  - OpenAI API Key (GPT-4 Vision) - for sketch analysis"
echo "  - Anthropic API Key (Claude) - for code generation"
echo ""
echo "  Set these in appsettings.json or environment variables"
echo ""
echo -e "${YELLOW}Happy coding! 🎨 → 💻${NC}"
