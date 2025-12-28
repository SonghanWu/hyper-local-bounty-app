#!/bin/bash

echo "🧪 Running all Phase 2 tests..."
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# Test 1: Logout disables push notifications
echo -e "${YELLOW}Test 1: Logout disables push notifications${NC}"
node tests/test-logout-push-notifications.js
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Test 1 PASSED${NC}\n"
else
  echo -e "${RED}❌ Test 1 FAILED${NC}\n"
  FAILED=$((FAILED + 1))
fi

sleep 2

# Test 2: TTL mechanism
echo -e "${YELLOW}Test 2: TTL mechanism (5-minute expiration)${NC}"
node tests/test-ttl-mechanism.js
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Test 2 PASSED${NC}\n"
else
  echo -e "${RED}❌ Test 2 FAILED${NC}\n"
  FAILED=$((FAILED + 1))
fi

sleep 2

# Test 3: Location persistence
echo -e "${YELLOW}Test 3: Location persistence (Redis + PostgreSQL)${NC}"
node tests/test-location-persistence.js
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Test 3 PASSED${NC}\n"
else
  echo -e "${RED}❌ Test 3 FAILED${NC}\n"
  FAILED=$((FAILED + 1))
fi

# Summary
echo "=================================="
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAILED test(s) failed${NC}"
  exit 1
fi
