import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s"))

    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # The dashboard polls several times per second; keep access logs out of INFO.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
