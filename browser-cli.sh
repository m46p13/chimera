#!/bin/bash
# Browser control CLI for Chimera
# Usage: browser-cli.sh <command> [args]

BASE_URL="http://127.0.0.1:18799"

case "$1" in
  navigate)
    curl -s -X POST "$BASE_URL/browser/navigate" -H "Content-Type: application/json" -d "{\"url\": \"$2\"}"
    ;;
  screenshot)
    curl -s -X POST "$BASE_URL/browser/screenshot" | jq -r '.image' 2>/dev/null || curl -s -X POST "$BASE_URL/browser/screenshot"
    ;;
  click)
    curl -s -X POST "$BASE_URL/browser/click" -H "Content-Type: application/json" -d "{\"selector\": \"$2\"}"
    ;;
  type)
    curl -s -X POST "$BASE_URL/browser/type" -H "Content-Type: application/json" -d "{\"selector\": \"$2\", \"text\": \"$3\"}"
    ;;
  url)
    curl -s "$BASE_URL/browser/url"
    ;;
  title)
    curl -s "$BASE_URL/browser/title"
    ;;
  eval)
    curl -s -X POST "$BASE_URL/browser/evaluate" -H "Content-Type: application/json" -d "{\"code\": \"$2\"}"
    ;;
  *)
    echo "Usage: browser-cli.sh <command> [args]"
    echo "Commands: navigate <url>, screenshot, click <selector>, type <selector> <text>, url, title, eval <code>"
    ;;
esac
