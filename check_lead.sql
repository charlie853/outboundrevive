SELECT id, name, phone, status, opted_out, created_at 
FROM leads 
WHERE phone IN ('+12062959002', '+14152655001')
LIMIT 10;
