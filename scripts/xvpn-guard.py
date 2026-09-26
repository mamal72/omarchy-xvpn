#!/usr/bin/env python3
"""Bound X-VPN CLI output and runtime before Quickshell collects it."""

import os
import selectors
import signal
import subprocess
import sys
import time


LIMITS = {
    "status": (16 * 1024, 30),
    "account": (16 * 1024, 30),
    "location": (256 * 1024, 40),
    "protocol": (16 * 1024, 30),
    "connect": (16 * 1024, 120),
    "disconnect": (16 * 1024, 45),
}
LOCK_WAIT_SECONDS = 20


def stop_child(child, include_exited=False):
    if child.poll() is not None and not include_exited:
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    if child.poll() is None:
        child.wait()


def main(args):
    if not args or args[0] not in LIMITS:
        print("Unsupported X-VPN command", file=sys.stderr)
        return 64
    if args[0] == "protocol" and args[1:] != ["--get"] and (
        len(args) != 3 or args[1] != "--set"
    ):
        print("Unsupported X-VPN protocol command", file=sys.stderr)
        return 64

    max_bytes, deadline_seconds = LIMITS[args[0]]
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR") or "/tmp"
    lock_path = os.path.join(runtime_dir, "omarchy-xvpn-cli.lock")
    try:
        child = subprocess.Popen(
            ["flock", "-F", "-w", str(LOCK_WAIT_SECONDS), lock_path, "xvpn", *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    except OSError as exc:
        print(f"Could not start X-VPN: {exc}")
        return 69

    def cancelled(_signal, _frame):
        stop_child(child, include_exited=True)
        raise SystemExit(128 + signal.SIGTERM)

    signal.signal(signal.SIGTERM, cancelled)
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)
    output = bytearray()
    deadline = time.monotonic() + deadline_seconds
    try:
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                stop_child(child, include_exited=True)
                print("X-VPN command timed out")
                return 124
            for key, _ in selector.select(remaining):
                chunk = os.read(key.fd, min(65536, max_bytes + 1 - len(output)))
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                if len(output) + len(chunk) > max_bytes:
                    stop_child(child, include_exited=True)
                    print("X-VPN command output exceeded the limit")
                    return 70
                output.extend(chunk)
        child.wait()
        sys.stdout.buffer.write(output)
        return child.returncode if child.returncode >= 0 else 128 - child.returncode
    finally:
        selector.close()
        stop_child(child)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
