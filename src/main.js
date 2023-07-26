// 运行在 Electron 主进程 下的插件入口
const { app, ipcMain, dialog, BrowserWindow, MessageChannelMain } = require("electron");
const path = require("path");
const fs = require("fs");
let mainMessage, settings, options;

// 默认配置文件
const defaultOptions = {
  spareInitialization: false,
  sidebar: {
    top: [],
    bottom: [],
  },
  imageViewer: {
    quickClose: false,
  },
  message: {
    disabledSticker: false,
    disabledHotGIF: false,
    disabledBadge: false,
    convertBiliBiliArk: false,
  },
  textAreaFuncList: [],
  background: {
    enabled: false,
    url: "",
  },
};

const listenList = [];

// 加载插件时触发
function onLoad(plugin, liteloader) {
  console.log("轻量工具箱已加载", plugin.path);
  const pluginDataPath = plugin.path.data;
  const settingsPath = path.join(pluginDataPath, "settings.json");
  const stylePath = path.join(plugin.path.plugin, "src/style.css");

  // 初始化配置文件路径
  if (!fs.existsSync(pluginDataPath)) {
    fs.mkdirSync(pluginDataPath, { recursive: true });
  }

  // 初始化配置文件
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultOptions, null, 4));
  }

  // 获取本地配置文件
  fileOptions = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  // 保存配置和默认配置执行一次合并，以适配新增功能
  options = Object.assign(defaultOptions, fileOptions);

  // 获取侧边栏按钮
  ipcMain.handle("LiteLoader.lite_tools.getSidebar", async (event, message) => {
    mainMessage.webContents.send("LiteLoader.lite_tools.optionsOpen", message);
    const list = await new Promise((res) => {
      ipcMain.once("LiteLoader.lite_tools.sendSidebar", (event, list) => {
        options.sidebar = list;
        res(list);
      });
    });
    return list;
  });

  // 更新聊天框上方功能列表
  ipcMain.on("LiteLoader.lite_tools.sendTextAreaList", (event, list) => {
    let res = new Map(),
      concat = options.textAreaFuncList.concat(list);
    options.textAreaFuncList = concat.filter((item) => !res.has(item["name"]) && res.set(item["name"], 1));
    updateOptions();
  });

  // 获取/修改配置信息
  ipcMain.handle("LiteLoader.lite_tools.config", (event, opt) => {
    if (opt) {
      console.log("更新配置信息", opt);
      options = opt;
      updateOptions();
    } else {
      console.log("获取配置信息", options);
    }
    return options;
  });

  // 控制台日志打印
  ipcMain.on("LiteLoader.lite_tools.log", (event, message) => {
    console.log("轻量工具箱 [渲染进程]: ", message);
  });

  // 动态样式调整
  ipcMain.handle("LiteLoader.lite_tools.getStyle", (event) => {
    return fs.readFileSync(stylePath, "utf-8");
  });
  fs.watch(
    stylePath,
    "utf-8",
    debounce(() => {
      updateStyle();
    }, 100)
  );

  ipcMain.on("LiteLoader.lite_tools.openSelectBackground", () => {
    dialog
      .showOpenDialog({
        title: "请选择文件", //默认路径,默认选择的文件
        defaultPath: "default.jpg", //过滤文件后缀
        filters: [
          {
            name: "img",
            extensions: ["jpg", "png", "gif", "mp4"],
          },
        ], //打开按钮
        buttonLabel: "选择", //回调结果渲染到img标签上
      })
      .then((result) => {
        console.log("选择了文件", result);
        if (!result.canceled) {
          options.background.url = path.join(result.filePaths[0]).replace(/\\/g, "/");
          updateOptions();
        }
      })
      .catch((err) => {
        console.log("无效操作", err);
      });
  });

  function updateStyle() {
    const styleText = fs.readFileSync(stylePath, "utf-8");
    listenList.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send("LiteLoader.lite_tools.updateStyle", styleText);
      }
    });
  }

  function updateOptions() {
    fs.writeFileSync(settingsPath, JSON.stringify(options, null, 4));
    listenList.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send("LiteLoader.lite_tools.updateOptions", options);
      }
    });
  }
}

// 创建窗口时触发
function onBrowserWindowCreated(window, plugin) {
  // 新窗口添加到推送列表
  listenList.push(window);

  // 监听页面加载完成事件
  window.webContents.on("did-stop-loading", () => {
    if (window.webContents.getURL().indexOf("#/main/message") !== -1) {
      console.log("捕获到主窗口");
      mainMessage = window;
    }
    if (window.webContents.getURL().indexOf("#/setting/settings/common") !== -1) {
      console.log("捕获到设置窗口");
      settings = window;
    }
  });

  // 复写并监听ipc通信内容
  const original_send =
    (window.webContents.__qqntim_original_object && window.webContents.__qqntim_original_object.send) ||
    window.webContents.send;

  const patched_send = function (channel, ...args) {
    if (options.message.convertBiliBiliArk) {
      const msgListIndex = args.findIndex(
        (item) =>
          item &&
          item.hasOwnProperty("msgList") &&
          item.msgList != null &&
          item.msgList instanceof Array &&
          item.msgList.length > 0
      );
      if (msgListIndex !== -1) {
        args[msgListIndex].msgList.forEach((msgItem) => {
          // console.log("解析到消息数据", msgItem);
          let msg_seq = msgItem.msgSeq;
          msgItem.elements.forEach((msgElements) => {
            // console.log("拿到消息元素", msgElements);
            if (msgElements.arkElement && msgElements.arkElement.bytesData) {
              const json = JSON.parse(msgElements.arkElement.bytesData);
              if (json.prompt === "[QQ小程序]" && json.meta.detail_1.appid === "1109937557") {
                // console.log("解析到哔哩哔哩小程序卡片", msgElements.arkElement);
                msgElements.arkElement.bytesData = JSON.stringify({
                  app: "com.tencent.structmsg",
                  config: json.config,
                  desc: "新闻",
                  extra: { app_type: 1, appid: 100951776, msg_seq, uin: json.meta.detail_1.host.uin },
                  meta: {
                    news: {
                      action: "",
                      android_pkg_name: "",
                      app_type: 1,
                      appid: 100951776,
                      ctime: json.config.ctime,
                      desc: json.meta.detail_1.desc,
                      jumpUrl: json.meta.detail_1.qqdocurl.replace(/\\/g, ""),
                      preview: json.meta.detail_1.preview,
                      source_icon: json.meta.detail_1.icon,
                      source_url: "",
                      tag: "哔哩哔哩",
                      title: "哔哩哔哩",
                      uin: json.meta.detail_1.host.uin,
                    },
                  },
                  prompt: "[分享]哔哩哔哩",
                  ver: "0.0.0.1",
                  view: "news",
                });
              }
            }
          });
        });
      }
    }
    return original_send.call(window.webContents, channel, ...args);
  };

  if (window.webContents.__qqntim_original_object) {
    window.webContents.__qqntim_original_object.send = patched_send;
  } else {
    window.webContents.send = patched_send;
  }
}

// 防抖函数
function debounce(fn, time) {
  let timer = null;
  return function (...args) {
    timer && clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, time);
  };
}

// 这两个函数都是可选的
module.exports = {
  onLoad,
  onBrowserWindowCreated,
};
