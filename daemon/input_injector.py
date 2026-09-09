#!/usr/bin/env python3
import sys
import os
import time
import fcntl
import struct
import json
import subprocess

# Linux input event constants
UI_SET_EVBIT   = 0x40045564
UI_SET_KEYBIT  = 0x40045565
UI_SET_RELBIT  = 0x40045566
UI_SET_ABSBIT  = 0x40045567
UI_DEV_SETUP   = 0x405c5503
UI_ABS_SETUP   = 0x401c5504
UI_DEV_CREATE  = 0x5501
UI_DEV_DESTROY = 0x5502

EV_SYN = 0x00
EV_KEY = 0x01
EV_REL = 0x02
EV_ABS = 0x03

ABS_X = 0x00
ABS_Y = 0x01
REL_X = 0x00
REL_Y = 0x01
REL_WHEEL = 0x08

BTN_LEFT   = 0x110
BTN_RIGHT  = 0x111
BTN_MIDDLE = 0x112
BTN_TOUCH  = 0x14a

def emit_event(fd, ev_type, code, value):
    now = time.time()
    tv_sec = int(now)
    tv_usec = int((now - tv_sec) * 1_000_000)
    # struct input_event: timeval (16 bytes on 64-bit), type (2), code (2), value (4) -> 24 bytes
    data = struct.pack("qqHHi", tv_sec, tv_usec, ev_type, code, value)
    os.write(fd, data)

def syn(fd):
    emit_event(fd, EV_SYN, 0, 0)

def main():
    try:
        fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
    except Exception as e:
        sys.stderr.write(f"MirrorMarch Input: Could not open /dev/uinput: {e}\n")
        sys.exit(1)

    # Enable event types
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_SYN)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_LEFT)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_RIGHT)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_MIDDLE)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_TOUCH)

    fcntl.ioctl(fd, UI_SET_EVBIT, EV_REL)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_X)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_Y)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_WHEEL)

    fcntl.ioctl(fd, UI_SET_EVBIT, EV_ABS)
    fcntl.ioctl(fd, UI_SET_ABSBIT, ABS_X)
    fcntl.ioctl(fd, UI_SET_ABSBIT, ABS_Y)

    # Absolute range: 0 to 65535 for high precision
    MAX_ABS = 65535
    abs_x = struct.pack("HHiiiiii", ABS_X, 0, 0, 0, MAX_ABS, 0, 0, 1)
    abs_y = struct.pack("HHiiiiii", ABS_Y, 0, 0, 0, MAX_ABS, 0, 0, 1)
    fcntl.ioctl(fd, UI_ABS_SETUP, abs_x)
    fcntl.ioctl(fd, UI_ABS_SETUP, abs_y)

    id_struct = struct.pack("HHHH", 0x03, 0x1234, 0x5679, 1)
    name = b"MirrorMarch Tablet & Pointer".ljust(80, b"\x00")
    setup_data = id_struct + name + struct.pack("I", 0)

    fcntl.ioctl(fd, UI_DEV_SETUP, setup_data)
    fcntl.ioctl(fd, UI_DEV_CREATE)
    sys.stderr.write("MirrorMarch: Virtual input device active\n")

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue

            action = msg.get("action")

            if action == "move":
                x = float(msg.get("x", 0.0))
                y = float(msg.get("y", 0.0))
                abs_x_val = int(max(0.0, min(1.0, x)) * MAX_ABS)
                abs_y_val = int(max(0.0, min(1.0, y)) * MAX_ABS)
                emit_event(fd, EV_ABS, ABS_X, abs_x_val)
                emit_event(fd, EV_ABS, ABS_Y, abs_y_val)
                syn(fd)

            elif action == "rel_move":
                dx = int(float(msg.get("dx", 0.0)) * 100)
                dy = int(float(msg.get("dy", 0.0)) * 100)
                if dx != 0 or dy != 0:
                    emit_event(fd, EV_REL, REL_X, dx)
                    emit_event(fd, EV_REL, REL_Y, dy)
                    syn(fd)

            elif action == "click":
                btn = BTN_LEFT if msg.get("button") == "left" else BTN_RIGHT
                if "x" in msg and "y" in msg:
                    x = float(msg.get("x", 0.0))
                    y = float(msg.get("y", 0.0))
                    abs_x_val = int(max(0.0, min(1.0, x)) * MAX_ABS)
                    abs_y_val = int(max(0.0, min(1.0, y)) * MAX_ABS)
                    emit_event(fd, EV_ABS, ABS_X, abs_x_val)
                    emit_event(fd, EV_ABS, ABS_Y, abs_y_val)
                    syn(fd)
                emit_event(fd, EV_KEY, btn, 1)
                syn(fd)
                time.sleep(0.02)
                emit_event(fd, EV_KEY, btn, 0)
                syn(fd)

            elif action == "scroll":
                dy = float(msg.get("dy", 0.0))
                steps = -1 if dy > 0 else 1
                emit_event(fd, EV_REL, REL_WHEEL, steps)
                syn(fd)

            elif action == "type_text":
                text = str(msg.get("text", ""))
                if text:
                    subprocess.run(["wtype", "-s", "15", text], check=False)

            elif action == "key_press":
                key = str(msg.get("key", ""))
                if key:
                    subprocess.run(["wtype", "-k", key], check=False)

    finally:
        try:
            fcntl.ioctl(fd, UI_DEV_DESTROY)
            os.close(fd)
        except Exception:
            pass

if __name__ == "__main__":
    main()
