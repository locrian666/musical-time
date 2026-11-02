/** @type {AudioContext | null} */
let ctx = null;
/** @type {OscillatorNode | null} */
let oscillator = null;
/** @type {GainNode | null} */
let gainNode = null;

const $ = (id) => document.getElementById(id);

const btnStart = $("btn-start");
const btnRefresh = $("btn-refresh");
const btnSetChannels = $("btn-set-channels");
const btnTone = $("btn-tone");
const btnStopTone = $("btn-stop-tone");
const inputChannels = /** @type {HTMLInputElement} */ ($("input-channels"));
const statusEl = $("status");
const actionMsg = $("action-msg");
const logEl = $("log");

function log(line) {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${stamp}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  console.log(line);
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setActionMsg(text, isError = false) {
  actionMsg.textContent = text;
  actionMsg.classList.toggle("error", isError);
}

function revealPanels() {
  for (const id of ["metrics", "details", "actions", "console-panel"]) {
    $(id).hidden = false;
  }
  btnRefresh.disabled = false;
}

function readMetrics() {
  if (!ctx) return;

  const max = ctx.destination.maxChannelCount;
  const current = ctx.destination.channelCount;
  const rate = ctx.sampleRate;

  $("val-max").textContent = String(max);
  $("val-current").textContent = String(current);
  $("val-rate").textContent = rate.toLocaleString();

  inputChannels.max = String(max);
  if (Number(inputChannels.value) > max) {
    inputChannels.value = String(max);
  }

  const details = [
    ["state", ctx.state],
    ["baseLatency", `${(ctx.baseLatency * 1000).toFixed(2)} ms`],
    ["outputLatency", `${((ctx.outputLatency ?? 0) * 1000).toFixed(2)} ms`],
    ["destination.channelCountMode", ctx.destination.channelCountMode],
    ["destination.channelInterpretation", ctx.destination.channelInterpretation],
    ["destination.numberOfInputs", String(ctx.destination.numberOfInputs)],
    ["destination.numberOfOutputs", String(ctx.destination.numberOfOutputs)],
    ["AudioContext supported", String(typeof AudioContext !== "undefined")],
    ["webkitAudioContext", String(typeof webkitAudioContext !== "undefined")],
  ];

  const table = $("detail-table");
  table.innerHTML = details
    .map(
      ([k, v]) =>
        `<div class="detail-row"><span class="k">${k}</span><span class="v">${v}</span></div>`
    )
    .join("");

  log(`Max channels: ${max}`);
  log(`Current channels: ${current}`);
  log(`Sample rate: ${rate}`);
}

async function ensureRunning() {
  if (!ctx) throw new Error("AudioContext 尚未创建");
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

async function startContext() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        throw new Error("当前浏览器不支持 AudioContext");
      }
      ctx = new AC();
      log("AudioContext created");
    }

    await ensureRunning();
    revealPanels();
    readMetrics();
    setStatus(`AudioContext 已运行 · state = ${ctx.state}`);
    btnStart.textContent = "重新读取";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(message, true);
    log(`ERROR: ${message}`);
  }
}

async function applyChannelCount() {
  if (!ctx) return;
  const next = Number(inputChannels.value);
  try {
    await ensureRunning();
    ctx.destination.channelCount = next;
    setActionMsg(`已设置 destination.channelCount = ${ctx.destination.channelCount}`);
    log(`Set channelCount → ${ctx.destination.channelCount}`);
    readMetrics();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setActionMsg(`设置失败: ${message}`, true);
    log(`ERROR setting channelCount: ${message}`);
  }
}

async function playTone() {
  if (!ctx) return;
  try {
    await ensureRunning();
    stopTone(false);

    gainNode = ctx.createGain();
    gainNode.gain.value = 0.08;
    gainNode.connect(ctx.destination);

    oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    oscillator.connect(gainNode);
    oscillator.start();

    btnStopTone.disabled = false;
    setActionMsg("正在播放 440 Hz 正弦测试音");
    log("Tone started @ 440 Hz");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setActionMsg(`播放失败: ${message}`, true);
    log(`ERROR tone: ${message}`);
  }
}

function stopTone(announce = true) {
  if (oscillator) {
    try {
      oscillator.stop();
      oscillator.disconnect();
    } catch {
      /* already stopped */
    }
    oscillator = null;
  }
  if (gainNode) {
    try {
      gainNode.disconnect();
    } catch {
      /* already disconnected */
    }
    gainNode = null;
  }
  btnStopTone.disabled = true;
  if (announce) {
    setActionMsg("测试音已停止");
    log("Tone stopped");
  }
}

btnStart.addEventListener("click", startContext);
btnRefresh.addEventListener("click", async () => {
  try {
    await ensureRunning();
    readMetrics();
    setStatus(`已刷新 · state = ${ctx?.state}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(message, true);
  }
});
btnSetChannels.addEventListener("click", applyChannelCount);
btnTone.addEventListener("click", playTone);
btnStopTone.addEventListener("click", () => stopTone(true));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ctx) {
    setStatus(`页面可见 · AudioContext state = ${ctx.state}`);
  }
});
