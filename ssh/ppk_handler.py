"""PPK (PuTTY Private Key) file loading and conversion."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
from pathlib import Path

import paramiko
from cryptography.hazmat.primitives.asymmetric.ec import (
    EllipticCurvePrivateNumbers,
    EllipticCurvePublicNumbers,
    SECP256R1,
    SECP384R1,
    SECP521R1,
)
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.rsa import (
    RSAPrivateNumbers,
    RSAPublicNumbers,
    rsa_crt_dmp1,
    rsa_crt_dmq1,
)
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
)
from paramiko import ECDSAKey, Ed25519Key, RSAKey

from shared.exceptions import PPKLoadError

logger = logging.getLogger(__name__)

_CURVE_MAP = {
    "nistp256": SECP256R1(),
    "nistp384": SECP384R1(),
    "nistp521": SECP521R1(),
}


# ---------------------------------------------------------------------------
# SSH wire-format helpers
# ---------------------------------------------------------------------------

def _read_string(data: bytes) -> tuple[bytes, bytes]:
    """Read a length-prefixed string from SSH wire format.

    Returns (value_bytes, remaining_bytes).
    """
    if len(data) < 4:
        raise PPKLoadError("Truncated SSH wire data (string length)")
    length = int.from_bytes(data[:4], "big")
    if len(data) < 4 + length:
        raise PPKLoadError("Truncated SSH wire data (string body)")
    return data[4 : 4 + length], data[4 + length :]


def _read_mpint(data: bytes) -> tuple[int, bytes]:
    """Read an SSH mpint from data.

    Returns (integer_value, remaining_bytes).
    """
    value_bytes, remaining = _read_string(data)
    value = int.from_bytes(value_bytes, "big", signed=False)
    return value, remaining


# ---------------------------------------------------------------------------
# PPK file parser
# ---------------------------------------------------------------------------

def _parse_ppk_file(content: str) -> dict:
    """Parse a PPK file into a dictionary of fields.

    Returns a dict with keys:
        version (int), key_type (str), encryption (str), comment (str),
        public_blob (bytes), private_blob (bytes), private_mac (str),
        kdf (str|None), argon2_params (dict|None)
    """
    lines = content.splitlines()
    if not lines:
        raise PPKLoadError("PPK file is empty")

    first = lines[0]
    if first.startswith("PuTTY-User-Key-File-2:"):
        version = 2
        key_type = first.split(":", 1)[1].strip()
    elif first.startswith("PuTTY-User-Key-File-3:"):
        version = 3
        key_type = first.split(":", 1)[1].strip()
    else:
        raise PPKLoadError("Not a PPK file (unrecognised header)")

    fields: dict = {}
    argon2_params: dict = {}
    idx = 1

    def _next_kv() -> tuple[str, str] | None:
        nonlocal idx
        while idx < len(lines):
            line = lines[idx]
            idx += 1
            if ":" in line:
                k, v = line.split(":", 1)
                return k.strip(), v.strip()
        return None

    def _read_blob_lines(count: int) -> bytes:
        nonlocal idx
        blob_lines = []
        for _ in range(count):
            if idx >= len(lines):
                raise PPKLoadError("PPK file truncated while reading blob lines")
            blob_lines.append(lines[idx])
            idx += 1
        return base64.b64decode("".join(blob_lines))

    while idx < len(lines):
        kv = _next_kv()
        if kv is None:
            break
        key, value = kv

        if key == "Encryption":
            fields["encryption"] = value
        elif key == "Comment":
            fields["comment"] = value
        elif key == "Key-Derivation":
            fields["kdf"] = value
        elif key in ("Argon2-Memory", "Argon2-Passes", "Argon2-Parallelism"):
            argon2_params[key] = int(value)
        elif key == "Argon2-Salt":
            argon2_params["Argon2-Salt"] = value
        elif key == "Public-Lines":
            fields["public_blob"] = _read_blob_lines(int(value))
        elif key == "Private-Lines":
            fields["private_blob"] = _read_blob_lines(int(value))
        elif key == "Private-MAC":
            fields["private_mac"] = value

    fields["version"] = version
    fields["key_type"] = key_type
    fields.setdefault("encryption", "none")
    fields.setdefault("comment", "")
    fields.setdefault("kdf", None)
    fields["argon2_params"] = argon2_params if argon2_params else None

    for required in ("public_blob", "private_blob"):
        if required not in fields:
            raise PPKLoadError(f"PPK file is missing required section: {required}")

    return fields


# ---------------------------------------------------------------------------
# Decryption
# ---------------------------------------------------------------------------

def _decrypt_ppk_v2(passphrase: str, private_blob: bytes) -> bytes:
    """Decrypt a PPK v2 encrypted private blob using AES-256-CBC.

    Key derivation: SHA1(b'\\x00\\x00\\x00\\x00' + passphrase_bytes)
                  + SHA1(b'\\x00\\x00\\x00\\x01' + passphrase_bytes)
    First 32 bytes are used as the AES key; IV is 16 zero bytes.
    """
    pp = passphrase.encode("utf-8")
    key = (
        hashlib.sha1(b"\x00\x00\x00\x00" + pp).digest()
        + hashlib.sha1(b"\x00\x00\x00\x01" + pp).digest()
    )[:32]
    iv = b"\x00" * 16
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    return decryptor.update(private_blob) + decryptor.finalize()


# ---------------------------------------------------------------------------
# Key reconstruction helpers
# ---------------------------------------------------------------------------

def _build_rsa_key(public_blob: bytes, private_blob: bytes) -> paramiko.PKey:
    """Reconstruct an RSA paramiko key from PPK blobs."""
    # Public blob: string "ssh-rsa", mpint e, mpint n
    _algo, rest = _read_string(public_blob)
    e, rest = _read_mpint(rest)
    n, _ = _read_mpint(rest)

    # Private blob: mpint d, mpint p, mpint q, mpint iqmp
    d, rest = _read_mpint(private_blob)
    p, rest = _read_mpint(rest)
    q, rest = _read_mpint(rest)
    iqmp, _ = _read_mpint(rest)

    pub_numbers = RSAPublicNumbers(e=e, n=n)
    dmp1 = rsa_crt_dmp1(d, p)
    dmq1 = rsa_crt_dmq1(d, q)
    priv_numbers = RSAPrivateNumbers(
        p=p, q=q, d=d, dmp1=dmp1, dmq1=dmq1, iqmp=iqmp, public_numbers=pub_numbers
    )
    crypto_key = priv_numbers.private_key()
    pem = crypto_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
    return RSAKey.from_private_key(io.StringIO(pem.decode("ascii")))


def _build_ed25519_key(public_blob: bytes, private_blob: bytes) -> paramiko.PKey:
    """Reconstruct an Ed25519 paramiko key from PPK blobs."""
    # Private blob for ed25519: string k (32-byte seed)
    seed, _ = _read_string(private_blob)
    crypto_key = Ed25519PrivateKey.from_private_bytes(seed)
    pem = crypto_key.private_bytes(Encoding.PEM, PrivateFormat.OpenSSH, NoEncryption())
    return Ed25519Key.from_private_key(io.StringIO(pem.decode("ascii")))


def _build_ecdsa_key(
    key_type: str, public_blob: bytes, private_blob: bytes
) -> paramiko.PKey:
    """Reconstruct an ECDSA paramiko key from PPK blobs."""
    # Public blob: string "ecdsa-sha2-nistpXXX", string curve_name, string Q
    _algo, rest = _read_string(public_blob)
    curve_name_bytes, rest = _read_string(rest)
    q_bytes, _ = _read_string(rest)

    curve_name = curve_name_bytes.decode("ascii")
    if curve_name not in _CURVE_MAP:
        raise PPKLoadError(f"Unsupported ECDSA curve: {curve_name}")
    curve = _CURVE_MAP[curve_name]

    # q_bytes: 0x04 || x || y  (uncompressed point)
    if q_bytes[0] != 0x04:
        raise PPKLoadError("Only uncompressed ECDSA public points are supported")
    coord_size = (len(q_bytes) - 1) // 2
    x = int.from_bytes(q_bytes[1 : 1 + coord_size], "big")
    y = int.from_bytes(q_bytes[1 + coord_size :], "big")

    # Private blob: mpint d
    d, _ = _read_mpint(private_blob)

    pub_numbers = EllipticCurvePublicNumbers(x=x, y=y, curve=curve)
    priv_numbers = EllipticCurvePrivateNumbers(private_value=d, public_numbers=pub_numbers)
    crypto_key = priv_numbers.private_key()
    pem = crypto_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())
    return ECDSAKey.from_private_key(io.StringIO(pem.decode("ascii")))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class PPKHandler:
    """Loads and converts PuTTY Private Key files to paramiko key objects."""

    @staticmethod
    def load(ppk_path: str, passphrase: str | None = None) -> paramiko.PKey:
        """Load a PPK file and return a paramiko PKey object.

        Supports PPK v2 (encrypted + unencrypted) and PPK v3 (unencrypted).
        Falls back to PKey.from_path() for non-PPK files.
        """
        path = Path(ppk_path)
        if not path.exists():
            raise PPKLoadError(f"PPK file not found: {ppk_path}")
        if not path.is_file():
            raise PPKLoadError(f"PPK path is not a file: {ppk_path}")

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise PPKLoadError(f"Cannot read PPK file {ppk_path}: {exc}") from exc

        # If not a PPK file, fall back to paramiko's own loader
        if not content.startswith("PuTTY-User-Key-File-"):
            return PPKHandler._fallback_load(ppk_path, passphrase)

        try:
            return PPKHandler._load_ppk(ppk_path, content, passphrase)
        except PPKLoadError:
            raise
        except Exception as exc:
            raise PPKLoadError(
                f"Unexpected error loading PPK file {ppk_path}: {exc}"
            ) from exc

    @staticmethod
    def requires_passphrase(ppk_path: str) -> bool:
        """Check if a PPK file is passphrase-protected without fully loading it."""
        try:
            PPKHandler.load(ppk_path, passphrase=None)
            return False
        except PPKLoadError as exc:
            return "password-protected" in str(exc)
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback_load(ppk_path: str, passphrase: str | None) -> paramiko.PKey:
        """Use paramiko's built-in loader for OpenSSH / PEM format keys."""
        try:
            pkey = paramiko.pkey.PKey.from_path(str(ppk_path), passphrase=passphrase)
            logger.debug(
                "Loaded non-PPK key from %s (type: %s)", ppk_path, pkey.get_name()
            )
            return pkey
        except paramiko.PasswordRequiredException:
            raise PPKLoadError(
                f"PPK file is password-protected and no passphrase was provided: {ppk_path}"
            )
        except paramiko.SSHException as exc:
            raise PPKLoadError(f"Failed to parse key file {ppk_path}: {exc}") from exc
        except Exception as exc:
            raise PPKLoadError(
                f"Unexpected error loading key file {ppk_path}: {exc}"
            ) from exc

    @staticmethod
    def _load_ppk(ppk_path: str, content: str, passphrase: str | None) -> paramiko.PKey:
        """Parse and reconstruct a PPK key from file content."""
        fields = _parse_ppk_file(content)
        version: int = fields["version"]
        key_type: str = fields["key_type"]
        encryption: str = fields["encryption"]
        public_blob: bytes = fields["public_blob"]
        private_blob: bytes = fields["private_blob"]

        # Handle encryption
        if encryption != "none":
            if passphrase is None:
                raise PPKLoadError(
                    f"PPK file is password-protected and no passphrase was provided: {ppk_path}"
                )
            if version == 3:
                raise PPKLoadError(
                    "PPK v3 encrypted keys are not yet supported. "
                    "Please convert to PPK v2 or use an unencrypted key."
                )
            if encryption == "aes256-cbc":
                private_blob = _decrypt_ppk_v2(passphrase, private_blob)
            else:
                raise PPKLoadError(
                    f"Unsupported PPK encryption algorithm: {encryption}"
                )

        logger.debug(
            "Loaded PPK v%d key from %s (type: %s, encrypted: %s)",
            version,
            ppk_path,
            key_type,
            encryption != "none",
        )

        if key_type == "ssh-rsa":
            return _build_rsa_key(public_blob, private_blob)
        elif key_type == "ssh-ed25519":
            return _build_ed25519_key(public_blob, private_blob)
        elif key_type.startswith("ecdsa-sha2-"):
            return _build_ecdsa_key(key_type, public_blob, private_blob)
        else:
            raise PPKLoadError(f"Unsupported PPK key type: {key_type}")
