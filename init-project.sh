#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Welcome to the Gemini TTS API Project Setup Script!${NC}"
echo "This script will help you get the project ready to run."
echo "-----------------------------------------------------"

# --- Helper Functions ---
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}Error: '$1' command not found. Please install $1 and try again.${NC}"
    exit 1
  fi
}

# --- 1. Check Prerequisites ---
echo -e "\n${YELLOW}Step 1: Checking prerequisites...${NC}"
check_command "node"
check_command "npm"

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"
echo -e "${GREEN}✅ npm found: $NPM_VERSION${NC}"
# Add more specific version checks if needed, e.g.:
# if ! node -v | grep -q "v18."; then
#   echo -e "${YELLOW}Warning: Node.js v18 or higher is recommended.${NC}"
# fi

# --- 2. Check for package.json ---
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found in the current directory.${NC}"
    echo "Please ensure you are in the root directory of the project."
    exit 1
fi
echo -e "${GREEN}✅ package.json found.${NC}"

# --- 3. Install Dependencies ---
echo -e "\n${YELLOW}Step 2: Installing project dependencies (if needed)...${NC}"
if [ -d "node_modules" ]; then
  echo -e "${GREEN}✅ node_modules directory already exists. Skipping 'npm install'.${NC}"
  echo "   If you want to force a reinstall, delete node_modules and run this script again, or run 'npm install'."
else
  if npm install; then
    echo -e "${GREEN}✅ Dependencies installed successfully.${NC}"
  else
    echo -e "${RED}Error: 'npm install' failed. Please check for errors above.${NC}"
    exit 1
  fi
fi

# --- 4. Setup .env file ---
echo -e "\n${YELLOW}Step 3: Setting up .env configuration file...${NC}"
ENV_EXAMPLE_FILE="env.example" # Assuming your example file is env.example
# If your example file is indeed env-example.sh, change the line above to:
# ENV_EXAMPLE_FILE="env-example.sh"

if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
    echo -e "${RED}Error: Environment example file ('$ENV_EXAMPLE_FILE') not found!${NC}"
    echo "Cannot create .env file. Please ensure '$ENV_EXAMPLE_FILE' exists."
    # Attempt to create a basic one if truly missing, as a fallback
    echo -e "${YELLOW}Creating a minimal .env file as a fallback. Please review it carefully!${NC}"
    echo "GEMINI_API_KEY=your_gemini_api_key_here" > .env
    echo "PORT=3000" >> .env
else
    if [ -f ".env" ]; then
        echo -e "${GREEN}✅ .env file already exists.${NC}"
        echo "   Please ensure it contains your GEMINI_API_KEY."
    else
        cp "$ENV_EXAMPLE_FILE" .env
        echo -e "${GREEN}✅ .env file created from '$ENV_EXAMPLE_FILE'.${NC}"
    fi
fi

# Check if GEMINI_API_KEY is set (basic check, not foolproof)
if grep -q "GEMINI_API_KEY=your_gemini_api_key_here" .env || ! grep -q "GEMINI_API_KEY" .env; then
  echo -e "\n${RED}IMPORTANT: You MUST set your GEMINI_API_KEY in the .env file!${NC}"
  echo "Open the '.env' file and replace 'your_gemini_api_key_here' with your actual API key."
else
  echo -e "${GREEN}✅ GEMINI_API_KEY seems to be set in .env (please verify it's correct).${NC}"
fi

# --- 5. Create 'sessions' directory ---
echo -e "\n${YELLOW}Step 4: Ensuring 'sessions' directory exists...${NC}"
SESSIONS_DIR="sessions"
if [ -d "$SESSIONS_DIR" ]; then
  echo -e "${GREEN}✅ '$SESSIONS_DIR' directory already exists.${NC}"
else
  if mkdir "$SESSIONS_DIR"; then
    echo -e "${GREEN}✅ '$SESSIONS_DIR' directory created successfully.${NC}"
  else
    echo -e "${RED}Error: Failed to create '$SESSIONS_DIR' directory.${NC}"
    echo "Please create it manually."
  fi
fi

# --- 6. Create 'public' directory (if your app serves static files from it) ---
# The gemini-tts-api.js uses app.use(express.static('public'));
echo -e "\n${YELLOW}Step 5: Ensuring 'public' directory exists...${NC}"
PUBLIC_DIR="public"
if [ -d "$PUBLIC_DIR" ]; then
  echo -e "${GREEN}✅ '$PUBLIC_DIR' directory already exists.${NC}"
else
  if mkdir "$PUBLIC_DIR"; then
    echo -e "${GREEN}✅ '$PUBLIC_DIR' directory created successfully.${NC}"
    echo "   You can place static files like test-client.html here."
    # Optionally copy the test client if it's in a known location
    if [ -f "test-client.html" ]; then
        cp "test-client.html" "$PUBLIC_DIR/test-client.html"
        echo -e "${GREEN}   Copied test-client.html to $PUBLIC_DIR/test-client.html${NC}"
    fi
  else
    echo -e "${RED}Error: Failed to create '$PUBLIC_DIR' directory.${NC}"
    echo "Please create it manually if your application requires it for static files."
  fi
fi


# --- 7. Final Instructions ---
echo -e "\n-----------------------------------------------------"
echo -e "${GREEN}🎉 Project setup is complete!${NC}"
echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. ${RED}Ensure your GEMINI_API_KEY is correctly set in the '.env' file.${NC}"
echo "   The application will not work correctly without it for API calls."
echo "2. To start the server in development mode (with auto-restart):"
echo -e "   ${GREEN}npm run dev${NC}"
echo "3. To start the server in production mode:"
echo -e "   ${GREEN}npm start${NC}"
echo "4. The server will typically run on http://localhost:3000 (or the port specified in .env)."
echo "   If you copied/placed 'test-client.html' in the 'public' directory, you can access it at http://localhost:3000/test-client.html"
echo "5. To run tests (ensure you have test dependencies like Jest installed via devDependencies):"
echo -e "   ${GREEN}npm test${NC}"

echo -e "\n${YELLOW}Optional: Run a quick health check?${NC}"
echo "This will try to start the server and query the /health endpoint."
echo "Make sure your GEMINI_API_KEY is set in .env for the server to start without issues if it checks the key on init."

read -p "Run health check now? (y/N): " run_health_check
if [[ "$run_health_check" =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Attempting to run health check...${NC}"
    # Check if server is already running on the default port (3000 or from .env)
    PORT_TO_CHECK=$(grep '^PORT=' .env | cut -d '=' -f2)
    PORT_TO_CHECK=${PORT_TO_CHECK:-3000} # Default to 3000 if not in .env

    if nc -z localhost "$PORT_TO_CHECK"; then
        echo -e "${YELLOW}Server seems to be already running on port $PORT_TO_CHECK.${NC}"
        echo "Querying health endpoint..."
        if curl -s http://localhost:"$PORT_TO_CHECK"/health | grep -q '"success":true'; then
            echo -e "${GREEN}✅ Health check successful! Server is responsive.${NC}"
            curl -s http://localhost:"$PORT_TO_CHECK"/health
        else
            echo -e "${RED}❌ Health check failed or server not responding as expected on /health.${NC}"
        fi
    else
        echo "Starting server temporarily for health check (will stop it afterwards)..."
        # Assuming 'server.js' is your main file as per package.json
        # And that GEMINI_API_KEY is not strictly required just to start and reach /health
        (npm start & PID=$! ; sleep 5 ; \
        if curl -s http://localhost:"$PORT_TO_CHECK"/health | grep -q '"success":true'; then
            echo -e "\n${GREEN}✅ Health check successful! Server is responsive.${NC}"
            curl -s http://localhost:"$PORT_TO_CHECK"/health
        else
            echo -e "\n${RED}❌ Health check failed. Server might not have started correctly or /health is not reachable.${NC}"
            echo "   Check server logs if it tried to start."
        fi \
        ; kill $PID 2>/dev/null)
        wait $PID 2>/dev/null
        echo -e "\nTemporary server stopped."
    fi
else
    echo -e "${GREEN}Skipping health check.${NC}"
fi

echo -e "\nHappy coding! ✨"
echo "-----------------------------------------------------"
