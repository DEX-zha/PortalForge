"""PortalForge bridge for Felk scripting-preview4. Runs inside Dolphin.

Single emulation-thread dispatcher: no Python threads, no unsafe pause command.
Calls need advancing emulation; stopped/GUI-paused emulation yields a timeout.
"""
from dolphin import controller, emulation, event, memory, savestate
import base64
import json
import socket
import struct

VERSION = "portalforge-0.1.0"
PORT = 55355
frames = 0
last_frame = None
held = None
clients = []


def region(address, length):
    if type(address) is not int or type(length) is not int or not 1 <= length <= 65536:
        raise ValueError("integer address and length 1..65536 required")
    if not any(start <= address and address + length <= end for start, end in
               ((0x80000000, 0x81800000), (0x90000000, 0x94000000))):
        raise ValueError("range must fit entirely in MEM1 or Wii MEM2")


def read_bytes(address, length):
    region(address, length)
    return bytes(memory.read_u8(address + i) for i in range(length))


def memory_call(method, args):
    operation, kind = method.split(".")[1].split("_", 1)
    address = args[0]
    if kind == "bytes":
        if operation == "read":
            return read_bytes(address, args[1]).hex()
        data = bytes.fromhex(args[1])
        region(address, len(data))
    else:
        formats = {"u8": "B", "u16": "H", "u32": "I", "u64": "Q",
                   "s8": "b", "s16": "h", "s32": "i", "s64": "q", "f32": "f", "f64": "d"}
        fmt = ">" + formats[kind]
        size = struct.calcsize(fmt)
        region(address, size)
        if operation == "read":
            value = struct.unpack(fmt, read_bytes(address, size))[0]
            return str(value) if kind in ("u64", "s64") else value
        value = float(args[1]) if kind.startswith("f") else int(args[1])
        data = struct.pack(fmt, value)
    if operation != "write":
        raise ValueError("unknown memory operation")
    previous = read_bytes(address, len(data)).hex()
    for i, value in enumerate(data):
        memory.write_u8(address + i, value)
    return {"previous_hex": previous, "written_hex": data.hex()}


def dispatch(method, args):
    global held
    if method == "bridge.ping":
        return {"bridge_version": VERSION, "dolphin": "Felk scripting-preview4", "frames": frames,
                "pause_resume": False, "nunchuk": hasattr(controller, "set_wii_nunchuk_buttons"),
                "screenshot": last_frame is not None}
    if method.startswith("memory."):
        return memory_call(method, args)
    if method == "frame.get_count":
        return frames
    if method == "gui.screenshot":
        if last_frame is None:
            raise RuntimeError("no rendered frame available yet")
        width, height, data = last_frame
        return {"width": width, "height": height, "rgb_base64": base64.b64encode(data).decode("ascii")}
    if method == "controller.hold":
        port, buttons, nunchuk, count = args
        if not 0 <= port <= 3 or not 1 <= count <= 600:
            raise ValueError("port 0..3, frames 1..600 required")
        held = [port, buttons, nunchuk, count]
        return {"start_frame": frames, "frames_requested": count}
    allowed_controller = {"get_gc_buttons", "set_gc_buttons", "get_wiimote_buttons", "set_wiimote_buttons",
                          "get_wii_nunchuk_buttons", "set_wii_nunchuk_buttons", "set_wiimote_pointer",
                          "set_wiimote_acceleration", "set_wiimote_angular_velocity"}
    if method.startswith("controller.") and method.split(".")[1] in allowed_controller:
        if type(args[0]) is not int or not 0 <= args[0] <= 3:
            raise ValueError("port must be 0..3")
        return getattr(controller, method.split(".")[1])(*args)
    if method in ("savestate.save_to_slot", "savestate.load_from_slot"):
        if type(args[0]) is not int or not 0 <= args[0] <= 99:
            raise ValueError("slot must be 0..99 for this Dolphin API")
        return getattr(savestate, method.split(".")[1])(*args)
    if method == "emulation.reset":
        held = None
        return emulation.reset()
    raise ValueError("unsupported bridge method: " + method)


def respond(line):
    request_id = None
    try:
        req = json.loads(line)
        request_id = req["id"]
        result = dispatch(req["method"], req.get("params", []))
        return json.dumps({"id": request_id, "result": result}, allow_nan=False).encode() + b"\n"
    except Exception as exc:
        return json.dumps({"id": request_id, "error": str(exc)}).encode() + b"\n"


listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
listener.bind(("127.0.0.1", PORT))
listener.listen(8)
listener.setblocking(False)


def on_draw(width, height, data):
    global last_frame
    last_frame = (width, height, bytes(data))


def tick():
    global frames, clients, held
    frames += 1
    try:
        sock, _ = listener.accept()
        sock.setblocking(False)
        if len(clients) < 8:
            clients.append([sock, b"", b""])
        else:
            sock.close()
    except BlockingIOError:
        pass
    live = []
    for sock, incoming, outgoing in clients:
        try:
            try:
                data = sock.recv(262144)
                if not data:
                    sock.close()
                    continue
                incoming += data
            except BlockingIOError:
                pass
            if len(incoming) > 262144:
                raise ValueError("request too large")
            # One command per tick limits time spent blocking the emulation thread.
            if not outgoing and b"\n" in incoming:
                line, incoming = incoming.split(b"\n", 1)
                outgoing = respond(line)
            if outgoing:
                try:
                    sent = sock.send(outgoing)
                    outgoing = outgoing[sent:]
                except BlockingIOError:
                    pass
            live.append([sock, incoming, outgoing])
        except Exception:
            sock.close()
    clients = live
    if held:
        port, buttons, nunchuk, remaining = held
        controller.set_wiimote_buttons(port, buttons)
        controller.set_wii_nunchuk_buttons(port, nunchuk)
        held[3] = remaining - 1
        if held[3] == 0:
            held = None


event.on_framedrawn(on_draw)
print("[portalforge] bridge " + VERSION + " listening on 127.0.0.1:" + str(PORT))
while True:
    await event.frameadvance()
    tick()
