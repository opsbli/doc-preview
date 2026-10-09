export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    'postcss-prefix-selector': {
      prefix: '.rfp-root',
      transform(prefix, selector, prefixedSelector) {
        // 不处理已经包含 .rfp-root 的选择器
        if (selector.includes('.rfp-root')) return selector;

        // :root 选择器重写为容器选择器
        if (selector === ':root') return prefix;

        // body 选择器重写为容器选择器
        if (selector === 'body') return prefix;

        // 保留 video.js 全屏模式的 body 选择器（全屏功能需要）
        if (selector.startsWith('body.vjs-') || selector.startsWith('.vjs-full-window')) return selector;

        // body 开头的组合选择器重写
        if (selector.startsWith('body ')) return prefix + ' ' + selector.slice(5);
        if (selector.startsWith('body.')) return prefix + selector.slice(4);

        return prefixedSelector;
      },
    },
  },
}
