const REFRESH_INTERVAL_MS = 2500;

const elements = {
  lastUpdated: document.getElementById("last-updated"),
  hostname: document.getElementById("hostname"),
  platform: document.getElementById("platform"),
  bootTime: document.getElementById("boot-time"),
  uptime: document.getElementById("uptime"),
  cpuCores: document.getElementById("cpu-cores"),
  cpuUsage: document.getElementById("cpu-usage"),
  cpuBar: document.getElementById("cpu-bar"),
  cpuFrequency: document.getElementById("cpu-frequency"),
  loadAverage: document.getElementById("load-average"),
  coreList: document.getElementById("core-list"),
  memoryUsage: document.getElementById("memory-usage"),
  memoryBar: document.getElementById("memory-bar"),
  memoryBreakdown: document.getElementById("memory-breakdown"),
  diskUsage: document.getElementById("disk-usage"),
  diskBar: document.getElementById("disk-bar"),
  diskBreakdown: document.getElementById("disk-breakdown"),
  networkTotal: document.getElementById("network-total"),
  networkSent: document.getElementById("network-sent"),
  networkReceived: document.getElementById("network-received"),
  packetsSent: document.getElementById("packets-sent"),
  packetsReceived: document.getElementById("packets-received"),
  processCount: document.getElementById("process-count"),
  processTable: document.getElementById("process-table"),
};

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function setUsage(barElement, valueElement, value) {
  const percent = Math.max(0, Math.min(100, value));
  barElement.style.width = `${percent}%`;
  valueElement.textContent = formatPercent(percent);
}

function renderMetrics(data) {
  elements.lastUpdated.textContent = `Last updated ${formatDate(data.timestamp)}`;
  elements.hostname.textContent = data.system.hostname;
  elements.platform.textContent = data.system.platform;
  elements.bootTime.textContent = formatDate(data.system.boot_time);
  elements.uptime.textContent = formatDuration(data.system.uptime_seconds);
  elements.cpuCores.textContent = `${data.system.cpu_cores_physical} physical / ${data.system.cpu_cores_logical} logical`;

  setUsage(elements.cpuBar, elements.cpuUsage, data.cpu.usage_percent);
  elements.cpuFrequency.textContent = data.cpu.frequency_mhz
    ? `${data.cpu.frequency_mhz} MHz`
    : "Frequency unavailable";
  elements.loadAverage.textContent = data.system.load_average
    ? `Load avg ${data.system.load_average.join(" / ")}`
    : "Load average unavailable";
  elements.coreList.innerHTML = data.cpu.per_core_percent
    .map(
      (value, index) => `
        <div class="core-chip">
          <span>Core ${index + 1}</span>
          <strong>${formatPercent(value)}</strong>
        </div>
      `
    )
    .join("");

  setUsage(elements.memoryBar, elements.memoryUsage, data.memory.usage_percent);
  elements.memoryBreakdown.textContent = `${data.memory.used_gb} GB used / ${data.memory.total_gb} GB total`;

  setUsage(elements.diskBar, elements.diskUsage, data.disk.usage_percent);
  elements.diskBreakdown.textContent = `${data.disk.used_gb} GB used / ${data.disk.total_gb} GB total`;

  elements.networkSent.textContent = `${data.network.bytes_sent_mb} MB`;
  elements.networkReceived.textContent = `${data.network.bytes_recv_mb} MB`;
  elements.networkTotal.textContent = `${(data.network.bytes_sent_mb + data.network.bytes_recv_mb).toFixed(2)} MB`;
  elements.packetsSent.textContent = data.network.packets_sent.toLocaleString();
  elements.packetsReceived.textContent = data.network.packets_recv.toLocaleString();
}

function renderProcesses(data) {
  elements.processCount.textContent = `${data.count} processes`;

  if (!data.processes.length) {
    elements.processTable.innerHTML =
      '<tr><td colspan="6" class="empty-state">No process data available.</td></tr>';
    return;
  }

  elements.processTable.innerHTML = data.processes
    .map(
      (process) => `
        <tr>
          <td>
            <div class="process-name">
              <strong>${process.name}</strong>
              <small>${process.user}</small>
            </div>
          </td>
          <td>${process.pid}</td>
          <td>${formatPercent(process.cpu_percent)}</td>
          <td>${formatPercent(process.memory_percent)}</td>
          <td><span class="status-tag">${process.status}</span></td>
          <td>${process.started_at ? formatDate(process.started_at) : "-"}</td>
        </tr>
      `
    )
    .join("");
}

async function refreshDashboard() {
  try {
    const [metricsResponse, processesResponse] = await Promise.all([
      fetch("/api/metrics", { cache: "no-store" }),
      fetch("/api/processes", { cache: "no-store" }),
    ]);

    if (!metricsResponse.ok || !processesResponse.ok) {
      throw new Error("Dashboard endpoints returned an error.");
    }

    const [metrics, processes] = await Promise.all([
      metricsResponse.json(),
      processesResponse.json(),
    ]);

    renderMetrics(metrics);
    renderProcesses(processes);
  } catch (error) {
    elements.lastUpdated.textContent = "Unable to refresh live data.";
    elements.processTable.innerHTML =
      '<tr><td colspan="6" class="empty-state">Connection lost. Check that the local server is running.</td></tr>';
  }
}

refreshDashboard();
setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
