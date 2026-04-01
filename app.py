import json
import platform
import socket
import socketserver
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

import psutil


ROOT = Path(__file__).parent
STATIC_DIR = ROOT / "static"
HOST = "127.0.0.1"
PORT = 8000
SYSTEM_ROOT = Path.cwd().anchor or "/"


def bytes_to_gb(value: float) -> float:
    return round(value / (1024 ** 3), 2)


def bytes_to_mb(value: float) -> float:
    return round(value / (1024 ** 2), 2)


def collect_metrics() -> dict:
    virtual_memory = psutil.virtual_memory()
    disk_usage = psutil.disk_usage(SYSTEM_ROOT)
    cpu_percent = psutil.cpu_percent(interval=0.15)
    load_average = None
    try:
        load_average = [round(value, 2) for value in psutil.getloadavg()]
    except (AttributeError, OSError):
        load_average = None

    net_counters = psutil.net_io_counters()
    boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc).isoformat()

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "system": {
            "hostname": socket.gethostname(),
            "platform": f"{platform.system()} {platform.release()}".strip(),
            "uptime_seconds": round(datetime.now(timezone.utc).timestamp() - psutil.boot_time()),
            "boot_time": boot_time,
            "cpu_cores_physical": psutil.cpu_count(logical=False),
            "cpu_cores_logical": psutil.cpu_count(logical=True),
            "load_average": load_average,
        },
        "cpu": {
            "usage_percent": round(cpu_percent, 1),
            "per_core_percent": [round(value, 1) for value in psutil.cpu_percent(interval=None, percpu=True)],
            "frequency_mhz": (
                round(psutil.cpu_freq().current, 1) if psutil.cpu_freq() else None
            ),
        },
        "memory": {
            "usage_percent": round(virtual_memory.percent, 1),
            "used_gb": bytes_to_gb(virtual_memory.used),
            "available_gb": bytes_to_gb(virtual_memory.available),
            "total_gb": bytes_to_gb(virtual_memory.total),
        },
        "disk": {
            "usage_percent": round(disk_usage.percent, 1),
            "used_gb": bytes_to_gb(disk_usage.used),
            "free_gb": bytes_to_gb(disk_usage.free),
            "total_gb": bytes_to_gb(disk_usage.total),
        },
        "network": {
            "bytes_sent_mb": bytes_to_mb(net_counters.bytes_sent),
            "bytes_recv_mb": bytes_to_mb(net_counters.bytes_recv),
            "packets_sent": net_counters.packets_sent,
            "packets_recv": net_counters.packets_recv,
        },
    }


def collect_processes(limit: int = 12) -> dict:
    processes = []
    for process in psutil.process_iter(
        ["pid", "name", "username", "cpu_percent", "memory_percent", "status", "create_time"]
    ):
        try:
            info = process.info
            processes.append(
                {
                    "pid": info["pid"],
                    "name": info["name"] or "Unknown",
                    "user": info["username"] or "N/A",
                    "cpu_percent": round(info["cpu_percent"] or 0.0, 1),
                    "memory_percent": round(info["memory_percent"] or 0.0, 1),
                    "status": info["status"],
                    "started_at": (
                        datetime.fromtimestamp(info["create_time"], tz=timezone.utc).isoformat()
                        if info["create_time"]
                        else None
                    ),
                }
            )
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue

    top_cpu = sorted(processes, key=lambda item: (-item["cpu_percent"], -item["memory_percent"]))[:limit]
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "processes": top_cpu,
        "count": len(processes),
    }


class MonitoringHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.path = "/index.html"
            return super().do_GET()

        if self.path == "/api/metrics":
            return self.send_json(collect_metrics())

        if self.path == "/api/processes":
            return self.send_json(collect_processes())

        return super().do_GET()

    def send_json(self, payload: dict):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args):
        return


class ThreadedTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    psutil.cpu_percent(interval=None)
    with ThreadedTCPServer((HOST, PORT), MonitoringHandler) as server:
        print(f"Dashboard running at http://{HOST}:{PORT}")
        server.serve_forever()
