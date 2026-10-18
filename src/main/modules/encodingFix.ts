// 编码修复工具
// 背景：老 mp3/音频的中文标签（ID3）常用 GBK 编码，但标签头却声明为
// ISO-8859-1（latin1）。music-metadata / node-id3 会按 latin1 逐字节解码，
// 把每个 0x80-0xFF 的字节映射成 U+0080-U+00FF 的拉丁字符，于是中文变成乱码。
//
// 修复思路：检测"原本是 GBK、被当 latin1 解出来"的字符串，把它重新编码回
// 原始字节（Buffer.from(text, 'latin1')），再用 GBK 解码，得到正确中文。
// 通过"GBK 再编码能还原成同样字节 + 结果含中文"双重校验，避免误伤正常拉丁字符串。

import * as iconv from 'iconv-lite';

// 已包含 CJK（中/日/韩统一表意文字及其扩展、兼容区）→ 说明原本就是正确的 UTF-8/UTF-16，无需处理
const RE_HAS_CJK = /[㐀-䶿一-鿿豈-﫿]/;
// 含 latin1 高位字符（0x80-0xFF）→ 才有可能是被误解的 GBK
const RE_HAS_HIGH = /[-ÿ]/;

/**
 * 将可能被 latin1 误解码的 GBK 字符串还原为正确中文。
 * @param text 输入文本（music-metadata / node-id3 解出的标签值）
 * @returns 修复后的文本；若不是乱码则原样返回
 */
export function fixEncoding(text: unknown): string {
  if (text == null) return '';
  const str = Array.isArray(text) ? text.join(' / ') : String(text);
  if (!str) return str;

  // 已经是正确的中文（UTF-8/16 解码成功）→ 不碰
  if (RE_HAS_CJK.test(str)) return str;
  // 不含高位字节 → 不是 latin1 误解码的 GBK → 不碰
  if (!RE_HAS_HIGH.test(str)) return str;

  try {
    // 还原成原始字节
    const rawBytes = Buffer.from(str, 'latin1');
    // 按 GBK 重新解码
    const recovered = iconv.decode(rawBytes, 'gbk');
    if (!recovered || recovered === str) return str;

    // 双重校验：① 结果确实是中文；② GBK 再编码能还原成原始字节（确保是合法 GBK）
    if (!RE_HAS_CJK.test(recovered)) return str;
    const roundTrip = iconv.encode(recovered, 'gbk');
    if (roundTrip.length !== rawBytes.length) return str;
    if (Buffer.compare(roundTrip, rawBytes) !== 0) return str;

    return recovered;
  } catch {
    return str;
  }
}
