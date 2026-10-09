-- 0006: device secret. POST /auth/anon authenticates a KNOWN device_id with a client-generated 256-bit secret.
-- Only sha256(secret) hex is stored. NULL (rows from before this migration) can never match, so such a device
-- cannot re-login with /auth/anon (its refresh token still works).
ALTER TABLE devices ADD COLUMN device_secret_hash TEXT;
