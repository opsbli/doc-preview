import { useState, useRef, useEffect, useCallback } from 'react';
import { Lock, X } from 'lucide-react';
import type { Translator } from '@opsbli/file-preview-core';

interface EncryptedPasswordModalProps {
  t: Translator;
  retriesLeft: number;
  errorMessage: string;
  onSubmit: (password: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}

/**
 * 加密文件密码输入弹窗
 * 显示在预览容器内居中位置，包含标题、密码输入框、确认按钮、错误提示
 */
export function EncryptedPasswordModal({
  t,
  retriesLeft,
  errorMessage,
  onSubmit,
  onClose,
  autoFocus = true,
}: EncryptedPasswordModalProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback(() => {
    if (!password.trim()) return;
    onSubmit(password);
    setPassword('');
  }, [password, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  const isMaxReached = retriesLeft <= 0;

  return (
    <div
      className="rfp-absolute rfp-inset-0 rfp-flex rfp-items-center rfp-justify-center rfp-z-[20] rfp-bg-black/40 rfp-backdrop-blur-sm"
      onClick={() => onClose?.()}
    >
      <div
        className="rfp-relative rfp-w-80 rfp-max-w-[90%] rfp-bg-surface-panel rfp-rounded-lg rfp-shadow-2xl rfp-border rfp-border-line rfp-p-5 rfp-flex rfp-flex-col rfp-gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        {onClose && (
          <button
            className="rfp-absolute rfp-top-3 rfp-right-3 rfp-p-1 rfp-text-fg-muted hover:rfp-text-fg-primary rfp-transition-colors"
            onClick={onClose}
            title={t('common.close')}
          >
            <X className="rfp-w-4 rfp-h-4" />
          </button>
        )}

        {/* 图标 + 标题 */}
        <div className="rfp-flex rfp-items-center rfp-gap-3">
          <div className="rfp-p-2 rfp-rounded-lg rfp-bg-surface-2">
            <Lock className="rfp-w-5 rfp-h-5 rfp-text-fg-primary" />
          </div>
          <h3 className="rfp-font-medium rfp-text-sm rfp-text-fg-primary">
            {t('encrypted.title')}
          </h3>
        </div>

        {/* 密码输入 */}
        <div className="rfp-flex rfp-flex-col rfp-gap-2">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('encrypted.password_placeholder')}
            disabled={isMaxReached}
            className="rfp-w-full rfp-px-3 rfp-py-2 rfp-text-sm rfp-rounded-md rfp-border rfp-border-line rfp-bg-surface-input rfp-text-fg-primary rfp-outline-none focus:rfp-border-fg-primary focus:rfp-ring-1 focus:rfp-ring-fg-primary/30 rfp-placeholder:text-fg-muted disabled:rfp-opacity-50 disabled:rfp-cursor-not-allowed"
          />

          {/* 错误提示 */}
          {errorMessage && (
            <p className="rfp-text-xs rfp-text-red-500 rfp-flex rfp-items-center rfp-gap-1">
              {errorMessage}
            </p>
          )}

          {/* 重试次数 */}
          {!isMaxReached && (
            <p className="rfp-text-xs rfp-text-fg-muted">
              {t('encrypted.retries_left', { count: retriesLeft })}
            </p>
          )}
        </div>

        {/* 确认按钮 */}
        <button
          onClick={handleSubmit}
          disabled={isMaxReached || !password.trim()}
          className="rfp-w-full rfp-py-2 rfp-text-sm rfp-font-medium rfp-rounded-md rfp-bg-fg-primary rfp-text-fg-inverse rfp-transition-colors hover:rfp-opacity-90 disabled:rfp-opacity-40 disabled:rfp-cursor-not-allowed"
        >
          {isMaxReached ? t('encrypted.max_attempts') : t('encrypted.confirm')}
        </button>
      </div>
    </div>
  );
}
