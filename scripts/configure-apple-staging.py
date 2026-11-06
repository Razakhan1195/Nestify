#!/usr/bin/env python3
"""Privately supply the Apple client-secret JWT for the isolated staging rollout."""
import base64
import datetime
import getpass
import json
import os
from pathlib import Path
import secrets
import sys
import time

def decode_segment(value):
    return json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))

def main():
    if not sys.stdin.isatty():
        raise SystemExit("Run this command in your own Terminal so secret entry stays hidden.")
    private = Path.home() / "Library/Application Support/Rezlee/apple-lifecycle-staging-20261012"
    path = private / "deployment-settings.json"
    if not path.is_file() or path.is_symlink():
        raise SystemExit("The prepared staging configuration is missing. Return to ChatGPT.")
    settings = json.loads(path.read_text())
    if settings.get("NEXT_PUBLIC_SUPABASE_URL") != "https://gjwvalpxnfbvryosmcbj.supabase.co":
        raise SystemExit("Staging target does not match; nothing was changed.")
    print("Paste the Apple client-secret JWT you entered in Supabase.")
    print("Input is hidden. Do not paste your Apple password or the .p8 file.")
    token = getpass.getpass("Apple client-secret JWT: ").strip()
    try:
        parts = token.split(".")
        if len(parts) != 3 or not parts[2] or len(token) > 16384:
            raise ValueError()
        header, claims = decode_segment(parts[0]), decode_segment(parts[1])
        now = time.time()
        if not (
            header.get("alg") == "ES256" and header.get("kid") == "BWNDV3HRWJ"
            and claims.get("iss") == "NH27US37HF"
            and claims.get("sub") == "com.rezlee.app.web"
            and claims.get("aud") == "https://appleid.apple.com"
            and isinstance(claims.get("iat"), (int, float))
            and isinstance(claims.get("exp"), (int, float))
            and claims["iat"] <= now + 30
            and claims["exp"] > now + 3600
            and 0 < claims["exp"] - claims["iat"] <= 15777000
        ):
            raise ValueError()
        key = base64.b64decode(settings["REZLEE_APPLE_ENCRYPTION_KEY"], validate=True)
        if len(key) != 32:
            raise ValueError()
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise SystemExit("The JWT does not match this staging setup or is near expiry. Nothing was changed.")
    settings["REZLEE_APPLE_CLIENT_SECRET"] = token
    settings["REZLEE_APPLE_GRANTS_ENABLED"] = "true"
    temp = private / ("settings-" + secrets.token_hex(8) + ".tmp")
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as target:
            json.dump(settings, target, indent=2)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()
    expiry = datetime.datetime.fromtimestamp(claims["exp"], datetime.timezone.utc)
    print("Saved privately for staging. JWT expiry: " + expiry.isoformat())
    print("Apple will verify the signature during live acceptance.")
    print("Return to ChatGPT and say saved. No deployment was performed by this command.")

if __name__ == "__main__":
    main()
