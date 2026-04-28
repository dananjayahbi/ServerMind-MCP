"""GUI entry point."""

import logging
import sys


def main() -> None:
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    try:
        import customtkinter  # noqa: F401
    except ImportError:
        print(
            "ERROR: customtkinter is not installed.\n"
            "Run: pip install customtkinter",
            file=sys.stderr,
        )
        sys.exit(1)

    from gui.app import ServerMindApp

    app = ServerMindApp()
    app.mainloop()


if __name__ == "__main__":
    main()
