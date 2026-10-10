/**
 * 不受信任 HTML 的尽力而为清洗（best-effort）
 *
 * 用途：邮件正文（.eml）等外部来源 HTML 在预览前降低注入面。
 *
 * ⚠️ 边界说明：这是基于正则的轻量清洗，**不是完整 HTML 解析器**，
 * 不能替代 DOMPurify 等专业消毒库。它只覆盖最常见的攻击面：
 * - 脚本与可执行内嵌元素（script / iframe / object / embed / applet / base / link / meta）
 * - 内联事件处理器属性（on*）
 * - 危险协议 URL（javascript: / vbscript: / data:text/html）
 *
 * 若后续需要更高保证，应引入专业消毒库并替换本实现。
 */

/** 连同内容一起移除的元素（这些元素自身或其内容都不应出现在预览中） */
const DROPPED_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'applet', 'base', 'link', 'meta'];

/** 带有 URL 的属性名 */
const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'background', 'xlink:href', 'srcdoc'];

const DANGEROUS_URL_PATTERN = /^\s*(?:javascript|vbscript)\s*:/i;
const DANGEROUS_DATA_URL_PATTERN = /^\s*data\s*:\s*text\/html/i;

function dropElements(html: string, tag: string): string {
  const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
  return html.replace(paired, '').replace(selfClosing, '');
}

/** 移除内联事件处理器属性（onclick、onerror、onload 等） */
function stripEventHandlers(html: string): string {
  return html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/** 将危险协议的 URL 属性值置空 */
function stripDangerousUrls(html: string): string {
  return html.replace(
    new RegExp(`(\\s(?:${URL_ATTRIBUTES.join('|')})\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'),
    (match, prefix: string, rawValue: string) => {
      const quote = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : '';
      const value = quote ? rawValue.slice(1, -1) : rawValue;
      if (DANGEROUS_URL_PATTERN.test(value) || DANGEROUS_DATA_URL_PATTERN.test(value)) {
        return `${prefix}${quote}${quote}`;
      }
      return match;
    },
  );
}

/**
 * 清洗 HTML 字符串，返回可安全插入预览容器的 HTML。
 *
 * 注意：结果仍应只插入到受限容器中；本函数不处理 CSS 层面的信息泄露。
 */
export function sanitizeEmailHtml(html: string): string {
  let result = html;
  for (const tag of DROPPED_ELEMENTS) {
    result = dropElements(result, tag);
  }
  result = stripEventHandlers(result);
  result = stripDangerousUrls(result);
  return result;
}

/**
 * HTML 预览（sandbox iframe）前的轻量预处理
 *
 * 预览以 `<iframe sandbox="">` 承载，脚本与同源访问已由 sandbox 阻断。
 * 此处只额外去掉两类会让预览“自己跑掉”的元素，保持其余内容原样以保留页面保真度：
 * - `<base>`：会改写页内相对路径的基准
 * - `<meta http-equiv="refresh">`：会触发自动跳转（可能把 iframe 导到远程页面）
 */
export function prepareHtmlForSandbox(html: string): string {
  return html
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
}
