import { dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { downloadPic } from "./downloadPic.js";
import { config } from "./config.js";
import { getRkey } from "./getRkey.js";
import { Logs } from "./logs.js";
const log = new Logs("图片处理模块");

// 获取图片链接
async function getPicUrl(picData, chatType) {
  log(picData);
  if (!picData.original) {
    if (picData.originImageUrl) {
      if (picData.originImageUrl.includes("&rkey=")) {
        return `${config.global.IMAGE_HTTP_HOST_NT}${picData.originImageUrl}`;
      } else {
        const rkey = await getRkey(chatType);
        return `${config.global.IMAGE_HTTP_HOST_NT}${picData.originImageUrl}${rkey}`;
      }
    } else {
      return `${config.global.IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${picData.originImageMd5}/`;
    }
  } else {
    return `${config.global.IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${picData.md5HexStr.toUpperCase()}/`;
  }
}

async function getPicArr(picData, chatType) {
  const rawUrl = await getPicUrl(picData, chatType);
  return [0, 198, 720].map((el) => {
    if (rawUrl.includes("gchatpic_new")) {
      return `${rawUrl}${el}`;
    } else {
      return rawUrl.replace("&spec=0", `&spec=${el}`);
    }
  });
}

/**
 * 下载消息内含有的图片
 * @param {Object} msgItem 消息数据
 */
async function processPic(msgItem) {
  if (msgItem?.elements && msgItem?.elements?.length) {
    for (let i = 0; i < msgItem.elements.length; i++) {
      const el = msgItem.elements[i];
      if (el?.picElement) {
        log("该消息含有图片", el);
        const pic = el.picElement;
        const chatType = msgItem.chatType === 2 ? "group_rkey" : "private_rkey";
        const picUrls = await getPicArr(pic, chatType);
        if (!existsSync(pic.sourcePath)) {
          log("下载原图", picUrls);
          const body = await downloadPic(picUrls[0]);
          mkdirSync(dirname(pic.sourcePath), { recursive: true });
          writeFileSync(pic.sourcePath, body);
        }
        // 修复本地数据中的错误
        if (pic?.thumbPath) {
          pic.thumbPath = new Map([
            [0, pic.sourcePath.replace("Ori", "Thumb").replace(pic.md5HexStr, pic.md5HexStr + "_0")],
            [198, pic.sourcePath.replace("Ori", "Thumb").replace(pic.md5HexStr, pic.md5HexStr + "_198")],
            [720, pic.sourcePath.replace("Ori", "Thumb").replace(pic.md5HexStr, pic.md5HexStr + "_720")],
          ]);
          log("修复缩略图数据", pic.thumbPath);
        }
        // log("缩略图", typeof pic?.thumbPath, pic?.thumbPath instanceof Map);
        if (pic?.thumbPath) {
          const toArray = Array.from(pic.thumbPath);
          log("开始下载缩略图", toArray);
          for (let i = 0; i < toArray.length; i++) {
            const picPath = toArray[i][1];
            if (!existsSync(picPath)) {
              try {
                log("尝试下载", picPath, picUrls[i]);
                const body = await downloadPic(picUrls[i]);
                mkdirSync(dirname(picPath), { recursive: true });
                writeFileSync(picPath, body);
              } catch (err) {
                log("缩略图下载失败", picPath, err?.message);
              }
            } else {
              log("缩略图已存在", picPath);
            }
          }
        }
      }
    }
  }
}

export { processPic };
