# Channel Probe

检测本机 `AudioContext` 输出能力的小站：

- `destination.maxChannelCount`
- `destination.channelCount`
- `sampleRate`

并可尝试设置声道数、播放 440 Hz 测试音。

## 运行

```bash
cd audio-context-probe
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（通常是 http://localhost:5173/）。

需点击「启动 AudioContext」——浏览器要求用户手势后才能创建/恢复音频上下文。
