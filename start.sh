#!/bin/bash
echo "==================================================="
echo "  FinAI - AI Tax Accountant & Financial Manager"
echo "==================================================="
echo ""

if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "[ERROR] Python 3 is not installed or not in PATH."
        exit 1
    else
        PYTHON_CMD="python"
    fi
else
    PYTHON_CMD="python3"
fi

echo "Starting FinAI local server on http://localhost:8000 ..."
$PYTHON_CMD "$(dirname "$0")/server.py"
