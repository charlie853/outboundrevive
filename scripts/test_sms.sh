#!/usr/bin/env bash
set -euo pipefail

# SMS System Test Harness
# Tests the unified LLM system prompt + JSON contract implementation

BASE_URL="${BASE_URL:-http://localhost:3000}"
TWILIO_WEBHOOK="${BASE_URL}/api/webhooks/twilio/inbound"
TEST_FROM="+14155551234"
TEST_TO="+14155556789"

echo "=== OutboundRevive SMS Test Harness ==="
echo "Target: $TWILIO_WEBHOOK"
echo

# Helper: send SMS and capture response
send_sms() {
  local body="$1"
  local from="${2:-$TEST_FROM}"
  
  curl -s -X POST "$TWILIO_WEBHOOK" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "From=$from" \
    --data-urlencode "To=$TEST_TO" \
    --data-urlencode "Body=$body"
}

# Helper: extract message from TwiML
extract_message() {
  echo "$1" | grep -oP '(?<=<Message>)[^<]+' | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&apos;/'\''/g'
}

# Helper: check if response contains text
assert_contains() {
  local response="$1"
  local expected="$2"
  local test_name="$3"
  
  if echo "$response" | grep -qi "$expected"; then
    echo "✅ PASS: $test_name"
    return 0
  else
    echo "❌ FAIL: $test_name"
    echo "   Expected to contain: $expected"
    echo "   Got: $(extract_message "$response")"
    return 1
  fi
}

# Helper: check length
assert_length() {
  local response="$1"
  local max_length="$2"
  local test_name="$3"
  
  local msg=$(extract_message "$response")
  local len=${#msg}
  
  if [ "$len" -le "$max_length" ]; then
    echo "✅ PASS: $test_name (length: $len)"
    return 0
  else
    echo "❌ FAIL: $test_name"
    echo "   Max length: $max_length, got: $len"
    echo "   Message: $msg"
    return 1
  fi
}

# === Health Checks ===
echo "--- Health Checks ---"

health_ok=$(curl -s "${BASE_URL}/api/ok" || echo "FAIL")
if echo "$health_ok" | grep -q "ok"; then
  echo "✅ /api/ok"
else
  echo "❌ /api/ok failed"
fi

health_sms=$(curl -s "${BASE_URL}/api/health/sms" || echo "FAIL")
if echo "$health_sms" | grep -qi "ok\|healthy\|200"; then
  echo "✅ /api/health/sms"
else
  echo "❌ /api/health/sms failed"
fi

echo

# === Test A: Scheduling ===
echo "--- Test A: Scheduling ---"
resp_a=$(send_sms "book a call")
msg_a=$(extract_message "$resp_a")

assert_contains "$resp_a" "cal.com" "A1: Contains booking link"
assert_length "$resp_a" 320 "A2: Length ≤320"

# Check if link is last
if echo "$msg_a" | grep -oE 'https?://[^ ]+' | tail -1 | grep -q 'cal.com'; then
  echo "✅ PASS: A3: Link is last"
else
  echo "❌ FAIL: A3: Link should be last token"
fi

echo

# === Test B: "who is this" ===
echo "--- Test B: Identity ---"
resp_b=$(send_sms "who is this")
msg_b=$(extract_message "$resp_b")

if [ "$msg_b" = "Charlie from OutboundRevive." ]; then
  echo "✅ PASS: B1: Exact match"
else
  echo "❌ FAIL: B1: Expected 'Charlie from OutboundRevive.', got '$msg_b'"
fi

echo

# === Test C: Pricing ===
echo "--- Test C: Pricing ---"
resp_c=$(send_sms "how much does this cost")
msg_c=$(extract_message "$resp_c")

assert_length "$resp_c" 320 "C1: Length ≤320"
assert_contains "$resp_c" "\$" "C2: Contains price anchor"

# Check for 1-2 sentences (rough heuristic: 1-3 periods/question marks)
sentence_count=$(echo "$msg_c" | grep -o '[.?!]' | wc -l)
if [ "$sentence_count" -le 3 ]; then
  echo "✅ PASS: C3: Concise (1-2 sentences)"
else
  echo "⚠️  WARN: C3: May be too verbose ($sentence_count sentences)"
fi

echo

# === Test D: 24h link gate ===
echo "--- Test D: 24h Link Gate ---"
# First request (should have link from test A above, so use fresh number)
test_from_d="+14155559999"
resp_d1=$(send_sms "book a call" "$test_from_d")
msg_d1=$(extract_message "$resp_d1")

if echo "$msg_d1" | grep -q "cal.com"; then
  echo "✅ PASS: D1: First request has link"
else
  echo "⚠️  WARN: D1: First request should have link"
fi

# Second request within 60s (should NOT have link)
sleep 2
resp_d2=$(send_sms "book a call" "$test_from_d")
msg_d2=$(extract_message "$resp_d2")

if echo "$msg_d2" | grep -q "cal.com"; then
  echo "❌ FAIL: D2: Second request should NOT have link (24h gate)"
  echo "   Got: $msg_d2"
else
  echo "✅ PASS: D2: Second request has no link (gated)"
fi

echo

# === Test E: Compliance (STOP) ===
echo "--- Test E: Compliance ---"
test_from_e="+14155558888"

# Send STOP
resp_e=$(send_sms "STOP" "$test_from_e")
msg_e=$(extract_message "$resp_e")

assert_contains "$resp_e" "paused\|opted out\|won't receive" "E1: STOP confirmation"

# Try sending another message (should get no response or empty)
sleep 1
resp_e2=$(send_sms "hello" "$test_from_e")

if echo "$resp_e2" | grep -q '<Message>'; then
  echo "⚠️  WARN: E2: Lead should be suppressed after STOP (got response)"
else
  echo "✅ PASS: E2: No response after STOP (opted out)"
fi

echo

# === Test F: PAUSE ===
echo "--- Test F: PAUSE ---"
test_from_f="+14155557777"

resp_f=$(send_sms "PAUSE" "$test_from_f")
msg_f=$(extract_message "$resp_f")

assert_contains "$resp_f" "paused\|won't receive" "F1: PAUSE confirmation"

echo

# === Test G: HELP ===
echo "--- Test G: HELP ---"
resp_g=$(send_sms "HELP")
msg_g=$(extract_message "$resp_g")

assert_contains "$resp_g" "PAUSE\|START\|stop" "G1: HELP includes opt-out info"

echo

# === Summary ===
echo "========================================="
echo "Test suite complete."
echo "Review failures above and check server logs for detailed diagnostics."

