#!/bin/bash

# =============================================================================
# Smoke Tests para MCP Neo4j Cypher Server - Staging
# =============================================================================

# Configuración
STAGING_URL="${STAGING_URL:-https://mcp-neo4j-cypher-staging.eduardodominguezotero.workers.dev}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Funciones de utilidad
# =============================================================================

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# =============================================================================
# Tests
# =============================================================================

echo ""
echo "============================================================================="
echo "  MCP Neo4j Cypher Server - Smoke Tests"
echo "============================================================================="
echo "  Target: $STAGING_URL"
echo "  Date:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Health & Connectivity
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 1. Health & Connectivity ━━━${NC}"

HEALTH_RESPONSE=$(curl -s "${STAGING_URL}/health")
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${STAGING_URL}/health")

if [ "$HEALTH_STATUS" = "200" ]; then
    log_success "GET /health returns 200"
else
    log_fail "GET /health returns $HEALTH_STATUS (expected 200)"
fi

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    log_success "Health status is 'ok'"
else
    log_fail "Health status is not 'ok'"
fi

if echo "$HEALTH_RESPONSE" | jq -e '.server == "mcp-neo4j-cypher"' > /dev/null 2>&1; then
    log_success "Server name is correct"
else
    log_fail "Server name incorrect"
fi

if echo "$HEALTH_RESPONSE" | jq -e '.version' > /dev/null 2>&1; then
    log_success "Version field exists"
else
    log_fail "Version field missing"
fi

echo ""

# -----------------------------------------------------------------------------
# 2. Setup UI
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 2. Setup UI ━━━${NC}"

SETUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${STAGING_URL}/setup")
SETUP_HTML=$(curl -s "${STAGING_URL}/setup")

if [ "$SETUP_STATUS" = "200" ]; then
    log_success "GET /setup returns 200"
else
    log_fail "GET /setup returns $SETUP_STATUS"
fi

if echo "$SETUP_HTML" | grep -q "<!DOCTYPE html>"; then
    log_success "Setup page returns valid HTML"
else
    log_fail "Setup page does not return HTML"
fi

if echo "$SETUP_HTML" | grep -q "mcp-neo4j-cypher"; then
    log_success "Setup page contains app name"
else
    log_fail "Setup page missing app name"
fi

if echo "$SETUP_HTML" | grep -q "<form"; then
    log_success "Setup page contains form"
else
    log_fail "Setup page missing form"
fi

echo ""

# -----------------------------------------------------------------------------
# 3. API Setup Status
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 3. API Setup Status ━━━${NC}"

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${STAGING_URL}/api/setup")
API_RESPONSE=$(curl -s "${STAGING_URL}/api/setup")

if [ "$API_STATUS" = "200" ]; then
    log_success "GET /api/setup returns 200"
else
    log_fail "GET /api/setup returns $API_STATUS"
fi

if echo "$API_RESPONSE" | jq -e '.connected == false' > /dev/null 2>&1; then
    log_success "Not connected without auth (expected)"
else
    log_fail "Unexpected connection status"
fi

echo ""

# -----------------------------------------------------------------------------
# 4. MCP Protocol - Initialize
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 4. MCP Protocol - Initialize ━━━${NC}"

INIT_REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"smoke-test","version":"1.0.0"},"capabilities":{}}}'

INIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$INIT_REQUEST")
INIT_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$INIT_REQUEST")

if [ "$INIT_STATUS" = "200" ]; then
    log_success "POST /mcp initialize returns 200"
else
    log_fail "POST /mcp initialize returns $INIT_STATUS"
fi

if echo "$INIT_RESPONSE" | jq -e '.jsonrpc == "2.0"' > /dev/null 2>&1; then
    log_success "JSON-RPC version is 2.0"
else
    log_fail "JSON-RPC version incorrect"
fi

if echo "$INIT_RESPONSE" | jq -e '.id == 1' > /dev/null 2>&1; then
    log_success "Response ID matches request"
else
    log_fail "Response ID mismatch"
fi

if echo "$INIT_RESPONSE" | jq -e '.result.serverInfo.name == "mcp-neo4j-cypher"' > /dev/null 2>&1; then
    log_success "Server info name correct"
else
    log_fail "Server info name incorrect"
fi

if echo "$INIT_RESPONSE" | jq -e '.result.capabilities' > /dev/null 2>&1; then
    log_success "Capabilities object exists"
else
    log_fail "Capabilities object missing"
fi

if echo "$INIT_RESPONSE" | jq -e '.result.protocolVersion' > /dev/null 2>&1; then
    log_success "Protocol version in response"
else
    log_fail "Protocol version missing"
fi

echo ""

# -----------------------------------------------------------------------------
# 5. MCP Protocol - Tools List
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 5. MCP Protocol - Tools List ━━━${NC}"

TOOLS_REQUEST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

TOOLS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$TOOLS_REQUEST")
TOOLS_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$TOOLS_REQUEST")

if [ "$TOOLS_STATUS" = "200" ]; then
    log_success "POST /mcp tools/list returns 200"
else
    log_fail "POST /mcp tools/list returns $TOOLS_STATUS"
fi

TOOLS_COUNT=$(echo "$TOOLS_RESPONSE" | jq '.result.tools | length' 2>/dev/null)
if [ "$TOOLS_COUNT" = "3" ]; then
    log_success "Returns exactly 3 tools"
else
    log_fail "Expected 3 tools, got $TOOLS_COUNT"
fi

if echo "$TOOLS_RESPONSE" | jq -e '.result.tools[] | select(.name == "get_neo4j_schema")' > /dev/null 2>&1; then
    log_success "Tool 'get_neo4j_schema' exists"
else
    log_fail "Tool 'get_neo4j_schema' not found"
fi

if echo "$TOOLS_RESPONSE" | jq -e '.result.tools[] | select(.name == "read_neo4j_cypher")' > /dev/null 2>&1; then
    log_success "Tool 'read_neo4j_cypher' exists"
else
    log_fail "Tool 'read_neo4j_cypher' not found"
fi

if echo "$TOOLS_RESPONSE" | jq -e '.result.tools[] | select(.name == "write_neo4j_cypher")' > /dev/null 2>&1; then
    log_success "Tool 'write_neo4j_cypher' exists"
else
    log_fail "Tool 'write_neo4j_cypher' not found"
fi

# Verificar que cada herramienta tiene inputSchema
for tool in get_neo4j_schema read_neo4j_cypher write_neo4j_cypher; do
    if echo "$TOOLS_RESPONSE" | jq -e ".result.tools[] | select(.name == \"$tool\") | .inputSchema" > /dev/null 2>&1; then
        log_success "Tool '$tool' has inputSchema"
    else
        log_fail "Tool '$tool' missing inputSchema"
    fi
done

echo ""

# -----------------------------------------------------------------------------
# 6. MCP Protocol - Error Handling
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 6. MCP Protocol - Error Handling ━━━${NC}"

# Invalid method
INVALID_METHOD='{"jsonrpc":"2.0","id":3,"method":"invalid/method","params":{}}'
INVALID_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$INVALID_METHOD")

if echo "$INVALID_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    log_success "Returns error for invalid method"
else
    log_fail "No error for invalid method"
fi

ERROR_CODE=$(echo "$INVALID_RESPONSE" | jq '.error.code' 2>/dev/null)
if [ "$ERROR_CODE" = "-32601" ]; then
    log_success "Error code is -32601 (Method not found)"
else
    log_fail "Expected error code -32601, got $ERROR_CODE"
fi

# Invalid JSON
INVALID_JSON_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "not valid json")

if echo "$INVALID_JSON_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    log_success "Returns error for invalid JSON"
else
    log_fail "No error for invalid JSON"
fi

# Missing required fields
MISSING_FIELDS='{"jsonrpc":"2.0"}'
MISSING_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$MISSING_FIELDS")

if echo "$MISSING_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    log_success "Returns error for missing fields"
else
    log_fail "No error for missing fields"
fi

echo ""

# -----------------------------------------------------------------------------
# 7. MCP Protocol - tools/call without auth
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 7. MCP Protocol - tools/call (no auth) ━━━${NC}"

CALL_REQUEST='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_neo4j_schema","arguments":{}}}'
CALL_RESPONSE=$(curl -s -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$CALL_REQUEST")

CALL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${STAGING_URL}/mcp" \
    -H "Content-Type: application/json" \
    -d "$CALL_REQUEST")

if [ "$CALL_STATUS" = "200" ]; then
    log_success "POST /mcp tools/call returns 200"
else
    log_fail "POST /mcp tools/call returns $CALL_STATUS"
fi

# Debería retornar instrucciones de setup o error
CALL_TEXT=$(echo "$CALL_RESPONSE" | jq -r '.result.content[0].text // .error.message // ""' 2>/dev/null)
if echo "$CALL_TEXT" | grep -qiE "setup|config|connect|neo4j|not configured"; then
    log_success "Returns setup instructions without auth"
else
    log_warn "Response: $CALL_TEXT"
fi

echo ""

# -----------------------------------------------------------------------------
# 8. CORS Headers
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 8. CORS Headers ━━━${NC}"

CORS_HEADERS=$(curl -s -I -X OPTIONS "${STAGING_URL}/mcp" \
    -H "Origin: https://claude.ai" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" 2>/dev/null)

if echo "$CORS_HEADERS" | grep -qi "access-control-allow-origin"; then
    log_success "CORS Allow-Origin header present"
    ORIGIN_VALUE=$(echo "$CORS_HEADERS" | grep -i "access-control-allow-origin" | head -1)
    echo "       $ORIGIN_VALUE"
else
    log_fail "CORS Allow-Origin header missing"
fi

if echo "$CORS_HEADERS" | grep -qi "access-control-allow-methods"; then
    log_success "CORS Allow-Methods header present"
else
    log_fail "CORS Allow-Methods header missing"
fi

if echo "$CORS_HEADERS" | grep -qi "access-control-allow-headers"; then
    log_success "CORS Allow-Headers header present"
else
    log_fail "CORS Allow-Headers header missing"
fi

echo ""

# -----------------------------------------------------------------------------
# 9. 404 Handling
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 9. 404 Handling ━━━${NC}"

NOT_FOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${STAGING_URL}/nonexistent-route-12345")
NOT_FOUND_BODY=$(curl -s "${STAGING_URL}/nonexistent-route-12345")

if [ "$NOT_FOUND_STATUS" = "404" ]; then
    log_success "Returns 404 for unknown route"
else
    log_fail "Expected 404, got $NOT_FOUND_STATUS"
fi

if echo "$NOT_FOUND_BODY" | jq -e '.error' > /dev/null 2>&1; then
    log_success "404 returns JSON error body"
else
    log_fail "404 does not return JSON error"
fi

echo ""

# -----------------------------------------------------------------------------
# 10. Setup API - Invalid Credentials
# -----------------------------------------------------------------------------
echo -e "${BLUE}━━━ 10. Setup API - Validation ━━━${NC}"

# Test con URI inválida
INVALID_SETUP='{"neo4jUri":"invalid-uri","neo4jUser":"test","neo4jPassword":"test"}'
INVALID_SETUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${STAGING_URL}/api/setup" \
    -H "Content-Type: application/json" \
    -d "$INVALID_SETUP")

if [ "$INVALID_SETUP_STATUS" = "400" ]; then
    log_success "Rejects invalid Neo4j URI with 400"
else
    log_warn "Invalid URI returned $INVALID_SETUP_STATUS (expected 400)"
fi

# Test sin campos requeridos
MISSING_SETUP='{"neo4jUri":"neo4j+s://test.databases.neo4j.io"}'
MISSING_SETUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${STAGING_URL}/api/setup" \
    -H "Content-Type: application/json" \
    -d "$MISSING_SETUP")

if [ "$MISSING_SETUP_STATUS" = "400" ]; then
    log_success "Rejects missing credentials with 400"
else
    log_warn "Missing credentials returned $MISSING_SETUP_STATUS (expected 400)"
fi

echo ""

# =============================================================================
# Resumen
# =============================================================================

TESTS_TOTAL=$((TESTS_PASSED + TESTS_FAILED))

echo "============================================================================="
echo -e "  ${BLUE}TEST SUMMARY${NC}"
echo "============================================================================="
echo ""
echo -e "  Total:  $TESTS_TOTAL"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "  ${GREEN}✓ All tests passed! Ready for production deploy.${NC}"
    echo ""
    exit 0
else
    echo -e "  ${YELLOW}⚠ Some tests failed. Review before production deploy.${NC}"
    echo ""
    exit 1
fi
