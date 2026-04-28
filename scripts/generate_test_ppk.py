#!/usr/bin/env python3
"""
Generate a test RSA key and save it as a PPK file for use in tests.

Usage:
    python scripts/generate_test_ppk.py [--output tests/fixtures/test_key.ppk] [--passphrase mypass]

The generated PPK file path can be set via TEST_PPK_PATH environment variable
to enable PPK handler integration tests.
"""

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a test PPK key file")
    parser.add_argument(
        "--output",
        default="tests/fixtures/test_key.ppk",
        help="Output path for the PPK file",
    )
    parser.add_argument(
        "--passphrase",
        default="",
        help="Optional passphrase to encrypt the key",
    )
    parser.add_argument(
        "--bits",
        type=int,
        default=2048,
        help="RSA key size in bits (default: 2048)",
    )
    args = parser.parse_args()

    try:
        import paramiko
    except ImportError:
        print("ERROR: paramiko is required. Run: pip install paramiko", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Generating {args.bits}-bit RSA key...")
    key = paramiko.RSAKey.generate(args.bits)

    passphrase = args.passphrase if args.passphrase else None
    key.write_private_key_file(str(output_path), password=passphrase)

    print(f"Key written to: {output_path}")
    print(f"Passphrase: {'(none)' if not passphrase else '(set)'}")
    print()
    print("To use in tests, set:")
    print(f"  export TEST_PPK_PATH={output_path.absolute()}")
    if passphrase:
        print(f"  export TEST_PPK_PASSWORD={passphrase}")


if __name__ == "__main__":
    main()
